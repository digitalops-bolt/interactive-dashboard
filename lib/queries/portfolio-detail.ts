import { cachedQuery } from "@/lib/bigquery";
import {
  comparisonAnchorDate,
  comparisonPredicate,
  occupancyEndAnchor,
  rangePredicate,
  rangeKeyParts,
  rangeParams,
  windowBounds,
  type RangeSpec,
} from "@/lib/metrics";
import type { MetricBaseline } from "@/lib/types";
import { channelLabel, labelToPortfolioCase } from "@/lib/ads";

const A = "cubbyboltdata.analytics";
const S = "cubbyboltdata.stg";
const ADS = "cubbyboltdata.bolt_g_ads_data";

export interface PortfolioKpis {
  occPct: number;
  occupied: number;
  total: number;
  unavailable: number;
  revenue: number;
  moveIns: number;
  moveOuts: number;
  onlineMoveIns: number;
  phoneMoveIns: number;
  occAsOfDate: string | null;
  prevPeriod: MetricBaseline;
  prevYear: MetricBaseline;
}

export interface CategoryOccupancy {
  category: string;
  occupied: number;
  total: number;
  occPct: number;
  unavailable: number;
}

export interface UnitStatus {
  occupied: number;
  vacant: number;
  unavailable: number;
  total: number;
  overlocked: number;
  inAuction: number;
  needsOverlock: number;
  activeLeases: number;
  autopay: number;
}

export interface AdsByType {
  channelType: string;
  channelLabel: string;
  spend: number;
  conversions: number;
}

export interface ConversionActionRow {
  channelType: string;
  channelLabel: string;
  actionName: string;
  category: string;
  conversions: number;
}

export interface FacilityRow {
  facility: string;
  occPct: number | null;
  occupied: number | null;
  total: number | null;
  available: number | null;
  unavailable: number | null;
  revenue: number | null;
  moveIns: number;
  moveOuts: number;
}

export interface PricingGroupRow {
  facility: string;
  pricingGroup: string;
  total: number;
  occupied: number;
  available: number;
  unavailable: number;
  occPct: number | null;
}

const LATEST_OCC = `(SELECT MAX(date) FROM \`${A}.occupancy_daily\`)`;

export async function getPortfolioNames(): Promise<string[]> {
  // Sourced from occupancy_daily's latest snapshot (same table as the leaderboard), NOT
  // portfolio_occ_daily — that sync silently emptied once (2026-07-02) and blanked every
  // /portfolios route, since this list gates the [portfolio] param (empty list = notFound).
  const rows = await cachedQuery<{ portfolio: string }>(
    `SELECT DISTINCT portfolio_name AS portfolio FROM \`${A}.occupancy_daily\`
     WHERE date = ${LATEST_OCC} AND portfolio_name IS NOT NULL
     ORDER BY portfolio_name`,
    { cacheKey: "portfolio-names-v2" },
  );
  return rows.map((r) => r.portfolio);
}

