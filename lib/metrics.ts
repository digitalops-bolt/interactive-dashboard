// Canonical metric rules — single source of truth, mirroring the company's n8n report SQL.
//
// OCCUPANCY (a *stock*): occupied/total, occupied = rentable AND occupied, total INCLUDES
// unrentable. Shown as the snapshot at the END of the selected window (latest snapshot for
// presets; the chosen end date for a custom range) — never averaged across dates.
//
// FLOWS (revenue, move-ins/outs/net): summed over the selected window, half-open [start, end).
// Presets end at CURRENT_DATE() so today's partial day is EXCLUDED; custom ranges are capped at
// yesterday by the picker. Move-ins exclude IMPORT (handled upstream). Company-wide totals are
// NOT filtered by portfolio; per-portfolio views bucket null portfolios as 'Unmapped'.
//
// REVENUE: net = approved − refunds, from stg.payments_daily. History is retained back to the
// data floor; the sync only *re-writes* a trailing 95-day window, so revenue on days older than
// ~95 days may not reflect very-late refunds (minor, one-directional).

import { formatDate } from "@/lib/format";

/** Earliest date with data across flows/revenue (facility_daily & payments_daily start here). */
export const DATA_FLOOR = "2025-06-01";

export type PresetKey = "mtd" | "lastmonth" | "7d" | "30d" | "90d" | "qtd" | "lastq";
/** Kept for back-compat in places that only deal with presets. */
export type RangeKey = PresetKey;

/** A resolved date selection: a preset, or an explicit inclusive custom range (single-day when from === to). */
export type RangeSpec =
  | { kind: "preset"; key: PresetKey }
  | { kind: "custom"; from: string; to: string };

export const RANGE_OPTIONS: { key: PresetKey; label: string }[] = [
  { key: "mtd", label: "This month" },
  { key: "lastmonth", label: "Previous month" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "qtd", label: "Quarter to date" },
  { key: "lastq", label: "Last quarter" },
];

const PRESET_KEYS = new Set<string>(RANGE_OPTIONS.map((o) => o.key));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function one(value: string | string[] | undefined | null): string | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Yesterday (UTC) — the latest fully-synced day a custom range may end on. */
export function maxSelectableDate(): string {
  return isoUTC(new Date(Date.now() - 86_400_000));
}

/** Inclusive day-count of a custom range (e.g. Jun 1..Jun 1 = 1). */
function customLengthDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Parse the URL params into a RangeSpec. `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` →
 * custom (clamped to [DATA_FLOOR, yesterday]); a preset key → that preset; anything else → mtd.
 */
export function parseRangeSpec(searchParams: {
  range?: string | string[];
  from?: string | string[];
  to?: string | string[];
}): RangeSpec {
  const range = one(searchParams?.range);
  if (range && PRESET_KEYS.has(range)) {
    return { kind: "preset", key: range as PresetKey };
  }
  if (range === "custom") {
    let from = one(searchParams?.from);
    let to = one(searchParams?.to);
    if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to)) {
      const cap = maxSelectableDate();
      if (from < DATA_FLOOR) from = DATA_FLOOR;
      if (to > cap) to = cap;
      if (from <= to) return { kind: "custom", from, to };
    }
  }
  return { kind: "preset", key: "mtd" };
}

export function rangeLabel(spec: RangeSpec): string {
  if (spec.kind === "custom") {
    return spec.from === spec.to
      ? formatDate(spec.to)
      : `${formatDate(spec.from)} – ${formatDate(spec.to)}`;
  }
  return RANGE_OPTIONS.find((o) => o.key === spec.key)?.label ?? "This month";
}

/** Short label for the prior-period comparison (MTD's prior period is literally last month). */
export function prevPeriodLabel(spec: RangeSpec): string {
  if (spec.kind === "custom") {
    const n = customLengthDays(spec.from, spec.to);
    return n === 1 ? "vs prior day" : `vs prior ${n}d`;
  }
  switch (spec.key) {
    case "mtd":
      return "vs last month";
    case "lastmonth":
      return "vs prior month";
    case "qtd":
      return "vs last quarter";
    case "lastq":
      return "vs prior quarter";
    default:
      return `vs prev ${spec.key}`;
  }
}

// ── Period-over-period comparison helpers ─────────────────────────────────────
// Every comparison is "current window" vs the same-length window shifted back by one
// period (prevPeriod) or by one year (prevYear).

export type ComparisonBasis = "current" | "prevPeriod" | "prevYear";

