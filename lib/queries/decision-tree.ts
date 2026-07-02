import { cachedQuery } from "@/lib/bigquery";

const A = "cubbyboltdata.analytics";
const S = "cubbyboltdata.stg";

export type Direction = "up" | "down" | "flat";
export type StatusTone = "green" | "red" | "amber" | "neutral";

export interface MonthPoint {
  month: string; // 'YYYY-MM'
  occPct: number | null; // unit occupancy %, end-of-month snapshot
  revenue: number | null; // net revenue for the month
  netRentals: number | null; // move-ins − move-outs for the month
  moveOuts: number | null; // move-outs for the month (used by the AI overview)
}

export interface PortfolioTrend {
  portfolio: string;
  months: MonthPoint[]; // chronological, up to 6 complete months
  occChange: number | null; // point difference (avg last 3 − avg first 3), shown with %
  revChange: number | null; // relative % (avg last 3 vs avg first 3)
  occTrend: Direction;
  revTrend: Direction;
  status: { label: string; tone: StatusTone };
}

// Trend thresholds. Occupancy in points (shown with %); revenue in relative %.
const OCC_FLAT = 1.5;
const REV_FLAT = 3;

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function occDir(firstAvg: number | null, lastAvg: number | null): Direction {
  if (firstAvg == null || lastAvg == null) return "flat";
  const d = lastAvg - firstAvg;
  return d > OCC_FLAT ? "up" : d < -OCC_FLAT ? "down" : "flat";
}

function revDir(firstAvg: number | null, lastAvg: number | null): Direction {
  if (firstAvg == null || lastAvg == null || firstAvg === 0) return "flat";
  const r = (lastAvg / firstAvg - 1) * 100;
  return r > REV_FLAT ? "up" : r < -REV_FLAT ? "down" : "flat";
}

function statusFor(occ: Direction, rev: Direction): { label: string; tone: StatusTone } {
  if (occ === "up" && rev === "up") return { label: "Growing", tone: "green" };
  if (occ === "down" && rev === "down") return { label: "Declining", tone: "red" };
  if (occ === "up" && rev === "down") return { label: "Filling at lower rates", tone: "amber" };
  if (occ === "down" && rev === "up") return { label: "Higher rate, fewer units", tone: "amber" };
  return { label: "Stable", tone: "neutral" };
}

const STATUS_ORDER: Record<string, number> = {
  Declining: 0,
  "Higher rate, fewer units": 1,
  "Filling at lower rates": 1,
  Stable: 2,
  Growing: 3,
};

/**
 * Per-portfolio last-6-complete-months trend of unit occupancy (end-of-month snapshot) and
 * net revenue, plus a deterministic "decision tree" status from the occupancy×revenue
 * direction. Athens is already excluded upstream in both source tables.
 */
