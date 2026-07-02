import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import { getOverviewKpis, getPortfolioLeaderboard } from "@/lib/queries/overview";
import { getAdsByPortfolio } from "@/lib/queries/ads-overview";
import { computeSignals, type InsightsResult, type Signal } from "@/lib/insights";
import { rangeKeyParts, rangeLabel, type RangeSpec } from "@/lib/metrics";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
// Bump when the prompt/payload shape changes so cached narrations regenerate.
const PROMPT_VERSION = "v5";
// 24h: combined with a per-data-day cache key, the narration is generated at most once per
// range per data-day (shared by all users) — not on every dashboard open.
const REVALIDATE = 86_400;

// Bolt Storage domain context for interpretation. Soft and observational — the prompt forbids
// treating any of it as a hard rule or as causation.
const STUDENT_MARKETS = [
  "Ithaca",
  "Lansing",
  "Newfield",
  "Christiansburg",
  "Milledgeville",
  "Bowling Green",
];
const DOMAIN_CONTEXT =
  "Seasonality (multi-year observation, NOT a rule and NOT causation — never attribute a change " +
  "to season alone; it could be ads, pricing, or competition): spring/summer is higher demand; " +
  "move-ins historically rise in May, dip in June, then rebound in July-August.\n" +
  "Student markets near universities: Ithaca, Lansing, Newfield (Cornell) get a May spike of " +
  "SHORT-TERM student storage (1-2 months) when classes end; Christiansburg is a student market " +
  "with more competition but still spikes; Milledgeville and Bowling Green are lighter student " +
  "markets. In these markets a May move-in spike is likely seasonal/short-term, so an " +
  "'underpriced / raise rates' hypothesis is WEAKER there — prefer 'monitor, likely seasonal.'";

/** True unless an Anthropic key is present and the kill switch isn't off. */
function aiDisabled(): boolean {
  if (process.env.AI_BRIEFING_ENABLED === "false") return true;
  return !process.env.ANTHROPIC_API_KEY;
}

export interface BriefingSignal extends Signal {
  note: string; // AI hypothesis if available, else the deterministic default
}

export interface Briefing {
  rangeLabel: string;
  aiGenerated: boolean; // false → deterministic fallback (no narration)
  headline: string;
  insights: InsightsResult;
  signals: BriefingSignal[];
}

function signalId(s: Signal): string {
  return `${s.type}:${s.portfolio}`;
}

function fallbackHeadline(insights: InsightsResult, label: string): string {
  const c = insights.company;
  const net = c.netRentals >= 0 ? `+${c.netRentals}` : `${c.netRentals}`;
  const n = insights.signals.length;
  const flagged = n === 0 ? "No notable swings flagged." : `${n} signal${n === 1 ? "" : "s"} flagged below.`;
  return `Occupancy ${c.occPct}% · net rentals ${net} (${c.moveIns} in / ${c.moveOuts} out) for ${label}. ${flagged}`;
}

interface AiResult {
  headline: string;
  notes: Record<string, string>;
}

/** One Anthropic call. Throws on any failure so the result is NOT cached (we retry next time). */
async function narrate(payload: unknown): Promise<AiResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system =
    "You are a self-storage operations analyst writing a short briefing for management at " +
    "Bolt Storage (a multi-portfolio storage operator). You are given pre-computed metrics and " +
    "a list of already-detected signals — each signal's `headline` already contains the exact " +
    "numbers. Your job is ONLY to narrate and prioritize.\n\n" +
    "RULES:\n" +
    "- Use ONLY the numbers provided. NEVER invent, recompute, or estimate any figure.\n" +
    "- `headline`: 2-3 sentences of INSIGHT, not a recap. The reader already sees the KPI cards " +
    "(occupancy, revenue, move-ins, move-outs, net rentals, ad spend), so DO NOT just restate " +
    "those totals. Lead with the most important shifts, risks, or opportunities and the 'so what / " +
    "what to do', citing only the few figures that matter to the point. Plain, direct, no fluff.\n" +
    "- `notes`: for each signal id, one concise, actionable sentence (the 'so what / do what'). " +
    "Build on the provided hypothesis; don't restate the raw numbers.\n" +
    "- The `headline` should also note overall ad performance (spend & conversion change) when the " +
    "ads totals are provided.\n" +
    "- Express an occupancy change as the DIFFERENCE in occupancy points written with a % sign " +
    "(e.g. 80% to 70% is '-10%'). Do NOT compute a relative percentage, and never use 'pp'/'ppt'.\n" +
    "- 'Occupancy' always means UNIT occupancy (occupied units / total units); say 'unit occupancy'.\n" +
    "- Performance is level AND trajectory: a low-occupancy site that is improving year-over-year is " +
    "NOT a poor performer. The lists provided are `needsAttention` (low AND declining YoY) and " +
    "`mostImproved` (biggest YoY occupancy gains) — treat them that way.\n" +
    "- Output STRICT JSON only matching {\"headline\": string, \"notes\": {<id>: string}}. " +
    "No markdown, no code fences, no commentary.\n\n" +
    "DOMAIN CONTEXT (use for smarter interpretation; do not quote verbatim):\n" +
    DOMAIN_CONTEXT;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.3,
    system,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  const parsed = JSON.parse(text) as Partial<AiResult>;
  if (typeof parsed.headline !== "string") throw new Error("AI response missing headline");
  return { headline: parsed.headline, notes: parsed.notes ?? {} };
}