/** The SQL INTERVAL that equals one window length (used to shift windows and occupancy anchors). */
export function periodShiftInterval(spec: RangeSpec): string {
  if (spec.kind === "custom") {
    return `INTERVAL ${customLengthDays(spec.from, spec.to)} DAY`;
  }
  switch (spec.key) {
    case "mtd":
    case "lastmonth":
      return "INTERVAL 1 MONTH";
    case "7d":
      return "INTERVAL 7 DAY";
    case "30d":
      return "INTERVAL 30 DAY";
    case "90d":
      return "INTERVAL 90 DAY";
    case "qtd":
    case "lastq":
      return "INTERVAL 1 QUARTER";
  }
}

function currentBounds(spec: RangeSpec): { start: string; end: string } {
  if (spec.kind === "custom") {
    // Half-open: end date is inclusive in the UI, so the upper bound is the next day.
    return { start: "DATE(@rng_from)", end: "DATE_ADD(DATE(@rng_to), INTERVAL 1 DAY)" };
  }
  switch (spec.key) {
    case "mtd":
      return { start: "DATE_TRUNC(CURRENT_DATE(), MONTH)", end: "CURRENT_DATE()" };
    case "lastmonth":
      return {
        start: "DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)",
        end: "DATE_TRUNC(CURRENT_DATE(), MONTH)",
      };
    case "7d":
      return { start: "DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)", end: "CURRENT_DATE()" };
    case "30d":
      return { start: "DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)", end: "CURRENT_DATE()" };
    case "90d":
      return { start: "DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)", end: "CURRENT_DATE()" };
    case "qtd":
      return { start: "DATE_TRUNC(CURRENT_DATE(), QUARTER)", end: "CURRENT_DATE()" };
    case "lastq":
      return {
        start:
          "DATE_TRUNC(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 1 DAY), QUARTER)",
        end: "DATE_TRUNC(CURRENT_DATE(), QUARTER)",
      };
  }
}

/** SQL [start, end) date expressions for a flow window on the given basis. */
export function windowBounds(
  spec: RangeSpec,
  basis: ComparisonBasis,
): { start: string; end: string } {
  const base = currentBounds(spec);
  if (basis === "current") return base;
  const shift = basis === "prevYear" ? "INTERVAL 1 YEAR" : periodShiftInterval(spec);
  return {
    start: `DATE_SUB(${base.start}, ${shift})`,
    end: `DATE_SUB(${base.end}, ${shift})`,
  };
}

/** Flow predicate for a comparison window (current / prevPeriod / prevYear). */
export function comparisonPredicate(
  dateColumn: string,
  spec: RangeSpec,
  basis: ComparisonBasis,
): string {
  const { start, end } = windowBounds(spec, basis);
  return `${dateColumn} >= ${start} AND ${dateColumn} < ${end}`;
}

/** Flow predicate over the selected (current) window — excludes today for presets. */
export function rangePredicate(dateColumn: string, spec: RangeSpec): string {
  return comparisonPredicate(dateColumn, spec, "current");
}

/**
 * SQL date of the window's last *included* day — the as-of date for the end-of-range
 * occupancy snapshot. (Window end is exclusive, so it's end − 1 day: yesterday for the
 * live presets, the quarter's last day for "Last quarter", the chosen `to` for custom.)
 */
export function occupancyEndAnchor(spec: RangeSpec): string {
  return `DATE_SUB(${currentBounds(spec).end}, INTERVAL 1 DAY)`;
}

/**
 * Occupancy is a snapshot read at an anchor date. `anchorExpr` is the SQL for the window's
 * end-of-range anchor (latest snapshot for presets, DATE(@rng_to) for custom). Shifts it for
 * prior-period / prior-year baselines.
 */
export function comparisonAnchorDate(
  anchorExpr: string,
  spec: RangeSpec,
  basis: ComparisonBasis,
): string {
  if (basis === "current") return anchorExpr;
  const shift = basis === "prevYear" ? "INTERVAL 1 YEAR" : periodShiftInterval(spec);
  return `DATE_SUB(${anchorExpr}, ${shift})`;
}

/** Bound params required by a spec ({} for presets; the two dates for custom). */
export function rangeParams(spec: RangeSpec): Record<string, string> {
  return spec.kind === "custom" ? { rng_from: spec.from, rng_to: spec.to } : {};
}

/** Cache-key fragments that distinguish one spec from another. */
export function rangeKeyParts(spec: RangeSpec): string[] {
  return spec.kind === "custom" ? ["custom", spec.from, spec.to] : [spec.key];
}

/** Bucket label for activity whose facility has no portfolio mapping. */
export const UNMAPPED_PORTFOLIO = "Unmapped";
