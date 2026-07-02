import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getBriefing, renderBriefingMarkdown } from "@/lib/ai/briefing";
import { parseRangeSpec } from "@/lib/metrics";

export const runtime = "nodejs";

/** Constant-time bearer-token check against BRIEFING_WEBHOOK_SECRET. */
function authorized(req: Request): boolean {
  const secret = process.env.BRIEFING_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Machine-to-machine briefing endpoint for the scheduled digest (n8n → Slack/email).
 * Bearer-authenticated with BRIEFING_WEBHOOK_SECRET (NOT Clerk). Returns the same briefing
 * shown in-app, plus a markdown rendering. Range via ?range=7d (default last 7 days).
 */
export async function GET(req: Request) {
  if (!process.env.BRIEFING_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "BRIEFING_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Default to the same rolling 30-day window the in-app briefing uses, so both share one
  // cached generation per day. (A caller may still override with ?range=.)
  const sp = new URL(req.url).searchParams;
  const range = parseRangeSpec({
    range: sp.get("range") ?? "30d",
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });

  const briefing = await getBriefing(range);
  return NextResponse.json({
    rangeLabel: briefing.rangeLabel,
    aiGenerated: briefing.aiGenerated,
    headline: briefing.headline,
    company: briefing.insights.company,
    companyAds: briefing.insights.companyAds,
    signals: briefing.signals,
    needsAttention: briefing.insights.needsAttention,
    mostImproved: briefing.insights.mostImproved,
    markdown: renderBriefingMarkdown(briefing),
  });
}
