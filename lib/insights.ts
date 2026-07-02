// Deterministic insight engine. ALL numbers are computed here from aggregates the dashboard
// already produces — the AI layer only narrates/prioritizes these, it never invents figures.
// Thresholds live as tunable constants up top; adjust against real data before relying on them.

import { formatCurrency, formatNumber } from "@/lib/format";
import type { MetricBaseline, OverviewKpis, PortfolioLeaderRow } from "@/lib/types";
import type { AdsPortfolioRow } from "@/lib/queries/ads-overview";

// ── Tunable thresholds (with noise floors so tiny portfolios don't dominate) ──
const MOVE_IN_SURGE_RATIO = 1.25; // move-ins ≥ 125% of last year
const MOVE_IN_FLOOR = 5; // …and at least this many move-ins
const HIGH_OCC = 85; // …and occupancy at/above this %
const MOVE_OUT_SURGE_RATIO = 1.25;
const MOVE_OUT_FLOOR = 5;
const OCC_DECLINE_PP = 3; // occupancy down ≥ this many points YoY
const AD_SPEND_SPIKE_RATIO = 1.3; // spend ≥ 130% of prior period
const AD_SPEND_FLOOR = 100; // …on at least this much spend ($)
const CONV_DECLINE_RATIO = 0.8; // conversions ≤ 80% of prior period
const CONV_FLOOR = 5; // …with a meaningful prior-period base
const MAX_SIGNALS = 8;
const PERF_LIST_SIZE = 5;

export type SignalCategory = "moveins" | "occupancy" | "adspend";
export type SignalType =
  | "MOVE_IN_SURGE"
  | "MOVE_OUT_SURGE"
  | "OCC_DECLINE_YOY"
  | "AD_SPEND_SPIKE"
  | "CONV_DECLINE";

/** Severity (higher = more notable) — visual emphasis only. */
export type Severity = "high" | "medium" | "low";

/** Full current-period metric set for one portfolio (shown under each watchlist signal). */
export interface PortfolioMetrics {
  moveIns: number;
  moveOuts: number;
  netRentals: number;
  revenue: number | null;
  adSpend: number | null;
  conversions: number | null;
  cpa: number | null; // spend / conversions
}

export interface Signal {
  type: SignalType;
  category: SignalCategory;
  portfolio: string;
  score: number; // for ranking; not displayed
  severity: Severity;
  headline: string; // deterministic, numbers baked in
  hypothesis: string; // deterministic default; the AI may rephrase
  metrics: PortfolioMetrics; // that portfolio's full current-period figures
}

export interface CompanySummary {
  occPct: number;
  revenue: number;
  moveIns: number;
  moveOuts: number;
  netRentals: number;
  occAsOfDate: string | null;
  prevPeriod: MetricBaseline;
  prevYear: MetricBaseline;
}

export interface PerfRow {
  portfolio: string;
  occPct: number | null;
  occPctMoM: number | null; // relative % vs last month
  occPctYoY: number | null; // relative % vs last year
  netRentals: number;
  revenue: number | null;
  revenueMoM: number | null;
  revenueYoY: number | null;
  adSpend: number | null; // current-window ad spend (null if no ads attributed)
  cpa: number | null; // spend / conversions
  cpc: number | null; // spend / clicks
}

/** Company-wide ad totals for the window vs the prior period (month-over-month). */
export interface CompanyAds {
  spend: number;
  conversions: number;
  clicks: number;
  spendPrevPeriod: number;
  conversionsPrevPeriod: number;
  clicksPrevPeriod: number;
}

export interface InsightsResult {
  company: CompanySummary;
  companyAds: CompanyAds;
  signals: Signal[];
  // Performance is level + trajectory, not occupancy level alone:
  needsAttention: PerfRow[]; // low unit occupancy AND declining YoY (the real problems)
  mostImproved: PerfRow[]; // biggest YoY unit-occupancy gains, any level (turnarounds)
}

function pctChange(current: number, baseline: number): number {
  return Math.round((current / baseline - 1) * 100);
}

/** Relative % change; null when not computable (missing baseline or zero baseline). */
function relPct(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null || baseline === 0) return null;
  return Math.round((current / baseline - 1) * 100);
}

/**
 * Occupancy delta as a POINT difference (current − baseline), one decimal. Per company
 * preference this is displayed with a "%" sign (80%→70% = −10%), not a relative %.
 */
