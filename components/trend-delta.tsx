import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Delta } from "@/lib/format";

/**
 * Renders a period-over-period delta with a colored arrow. Color reflects whether the
 * change is *good*, which depends on the metric: higherIsBetter=true → up is green;
 * for move-outs (higherIsBetter=false) → up is red. A null delta renders a muted "—"
 * so cards stay aligned when a baseline isn't available yet.
 */
export function TrendDelta({
  delta,
  label,
  higherIsBetter = true,
  divider = false,
  className,
}: {
  delta: Delta | null;
  label?: string;
  higherIsBetter?: boolean;
  /** Render a thin vertical rule before the arrow (separates it from an inline value). */
  divider?: boolean;
  className?: string;
}) {
  if (!delta) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          className,
        )}
      >
        —{label ? <span>{label}</span> : null}
      </span>
    );
  }

  const { direction, text } = delta;
  const good = direction === "flat" ? null : (direction === "up") === higherIsBetter;
  const color =
    good == null
      ? "text-muted-foreground"
      : good
        ? "text-emerald-600 dark:text-emerald-500"
        : "text-red-600 dark:text-red-500";
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        color,
        className,
      )}
    >
      {divider ? (
        <span className="mr-1 h-3 w-px shrink-0 bg-border" aria-hidden />
      ) : null}
      {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
      {text}
      {label ? (
        <span className="font-normal text-muted-foreground"> {label}</span>
      ) : null}
    </span>
  );
}
