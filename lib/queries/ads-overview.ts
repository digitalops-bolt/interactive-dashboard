import { cachedQuery } from "@/lib/bigquery";
import {
  comparisonPredicate,
  rangeKeyParts,
  rangeParams,
  type RangeSpec,
} from "@/lib/metrics";
import { labelToPortfolioCase } from "@/lib/ads";

const ADS = "cubbyboltdata.bolt_g_ads_data";

/**
 * Per-portfolio Google Ads spend + conversions for the selected window AND the
 * immediately-prior same-length window (prevPeriod) — the month-over-month basis the
 * briefing uses to flag spend spikes and conversion declines. Spend comes from
 * CampaignBasicStats (unsegmented; matches the platform totals — see getAdsByType for why).
 * Portfolio attribution reuses the version-controlled label map (lib/ads.ts).
 * Reads bolt_g_ads_data — requires the dashboard SA to have Data Viewer on that dataset;
 * callers should handle a thrown permission error.
 */
export interface AdsPortfolioRow {
  portfolio: string;
  spend: number;
  conversions: number;
  clicks: number;
  spendPrevPeriod: number;
  conversionsPrevPeriod: number;
  clicksPrevPeriod: number;
}

export async function getAdsByPortfolio(
  range: RangeSpec,
): Promise<AdsPortfolioRow[]> {
  const curPred = comparisonPredicate("s.segments_date", range, "current");
  const ppPred = comparisonPredicate("s.segments_date", range, "prevPeriod");

  const rows = await cachedQuery<{
    portfolio: string | null;
    spend: number;
    conversions: number;
    clicks: number;
    spend_pp: number;
    conversions_pp: number;
    clicks_pp: number;
  }>(
    `WITH labels AS (
       SELECT campaign_id, ${labelToPortfolioCase("label_name")} AS portfolio
       FROM \`${ADS}.ads_CampaignLabel_2921271203\`
       WHERE _DATA_DATE = _LATEST_DATE AND label_name NOT LIKE 'Paused%'
     ),
     camp_portfolio AS (
       SELECT campaign_id, ANY_VALUE(portfolio) AS portfolio FROM labels GROUP BY campaign_id
     )
     SELECT cp.portfolio,
            ROUND(SUM(IF(${curPred}, s.metrics_cost_micros, 0))/1e6, 2) AS spend,
            ROUND(SUM(IF(${curPred}, s.metrics_conversions, 0)), 1) AS conversions,
            SUM(IF(${curPred}, s.metrics_clicks, 0)) AS clicks,
            ROUND(SUM(IF(${ppPred}, s.metrics_cost_micros, 0))/1e6, 2) AS spend_pp,
            ROUND(SUM(IF(${ppPred}, s.metrics_conversions, 0)), 1) AS conversions_pp,
            SUM(IF(${ppPred}, s.metrics_clicks, 0)) AS clicks_pp
     FROM \`${ADS}.p_ads_CampaignBasicStats_2921271203\` s
     JOIN camp_portfolio cp ON s.campaign_id = cp.campaign_id
     WHERE cp.portfolio IS NOT NULL AND ((${curPred}) OR (${ppPred}))
     GROUP BY cp.portfolio
     ORDER BY spend DESC`,
    {
      cacheKey: "ads-by-portfolio",
      keyParts: rangeKeyParts(range),
      params: rangeParams(range),
    },
  );

  return rows
    .filter((r) => r.portfolio != null)
    .map((r) => ({
      portfolio: String(r.portfolio),
      spend: Number(r.spend ?? 0),
      conversions: Number(r.conversions ?? 0),
      clicks: Number(r.clicks ?? 0),
      spendPrevPeriod: Number(r.spend_pp ?? 0),
      conversionsPrevPeriod: Number(r.conversions_pp ?? 0),
      clicksPrevPeriod: Number(r.clicks_pp ?? 0),
    }));
}