/**
 * Build the management briefing for a range. Runs the (cached) aggregate queries, detects
 * signals deterministically, then has Claude narrate them — the narration is cached per
 * (range, data) so generation is infrequent and cheap. Degrades gracefully to a rules-based
 * briefing (no narration) if the AI key is absent, disabled, or the call fails.
 */
export async function getBriefing(range: RangeSpec): Promise<Briefing> {
  const [kpis, leaderboard, ads] = await Promise.all([
    getOverviewKpis(range),
    getPortfolioLeaderboard(range),
    // Ads requires Data Viewer on the ads dataset; never let it break the briefing.
    getAdsByPortfolio(range).catch((e) => {
      console.error("getAdsByPortfolio failed:", e);
      return [];
    }),
  ]);

  const insights = computeSignals({ kpis, leaderboard, ads });
  const label = rangeLabel(range);

  const base: Briefing = {
    rangeLabel: label,
    aiGenerated: false,
    headline: fallbackHeadline(insights, label),
    insights,
    signals: insights.signals.map((s) => ({ ...s, note: s.hypothesis })),
  };

  if (aiDisabled()) return base;

  // Compact payload — only what the model needs to narrate. No raw rows, no financial detail
  // beyond the figures already in each signal headline.
  const payload = {
    period: label,
    company: insights.company,
    companyAds: insights.companyAds,
    studentMarkets: STUDENT_MARKETS,
    signals: insights.signals.map((s) => ({
      id: signalId(s),
      headline: s.headline,
      hypothesis: s.hypothesis,
    })),
    needsAttention: insights.needsAttention,
    mostImproved: insights.mostImproved,
  };

  // Cache key = data-day (occupancy snapshot date) + range → at most one generation per range
  // per data-day, shared by everyone. Refreshes when the next day's snapshot lands.
  const dayKey = insights.company.occAsOfDate ?? "nodata";
  try {
    const cached = unstable_cache(
      () => narrate(payload),
      ["ai-briefing", PROMPT_VERSION, ...rangeKeyParts(range), dayKey],
      { revalidate: REVALIDATE, tags: ["ai-briefing"] },
    );
    const ai = await cached();
    return {
      ...base,
      aiGenerated: true,
      headline: ai.headline || base.headline,
      signals: insights.signals.map((s) => ({
        ...s,
        note: ai.notes[signalId(s)] ?? s.hypothesis,
      })),
    };
  } catch (e) {
    console.error("AI briefing narration failed; using fallback:", e);
    return base;
  }
}

/** Plain-markdown rendering of a briefing for the scheduled digest (Slack/email via n8n). */
export function renderBriefingMarkdown(b: Briefing): string {
  const lines: string[] = [];
  lines.push(`*Bolt Storage — Management Briefing* (${b.rangeLabel})`, "", b.headline, "");
  if (b.signals.length) {
    lines.push("*Watchlist*");
    for (const s of b.signals) lines.push(`• ${s.headline}\n   ↳ ${s.note}`);
    lines.push("");
  }
  const perfLine = (r: { portfolio: string; occPct: number | null; occPctYoY: number | null; netRentals: number }) =>
    `• ${r.portfolio} — ${r.occPct ?? "—"}% unit occ (YoY ${r.occPctYoY ?? "—"}%), net ${r.netRentals}`;
  if (b.insights.needsAttention.length) {
    lines.push("*Needs attention* (low & declining YoY)");
    for (const r of b.insights.needsAttention) lines.push(perfLine(r));
    lines.push("");
  }
  if (b.insights.mostImproved.length) {
    lines.push("*Most improved* (YoY unit occupancy)");
    for (const r of b.insights.mostImproved) lines.push(perfLine(r));
  }
  if (!b.aiGenerated) lines.push("", "_(rules-based — AI narration unavailable)_");
  return lines.join("\n");
}
