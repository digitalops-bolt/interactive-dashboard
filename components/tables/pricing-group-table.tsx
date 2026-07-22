"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronsUpDown } from "lucide-react";
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
  // Empty set = "all facilities" (no filter). Otherwise show only the selected ones —
  // any number from one up to all of them.
  const [selectedFacilities, setSelectedFacilities] = useState<Set<string>>(
    () => new Set<string>(),
  );
  // Default to worst occupancy first so underperformers surface immediately.
  const [sortKey, setSortKey] = useState<SortKey>("occPct");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  // Hide the per-row facility column only when exactly one facility is isolated —
  // with 0 (all) or 2+ selected, rows mix facilities and need the label.
  const showFacilityColumn = multiFacility && selectedFacilities.size !== 1;

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "pricingGroup" || key === "facility" ? "asc" : "desc");
    }
  }

  const filtered = useMemo(
    () =>
      selectedFacilities.size === 0
        ? rows
        : rows.filter((r) => selectedFacilities.has(r.facility)),
    [rows, selectedFacilities],
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Facility
          </span>
          <FacilityMultiSelect
            facilities={facilities}
            selected={selectedFacilities}
            onChange={setSelectedFacilities}
          />
          <span className="text-xs text-muted-foreground">
            {sorted.length} {sorted.length === 1 ? "group" : "groups"}
          </span>
        </div>
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
              <SortHead label="Unit occ." sortKey="occPct" />
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

/** Checkbox dropdown: pick zero (= all), one, or many facilities at once. */
function FacilityMultiSelect({
  facilities,
  selected,
  onChange,
}: {
  facilities: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleFacility(f: string) {
    const next = new Set(selected);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    track("pricing_group_filtered", { facilities: Array.from(next) });
    onChange(next);
  }

  function selectAll() {
    track("pricing_group_filtered", { facilities: [] });
    onChange(new Set());
  }

  const label =
    selected.size === 0
      ? "All facilities"
      : selected.size === 1
        ? Array.from(selected)[0]
        : `${selected.size} facilities selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter pricing groups by facility"
        className="flex h-9 min-w-[200px] items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm font-medium text-foreground shadow-sm transition-colors hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-10 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          <button
            type="button"
            role="option"
            aria-selected={selected.size === 0}
            onClick={selectAll}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-input",
                selected.size === 0 && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {selected.size === 0 && <Check className="h-3 w-3" />}
            </span>
            All facilities
          </button>
          <div className="my-1 border-t" />
          {facilities.map((f) => {
            const checked = selected.has(f);
            return (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleFacility(f)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-input",
                    checked && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{f}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