export async function getPortfolioTrends(): Promise<PortfolioTrend[]> {
  const rows = await cachedQuery<{
    mo: string;
    portfolio: string;
    occ_pct: number | null;
    revenue: number | null;
    net: number | null;
    move_outs: number | null;
  }>(
    `WITH bounds AS (
       SELECT DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 6 MONTH) AS lo,
              DATE_TRUNC(CURRENT_DATE(), MONTH) AS hi
     ),
     month_ends AS (
       SELECT DATE_TRUNC(date, MONTH) AS mo, MAX(date) AS end_date
       FROM \`${A}.occupancy_daily\`, bounds
       WHERE date >= bounds.lo AND date < bounds.hi
       GROUP BY mo
     ),
     occ AS (
       SELECT FORMAT_DATE('%Y-%m', o.date) AS mo, o.portfolio_name AS portfolio,
              ROUND(SUM(o.occupied_units) / SUM(o.total_units) * 100, 1) AS occ_pct
       FROM \`${A}.occupancy_daily\` o
       JOIN month_ends me ON o.date = me.end_date
       GROUP BY mo, portfolio
     ),
     rev AS (
       SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC(p.payment_date, MONTH)) AS mo, p.portfolio AS portfolio,
              CAST(SUM(p.net_revenue) AS FLOAT64) AS revenue
       FROM \`${S}.payments_daily\` p, bounds
       WHERE p.portfolio IS NOT NULL AND p.payment_date >= bounds.lo AND p.payment_date < bounds.hi
       GROUP BY mo, portfolio
     ),
     moves AS (
       SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC(f.date, MONTH)) AS mo, f.portfolio AS portfolio,
              SUM(f.move_ins) - SUM(f.move_outs) AS net, SUM(f.move_outs) AS move_outs
       FROM \`${A}.facility_daily\` f, bounds
       WHERE f.portfolio IS NOT NULL AND f.date >= bounds.lo AND f.date < bounds.hi
       GROUP BY mo, portfolio
     )
     SELECT COALESCE(occ.mo, rev.mo, moves.mo) AS mo,
            COALESCE(occ.portfolio, rev.portfolio, moves.portfolio) AS portfolio,
            occ.occ_pct, rev.revenue, moves.net, moves.move_outs
     FROM occ
     FULL OUTER JOIN rev ON occ.mo = rev.mo AND occ.portfolio = rev.portfolio
     FULL OUTER JOIN moves
       ON COALESCE(occ.mo, rev.mo) = moves.mo
      AND COALESCE(occ.portfolio, rev.portfolio) = moves.portfolio
     ORDER BY portfolio, mo`,
    {
      cacheKey: "decision-tree-trends",
      keyParts: [new Date().toISOString().slice(0, 7)],
      revalidate: 21_600,
    },
  );

  // The 6 chronological month labels present in the data.
  const months = Array.from(new Set(rows.map((r) => r.mo))).sort().slice(-6);
  const byPortfolio = new Map<
    string,
    Map<string, { occPct: number | null; revenue: number | null; netRentals: number | null; moveOuts: number | null }>
  >();
  for (const r of rows) {
    if (!byPortfolio.has(r.portfolio)) byPortfolio.set(r.portfolio, new Map());
    byPortfolio.get(r.portfolio)!.set(r.mo, {
      occPct: r.occ_pct == null ? null : Number(r.occ_pct),
      revenue: r.revenue == null ? null : Number(r.revenue),
      netRentals: r.net == null ? null : Number(r.net),
      moveOuts: r.move_outs == null ? null : Number(r.move_outs),
    });
  }

  const trends: PortfolioTrend[] = [];
  for (const [portfolio, monthMap] of byPortfolio) {
    const series: MonthPoint[] = months.map((m) => ({
      month: m,
      occPct: monthMap.get(m)?.occPct ?? null,
      revenue: monthMap.get(m)?.revenue ?? null,
      netRentals: monthMap.get(m)?.netRentals ?? null,
      moveOuts: monthMap.get(m)?.moveOuts ?? null,
    }));
    const firstHalf = series.slice(0, 3);
    const lastHalf = series.slice(-3);
    const occFirst = avg(firstHalf.map((p) => p.occPct));
    const occLast = avg(lastHalf.map((p) => p.occPct));
    const revFirst = avg(firstHalf.map((p) => p.revenue));
    const revLast = avg(lastHalf.map((p) => p.revenue));
    const occTrend = occDir(occFirst, occLast);
    const revTrend = revDir(revFirst, revLast);
    trends.push({
      portfolio,
      months: series,
      occChange:
        occFirst != null && occLast != null ? Math.round((occLast - occFirst) * 10) / 10 : null,
      revChange:
        revFirst != null && revLast != null && revFirst !== 0
          ? Math.round((revLast / revFirst - 1) * 100)
          : null,
      occTrend,
      revTrend,
      status: statusFor(occTrend, revTrend),
    });
  }

  // Surface problems first: Declining → mixed → Stable → Growing, then by occupancy change asc.
  return trends.sort((a, b) => {
    const sa = STATUS_ORDER[a.status.label] ?? 2;
    const sb = STATUS_ORDER[b.status.label] ?? 2;
    if (sa !== sb) return sa - sb;
    return (a.occChange ?? 0) - (b.occChange ?? 0);
  });
}

