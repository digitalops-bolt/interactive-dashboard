import { cachedQuery } from "@/lib/bigquery";
import type {
  UnrentablePortfolioRow,
  UnrentablePricingGroupRow,
  UnrentableSummary,
} from "@/lib/types";

const A = "cubbyboltdata.analytics";
const S = "cubbyboltdata.stg";

/**
 * Unrentable-unit detail per portfolio, from the latest occupancy_daily snapshot
 * (total = occupied + available + unrentable; available = rentable − occupied).
 * Baselines come from the latest snapshot on/before 30 days ago so the page can show
 * whether unrentable inventory is being worked down. Range-independent by design —
 * unrentable is a stock, not a flow.
 */
export async function getUnrentableByPortfolio(): Promise<{
  rows: UnrentablePortfolioRow[];
  summary: UnrentableSummary;
}> {
  const [raw, auctionRows] = await Promise.all([
    cachedQuery<{
      portfolio: string;
      total_units: number;
      occupied_units: number;
      rentable_units: number;
      unrentable_units: number;
      total_units_30d: number | null;
      occupied_units_30d: number | null;
      rentable_units_30d: number | null;
      unrentable_units_30d: number | null;
      as_of: string;
    }>(
      `WITH latest AS (
         SELECT MAX(date) AS d FROM \`${A}.occupancy_daily\`
       ),
       baseline AS (
         SELECT MAX(date) AS d FROM \`${A}.occupancy_daily\`, latest
         WHERE date <= DATE_SUB(latest.d, INTERVAL 30 DAY)
       ),
       cur AS (
         SELECT portfolio_name AS portfolio,
                SUM(total_units) AS total_units,
                SUM(occupied_units) AS occupied_units,
                SUM(rentable_units) AS rentable_units,
                SUM(unrentable_units) AS unrentable_units
         FROM \`${A}.occupancy_daily\`, latest
         WHERE date = latest.d
         GROUP BY 1
       ),
       prev AS (
         SELECT portfolio_name AS portfolio,
                SUM(total_units) AS total_units,
                SUM(occupied_units) AS occupied_units,
                SUM(rentable_units) AS rentable_units,
                SUM(unrentable_units) AS unrentable_units
         FROM \`${A}.occupancy_daily\`, baseline
         WHERE date = baseline.d
         GROUP BY 1
       )
       SELECT cur.portfolio,
              cur.total_units,
              cur.occupied_units,
              cur.rentable_units,
              cur.unrentable_units,
              prev.total_units AS total_units_30d,
              prev.occupied_units AS occupied_units_30d,
              prev.rentable_units AS rentable_units_30d,
              prev.unrentable_units AS unrentable_units_30d,
              (SELECT FORMAT_DATE('%Y-%m-%d', d) FROM latest) AS as_of
       FROM cur
       LEFT JOIN prev USING (portfolio)
       ORDER BY cur.unrentable_units DESC`,
      { cacheKey: "unrentable-by-portfolio" },
    ),
    // Active auctions is an independent signal, not an unrentable sub-breakdown — a unit only
    // becomes unrentable once vacant, while an in-auction lease means it's still occupied, so
    // the two never overlap (verified empirically). leases_enriched is a new dependency for
    // this tab; .catch keeps a hiccup there from taking down the whole page.
    cachedQuery<{ portfolio: string; active_auctions: number | null }>(
      `SELECT portfolio_name AS portfolio, SUM(is_in_auction) AS active_auctions
       FROM \`${S}.leases_enriched\`
       WHERE is_active = 1 AND portfolio_name IS NOT NULL
       GROUP BY portfolio`,
      { cacheKey: "unrentable-active-auctions" },
    ).catch(() => null),
  ]);

  const auctionsByPortfolio = auctionRows
    ? new Map(auctionRows.map((r) => [r.portfolio, Number(r.active_auctions ?? 0)]))
    : null;

  const num = (v: number | null | undefined) => (v == null ? null : Number(v));
  // Unrentable / available: exceeds 100% when a portfolio has more broken units than
  // sellable empty ones (Felipe's preferred urgency read). Null when nothing is available.
  const pctOfAvailable = (
    unrentable: number | null,
    available: number | null,
  ): number | null => {
    if (unrentable == null || available == null) return null;
    return available > 0 ? (unrentable / available) * 100 : null;
  };
  const pctOfTotal = (unrentable: number | null, total: number | null): number | null =>
    unrentable == null || total == null || total === 0 ? null : (unrentable / total) * 100;

  const rows: UnrentablePortfolioRow[] = raw.map((r) => {
    const available = Number(r.rentable_units) - Number(r.occupied_units);
    const avail30d =
      r.rentable_units_30d == null || r.occupied_units_30d == null
        ? null
        : Number(r.rentable_units_30d) - Number(r.occupied_units_30d);
    return {
      portfolio: r.portfolio,
      totalUnits: Number(r.total_units),
      occupiedUnits: Number(r.occupied_units),
      availableUnits: available,
      unrentableUnits: Number(r.unrentable_units),
      occPct: (Number(r.occupied_units) / Number(r.total_units)) * 100,
      unrentablePctOfAvailable: pctOfAvailable(Number(r.unrentable_units), available),
      activeAuctions: auctionsByPortfolio == null ? null : auctionsByPortfolio.get(r.portfolio) ?? 0,
      unrentableUnitsPrev: num(r.unrentable_units_30d),
      unrentablePctOfAvailablePrev: pctOfAvailable(num(r.unrentable_units_30d), avail30d),
    };
  });

  const sum = (pick: (r: UnrentablePortfolioRow) => number) =>
    rows.reduce((s, r) => s + pick(r), 0);
  const totalUnits = sum((r) => r.totalUnits);
  const availableUnits = sum((r) => r.availableUnits);
  const unrentableUnits = sum((r) => r.unrentableUnits);
  // Company baselines: only meaningful if every portfolio has a baseline row (they all
  // share the same snapshot date, so in practice it's all-or-nothing).
  const hasPrev = rows.length > 0 && rows.every((r) => r.unrentableUnitsPrev != null);
  const prevRaw = raw.filter((r) => r.unrentable_units_30d != null);
  const prevUnrentable = hasPrev
    ? prevRaw.reduce((s, r) => s + Number(r.unrentable_units_30d), 0)
    : null;
  const prevTotal = hasPrev
    ? prevRaw.reduce((s, r) => s + Number(r.total_units_30d), 0)
    : null;
  const prevAvailable = hasPrev
    ? prevRaw.reduce(
        (s, r) => s + Number(r.rentable_units_30d) - Number(r.occupied_units_30d),
        0,
      )
    : null;

  const summary: UnrentableSummary = {
    asOfDate: raw[0]?.as_of ?? null,
    totalUnits,
    availableUnits,
    unrentableUnits,
    unrentablePctOfUnits: pctOfTotal(unrentableUnits, totalUnits),
    unrentablePctOfAvailable: pctOfAvailable(unrentableUnits, availableUnits),
    portfoliosAffected: rows.filter((r) => r.unrentableUnits > 0).length,
    prev: {
      unrentableUnits: prevUnrentable,
      unrentablePctOfUnits: pctOfTotal(prevUnrentable, prevTotal),
      unrentablePctOfAvailable: pctOfAvailable(prevUnrentable, prevAvailable),
    },
  };

  return { rows, summary };
}

