// Display formatters shared across the dashboard.
//
// NOTE: Intl.NumberFormat with `notation: "compact"` rounds inconsistently between
// Node (server) and the browser (e.g. "$50.0K" vs "$50K"), which breaks hydration in
// client components. So compact formatting is done with a deterministic helper below.

function toCompact(abs: number): string {
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${Math.round(abs)}`;
}

export function formatCurrency(
  value: number | null | undefined,
  opts?: { compact?: boolean },
): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (opts?.compact) {
    const sign = value < 0 ? "-" : "";
    return `${sign}$${toCompact(Math.abs(value))}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 1,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatNumber(
  value: number | null | undefined,
  opts?: { compact?: boolean },
): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (opts?.compact) {
    const sign = value < 0 ? "-" : "";
    return `${sign}${toCompact(Math.abs(value))}`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

/** Signed integer for net-rentals style deltas (uses a true minus sign). */
export function formatSignedNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const s = formatNumber(Math.abs(value));
  if (value > 0) return `+${s}`;
  if (value < 0) return `−${s}`;
  return s;
}

// ── Period-over-period deltas ─────────────────────────────────────────────────
// "pp" = occupancy point difference, DISPLAYED with a % sign (e.g. 80%→70% = "−10%") — per
// the company's preference, not a relative %. "pct" = relative % change (revenue/spend),
// "count" = absolute integer difference (move-ins/outs/net).
export type DeltaKind = "pp" | "pct" | "count";
export interface Delta {
  text: string;
  direction: "up" | "down" | "flat";
}

/**
 * Compares a current value to a baseline. Returns null when there's no baseline to
 * compare against (e.g. last-year window predates our data) so the UI can show "—".
 */
export function computeDelta(
  current: number,
  baseline: number | null | undefined,
  kind: DeltaKind,
): Delta | null {
  if (baseline == null || Number.isNaN(baseline)) return null;
  const diff = current - baseline;
  const direction = diff > 1e-9 ? "up" : diff < -1e-9 ? "down" : "flat";
  let mag: string;
  if (kind === "pp") {
    // Point difference, shown with "%" (company preference): 80%→70% renders as "−10%".
    mag = `${Math.abs(diff).toFixed(1).replace(/\.0$/, "")}%`;
  } else if (kind === "pct") {
    if (baseline === 0) return null;
    mag = `${Math.abs((diff / baseline) * 100).toFixed(1)}%`;
  } else {
    mag = formatNumber(Math.abs(Math.round(diff)));
  }
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";
  return { text: `${sign}${mag}`, direction };
}

/** Expects an ISO 'YYYY-MM-DD' string (as returned by FORMAT_DATE). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
