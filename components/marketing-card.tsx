"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdsByType, ConversionActionRow } from "@/lib/queries/portfolio-detail";

const CATEGORY_LABELS: Record<string, string> = {
  PURCHASE: "Rentals (purchases)",
  PHONE_CALL_LEAD: "Phone-call leads",
};

function prettyCategory(cat: string) {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ").toLowerCase();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function MarketingCard({
  spendByChannel,
  conversionRows,
  revenue,
}: {
  spendByChannel: AdsByType[];
  conversionRows: ConversionActionRow[];
  revenue: number;
}) {
  // Distinct conversion actions (name + category + total across channels), for the chips.
  const actions = useMemo(() => {
    const map = new Map<
      string,
      { actionName: string; category: string; total: number }
    >();
    for (const r of conversionRows) {
      const cur =
        map.get(r.actionName) ??
        { actionName: r.actionName, category: r.category, total: 0 };
      cur.total += r.conversions;
      map.set(r.actionName, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [conversionRows]);

  const allNames = useMemo(() => actions.map((a) => a.actionName), [actions]);
  const purchaseNames = useMemo(
    () => actions.filter((a) => a.category === "PURCHASE").map((a) => a.actionName),
    [actions],
  );

  // Default: every action selected (the whole picture).
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allNames));

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  const selectAll = () => setSelected(new Set(allNames));
  const selectRentals = () => setSelected(new Set(purchaseNames));

  // Spend & % of revenue are constant — never affected by the conversion filter.
  const totalSpend = useMemo(
    () => spendByChannel.reduce((s, a) => s + a.spend, 0),
    [spendByChannel],
  );
  const adPctRevenue = revenue > 0 ? (totalSpend / revenue) * 100 : null;

  // Filtered conversions per channel + grand total.
  const convByChannel = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of conversionRows) {
      if (!selected.has(r.actionName)) continue;
      m.set(r.channelType, (m.get(r.channelType) ?? 0) + r.conversions);
    }
    return m;
  }, [conversionRows, selected]);

  // Conversions are fractional (Google attributes partial credit). Round per channel
  // for display, and total = sum of those rounded values so the table reconciles with
  // the headline. CPA is then computed from the rounded integer (see table below) so we
  // never show a cost-per-acquisition against "0" conversions.
  const totalConversions = useMemo(
    () => [...convByChannel.values()].reduce((s, v) => s + Math.round(v), 0),
    [convByChannel],
  );

  const grouped = useMemo(() => {
    const g = new Map<string, typeof actions>();
    for (const a of actions) {
      const arr = g.get(a.category) ?? [];
      arr.push(a);
      g.set(a.category, arr);
    }
    return [...g.entries()];
  }, [actions]);

  const allSelected =
    allNames.length > 0 && selected.size === allNames.length;
  const rentalsSelected =
    purchaseNames.length > 0 &&
    selected.size === purchaseNames.length &&
    purchaseNames.every((n) => selected.has(n));

  return (
    <div className="space-y-4">
      {actions.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Count conversions from
            </span>
            <button
              type="button"
              onClick={selectAll}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                allSelected
                  ? "border-foreground bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              All
            </button>
            {purchaseNames.length > 0 && (
              <button
                type="button"
                onClick={selectRentals}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  rentalsSelected
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted",
                )}
              >
                Real rentals only
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {selected.size} of {allNames.length} actions · spend unaffected
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            {grouped.map(([cat, items]) => (
              <div key={cat} className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {prettyCategory(cat)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((a) => {
                    const on = selected.has(a.actionName);
                    return (
                      <button
                        key={a.actionName}
                        type="button"
                        onClick={() => toggle(a.actionName)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "border-input text-muted-foreground hover:bg-muted",
                        )}
                        aria-pressed={on}
                      >
                        {on ? "✓ " : ""}
                        {a.actionName} · {formatNumber(a.total)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ad spend" value={formatCurrency(totalSpend, { compact: true })} />
        <Stat label="Conversions (filtered)" value={formatNumber(totalConversions)} />
        <Stat
          label="% of revenue on ads"
          value={adPctRevenue == null ? "—" : formatPercent(adPctRevenue)}
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign type</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">CPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spendByChannel.map((a) => {
              const conv = Math.round(convByChannel.get(a.channelType) ?? 0);
              return (
                <TableRow key={a.channelType}>
                  <TableCell className="font-medium">{a.channelLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(a.spend, { compact: true })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(conv)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {conv > 0 ? formatCurrency(a.spend / conv) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