export async function getPortfolioKpis(
  portfolio: string,
  range: RangeSpec,
): Promise<PortfolioKpis> {
  // Coverage guards: a baseline window only counts if our data reaches its start.
  const ppStart = windowBounds(range, "prevPeriod").start;
  const pyStart = windowBounds(range, "prevYear").start;
  // End-of-range occupancy anchor: latest snapshot for presets, the chosen end date for custom.
  const snapAnchor = occupancyEndAnchor(range);
  const ppAnchor = comparisonAnchorDate(snapAnchor, range, "prevPeriod");
  const pyAnchor = comparisonAnchorDate(snapAnchor, range, "prevYear");
  // Occupancy at the latest snapshot on/before an anchor (survives sync gaps; NULL if
  // the anchor predates our data).
  const occAt = (anchor: string) =>
    `(SELECT ROUND(SUM(occupied_units)/SUM(total_units)*100, 1)
        FROM \`${A}.occupancy_daily\`
        WHERE portfolio_name = @p
          AND date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${anchor}))`;
  const flowAgg = (col: string, start: string) =>
    `IF((SELECT MIN(date) FROM \`${A}.facility_daily\`) <= ${start}, SUM(${col}), NULL)`;

  const rows = await cachedQuery<{
    occ_pct: number | null;
    occupied: number | null;
    total: number | null;
    unavailable: number | null;
    revenue: number | null;
    move_ins: number | null;
    move_outs: number | null;
    online: number | null;
    phone: number | null;
    occ_as_of: string | null;
    pp_move_ins: number | null;
    pp_move_outs: number | null;
    pp_revenue: number | null;
    pp_occ: number | null;
    py_move_ins: number | null;
    py_move_outs: number | null;
    py_revenue: number | null;
    py_occ: number | null;
  }>(
    `WITH occ AS (
       SELECT ROUND(SUM(occupied_units)/SUM(total_units)*100, 1) AS occ_pct,
              SUM(occupied_units) AS occupied, SUM(total_units) AS total,
              SUM(unrentable_units) AS unavailable
       FROM \`${A}.occupancy_daily\`
       WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${snapAnchor})
         AND portfolio_name = @p
     ),
     flows AS (
       SELECT SUM(move_ins) AS move_ins, SUM(move_outs) AS move_outs,
              SUM(online_move_ins) AS online, SUM(phone_move_ins) AS phone
       FROM \`${A}.facility_daily\`
       WHERE portfolio = @p AND ${rangePredicate("date", range)}
     ),
     rev AS (
       SELECT CAST(SUM(net_revenue) AS FLOAT64) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE portfolio = @p AND ${rangePredicate("payment_date", range)}
     ),
     flows_pp AS (
       SELECT ${flowAgg("move_ins", ppStart)} AS move_ins,
              ${flowAgg("move_outs", ppStart)} AS move_outs
       FROM \`${A}.facility_daily\`
       WHERE portfolio = @p AND ${comparisonPredicate("date", range, "prevPeriod")}
     ),
     flows_py AS (
       SELECT ${flowAgg("move_ins", pyStart)} AS move_ins,
              ${flowAgg("move_outs", pyStart)} AS move_outs
       FROM \`${A}.facility_daily\`
       WHERE portfolio = @p AND ${comparisonPredicate("date", range, "prevYear")}
     ),
     rev_pp AS (
       SELECT IF((SELECT MIN(payment_date) FROM \`${S}.payments_daily\`) <= ${ppStart},
                 CAST(SUM(net_revenue) AS FLOAT64), NULL) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE portfolio = @p AND ${comparisonPredicate("payment_date", range, "prevPeriod")}
     ),
     rev_py AS (
       SELECT IF((SELECT MIN(payment_date) FROM \`${S}.payments_daily\`) <= ${pyStart},
                 CAST(SUM(net_revenue) AS FLOAT64), NULL) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE portfolio = @p AND ${comparisonPredicate("payment_date", range, "prevYear")}
     )
     SELECT occ.occ_pct, occ.occupied, occ.total, occ.unavailable,
            rev.revenue, flows.move_ins, flows.move_outs, flows.online, flows.phone,
            (SELECT FORMAT_DATE('%Y-%m-%d', MAX(date)) FROM \`${A}.occupancy_daily\`
               WHERE date <= ${snapAnchor}) AS occ_as_of,
            flows_pp.move_ins AS pp_move_ins, flows_pp.move_outs AS pp_move_outs,
            rev_pp.revenue AS pp_revenue, ${occAt(ppAnchor)} AS pp_occ,
            flows_py.move_ins AS py_move_ins, flows_py.move_outs AS py_move_outs,
            rev_py.revenue AS py_revenue, ${occAt(pyAnchor)} AS py_occ
     FROM occ, flows, rev, flows_pp, flows_py, rev_pp, rev_py`,
    {
      cacheKey: "pd-kpis",
      keyParts: [portfolio, ...rangeKeyParts(range)],
      params: { p: portfolio, ...rangeParams(range) },
    },
  );
  const r = rows[0] ?? {};
  const num = (v: number | null | undefined) => (v == null ? null : Number(v));
  const net = (mi: number | null, mo: number | null) =>
    mi == null || mo == null ? null : mi - mo;
  const ppMoveIns = num(r.pp_move_ins);
  const ppMoveOuts = num(r.pp_move_outs);
  const pyMoveIns = num(r.py_move_ins);
  const pyMoveOuts = num(r.py_move_outs);
  return {
    occPct: Number(r.occ_pct ?? 0),
    occupied: Number(r.occupied ?? 0),
    total: Number(r.total ?? 0),
    unavailable: Number(r.unavailable ?? 0),
    revenue: Number(r.revenue ?? 0),
    moveIns: Number(r.move_ins ?? 0),
    moveOuts: Number(r.move_outs ?? 0),
    onlineMoveIns: Number(r.online ?? 0),
    phoneMoveIns: Number(r.phone ?? 0),
    occAsOfDate: r.occ_as_of ?? null,
    prevPeriod: {
      occPct: num(r.pp_occ),
      revenue: num(r.pp_revenue),
      moveIns: ppMoveIns,
      moveOuts: ppMoveOuts,
      netRentals: net(ppMoveIns, ppMoveOuts),
    },
    prevYear: {
      occPct: num(r.py_occ),
      revenue: num(r.py_revenue),
      moveIns: pyMoveIns,
      moveOuts: pyMoveOuts,
      netRentals: net(pyMoveIns, pyMoveOuts),
    },
  };
}

