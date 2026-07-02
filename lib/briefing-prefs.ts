// Per-user briefing preferences. PRESENTATION-ONLY: these never change what the AI generates
// (one shared briefing per range) — they only filter/emphasize what each person sees, so there
// is zero added AI cost. Stored on the Clerk user's publicMetadata (no new database), mirroring
// the getRole() pattern in lib/roles.ts.

import type { SignalCategory } from "@/lib/insights";

/** A focusable area: the three signal categories, plus the top/worst "performance" list. */
export type FocusKey = SignalCategory | "performance";
export type CompareMode = "prevYear" | "prevPeriod" | "both";

export const FOCUS_OPTIONS: { key: FocusKey; label: string }[] = [
  { key: "moveins", label: "Move-in / move-out velocity" },
  { key: "occupancy", label: "Occupancy" },
  { key: "adspend", label: "Ad spend & conversions" },
  { key: "performance", label: "Top & worst performers" },
];

export const COMPARE_OPTIONS: { key: CompareMode; label: string }[] = [
  { key: "both", label: "Last month & last year" },
  { key: "prevPeriod", label: "Last month only" },
  { key: "prevYear", label: "Last year only" },
];

const ALL_FOCUS = FOCUS_OPTIONS.map((o) => o.key);
const FOCUS_SET = new Set<string>(ALL_FOCUS);
const COMPARE_SET = new Set<string>(COMPARE_OPTIONS.map((o) => o.key));

export interface BriefingPrefs {
  focus: FocusKey[];
  compare: CompareMode;
}

/** Sensible default when a user hasn't set preferences: show everything, both comparisons. */
export const DEFAULT_PREFS: BriefingPrefs = { focus: ALL_FOCUS, compare: "both" };

/** Read + validate prefs from a Clerk user's public metadata; falls back to defaults. */
export function getBriefingPrefs(
  user: { publicMetadata?: Record<string, unknown> | null } | null | undefined,
): BriefingPrefs {
  const raw = user?.publicMetadata?.briefingPrefs as
    | { focus?: unknown; compare?: unknown }
    | undefined;
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;

  const focus = Array.isArray(raw.focus)
    ? (raw.focus.filter((f): f is FocusKey => typeof f === "string" && FOCUS_SET.has(f)) as FocusKey[])
    : DEFAULT_PREFS.focus;
  const compare =
    typeof raw.compare === "string" && COMPARE_SET.has(raw.compare)
      ? (raw.compare as CompareMode)
      : DEFAULT_PREFS.compare;

  return { focus: focus.length > 0 ? focus : DEFAULT_PREFS.focus, compare };
}

/** Validate an arbitrary object into a clean BriefingPrefs (used by the save action). */
export function sanitizePrefs(input: { focus?: unknown; compare?: unknown }): BriefingPrefs {
  return getBriefingPrefs({ publicMetadata: { briefingPrefs: input } });
}
