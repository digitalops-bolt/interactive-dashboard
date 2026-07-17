import { cachedQuery } from "@/lib/bigquery";
import type { UnrentablePortfolioRow, UnrentableSummary } from "@/lib/types";

const A = "cubbyboltdata.analytics";

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
  const raw = await cachedQuery<{
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
  );

  const num = (v: number | null | undefined) => (v == null ? null : Number(v));
  // Unrentable share of vacant = unrentable / (available + unrentable): "of the units
  // sitting empty, how many can't be sold" — bounded 0–100 even when available is tiny.
  const pctOfVacant = (
    unrentable: number | null,
    available: number | null,
  ): number | null => {
    if (unrentable == null || available == null) return null;
    const vacant = available + unrentable;
    return vacant > 0 ? (unrentable / vacant) * 100 : null;
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
      unrentablePctOfUnits: pctOfTotal(Number(r.unrentable_units), Number(r.total_units)),
      unrentablePctOfVacant: pctOfVacant(Number(r.unrentable_units), available),
      unrentableUnitsPrev: num(r.unrentable_units_30d),
      unrentablePctOfUnitsPrev: pctOfTotal(num(r.unrentable_units_30d), num(r.total_units_30d)),
      unrentablePctOfVacantPrev: pctOfVacant(num(r.unrentable_units_30d), avail30d),
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
    unrentablePctOfVacant: pctOfVacant(unrentableUnits, availableUnits),
    portfoliosAffected: rows.filter((r) => r.unrentableUnits > 0).length,
    prev: {
      unrentableUnits: prevUnrentable,
      unrentablePctOfUnits: pctOfTotal(prevUnrentable, prevTotal),
      unrentablePctOfVacant: pctOfVacant(prevUnrentable, prevAvailable),
    },
  };

  return { rows, summary };
}