/**
 * Unrentable-unit detail by pricing group, for every portfolio's per-row expand on the
 * leaderboard. Fetched eagerly for all portfolios up front (this page has no client-side
 * fetching anywhere) rather than lazily per row on click. Filtered to pricing groups that
 * currently have unrentable units — company-wide only ~700 units are unrentable, so most of
 * a large portfolio's pricing-group tiers will have none; showing those would just be noise
 * ahead of what the "View full portfolio" link already covers in full.
 */
export async function getUnrentablePricingGroupBreakdown(): Promise<
  Record<string, UnrentablePricingGroupRow[]>
> {
  const raw = await cachedQuery<{
    portfolio: string;
    pricing_group: string | null;
    total_units: number;
    occupied_units: number;
    available_units: number;
    unrentable_units: number;
  }>(
    `WITH latest AS (
       SELECT MAX(date) AS d FROM \`${A}.occupancy_daily\`
     )
     SELECT portfolio_name AS portfolio,
            pricing_group_name AS pricing_group,
            SUM(total_units) AS total_units,
            SUM(occupied_units) AS occupied_units,
            SUM(rentable_units) - SUM(occupied_units) AS available_units,
            SUM(unrentable_units) AS unrentable_units
     FROM \`${A}.occupancy_daily\`, latest
     WHERE date = latest.d
     GROUP BY 1, 2
     HAVING unrentable_units > 0
     ORDER BY 1, unrentable_units DESC`,
    { cacheKey: "unrentable-pricing-groups" },
  );

  const byPortfolio: Record<string, UnrentablePricingGroupRow[]> = {};
  for (const r of raw) {
    const row: UnrentablePricingGroupRow = {
      pricingGroup: r.pricing_group ?? "Uncategorized",
      totalUnits: Number(r.total_units),
      occupiedUnits: Number(r.occupied_units),
      availableUnits: Number(r.available_units),
      unrentableUnits: Number(r.unrentable_units),
    };
    (byPortfolio[r.portfolio] ??= []).push(row);
  }
  return byPortfolio;
}
