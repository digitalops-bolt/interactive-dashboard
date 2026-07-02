"use client";

import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatSignedNumber } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { Direction, PortfolioTrend, StatusTone } from "@/lib/queries/decision-tree";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  return MONTHS[Number(m) - 1] ?? ym;
}

const STATUS_CLASS: Record<StatusTone, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground",
};

function TrendCell({ dir, value }: { dir: Direction; value: number | null }) {
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : ArrowRight;
  const tone =
    dir === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : dir === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const sign = value != null && value > 0 ? "+" : value != null && value < 0 ? "−" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", tone)}>
      <Icon className="h-3.5 w-3.5" />
      {value == null ? "—" : `${sign}${Math.abs(value)}%`}
    </span>
  );
}

export function DecisionTreeTable({ trends }: { trends: PortfolioTrend[] }) {
  const [metric, setMetric] = useState<"occ" | "rev">("occ");
  const months = trends[0]?.months ?? [];

  function pick(metricKey: "occ" | "rev") {
    setMetric(metricKey);
    track("decision_tree_metric_toggled", { metric: metricKey });
  }

  const cellValue = (p: { occPct: number | null; revenue: number | null }) =>
    metric === "occ"
      ? formatPercent(p.occPct)
      : formatCurrency(p.revenue, { compact: true });

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border p-0.5 text-sm">
        {(["occ", "rev"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => pick(m)}
            className={cn(
              "rounded px-3 py-1 font-medium transition-colors",
              metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "occ" ? "Unit occupancy" : "Revenue"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Portfolio</th>
              {months.map((m) => (
                <th key={m.month} className="px-3 py-2 text-right font-medium">
                  {monthLabel(m.month)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Occ trend</th>
              <th className="px-3 py-2 text-right font-medium">Rev trend</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t) => (
              <tr key={t.portfolio} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{t.portfolio}</td>
                {t.months.map((p) => (
                  <td key={p.month} className="px-3 py-2 text-right tabular-nums">
                    <div>{cellValue(p)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.netRentals == null ? "" : `net ${formatSignedNumber(p.netRentals)}`}
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <TrendCell dir={t.occTrend} value={t.occChange} />
                </td>
                <td className="px-3 py-2 text-right">
                  <TrendCell dir={t.revTrend} value={t.revChange} />
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={cn(
                      "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_CLASS[t.status.tone],
                    )}
                  >
                    {t.status.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Net rentals (move-ins − move-outs) are shown under each month, so you can tell demand from
        auction/onsite occupancy changes. Trend compares the average of the last 3 months vs the
        first 3. Occupancy change is a point difference (80%→70% = −10%); revenue change is relative
        %. Status combines both: Growing (both up), Declining (both down), or a mixed signal.
      </p>
    </div>
  );
}
