import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DecisionTreeOverview } from "@/lib/ai/decision-tree-overview";
import type { StatusTone } from "@/lib/queries/decision-tree";

const STATUS_CLASS: Record<StatusTone, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  neutral: "bg-muted text-muted-foreground",
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function DecisionTreeOverviewCard({ overview }: { overview: DecisionTreeOverview }) {
  if (overview.items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI overview · {monthLabel(overview.month)}</CardTitle>
        <CardDescription>
          Detail on portfolios needing action (and a few low-growth stable ones): ad spend, unit
          availability, pricing-group availability, move-out changes, and auctions.{" "}
          {overview.aiGenerated ? "Refreshed monthly." : "Rules-based (AI unavailable)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {overview.items.map((it) => (
          <div key={it.portfolio} className="border-l-2 border-l-border pl-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{it.portfolio}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  STATUS_CLASS[it.statusTone],
                )}
              >
                {it.statusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{it.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
