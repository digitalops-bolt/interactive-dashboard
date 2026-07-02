import {
  AlertTriangle,
  Megaphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedNumber,
} from "@/lib/format";
import type { Briefing, BriefingSignal } from "@/lib/ai/briefing";
import type { BriefingPrefs } from "@/lib/briefing-prefs";
import type { PerfRow, PortfolioMetrics, SignalCategory, Severity } from "@/lib/insights";
import { TrackOnView } from "@/components/insights/track-view";

const CATEGORY_ICON: Record<SignalCategory, typeof TrendingUp> = {
  moveins: TrendingUp,
  occupancy: TrendingDown,
  adspend: Megaphone,
};

const SEVERITY_BAR: Record<Severity, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-sky-500",
};

/** Dollar with cents — for CPC, which is usually under a few dollars. */
function money2(v: number | null): string {
  return v == null ? "—" : `$${v.toFixed(2)}`;
}

/** Small relative-% delta with arrow + color; renders nothing when not computable. */
function DeltaPct({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const tone =
    value > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : value < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <span className={cn("tabular-nums", tone)}>
      {label} {sign}
      {Math.abs(value)}%
    </span>
  );
}

function MetricLine({ m }: { m: PortfolioMetrics }) {
  const parts = [
    `Move-ins ${formatNumber(m.moveIns)}`,
    `Move-outs ${formatNumber(m.moveOuts)}`,
    `Net ${formatSignedNumber(m.netRentals)}`,
    `Rev ${formatCurrency(m.revenue, { compact: true })}`,
    `Spend ${formatCurrency(m.adSpend, { compact: true })}`,
    `CPA ${m.cpa == null ? "—" : formatCurrency(m.cpa)}`,
    `Conv ${m.conversions == null ? "—" : formatNumber(m.conversions)}`,
  ];
  return <p className="text-xs tabular-nums text-muted-foreground">{parts.join(" · ")}</p>;
}

function SignalRow({ signal }: { signal: BriefingSignal }) {
  const Icon = CATEGORY_ICON[signal.category] ?? AlertTriangle;
  return (
    <div className={cn("border-l-2 py-2 pl-3", SEVERITY_BAR[signal.severity])}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium leading-snug">{signal.headline}</p>
          <p className="text-sm text-muted-foreground">{signal.note}</p>
          <MetricLine m={signal.metrics} />
        </div>
      </div>
    </div>
  );
}

function PerfTable({
  title,
  rows,
  showMoM,
  showYoY,
  empty,
}: {
  title: string;
  rows: PerfRow[];
  showMoM: boolean;
  showYoY: boolean;
  empty?: string;
}) {
  const deltas = (mom: number | null, yoy: number | null) =>
    showMoM || showYoY ? (
      <div className="flex flex-wrap justify-end gap-x-2 text-[11px]">
        {showMoM ? <DeltaPct label="MoM" value={mom} /> : null}
        {showYoY ? <DeltaPct label="YoY" value={yoy} /> : null}
      </div>
    ) : null;

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-medium">Portfolio</th>
              <th className="px-3 py-1.5 text-right font-medium">Unit occupancy</th>
              <th className="px-3 py-1.5 text-right font-medium">Net rentals</th>
              <th className="px-3 py-1.5 text-right font-medium">Revenue</th>
              <th className="px-3 py-1.5 text-right font-medium">Ad spend</th>
              <th className="px-3 py-1.5 text-right font-medium">CPA</th>
              <th className="px-3 py-1.5 text-right font-medium">CPC</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-2 text-muted-foreground">
                  {empty ?? "No data."}
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.portfolio} className="border-b last:border-0 align-top">
                <td className="px-3 py-1.5 font-medium">{r.portfolio}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatPercent(r.occPct)}
                  {deltas(r.occPctMoM, r.occPctYoY)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatSignedNumber(r.netRentals)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatCurrency(r.revenue, { compact: true })}
                  {deltas(r.revenueMoM, r.revenueYoY)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatCurrency(r.adSpend, { compact: true })}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.cpa == null ? "—" : formatCurrency(r.cpa)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money2(r.cpc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Renders the SHARED AI briefing through one user's preferences (presentation-only). The focus
 * list filters which signal categories + the performance section show; the compare setting picks
 * which delta column(s) appear in the best/worst tables. The underlying briefing is identical for
 * everyone (single cached generation).
 */
export function BriefingCard({
  briefing,
  prefs,
}: {
  briefing: Briefing;
  prefs: BriefingPrefs;
}) {
  const focus = new Set(prefs.focus);
  const showMoM = prefs.compare === "prevPeriod" || prefs.compare === "both";
  const showYoY = prefs.compare === "prevYear" || prefs.compare === "both";

  const visibleSignals = briefing.signals.filter((s) => focus.has(s.category));
  const showPerformance = focus.has("performance");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Management briefing
          <span className="text-xs font-normal text-muted-foreground">· {briefing.rangeLabel}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {visibleSignals.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Watchlist
            </p>
            <div className="space-y-1.5">
              {visibleSignals.map((s) => (
                <SignalRow key={`${s.type}:${s.portfolio}`} signal={s} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No notable swings in your selected focus areas for this period.
          </p>
        )}

        {showPerformance &&
        (briefing.insights.needsAttention.length > 0 || briefing.insights.mostImproved.length > 0) ? (
          <div className="space-y-4">
            <PerfTable
              title="Needs attention — low & declining"
              rows={briefing.insights.needsAttention}
              showMoM={showMoM}
              showYoY={showYoY}
              empty="No low-occupancy portfolios are declining year-over-year."
            />
            <PerfTable
              title="Most improved — biggest YoY gains"
              rows={briefing.insights.mostImproved}
              showMoM={showMoM}
              showYoY={showYoY}
              empty="No year-over-year occupancy data yet."
            />
            <p className="text-[11px] text-muted-foreground">
              Performance = level + trajectory. &quot;Needs attention&quot; = below-median unit
              occupancy that&apos;s also falling YoY; &quot;Most improved&quot; = largest YoY unit-occupancy
              gains (any level). Flows for {briefing.rangeLabel.toLowerCase()}; Δ = vs last month / vs last year.
            </p>
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          {briefing.aiGenerated
            ? "AI-summarized from dashboard metrics. Figures come from the data, not the model."
            : "Rules-based summary (AI narration unavailable)."}
        </p>
      </CardContent>
      <TrackOnView event="ai_briefing_viewed" props={{ range: briefing.rangeLabel, ai: briefing.aiGenerated }} />
    </Card>
  );
}
