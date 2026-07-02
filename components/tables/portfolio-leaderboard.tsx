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
import {
  computeDelta,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedNumber,
} from "@/lib/format";
import { TrendDelta } from "@/components/trend-delta";
import type { PortfolioLeaderRow } from "@/lib/types";

type SortKey =
  | "portfolio"
  | "occPct"
  | "revenue"
  | "moveIns"
  | "moveOuts"
  | "netRentals";

function occToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 85)
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
  if (pct >= 75)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
}

export function PortfolioLeaderboard({ rows }: { rows: PortfolioLeaderRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("occPct");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey) {
    track("leaderboard_sorted", { key });
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
    let occ = 0;
    let tot = 0;
    let revenue = 0;
    let moveIns = 0;
    let moveOuts = 0;
    let netRentals = 0;
    // Year-ago totals: revenue/move-ins/net are summed; occupancy is unit-weighted.
    // Counters track how many rows had a baseline — if none, the total stays null ("—").
    let occPy = 0;
    let totPy = 0;
    let revPy = 0;
    let miPy = 0;
    let netPy = 0;
    let occPyN = 0;
    let revPyN = 0;
    let miPyN = 0;
    let netPyN = 0;
    for (const r of rows) {
      if (r.occupiedUnits != null) occ += r.occupiedUnits;
      if (r.totalUnits != null) tot += r.totalUnits;
      if (r.revenue != null) revenue += r.revenue;
      moveIns += r.moveIns;
      moveOuts += r.moveOuts;
      netRentals += r.netRentals;
      if (r.totalUnitsPrevYear != null && r.occupiedUnitsPrevYear != null) {
        occPy += r.occupiedUnitsPrevYear;
        totPy += r.totalUnitsPrevYear;
        occPyN++;
      }
      if (r.revenuePrevYear != null) {
        revPy += r.revenuePrevYear;
        revPyN++;
      }
      if (r.moveInsPrevYear != null) {
        miPy += r.moveInsPrevYear;
        miPyN++;
      }
      if (r.netRentalsPrevYear != null) {
        netPy += r.netRentalsPrevYear;
        netPyN++;
      }
    }
    return {
      occPct: tot > 0 ? (occ / tot) * 100 : null,
      occ,
      tot,
      revenue,
      moveIns,
      moveOuts,
      netRentals,
      occPctPrevYear: occPyN > 0 && totPy > 0 ? (occPy / totPy) * 100 : null,
      revenuePrevYear: revPyN > 0 ? revPy : null,
      moveInsPrevYear: miPyN > 0 ? miPy : null,
      netRentalsPrevYear: netPyN > 0 ? netPy : null,
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
            <TableHead className="text-right">Units</TableHead>
            <SortHead label="Revenue" sortKey="revenue" />
            <SortHead label="Move-ins" sortKey="moveIns" />
            <SortHead label="Move-outs" sortKey="moveOuts" />
            <SortHead label="Net" sortKey="netRentals" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            // Same-window-last-year arrows (null → not rendered; e.g. uncovered ranges).
            const occD =
              r.occPct == null ? null : computeDelta(r.occPct, r.occPctPrevYear, "pct");
            const revD =
              r.revenue == null ? null : computeDelta(r.revenue, r.revenuePrevYear, "pct");
            const miD = computeDelta(r.moveIns, r.moveInsPrevYear, "count");
            const netD = computeDelta(r.netRentals, r.netRentalsPrevYear, "count");
            return (
              <TableRow key={r.portfolio} className={cn(r.isUnmapped && "text-muted-foreground")}>
                <TableCell className="font-medium">
                  {r.isUnmapped ? (
                    <span>
                      {r.portfolio}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (unmapped facilities)
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={`/portfolios/${encodeURIComponent(r.portfolio)}`}
                      className="text-foreground hover:underline"
                      onClick={() =>
                        track("portfolio_opened", {
                          portfolio: r.portfolio,
                          source: "leaderboard",
                        })
                      }
                    >
                      {r.portfolio}
                    </Link>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {r.occPct == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant="secondary" className={occToneClass(r.occPct)}>
                        {formatPercent(r.occPct)}
                      </Badge>
                    )}
                    {occD ? <TrendDelta delta={occD} divider /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.totalUnits == null
                    ? "—"
                    : `${formatNumber(r.occupiedUnits)}/${formatNumber(r.totalUnits)}`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="flex items-center justify-end gap-1.5">
                    {formatCurrency(r.revenue, { compact: true })}
                    {revD ? <TrendDelta delta={revD} divider /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="flex items-center justify-end gap-1.5">
                    {formatNumber(r.moveIns)}
                    {miD ? <TrendDelta delta={miD} divider /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.moveOuts)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    r.netRentals > 0 && "text-emerald-600 dark:text-emerald-500",
                    r.netRentals < 0 && "text-red-600 dark:text-red-500",
                  )}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {formatSignedNumber(r.netRentals)}
                    {netD ? <TrendDelta delta={netD} divider /> : null}
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
              <div className="flex items-center justify-end gap-1.5">
                {totals.occPct == null ? (
                  "—"
                ) : (
                  <Badge variant="secondary" className={occToneClass(totals.occPct)}>
                    {formatPercent(totals.occPct)}
                  </Badge>
                )}
                {totals.occPct != null && totals.occPctPrevYear != null ? (
                  <TrendDelta
                    delta={computeDelta(totals.occPct, totals.occPctPrevYear, "pct")}
                    divider
                  />
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatNumber(totals.occ)}/{formatNumber(totals.tot)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              <div className="flex items-center justify-end gap-1.5">
                {formatCurrency(totals.revenue, { compact: true })}
                {totals.revenuePrevYear != null ? (
                  <TrendDelta
                    delta={computeDelta(totals.revenue, totals.revenuePrevYear, "pct")}
                    divider
                  />
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              <div className="flex items-center justify-end gap-1.5">
                {formatNumber(totals.moveIns)}
                {totals.moveInsPrevYear != null ? (
                  <TrendDelta
                    delta={computeDelta(totals.moveIns, totals.moveInsPrevYear, "count")}
                    divider
                  />
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.moveOuts)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums font-semibold",
                totals.netRentals > 0 && "text-emerald-600 dark:text-emerald-500",
                totals.netRentals < 0 && "text-red-600 dark:text-red-500",
              )}
            >
              <div className="flex items-center justify-end gap-1.5">
                {formatSignedNumber(totals.netRentals)}
                {totals.netRentalsPrevYear != null ? (
                  <TrendDelta
                    delta={computeDelta(totals.netRentals, totals.netRentalsPrevYear, "count")}
                    divider
                  />
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
