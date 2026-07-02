import { cachedQuery } from "@/lib/bigquery";
import {
  comparisonAnchorDate,
  comparisonPredicate,
  occupancyEndAnchor,
  rangePredicate,
  rangeKeyParts,
  rangeParams,
  windowBounds,
  UNMAPPED_PORTFOLIO,
  type RangeSpec,
} from "@/lib/metrics";
import type {
  OccupancyTrendPoint,
  OverviewKpis,
  PortfolioLeaderRow,
} from "@/lib/types";

const A = "cubbyboltdata.analytics";
const S = "cubbyboltdata.stg";

/**
 * Company-wide KPIs. Occupancy = occupied/total, latest snapshot (range-independent).
 * Revenue = net (approved − refunds) over the range from payments_daily. Flows = over the
 * range, excluding today; NO portfolio filter (matches the Slack reports).
 */
export async function getOverviewKpis(range: RangeSpec): Promise<OverviewKpis> {
  const ppStart = windowBounds(range, "prevPeriod").start;
  const pyStart = windowBounds(range, "prevYear").start;
  // Occupancy as-of the window's last day (yesterday for live presets, quarter-end for lastq, `to` for custom).
  const occAnchor = occupancyEndAnchor(range);
  const ppAnchor = comparisonAnchorDate(occAnchor, range, "prevPeriod");
  const pyAnchor = comparisonAnchorDate(occAnchor, range, "prevYear");
  // Company occupancy at the latest snapshot on/before an anchor (NULL if before our data).
  const occAt = (anchor: string) =>
    `(SELECT ROUND(SUM(occupied_units)/SUM(total_units)*100, 1)
        FROM \`${A}.occupancy_daily\`
        WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${anchor}))`;
  const flowSub = (col: string, basis: "prevPeriod" | "prevYear", start: string) =>
    `IF((SELECT MIN(date) FROM \`${A}.facility_daily\`) <= ${start},
        (SELECT SUM(${col}) FROM \`${A}.facility_daily\` WHERE ${comparisonPredicate("date", range, basis)}),
        NULL)`;
  const revSub = (basis: "prevPeriod" | "prevYear", start: string) =>
    `IF((SELECT MIN(payment_date) FROM \`${S}.payments_daily\`) <= ${start},
        (SELECT CAST(SUM(net_revenue) AS FLOAT64) FROM \`${S}.payments_daily\` WHERE ${comparisonPredicate("payment_date", range, basis)}),
        NULL)`;

  const rows = await cachedQuery<{
    company_occ_pct: number | null;
    occ_as_of: string | null;
    revenue: number | null;
    move_ins: number | null;
    move_outs: number | null;
    pp_revenue: number | null;
    pp_move_ins: number | null;
    pp_move_outs: number | null;
    pp_occ: number | null;
    py_revenue: number | null;
    py_move_ins: number | null;
    py_move_outs: number | null;
    py_occ: number | null;
  }>(
    `SELECT
       ${occAt(occAnchor)} AS company_occ_pct,
       (SELECT FORMAT_DATE('%Y-%m-%d', MAX(date))
          FROM \`${A}.occupancy_daily\` WHERE date <= ${occAnchor}) AS occ_as_of,
       (SELECT CAST(SUM(net_revenue) AS FLOAT64) FROM \`${S}.payments_daily\`
          WHERE ${rangePredicate("payment_date", range)}) AS revenue,
       (SELECT SUM(move_ins) FROM \`${A}.facility_daily\` WHERE ${rangePredicate("date", range)}) AS move_ins,
       (SELECT SUM(move_outs) FROM \`${A}.facility_daily\` WHERE ${rangePredicate("date", range)}) AS move_outs,
       ${revSub("prevPeriod", ppStart)} AS pp_revenue,
       ${flowSub("move_ins", "prevPeriod", ppStart)} AS pp_move_ins,
       ${flowSub("move_outs", "prevPeriod", ppStart)} AS pp_move_outs,
       ${occAt(ppAnchor)} AS pp_occ,
       ${revSub("prevYear", pyStart)} AS py_revenue,
       ${flowSub("move_ins", "prevYear", pyStart)} AS py_move_ins,
       ${flowSub("move_outs", "prevYear", pyStart)} AS py_move_outs,
       ${occAt(pyAnchor)} AS py_occ`,
    { cacheKey: "overview-kpis", keyParts: rangeKeyParts(range), params: rangeParams(range) },
  );
  const r = rows[0] ?? {};
  const moveIns = Number(r.move_ins ?? 0);
  const moveOuts = Number(r.move_outs ?? 0);
  const num = (v: number | null | undefined) => (v == null ? null : Number(v));
  const net = (mi: number | null, mo: number | null) =>
    mi == null || mo == null ? null : mi - mo;
  const ppMi = num(r.pp_move_ins);
  const ppMo = num(r.pp_move_outs);
  const pyMi = num(r.py_move_ins);
  const pyMo = num(r.py_move_outs);
  return {
    companyOccPct: Number(r.company_occ_pct ?? 0),
    revenue: Number(r.revenue ?? 0),
    moveIns,
    moveOuts,
    netRentals: moveIns - moveOuts,
    occAsOfDate: r.occ_as_of ?? null,
    prevPeriod: {
      occPct: num(r.pp_occ),
      revenue: num(r.pp_revenue),
      moveIns: ppMi,
      moveOuts: ppMo,
      netRentals: net(ppMi, ppMo),
    },
    prevYear: {
      occPct: num(r.py_occ),
      revenue: num(r.py_revenue),
      moveIns: pyMi,
      moveOuts: pyMo,
      netRentals: net(pyMi, pyMo),
    },
  };
}

