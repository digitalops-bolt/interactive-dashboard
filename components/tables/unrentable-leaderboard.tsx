"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { computeDelta, formatNumber, formatPercent } from "@/lib/format";
import { TrendDelta } from "@/components/trend-delta";
import type { UnrentablePortfolioRow } from "@/lib/types";

type SortKey =
  | "portfolio"
  | "occPct"
  | "totalUnits"
  | "occupiedUnits"
  | "availableUnits"
  | "unrentableUnits"
  | "unrentablePctOfUnits"
  | "unrentablePctOfVacant";

function occToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 85)
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
  if (pct >= 75)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
}

// Reversed tones: a HIGH unrentable share of vacant inventory is the bad case.
function urgencyToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 40)
    return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
  if (pct >= 20)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
}

export function UnrentableLeaderboard({ rows }: { rows: UnrentablePortfolioRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("unrentablePctOfVacant");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey) {
    track("unrentable_sorted", { key });
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "portfolio" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      const cmp =
        typeof av === "string"
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, dir]);

  const totals = useMemo(() => {
    let tot = 0;
    let occ = 0;
    let avail = 0;
    let unrent = 0;
    let unrentPrev = 0;
    let unrentPrevN = 0;
    for (const r of rows) {
      tot += r.totalUnits;
      occ += r.occupiedUnits;
      avail += r.availableUnits;
      unrent += r.unrentableUnits;
      if (r.unrentableUnitsPrev != null) {
        unrentPrev += r.unrentableUnitsPrev;
        unrentPrevN++;
      }
    }
    const vacant = avail + unrent;
    return {
      tot,
      occ,
      avail,
      unrent,
      occPct: tot > 0 ? (occ / tot) * 100 : null,
      pctOfUnits: tot > 0 ? (unrent / tot) * 100 : null,
      pctOfVacant: vacant > 0 ? (unrent / vacant) * 100 : null,
      unrentPrev: unrentPrevN > 0 ? unrentPrev : null,
    };
  }, [rows]);

  function SortHead({
    label,
    sortKey: key,
    align = "right",
  }: {
    label: string;
    sortKey: SortKey;
    align?: "left" | "right";
  }) {
    const active = sortKey === key;
    return (
      <TableHead className={align === "right" ? "text-right" : undefined}>
        <button
          type="button"
          onClick={() => toggle(key)}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
            align === "right" && "flex-row-reverse",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
          {active ? (
            dir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          )}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="Portfolio" sortKey="portfolio" align="left" />
            <SortHead label="Unit occ." sortKey="occPct" />
            <SortHead label="Total units" sortKey="totalUnits" />
            <SortHead label="Occupied" sortKey="occupiedUnits" />
            <SortHead label="Available" sortKey="availableUnits" />
            <SortHead label="Unrentable" sortKey="unrentableUnits" />
            <SortHead label="% of units" sortKey="unrentablePctOfUnits" />
            <SortHead label="% of vacant" sortKey="unrentablePctOfVacant" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            // 30-day arrows: fewer unrentable units / lower vacant share = good (green down).
            const countD = computeDelta(r.unrentableUnits, r.unrentableUnitsPrev, "count");
            const vacantD =
              r.unrentablePctOfVacant == null
                ? null
                : computeDelta(r.unrentablePctOfVacant, r.unrentablePctOfVacantPrev, "pp");
            return (
              <TableRow key={r.portfolio}>
                <TableCell className="font-medium">
                  <Link
                    href={`/portfolios/${encodeURIComponent(r.portfolio)}`}
                    className="text-foreground hover:underline"
                    onClick={() =>
                      track("portfolio_opened", {
                        portfolio: r.portfolio,
                        source: "unrentable",
                      })
                    }
                  >
                    {r.portfolio}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className={occToneClass(r.occPct)}>
                    {formatPercent(r.occPct)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(r.totalUnits)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(r.occupiedUnits)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.availableUnits)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  <div className="flex items-center justify-end gap-1.5">
                    {formatNumber(r.unrentableUnits)}
                    {countD ? (
                      <TrendDelta delta={countD} higherIsBetter={false} divider />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(r.unrentablePctOfUnits)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.unrentablePctOfVacant == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge
                        variant="secondary"
                        className={urgencyToneClass(r.unrentablePctOfVacant)}
                      >
                        {formatPercent(r.unrentablePctOfVacant)}
                      </Badge>
                    )}
                    {vacantD ? (
                      <TrendDelta delta={vacantD} higherIsBetter={false} divider />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right">
              {totals.occPct == null ? (
                "—"
              ) : (
                <Badge variant="secondary" className={occToneClass(totals.occPct)}>
                  {formatPercent(totals.occPct)}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.tot)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.occ)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.avail)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              <div className="flex items-center justify-end gap-1.5">
                {formatNumber(totals.unrent)}
                {totals.unrentPrev != null ? (
                  <TrendDelta
                    delta={computeDelta(totals.unrent, totals.unrentPrev, "count")}
                    higherIsBetter={false}
                    divider
                  />
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatPercent(totals.pctOfUnits)}
            </TableCell>
            <TableCell className="text-right">
              {totals.pctOfVacant == null ? (
                "—"
              ) : (
                <Badge variant="secondary" className={urgencyToneClass(totals.pctOfVacant)}>
                  {formatPercent(totals.pctOfVacant)}
                </Badge>
              )}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
