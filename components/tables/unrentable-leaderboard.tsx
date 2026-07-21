"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
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
import type { UnrentablePortfolioRow, UnrentablePricingGroupRow } from "@/lib/types";

type SortKey =
  | "portfolio"
  | "unrentablePctOfAvailable"
  | "activeAuctions"
  | "totalUnits"
  | "occupiedUnits"
  | "availableUnits"
  | "unrentableUnits"
  | "occPct";

function occToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 85)
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
  if (pct >= 75)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
}

// Reversed tones: a HIGH unrentable-to-available ratio is the bad case. The ratio can
// exceed 100% (more broken units than sellable empty ones), hence the wider cutoffs.
function urgencyToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 50)
    return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
  if (pct >= 25)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
}

export function UnrentableLeaderboard({
  rows,
  pricingGroupsByPortfolio,
}: {
  rows: UnrentablePortfolioRow[];
  pricingGroupsByPortfolio: Record<string, UnrentablePricingGroupRow[]>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("unrentablePctOfAvailable");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [expandedPortfolio, setExpandedPortfolio] = useState<string | null>(null);

  function toggle(key: SortKey) {
    track("unrentable_sorted", { key });
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "portfolio" ? "asc" : "desc");
    }
  }

  function toggleExpanded(portfolio: string) {
    const willExpand = expandedPortfolio !== portfolio;
    track(willExpand ? "unrentable_portfolio_expanded" : "unrentable_portfolio_collapsed", {
      portfolio,
    });
    setExpandedPortfolio(willExpand ? portfolio : null);
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
    let activeAuctions = 0;
    let auctionsN = 0;
    for (const r of rows) {
      tot += r.totalUnits;
      occ += r.occupiedUnits;
      avail += r.availableUnits;
      unrent += r.unrentableUnits;
      if (r.unrentableUnitsPrev != null) {
        unrentPrev += r.unrentableUnitsPrev;
        unrentPrevN++;
      }
      if (r.activeAuctions != null) {
        activeAuctions += r.activeAuctions;
        auctionsN++;
      }
    }
    return {
      tot,
      occ,
      avail,
      unrent,
      occPct: tot > 0 ? (occ / tot) * 100 : null,
      pctOfAvailable: avail > 0 ? (unrent / avail) * 100 : null,
      unrentPrev: unrentPrevN > 0 ? unrentPrev : null,
      activeAuctions: auctionsN > 0 ? activeAuctions : null,
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
            <SortHead label="Unrentable" sortKey="unrentableUnits" />
            <SortHead label="Available" sortKey="availableUnits" />
            <SortHead label="% of available" sortKey="unrentablePctOfAvailable" />
            <SortHead label="Active auctions" sortKey="activeAuctions" />
            <SortHead label="Total units" sortKey="totalUnits" />
            <SortHead label="Occupied" sortKey="occupiedUnits" />
            <SortHead label="Unit occ." sortKey="occPct" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            // 30-day arrows: fewer unrentable units / lower ratio = good (green down).
            const countD = computeDelta(r.unrentableUnits, r.unrentableUnitsPrev, "count");
            const availD =
              r.unrentablePctOfAvailable == null
                ? null
                : computeDelta(
                    r.unrentablePctOfAvailable,
                    r.unrentablePctOfAvailablePrev,
                    "pp",
                  );
            const isExpanded = expandedPortfolio === r.portfolio;
            const breakdown = pricingGroupsByPortfolio[r.portfolio] ?? [];
            return (
              <Fragment key={r.portfolio}>
                <TableRow>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(r.portfolio)}
                      aria-expanded={isExpanded}
                      className="inline-flex items-center gap-1.5 text-foreground hover:underline"
                    >
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
                      {r.portfolio}
                    </button>
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
                    {formatNumber(r.availableUnits)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.unrentablePctOfAvailable == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant="secondary"
                          className={urgencyToneClass(r.unrentablePctOfAvailable)}
                        >
                          {formatPercent(r.unrentablePctOfAvailable)}
                        </Badge>
                      )}
                      {availD ? (
                        <TrendDelta delta={availD} higherIsBetter={false} divider />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.activeAuctions == null ? "—" : formatNumber(r.activeAuctions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatNumber(r.totalUnits)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatNumber(r.occupiedUnits)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className={occToneClass(r.occPct)}>
                      {formatPercent(r.occPct)}
                    </Badge>
                  </TableCell>
                </TableRow>
                {isExpanded ? (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={8} className="p-0">
                      <div className="max-h-80 overflow-y-auto border-t px-4 py-3">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Unrentable by pricing group
                        </p>
                        {breakdown.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No pricing groups currently have unrentable units.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead>Pricing group</TableHead>
                                <TableHead className="text-right">Unrentable</TableHead>
                                <TableHead className="text-right">Available</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Occupied</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {breakdown.map((pg) => (
                                <TableRow key={pg.pricingGroup}>
                                  <TableCell className="font-medium">
                                    {pg.pricingGroup}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">
                                    {formatNumber(pg.unrentableUnits)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {formatNumber(pg.availableUnits)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {formatNumber(pg.totalUnits)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-muted-foreground">
                                    {formatNumber(pg.occupiedUnits)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                        <div className="mt-2 flex justify-end">
                          <Link
                            href={`/portfolios/${encodeURIComponent(r.portfolio)}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                            onClick={() =>
                              track("portfolio_opened", {
                                portfolio: r.portfolio,
                                source: "unrentable_expanded",
                              })
                            }
                          >
                            View full portfolio <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
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
              {formatNumber(totals.avail)}
            </TableCell>
            <TableCell className="text-right">
              {totals.pctOfAvailable == null ? (
                "—"
              ) : (
                <Badge
                  variant="secondary"
                  className={urgencyToneClass(totals.pctOfAvailable)}
                >
                  {formatPercent(totals.pctOfAvailable)}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {totals.activeAuctions == null ? "—" : formatNumber(totals.activeAuctions)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.tot)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.occ)}
            </TableCell>
            <TableCell className="text-right">
              {totals.occPct == null ? (
                "—"
              ) : (
                <Badge variant="secondary" className={occToneClass(totals.occPct)}>
                  {formatPercent(totals.occPct)}
                </Badge>
              )}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
