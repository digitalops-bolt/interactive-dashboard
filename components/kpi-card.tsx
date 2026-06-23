import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { computeDelta, type DeltaKind } from "@/lib/format";
import { TrendDelta } from "@/components/trend-delta";

export interface KpiComparison {
  label: string;
  current: number;
  baseline: number | null;
  kind: DeltaKind;
}

export function KpiCard({
  title,
  value,
  hint,
  tone = "default",
  comparisons,
  higherIsBetter = true,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
  comparisons?: KpiComparison[];
  higherIsBetter?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold leading-tight tracking-tight tabular-nums",
          tone === "positive" && "text-emerald-600 dark:text-emerald-500",
          tone === "negative" && "text-red-600 dark:text-red-500",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {comparisons && comparisons.length > 0 ? (
        <div className="mt-2 flex flex-col gap-0.5">
          {comparisons.map((c) => (
            <TrendDelta
              key={c.label}
              delta={computeDelta(c.current, c.baseline, c.kind)}
              label={c.label}
              higherIsBetter={higherIsBetter}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
