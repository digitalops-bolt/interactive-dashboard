import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import {
  getPortfolioContext,
  getPortfolioTrends,
  type PortfolioContext,
  type PortfolioTrend,
  type StatusTone,
} from "@/lib/queries/decision-tree";
import { getAdsByPortfolio } from "@/lib/queries/ads-overview";
import { formatCurrency, formatNumber } from "@/lib/format";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const PROMPT_VERSION = "v1";

const NEEDS_ACTION = new Set(["Declining", "Filling at lower rates", "Higher rate, fewer units"]);
const MAX_STABLE = 3; // a few low-growth "Stable" portfolios for context

function aiDisabled(): boolean {
  if (process.env.AI_BRIEFING_ENABLED === "false") return true;
  return !process.env.ANTHROPIC_API_KEY;
}

export interface OverviewItem {
  portfolio: string;
  statusLabel: string;
  statusTone: StatusTone;
  text: string;
}

export interface DecisionTreeOverview {
  month: string; // 'YYYY-MM'
  aiGenerated: boolean;
  items: OverviewItem[];
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Move-out change: last month vs the average of prior months, as a relative %. */
function moveOutChangePct(t: PortfolioTrend): number | null {
  const mo = t.months.map((m) => m.moveOuts).filter((x): x is number => x != null);
  if (mo.length < 2) return null;
  const recent = mo[mo.length - 1];
  const prior = avg(mo.slice(0, -1));
  if (prior == null || prior === 0) return null;
  return Math.round((recent / prior - 1) * 100);
}

interface AiResult {
  overviews: Record<string, string>;
}

async function narrate(payload: unknown): Promise<AiResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system =
    "You are a self-storage operations analyst writing a monthly per-portfolio note for the " +
    "Bolt Storage team. For each portfolio in the input, write a concise 2-3 sentence overview " +
    "explaining what's happening and what to check or do.\n\n" +
    "RULES:\n" +
    "- Use ONLY the numbers provided; never invent or recompute figures.\n" +
    "- `occChangePts` and `moveOutChangePct` are already computed — occupancy change is a POINT " +
    "difference written with % (e.g. -10%); do not convert it.\n" +
    "- Weave in the relevant signals: ad spend & conversions, vacant units / availability, the " +
    "pricing group with the most availability, whether move-outs rose, and any auctions.\n" +
    "- Be specific and actionable (e.g. what to price, where availability is concentrated). No fluff.\n" +
    "- Output STRICT JSON only: {\"overviews\": {\"<portfolio>\": \"<text>\"}}. No markdown, no fences.";

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
  if (!parsed.overviews || typeof parsed.overviews !== "object") {
    throw new Error("AI response missing overviews");
  }
  return { overviews: parsed.overviews };
}

/** Deterministic one-line fallback when the AI is unavailable. */
function factLine(
  t: PortfolioTrend,
  ctx: PortfolioContext | undefined,
  ad: { spend: number; conversions: number } | undefined,
): string {
  const parts = [`${t.status.label.toLowerCase()}`];
  if (t.occChange != null) parts.push(`occupancy ${t.occChange > 0 ? "+" : ""}${t.occChange}% (6-mo)`);
  if (ctx) parts.push(`${formatNumber(ctx.vacant)} vacant (${ctx.availabilityPct}% avail)`);
  if (ctx?.topAvailGroup)
    parts.push(`most availability: ${ctx.topAvailGroup.group} at ${ctx.topAvailGroup.facility} (${ctx.topAvailGroup.available})`);
  if (ad) parts.push(`ad spend ${formatCurrency(ad.spend)} / ${formatNumber(ad.conversions)} conv`);
  if (ctx?.inAuction) parts.push(`${ctx.inAuction} in auction`);
  return parts.join(" · ");
}

/**
 * Monthly per-portfolio AI overview of the flagged portfolios (needs-action + a few low-growth
 * Stable). Cached on the current calendar month so it generates at most once per month.
 */
export async function getDecisionTreeOverview(): Promise<DecisionTreeOverview> {
  const month = new Date().toISOString().slice(0, 7);
  const [trends, context, ads] = await Promise.all([
    getPortfolioTrends(),
    getPortfolioContext(),
    getAdsByPortfolio({ kind: "preset", key: "30d" }).catch((e) => {
      console.error("getAdsByPortfolio (decision-tree) failed:", e);
      return [];
    }),
  ]);

  const ctxByPortfolio = new Map(context.map((c) => [c.portfolio, c]));
  const adByPortfolio = new Map(ads.map((a) => [a.portfolio, a]));

  const needsAction = trends.filter((t) => NEEDS_ACTION.has(t.status.label));
  const lowGrowthStable = trends
    .filter(
      (t) =>
        t.status.label === "Stable" &&
        Math.abs(t.occChange ?? 0) < 1.5 &&
        Math.abs(t.revChange ?? 0) < 3,
    )
    .slice(0, MAX_STABLE);
  const flagged = [...needsAction, ...lowGrowthStable];

  const baseItems: OverviewItem[] = flagged.map((t) => ({
    portfolio: t.portfolio,
    statusLabel: t.status.label,
    statusTone: t.status.tone,
    text: factLine(t, ctxByPortfolio.get(t.portfolio), adByPortfolio.get(t.portfolio)),
  }));

  if (aiDisabled() || flagged.length === 0) {
    return { month, aiGenerated: false, items: baseItems };
  }

  const payload = flagged.map((t) => {
    const ctx = ctxByPortfolio.get(t.portfolio);
    const ad = adByPortfolio.get(t.portfolio);
    const lastNet = [...t.months].reverse().find((m) => m.netRentals != null)?.netRentals ?? null;
    return {
      portfolio: t.portfolio,
      status: t.status.label,
      occChangePts: t.occChange,
      revChangePct: t.revChange,
      netLastMonth: lastNet,
      moveOutChangePct: moveOutChangePct(t),
      adSpend: ad?.spend ?? null,
      conversions: ad?.conversions ?? null,
      vacantUnits: ctx?.vacant ?? null,
      availabilityPct: ctx?.availabilityPct ?? null,
      mostAvailableGroup: ctx?.topAvailGroup
        ? `${ctx.topAvailGroup.group} at ${ctx.topAvailGroup.facility} (${ctx.topAvailGroup.available} available)`
        : null,
      auctionsInProgress: ctx?.inAuction ?? 0,
    };
  });

  try {
    const cached = unstable_cache(
      () => narrate(payload),
      ["decision-tree-overview", PROMPT_VERSION, month],
      { revalidate: 60 * 60 * 24 * 35, tags: ["decision-tree-overview"] },
    );
    const ai = await cached();
    return {
      month,
      aiGenerated: true,
      items: baseItems.map((it) => ({ ...it, text: ai.overviews[it.portfolio] ?? it.text })),
    };
  } catch (e) {
    console.error("Decision-tree overview narration failed; using fallback:", e);
    return { month, aiGenerated: false, items: baseItems };
  }
}