// ── Extra per-portfolio context for the monthly AI overview ───────────────────

export interface PortfolioContext {
  portfolio: string;
  occPct: number | null; // current unit occupancy %
  vacant: number; // rentable − occupied (rentable units sitting empty)
  unavailable: number; // unrentable units
  totalUnits: number;
  availabilityPct: number | null; // vacant / total * 100
  topAvailGroup: { facility: string; group: string; available: number } | null;
  inAuction: number; // active leases currently in auction
}

/**
 * Latest-snapshot availability + top-availability pricing group per portfolio (from
 * occupancy_daily), plus active auctions (from leases_enriched). Feeds the AI overview.
 */
export async function getPortfolioContext(): Promise<PortfolioContext[]> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const [groupRows, auctionRows] = await Promise.all([
    cachedQuery<{
      portfolio: string;
      facility: string;
      grp: string | null;
      available: number;
      occupied: number;
      total: number;
      unavailable: number;
    }>(
      `SELECT portfolio_name AS portfolio, facility_name AS facility, pricing_group_name AS grp,
              SUM(rentable_units) - SUM(occupied_units) AS available,
              SUM(occupied_units) AS occupied, SUM(total_units) AS total,
              SUM(unrentable_units) AS unavailable
       FROM \`${A}.occupancy_daily\`
       WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\`)
       GROUP BY portfolio, facility, grp`,
      { cacheKey: "decision-tree-ctx-occ", keyParts: [monthKey], revalidate: 21_600 },
    ),
    cachedQuery<{ portfolio: string; in_auction: number }>(
      `SELECT portfolio_name AS portfolio, SUM(is_in_auction) AS in_auction
       FROM \`${S}.leases_enriched\`
       WHERE is_active = 1 AND portfolio_name IS NOT NULL
       GROUP BY portfolio`,
      { cacheKey: "decision-tree-ctx-auction", keyParts: [monthKey], revalidate: 21_600 },
    ),
  ]);

  const auctionByPortfolio = new Map(
    auctionRows.map((r) => [r.portfolio, Number(r.in_auction ?? 0)]),
  );

  const acc = new Map<
    string,
    {
      occupied: number;
      total: number;
      rentable: number;
      unavailable: number;
      top: { facility: string; group: string; available: number } | null;
    }
  >();
  for (const r of groupRows) {
    if (!r.portfolio) continue;
    const cur =
      acc.get(r.portfolio) ??
      { occupied: 0, total: 0, rentable: 0, unavailable: 0, top: null as null | { facility: string; group: string; available: number } };
    const available = Number(r.available ?? 0);
    cur.occupied += Number(r.occupied ?? 0);
    cur.total += Number(r.total ?? 0);
    cur.rentable += Number(r.occupied ?? 0) + available; // occupied + available = rentable
    cur.unavailable += Number(r.unavailable ?? 0);
    if (available > 0 && (!cur.top || available > cur.top.available)) {
      cur.top = { facility: r.facility, group: r.grp ?? "Uncategorized", available };
    }
    acc.set(r.portfolio, cur);
  }

  return Array.from(acc.entries()).map(([portfolio, a]) => {
    const vacant = Math.max(0, a.rentable - a.occupied);
    return {
      portfolio,
      occPct: a.total > 0 ? Math.round((a.occupied / a.total) * 1000) / 10 : null,
      vacant,
      unavailable: a.unavailable,
      totalUnits: a.total,
      availabilityPct: a.total > 0 ? Math.round((vacant / a.total) * 1000) / 10 : null,
      topAvailGroup: a.top,
      inAuction: auctionByPortfolio.get(portfolio) ?? 0,
    };
  });
}