export async function getOccupancyByCategory(
  portfolio: string,
  range: RangeSpec,
): Promise<CategoryOccupancy[]> {
  const snapAnchor = occupancyEndAnchor(range);
  const rows = await cachedQuery<{
    category: string | null;
    occupied: number;
    total: number;
    occ_pct: number;
    unavailable: number;
  }>(
    `SELECT unit_category AS category,
            SUM(occupied_units) AS occupied, SUM(total_units) AS total,
            ROUND(SUM(occupied_units)/SUM(total_units)*100, 1) AS occ_pct,
            SUM(unrentable_units) AS unavailable
     FROM \`${A}.occupancy_daily\`
     WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${snapAnchor})
       AND portfolio_name = @p
     GROUP BY unit_category
     ORDER BY total DESC`,
    {
      cacheKey: "pd-occ-category",
      keyParts: [portfolio, ...rangeKeyParts(range)],
      params: { p: portfolio, ...rangeParams(range) },
    },
  );
  return rows.map((r) => ({
    category: r.category ?? "Uncategorized",
    occupied: Number(r.occupied),
    total: Number(r.total),
    occPct: Number(r.occ_pct),
    unavailable: Number(r.unavailable),
  }));
}

export async function getUnitStatus(portfolio: string): Promise<UnitStatus> {
  const rows = await cachedQuery<{
    occupied: number | null;
    rentable: number | null;
    total: number | null;
    unavailable: number | null;
    overlocked: number | null;
    in_auction: number | null;
    needs_overlock: number | null;
    active_leases: number | null;
    autopay: number | null;
  }>(
    `WITH u AS (
       SELECT SUM(occupied_units) AS occupied, SUM(rentable_units) AS rentable,
              SUM(total_units) AS total, SUM(unrentable_units) AS unavailable
       FROM \`${A}.occupancy_daily\`
       WHERE date = ${LATEST_OCC} AND portfolio_name = @p
     ),
     l AS (
       SELECT COUNT(*) AS active_leases, SUM(is_overlocked) AS overlocked,
              SUM(is_in_auction) AS in_auction, SUM(is_needs_overlock) AS needs_overlock,
              COUNTIF(is_autopay_enabled) AS autopay
       FROM \`${S}.leases_enriched\`
       WHERE is_active = 1 AND portfolio_name = @p
     )
     SELECT u.occupied, u.rentable, u.total, u.unavailable,
            l.overlocked, l.in_auction, l.needs_overlock, l.active_leases, l.autopay
     FROM u, l`,
    { cacheKey: "pd-unit-status", keyParts: [portfolio], params: { p: portfolio } },
  );
  const r = rows[0] ?? {};
  const occupied = Number(r.occupied ?? 0);
  const rentable = Number(r.rentable ?? 0);
  return {
    occupied,
    vacant: Math.max(0, rentable - occupied),
    unavailable: Number(r.unavailable ?? 0),
    total: Number(r.total ?? 0),
    overlocked: Number(r.overlocked ?? 0),
    inAuction: Number(r.in_auction ?? 0),
    needsOverlock: Number(r.needs_overlock ?? 0),
    activeLeases: Number(r.active_leases ?? 0),
    autopay: Number(r.autopay ?? 0),
  };
}

/**
 * Ad spend + conversions by campaign type for one portfolio (date range), via the
 * labels→portfolio attribution. Reads bolt_g_ads_data — requires the dashboard SA to
 * have Data Viewer on that dataset; callers should handle a thrown permission error.
 */
