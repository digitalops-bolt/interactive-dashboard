// Shared result types for the Portfolio Performance view.
// Money is USD (JS number); percentages are 0–100; dates are 'YYYY-MM-DD'.
// Flow metrics (revenue/moves/net) reflect the SELECTED range; occupancy is always latest.

// A baseline set of the comparable metrics for a prior window. Any field is null when
// that window predates our data (e.g. last-year flows before May 2025) → renders "—".
export interface MetricBaseline {
  occPct: number | null;
  revenue: number | null;
  moveIns: number | null;
  moveOuts: number | null;
  netRentals: number | null;
}

export interface OverviewKpis {
  companyOccPct: number; // 0–100, occupied/total, latest snapshot
  revenue: number; // net (approved − refunds) over the range
  moveIns: number; // over the range, excl. today + IMPORT
  moveOuts: number; // over the range, excl. today
  netRentals: number; // moveIns - moveOuts
  occAsOfDate: string | null; // occupancy snapshot date
  prevPeriod: MetricBaseline; // same-length window immediately before
  prevYear: MetricBaseline; // same window one year ago
}

export interface OccupancyTrendPoint {
  date: string; // YYYY-MM-DD
  unitOccPct: number; // 0–100, occupied_units / total_units
  areaOccPct: number; // 0–100, occupied_sqft / total_sqft
}

// ── Unrentable units (latest snapshot; total = occupied + available + unrentable) ────
// "Prev" fields = the latest snapshot on/before 30 days earlier (null before our data).
export interface UnrentablePortfolioRow {
  portfolio: string;
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number; // rentable − occupied (vacant AND sellable)
  unrentableUnits: number;
  occPct: number; // 0–100, occupied/total
  unrentablePctOfAvailable: number | null; // unrentable/available — CAN exceed 100; null when available = 0
  activeAuctions: number | null; // leases_enriched.is_in_auction, active leases; null = fetch failed (render "—", not 0)
  unrentableUnitsPrev: number | null;
  unrentablePctOfAvailablePrev: number | null;
}

// One entry per pricing group currently holding unrentable units, for one portfolio — powers
// the leaderboard's per-row expand. Pre-filtered (unrentable > 0) and pre-sorted worst-first
// by the query itself; see lib/queries/unrentable.ts.
export interface UnrentablePricingGroupRow {
  pricingGroup: string;
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  unrentableUnits: number;
}

export interface UnrentableSummary {
  asOfDate: string | null;
  totalUnits: number;
  availableUnits: number;
  unrentableUnits: number;
  unrentablePctOfUnits: number | null;
  unrentablePctOfAvailable: number | null;
  portfoliosAffected: number; // portfolios with unrentable > 0
  prev: {
    unrentableUnits: number | null;
    unrentablePctOfUnits: number | null;
    unrentablePctOfAvailable: number | null;
  };
}

export interface PortfolioLeaderRow {
  portfolio: string;
  occupiedUnits: number | null; // null for the Unmapped bucket
  totalUnits: number | null;
  occPct: number | null; // 0–100, latest snapshot; null if no occupancy row
  revenue: number | null; // net revenue over the range; null if none
  moveIns: number;
  moveOuts: number;
  netRentals: number;
  isUnmapped: boolean;
  // Same-window-last-year baselines for the arrows (null when not yet covered).
  occPctPrevYear: number | null;
  revenuePrevYear: number | null;
  netRentalsPrevYear: number | null;
  moveInsPrevYear: number | null;
  // Year-ago unit counts (for the weighted company occupancy total in the footer).
  occupiedUnitsPrevYear: number | null;
  totalUnitsPrevYear: number | null;
  // Prior-period (month-over-month) baselines for the briefing's best/worst deltas.
  occPctPrevPeriod: number | null;
  revenuePrevPeriod: number | null;
}