function pointDiff(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null) return null;
  return Math.round((current - baseline) * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function severityFromScore(score: number): Severity {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

/**
 * Turn the cached aggregates into a ranked set of signals plus top/worst performer lists.
 * Pure + synchronous so it can run on the server (briefing) and is trivially testable.
 */
export function computeSignals(input: {
  kpis: OverviewKpis;
  leaderboard: PortfolioLeaderRow[];
  ads: AdsPortfolioRow[];
}): InsightsResult {
  const { kpis, leaderboard, ads } = input;
  const signals: Omit<Signal, "metrics">[] = [];
  const real = leaderboard.filter((r) => !r.isUnmapped);

  const adsByPortfolio = new Map(ads.map((a) => [a.portfolio, a]));
  const leaderByName = new Map(leaderboard.map((r) => [r.portfolio, r]));
  const metricsFor = (portfolio: string): PortfolioMetrics => {
    const lr = leaderByName.get(portfolio);
    const ad = adsByPortfolio.get(portfolio);
    return {
      moveIns: lr?.moveIns ?? 0,
      moveOuts: lr?.moveOuts ?? 0,
      netRentals: lr?.netRentals ?? 0,
      revenue: lr?.revenue ?? null,
      adSpend: ad?.spend ?? null,
      conversions: ad?.conversions ?? null,
      cpa: ad && ad.conversions > 0 ? round2(ad.spend / ad.conversions) : null,
    };
  };

  for (const r of real) {
    // Move-in surge: demand strong + occupancy high → likely underpriced.
    if (
      r.moveInsPrevYear != null &&
      r.moveInsPrevYear > 0 &&
      r.moveIns >= MOVE_IN_FLOOR &&
      r.moveIns >= r.moveInsPrevYear * MOVE_IN_SURGE_RATIO &&
      r.occPct != null &&
      r.occPct >= HIGH_OCC
    ) {
      const change = pctChange(r.moveIns, r.moveInsPrevYear);
      const score = r.moveIns / r.moveInsPrevYear - 1;
      signals.push({
        type: "MOVE_IN_SURGE",
        category: "moveins",
        portfolio: r.portfolio,
        score,
        severity: severityFromScore(score),
        headline: `${r.portfolio}: ${formatNumber(r.moveIns)} move-ins (+${change}% vs last year) at ${r.occPct}% unit occupancy`,
        hypothesis:
          "Demand is strong and occupancy is high — rates may be too low. Consider a price increase.",
      });
    }

    // Move-out surge (YoY) — moveOutsPrevYear is derived: moveIns_py − netRentals_py.
    const moveOutsPrevYear =
      r.moveInsPrevYear != null && r.netRentalsPrevYear != null
        ? r.moveInsPrevYear - r.netRentalsPrevYear
        : null;
    if (
      moveOutsPrevYear != null &&
      moveOutsPrevYear > 0 &&
      r.moveOuts >= MOVE_OUT_FLOOR &&
      r.moveOuts >= moveOutsPrevYear * MOVE_OUT_SURGE_RATIO
    ) {
      const change = pctChange(r.moveOuts, moveOutsPrevYear);
      const score = r.moveOuts / moveOutsPrevYear - 1;
      signals.push({
        type: "MOVE_OUT_SURGE",
        category: "moveins",
        portfolio: r.portfolio,
        score,
        severity: severityFromScore(score),
        headline: `${r.portfolio}: ${formatNumber(r.moveOuts)} move-outs (+${change}% vs last year)`,
        hypothesis:
          "Elevated move-outs — check for seasonality, auctions, or a churn problem.",
      });
    }

    // Occupancy decline YoY.
    if (r.occPct != null && r.occPctPrevYear != null) {
      const diff = r.occPct - r.occPctPrevYear;
      if (diff <= -OCC_DECLINE_PP) {
        const score = Math.abs(diff) / 10;
        // Occupancy change = point difference, shown with "%" (80%→70% = −10%), not relative %.
        const change = Math.round(diff * 10) / 10;
        signals.push({
          type: "OCC_DECLINE_YOY",
          category: "occupancy",
          portfolio: r.portfolio,
          score,
          severity: severityFromScore(score),
          headline: `${r.portfolio}: unit occupancy ${r.occPct}% (${change}% vs last year)`,
          hypothesis:
            "Occupancy is down year-over-year — review pricing and marketing for this market.",
        });
      }
    }
  }

  for (const a of ads) {
    // Ad spend spike with conversions not following.
    if (
      a.spendPrevPeriod >= AD_SPEND_FLOOR &&
      a.spend >= a.spendPrevPeriod * AD_SPEND_SPIKE_RATIO &&
      a.conversions <= a.conversionsPrevPeriod
    ) {
      const change = pctChange(a.spend, a.spendPrevPeriod);
      const score = a.spend / a.spendPrevPeriod - 1;
      signals.push({
        type: "AD_SPEND_SPIKE",
        category: "adspend",
        portfolio: a.portfolio,
        score,
        severity: severityFromScore(score),
        headline: `${a.portfolio}: ad spend ${formatCurrency(a.spend)} (+${change}% vs prior period) but conversions flat/down (${formatNumber(a.conversions)} vs ${formatNumber(a.conversionsPrevPeriod)})`,
        hypothesis:
          "Spend is rising without more conversions — review campaign targeting and cost per acquisition.",
      });
    }

    // Conversions declining vs the prior period.
    if (
      a.conversionsPrevPeriod >= CONV_FLOOR &&
      a.conversions <= a.conversionsPrevPeriod * CONV_DECLINE_RATIO
    ) {
      const change = pctChange(a.conversions, a.conversionsPrevPeriod);
      const score = 1 - a.conversions / a.conversionsPrevPeriod;
      signals.push({
        type: "CONV_DECLINE",
        category: "adspend",
        portfolio: a.portfolio,
        score,
        severity: severityFromScore(score),
        headline: `${a.portfolio}: conversions ${formatNumber(a.conversions)} (${change}% vs prior period)`,
        hypothesis:
          "Conversions are down versus the prior period — check landing pages, budget pacing, and seasonality.",
      });
    }
  }

  signals.sort((a, b) => b.score - a.score);

  const toPerf = (r: PortfolioLeaderRow): PerfRow => {
    const ad = adsByPortfolio.get(r.portfolio);
    return {
      portfolio: r.portfolio,
      occPct: r.occPct,
      occPctMoM: pointDiff(r.occPct, r.occPctPrevPeriod),
      occPctYoY: pointDiff(r.occPct, r.occPctPrevYear),
      netRentals: r.netRentals,
      revenue: r.revenue,
      revenueMoM: relPct(r.revenue, r.revenuePrevPeriod),
      revenueYoY: relPct(r.revenue, r.revenuePrevYear),
      adSpend: ad?.spend ?? null,
      cpa: ad && ad.conversions > 0 ? round2(ad.spend / ad.conversions) : null,
      cpc: ad && ad.clicks > 0 ? round2(ad.spend / ad.clicks) : null,
    };
  };

  const companyAds = ads.reduce<CompanyAds>(
    (acc, a) => ({
      spend: acc.spend + a.spend,
      conversions: acc.conversions + a.conversions,
      clicks: acc.clicks + a.clicks,
      spendPrevPeriod: acc.spendPrevPeriod + a.spendPrevPeriod,
      conversionsPrevPeriod: acc.conversionsPrevPeriod + a.conversionsPrevPeriod,
      clicksPrevPeriod: acc.clicksPrevPeriod + a.clicksPrevPeriod,
    }),
    { spend: 0, conversions: 0, clicks: 0, spendPrevPeriod: 0, conversionsPrevPeriod: 0, clicksPrevPeriod: 0 },
  );

  // Performance = level + trajectory. Build PerfRows, then split into two ACTION lists.
  const perf = real.map(toPerf);
  // Median unit occupancy defines "low" (adaptive, explainable as "bottom half").
  const occs = perf
    .map((p) => p.occPct)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const medianOcc = occs.length ? occs[Math.floor((occs.length - 1) / 2)] : 0;

  // Needs attention: low occupancy AND declining year-over-year; steepest decline first.
  const needsAttention = perf
    .filter((p) => p.occPct != null && p.occPctYoY != null && p.occPctYoY < 0 && p.occPct <= medianOcc)
    .sort((a, b) => (a.occPctYoY ?? 0) - (b.occPctYoY ?? 0))
    .slice(0, PERF_LIST_SIZE);

  // Most improved: biggest YoY unit-occupancy gain, regardless of current level (turnarounds).
  const mostImproved = perf
    .filter((p) => p.occPctYoY != null)
    .sort((a, b) => (b.occPctYoY ?? 0) - (a.occPctYoY ?? 0))
    .slice(0, PERF_LIST_SIZE);

  return {
    company: {
      occPct: kpis.companyOccPct,
      revenue: kpis.revenue,
      moveIns: kpis.moveIns,
      moveOuts: kpis.moveOuts,
      netRentals: kpis.netRentals,
      occAsOfDate: kpis.occAsOfDate,
      prevPeriod: kpis.prevPeriod,
      prevYear: kpis.prevYear,
    },
    companyAds,
    signals: signals
      .slice(0, MAX_SIGNALS)
      .map((s) => ({ ...s, metrics: metricsFor(s.portfolio) })),
    needsAttention,
    mostImproved,
  };
}
