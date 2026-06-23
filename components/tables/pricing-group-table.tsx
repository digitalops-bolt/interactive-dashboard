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
import { formatNumber, formatPercent } from "@/lib/format";
import { track } from "@/lib/analytics";
import type { PricingGroupRow } from "@/lib/queries/portfolio-detail";

type SortKey =
  | "pricingGroup"
  | "facility"
  | "total"
  | "occupied"
  | "available"
  | "unavailable"
  | "occPct";

function occToneClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (pct >= 85)
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
  if (pct >= 75)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
}

export function PricingGroupTable({
  rows,
  facilities,
  multiFacility,
}: {
  rows: PricingGroupRow[];
  facilities: string[];
  multiFacility: boolean;
}) {
  const [facility, setFacility] = useState<string>("all");
  // Default to worst occupancy first so underperformers surface immediately.
  const [sortKey, setSortKey] = useState<SortKey>("occPct");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const showFacilityColumn = multiFacility && facility === "all";

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "pricingGroup" || key === "facility" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(
    () => (facility === "all" ? rows : rows.filter((r) => r.facility === facility)),
    [rows, facility],
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortKey, dir]);

  const totals = useMemo(() => {
    let total = 0;
    let occupied = 0;
    let available = 0;
    let unavailable = 0;
    for (const r of filtered) {
      total += r.total;
      occupied += r.occupied;
      available += r.available;
      unavailable += r.unavailable;
    }
    return {
      total,
      occupied,
      available,
      unavailable,
      occPct: total > 0 ? (occupied / total) * 100 : null,
    };
  }, [filtered]);

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
    <div className="space-y-3">
      {multiFacility && (
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Facility
          </span>
          <select
            value={facility}
            onChange={(e) => {
              track("pricing_group_filtered", { facility: e.target.value });
              setFacility(e.target.value);
            }}
            aria-label="Filter pricing groups by facility"
            className="h-9 min-w-[200px] cursor-pointer rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All facilities</option>
            {facilities.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {sorted.length} {sorted.length === 1 ? "group" : "groups"}
          </span>
        </label>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Pricing group" sortKey="pricingGroup" align="left" />
              {showFacilityColumn && (
                <SortHead label="Facility" sortKey="facility" align="left" />
              )}
              <SortHead label="Total" sortKey="total" />
              <SortHead label="Occupied" sortKey="occupied" />
              <SortHead label="Available" sortKey="available" />
              <SortHead label="Unavailable" sortKey="unavailable" />
              <SortHead label="Occupancy" sortKey="occPct" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={`${r.facility}|${r.pricingGroup}`}>
                <TableCell className="font-medium">{r.pricingGroup}</TableCell>
                {showFacilityColumn && (
                  <TableCell className="text-muted-foreground">{r.facility}</TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.occupied)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(r.available)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNumber(r.unavailable)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className={occToneClass(r.occPct)}>
                    {formatPercent(r.occPct)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              {showFacilityColumn && <TableCell />}
              <TableCell className="text-right tabular-nums font-semibold">
                {formatNumber(totals.total)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {formatNumber(totals.occupied)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {formatNumber(totals.available)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {formatNumber(totals.unavailable)}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant="secondary" className={occToneClass(totals.occPct)}>
                  {formatPercent(totals.occPct)}
                </Badge>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
