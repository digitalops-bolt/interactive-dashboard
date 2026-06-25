"use client";

import { useMemo, useState } from "react";
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
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { FacilityRow } from "@/lib/queries/portfolio-detail";

type SortKey =
  | "facility"
  | "occPct"
  | "total"
  | "unavailable"
  | "revenue"
  | "moveIns"
  | "moveOuts";

function occToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 85)
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
  if (pct >= 75)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
}

export function PerFacilityTable({ rows }: { rows: FacilityRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey) {
    track("facility_table_sorted", { key });
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "facility" ? "asc" : "desc");
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
    let unavailable = 0;
    let revenue = 0;
    let moveIns = 0;
    let moveOuts = 0;
    for (const r of rows) {
      if (r.occupied != null) occ += r.occupied;
      if (r.total != null) tot += r.total;
      if (r.unavailable != null) unavailable += r.unavailable;
      if (r.revenue != null) revenue += r.revenue;
      moveIns += r.moveIns;
      moveOuts += r.moveOuts;
    }
    return {
      occPct: tot > 0 ? (occ / tot) * 100 : null,
      occ,
      tot,
      unavailable,
      revenue,
      moveIns,
      moveOuts,
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
            <SortHead label="Facility" sortKey="facility" align="left" />
            <SortHead label="Occupancy" sortKey="occPct" />
            <TableHead className="text-right">Units</TableHead>
            <SortHead label="Unavail." sortKey="unavailable" />
            <SortHead label="Revenue" sortKey="revenue" />
            <SortHead label="Move-ins" sortKey="moveIns" />
            <SortHead label="Move-outs" sortKey="moveOuts" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.facility}>
              <TableCell className="font-medium">{r.facility}</TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary" className={occToneClass(r.occPct)}>
                  {formatPercent(r.occPct)}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatNumber(r.occupied)}/{formatNumber(r.total)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatNumber(r.unavailable)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.revenue, { compact: true })}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.moveIns)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(r.moveOuts)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right">
              <Badge variant="secondary" className={occToneClass(totals.occPct)}>
                {formatPercent(totals.occPct)}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatNumber(totals.occ)}/{formatNumber(totals.tot)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.unavailable)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatCurrency(totals.revenue, { compact: true })}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.moveIns)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatNumber(totals.moveOuts)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