export async function getAdsByType(
  portfolio: string,
  range: RangeSpec,
): Promise<AdsByType[]> {
  const rows = await cachedQuery<{
    channel_type: string | null;
    spend: number;
    conversions: number;
  }>(
    `WITH labels AS (
       SELECT campaign_id, ${labelToPortfolioCase("label_name")} AS portfolio
       FROM \`${ADS}.ads_CampaignLabel_2921271203\`
       WHERE _DATA_DATE = _LATEST_DATE AND label_name NOT LIKE 'Paused%'
     ),
     camp_portfolio AS (
       SELECT campaign_id, ANY_VALUE(portfolio) AS portfolio FROM labels GROUP BY campaign_id
     ),
     camp_type AS (
       SELECT campaign_id, campaign_advertising_channel_type AS channel_type
       FROM \`${ADS}.ads_Campaign_2921271203\` WHERE _DATA_DATE = _LATEST_DATE
     )
     SELECT ct.channel_type,
            ROUND(SUM(s.metrics_cost_micros)/1e6, 2) AS spend,
            ROUND(SUM(s.metrics_conversions), 1) AS conversions
     -- Use CampaignBasicStats, NOT CampaignStats. CampaignStats is segmented by
     -- device/network/slot and its exported rows omit cost, understating daily
     -- campaign spend (~27% low on Demand Gen). BasicStats is the unsegmented
     -- daily campaign table and matches the Google Ads platform totals exactly.
     FROM \`${ADS}.p_ads_CampaignBasicStats_2921271203\` s
     JOIN camp_portfolio cp ON s.campaign_id = cp.campaign_id
     LEFT JOIN camp_type ct ON s.campaign_id = ct.campaign_id
     WHERE cp.portfolio = @p AND ${rangePredicate("s.segments_date", range)}
     GROUP BY ct.channel_type
     ORDER BY spend DESC`,
    {
      cacheKey: "pd-ads-by-type",
      keyParts: [portfolio, ...rangeKeyParts(range)],
      params: { p: portfolio, ...rangeParams(range) },
    },
  );
  return rows.map((r) => ({
    channelType: r.channel_type ?? "OTHER",
    channelLabel: channelLabel(r.channel_type),
    spend: Number(r.spend ?? 0),
    conversions: Number(r.conversions ?? 0),
  }));
}

/**
 * Conversions broken out by campaign channel type AND conversion action for one
 * portfolio (date range). Lets the UI filter which actions count toward "conversions"
 * (e.g. real rentals — PURCHASE — vs phone-call leads used for algo training) while
 * spend stays sourced from getAdsByType. Reads bolt_g_ads_data; callers handle errors.
 */
export async function getConversionsByAction(
  portfolio: string,
  range: RangeSpec,
): Promise<ConversionActionRow[]> {
  const rows = await cachedQuery<{
    channel_type: string | null;
    action_name: string | null;
    category: string | null;
    conversions: number;
  }>(
    `WITH labels AS (
       SELECT campaign_id, ${labelToPortfolioCase("label_name")} AS portfolio
       FROM \`${ADS}.ads_CampaignLabel_2921271203\`
       WHERE _DATA_DATE = _LATEST_DATE AND label_name NOT LIKE 'Paused%'
     ),
     camp_portfolio AS (
       SELECT campaign_id, ANY_VALUE(portfolio) AS portfolio FROM labels GROUP BY campaign_id
     ),
     camp_type AS (
       SELECT campaign_id, campaign_advertising_channel_type AS channel_type
       FROM \`${ADS}.ads_Campaign_2921271203\` WHERE _DATA_DATE = _LATEST_DATE
     )
     SELECT ct.channel_type,
            c.segments_conversion_action_name AS action_name,
            c.segments_conversion_action_category AS category,
            ROUND(SUM(c.metrics_conversions), 1) AS conversions
     FROM \`${ADS}.p_ads_CampaignConversionStats_2921271203\` c
     JOIN camp_portfolio cp ON c.campaign_id = cp.campaign_id
     LEFT JOIN camp_type ct ON c.campaign_id = ct.campaign_id
     WHERE cp.portfolio = @p AND ${rangePredicate("c.segments_date", range)}
     GROUP BY ct.channel_type, action_name, category
     ORDER BY conversions DESC`,
    {
      cacheKey: "pd-conversions-by-action",
      keyParts: [portfolio, ...rangeKeyParts(range)],
      params: { p: portfolio, ...rangeParams(range) },
    },
  );
  return rows.map((r) => ({
    channelType: r.channel_type ?? "OTHER",
    channelLabel: channelLabel(r.channel_type),
    actionName: r.action_name ?? "Unknown",
    category: r.category ?? "OTHER",
    conversions: Number(r.conversions ?? 0),
  }));
}