/**
 * Occupancy % per day for the last 90 days — unit (occupied/total) and area (occupied/total
 * sqft). Optionally scoped to one portfolio (occupancy_daily has portfolio_name). Days with
 * zero occupied are dropped (broken/partial sync, e.g. the 2026-05-16 gap).
 */
export async function getOccupancyTrend(
  portfolio: string = "all",
): Promise<OccupancyTrendPoint[]> {
  const isAll = !portfolio || portfolio === "all";
  const rows = await cachedQuery<{
    date: string;
    unit_occ_pct: number;
    area_occ_pct: number;
  }>(
    `SELECT FORMAT_DATE('%Y-%m-%d', date) AS date,
            ROUND(SUM(occupied_units)/SUM(total_units)*100, 1) AS unit_occ_pct,
            ROUND(SUM(occupied_sqft)/SUM(total_sqft)*100, 1) AS area_occ_pct
     FROM \`${A}.occupancy_daily\`
     WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
       ${isAll ? "" : "AND portfolio_name = @portfolio"}
     GROUP BY date
     HAVING SUM(occupied_units) > 0
     ORDER BY date`,
    {
      cacheKey: "overview-occupancy-trend",
      keyParts: [isAll ? "all" : portfolio],
      params: isAll ? undefined : { portfolio },
    },
  );
  return rows.map((r) => ({
    date: r.date,
    unitOccPct: Number(r.unit_occ_pct),
    areaOccPct: Number(r.area_occ_pct),
  }));
}

/**
 * Per-portfolio leaderboard. Occupancy = latest snapshot; revenue / move-ins / move-outs /
 * net are summed over the range. Null-portfolio activity is bucketed "Unmapped" so Σ rows =
 * company totals. FULL JOINs keep occupancy-only and flow/revenue-only portfolios visible.
 */