export async function getPerFacilityBreakdown(
  portfolio: string,
  range: RangeSpec,
): Promise<FacilityRow[]> {
  const snapAnchor = occupancyEndAnchor(range);
  const rows = await cachedQuery<{
    facility: string;
    occupied: number | null;
    total: number | null;
    available: number | null;
    unavailable: number | null;
    occ_pct: number | null;
    move_ins: number;
    move_outs: number;
    revenue: number | null;
  }>(
    `WITH occ AS (
       SELECT facility_id, ANY_VALUE(facility_name) AS facility,
              SUM(occupied_units) AS occupied, SUM(total_units) AS total,
              SUM(rentable_units) - SUM(occupied_units) AS available,
              SUM(unrentable_units) AS unavailable,
              ROUND(SUM(occupied_units)/SUM(total_units)*100, 1) AS occ_pct
       FROM \`${A}.occupancy_daily\`
       WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${snapAnchor})
         AND portfolio_name = @p
       GROUP BY facility_id
     ),
     flows AS (
       SELECT facility_id, SUM(move_ins) AS move_ins, SUM(move_outs) AS move_outs
       FROM \`${A}.facility_daily\`
       WHERE portfolio = @p AND ${rangePredicate("date", range)}
       GROUP BY facility_id
     ),
     rev AS (
       SELECT facility_id, CAST(SUM(net_revenue) AS FLOAT64) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE portfolio = @p AND ${rangePredicate("payment_date", range)}
       GROUP BY facility_id
     )
     SELECT occ.facility, occ.occupied, occ.total, occ.available, occ.unavailable, occ.occ_pct,
            COALESCE(flows.move_ins, 0) AS move_ins, COALESCE(flows.move_outs, 0) AS move_outs,
            rev.revenue
     FROM occ
     LEFT JOIN flows USING (facility_id)
     LEFT JOIN rev USING (facility_id)
     ORDER BY occ.total DESC`,
    {
      // v2: added `available` — bump the key so prod doesn't serve a pre-shape cached
      // row (missing the field) for up to the 1h revalidate window after deploy.
      cacheKey: "pd-per-facility-v2",
      keyParts: [portfolio, ...rangeKeyParts(range)],
      params: { p: portfolio, ...rangeParams(range) },
    },
  );
  return rows.map((r) => ({
    facility: r.facility,
    occPct: r.occ_pct == null ? null : Number(r.occ_pct),
    occupied: r.occupied == null ? null : Number(r.occupied),
    total: r.total == null ? null : Number(r.total),
    available: r.available == null ? null : Number(r.available),
    unavailable: r.unavailable == null ? null : Number(r.unavailable),
    revenue: r.revenue == null ? null : Number(r.revenue),
    moveIns: Number(r.move_ins),
    moveOuts: Number(r.move_outs),
  }));
}

/**
 * Per-pricing-group unit status (latest snapshot) for one portfolio. Pricing groups
 * are facility-specific size/type tiers, so rows carry their facility for filtering.
 * Identity: total = occupied + available + unavailable.
 */
export async function getPricingGroupStatus(
  portfolio: string,
  range: RangeSpec,
): Promise<PricingGroupRow[]> {
  const snapAnchor = occupancyEndAnchor(range);
  const rows = await cachedQuery<{
    facility: string;
    pricing_group: string | null;
    total: number;
    occupied: number;
    available: number;
    unavailable: number;
    occ_pct: number | null;
  }>(
    `SELECT facility_name AS facility, pricing_group_name AS pricing_group,
            SUM(total_units) AS total, SUM(occupied_units) AS occupied,
            SUM(rentable_units) - SUM(occupied_units) AS available,
            SUM(unrentable_units) AS unavailable,
            ROUND(SAFE_DIVIDE(SUM(occupied_units), SUM(total_units)) * 100, 1) AS occ_pct
     FROM \`${A}.occupancy_daily\`
     WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${snapAnchor})
       AND portfolio_name = @p
     GROUP BY facility_name, pricing_group_name
     ORDER BY occ_pct ASC, total DESC`,
    {
      cacheKey: "pd-pricing-groups",
      keyParts: [portfolio, ...rangeKeyParts(range)],
      params: { p: portfolio, ...rangeParams(range) },
    },
  );
  return rows.map((r) => ({
    facility: r.facility,
    pricingGroup: r.pricing_group ?? "Uncategorized",
    total: Number(r.total),
    occupied: Number(r.occupied),
    available: Number(r.available),
    unavailable: Number(r.unavailable),
    occPct: r.occ_pct == null ? null : Number(r.occ_pct),
  }));
}