export async function getPortfolioLeaderboard(
  range: RangeSpec,
): Promise<PortfolioLeaderRow[]> {
  const pyStart = windowBounds(range, "prevYear").start;
  const ppStart = windowBounds(range, "prevPeriod").start;
  const curAnchor = occupancyEndAnchor(range);
  const pyAnchor = comparisonAnchorDate(curAnchor, range, "prevYear");
  const ppAnchor = comparisonAnchorDate(curAnchor, range, "prevPeriod");
  const flowGuard = `(SELECT MIN(date) FROM \`${A}.facility_daily\`) <= ${pyStart}`;
  const revGuard = `(SELECT MIN(payment_date) FROM \`${S}.payments_daily\`) <= ${pyStart}`;
  const revGuardPp = `(SELECT MIN(payment_date) FROM \`${S}.payments_daily\`) <= ${ppStart}`;

  const rows = await cachedQuery<{
    portfolio: string;
    occupied_units: number | null;
    total_units: number | null;
    occ_pct: number | null;
    revenue: number | null;
    move_ins: number;
    move_outs: number;
    net_rentals: number;
    occ_pct_py: number | null;
    occupied_units_py: number | null;
    total_units_py: number | null;
    revenue_py: number | null;
    move_ins_py: number | null;
    net_rentals_py: number | null;
    occ_pct_pp: number | null;
    revenue_pp: number | null;
  }>(
    `WITH occ AS (
       SELECT portfolio_name AS portfolio,
              SUM(occupied_units) AS occupied_units,
              SUM(total_units) AS total_units,
              ROUND(SUM(occupied_units)/SUM(total_units) * 100, 1) AS occ_pct
       FROM \`${A}.occupancy_daily\`
       WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${curAnchor})
       GROUP BY 1
     ),
     mtd AS (
       SELECT COALESCE(portfolio, '${UNMAPPED_PORTFOLIO}') AS portfolio,
              SUM(move_ins) AS move_ins,
              SUM(move_outs) AS move_outs,
              SUM(move_ins) - SUM(move_outs) AS net_rentals
       FROM \`${A}.facility_daily\`
       WHERE ${rangePredicate("date", range)}
       GROUP BY 1
     ),
     rev AS (
       SELECT COALESCE(portfolio, '${UNMAPPED_PORTFOLIO}') AS portfolio,
              CAST(SUM(net_revenue) AS FLOAT64) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE ${rangePredicate("payment_date", range)}
       GROUP BY 1
     ),
     flows_py AS (
       SELECT COALESCE(portfolio, '${UNMAPPED_PORTFOLIO}') AS portfolio,
              IF(${flowGuard}, SUM(move_ins), NULL) AS move_ins,
              IF(${flowGuard}, SUM(move_ins) - SUM(move_outs), NULL) AS net_rentals
       FROM \`${A}.facility_daily\`
       WHERE ${comparisonPredicate("date", range, "prevYear")}
       GROUP BY 1
     ),
     rev_py AS (
       SELECT COALESCE(portfolio, '${UNMAPPED_PORTFOLIO}') AS portfolio,
              IF(${revGuard}, CAST(SUM(net_revenue) AS FLOAT64), NULL) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE ${comparisonPredicate("payment_date", range, "prevYear")}
       GROUP BY 1
     ),
     occ_py AS (
       SELECT portfolio_name AS portfolio,
              ROUND(SUM(occupied_units)/SUM(total_units) * 100, 1) AS occ_pct,
              SUM(occupied_units) AS occupied_units,
              SUM(total_units) AS total_units
       FROM \`${A}.occupancy_daily\`
       WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${pyAnchor})
       GROUP BY 1
     ),
     occ_pp AS (
       SELECT portfolio_name AS portfolio,
              ROUND(SUM(occupied_units)/SUM(total_units) * 100, 1) AS occ_pct
       FROM \`${A}.occupancy_daily\`
       WHERE date = (SELECT MAX(date) FROM \`${A}.occupancy_daily\` WHERE date <= ${ppAnchor})
       GROUP BY 1
     ),
     rev_pp AS (
       SELECT COALESCE(portfolio, '${UNMAPPED_PORTFOLIO}') AS portfolio,
              IF(${revGuardPp}, CAST(SUM(net_revenue) AS FLOAT64), NULL) AS revenue
       FROM \`${S}.payments_daily\`
       WHERE ${comparisonPredicate("payment_date", range, "prevPeriod")}
       GROUP BY 1
     )
     SELECT
       COALESCE(occ.portfolio, mtd.portfolio, rev.portfolio) AS portfolio,
       occ.occupied_units, occ.total_units, occ.occ_pct,
       rev.revenue,
       COALESCE(mtd.move_ins, 0) AS move_ins,
       COALESCE(mtd.move_outs, 0) AS move_outs,
       COALESCE(mtd.net_rentals, 0) AS net_rentals,
       occ_py.occ_pct AS occ_pct_py,
       occ_py.occupied_units AS occupied_units_py,
       occ_py.total_units AS total_units_py,
       rev_py.revenue AS revenue_py,
       flows_py.move_ins AS move_ins_py,
       flows_py.net_rentals AS net_rentals_py,
       occ_pp.occ_pct AS occ_pct_pp,
       rev_pp.revenue AS revenue_pp
     FROM occ
     FULL OUTER JOIN mtd ON occ.portfolio = mtd.portfolio
     FULL OUTER JOIN rev ON COALESCE(occ.portfolio, mtd.portfolio) = rev.portfolio
     LEFT JOIN occ_py ON occ_py.portfolio = COALESCE(occ.portfolio, mtd.portfolio, rev.portfolio)
     LEFT JOIN rev_py ON rev_py.portfolio = COALESCE(occ.portfolio, mtd.portfolio, rev.portfolio)
     LEFT JOIN flows_py ON flows_py.portfolio = COALESCE(occ.portfolio, mtd.portfolio, rev.portfolio)
     LEFT JOIN occ_pp ON occ_pp.portfolio = COALESCE(occ.portfolio, mtd.portfolio, rev.portfolio)
     LEFT JOIN rev_pp ON rev_pp.portfolio = COALESCE(occ.portfolio, mtd.portfolio, rev.portfolio)
     ORDER BY occ.occ_pct DESC NULLS LAST, move_ins DESC`,
    {
      cacheKey: "overview-portfolio-leaderboard",
      keyParts: rangeKeyParts(range),
      params: rangeParams(range),
    },
  );
  const num = (v: number | null | undefined) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    portfolio: r.portfolio,
    occupiedUnits: r.occupied_units == null ? null : Number(r.occupied_units),
    totalUnits: r.total_units == null ? null : Number(r.total_units),
    occPct: r.occ_pct == null ? null : Number(r.occ_pct),
    revenue: r.revenue == null ? null : Number(r.revenue),
    moveIns: Number(r.move_ins),
    moveOuts: Number(r.move_outs),
    netRentals: Number(r.net_rentals),
    isUnmapped: r.portfolio === UNMAPPED_PORTFOLIO,
    occPctPrevYear: num(r.occ_pct_py),
    revenuePrevYear: num(r.revenue_py),
    netRentalsPrevYear: num(r.net_rentals_py),
    moveInsPrevYear: num(r.move_ins_py),
    occupiedUnitsPrevYear: num(r.occupied_units_py),
    totalUnitsPrevYear: num(r.total_units_py),
    occPctPrevPeriod: num(r.occ_pct_pp),
    revenuePrevPeriod: num(r.revenue_pp),
  }));
}
