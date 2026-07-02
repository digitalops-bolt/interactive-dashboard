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
import { TrendDelta } from "@/components/trend-delta";
import { cn } from "@/lib/utils";
import { computeDelta, formatNumber, formatSignedNumber } from "@/lib/format";
import { track } from "@/lib/analytics";

export interface MovesRow {
  portfolio: string;
  moveIns: number;
  moveInsLY: number | null;
  moveOuts: number;
  moveOutsLY: number | null;
  netRentals: number;
  netLY: number | null;
}

type SortKey = "portfolio" | "moveIns" | "moveOuts" | "netRentals";

/** Value with its year-over-year change shown inline beside it (no label — see card description). */
function MoveCell({
  value,
  current,
  baseline,
  higherIsBetter = true,
}: {
  value: string;
  current: number;
  baseline: number | null;
  higherIsBetter?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums">{value}</span>
      <TrendDelta
        delta={computeDelta(current, baseline, "count")}
        higherIsBetter={higherIsBetter}
        divider
      />
    </div>
  );
}

export function MovesTable({
  rows,
  totals,
}: {
  rows: MovesRow[];
  totals: Omit<MovesRow, "portfolio">;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("netRentals");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey) {
    track("moves_table_sorted", { key });
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
      const cmp =
        typeof av === "string"
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, dir]);

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
            <SortHead label="Move-ins" sortKey="moveIns" />
            <SortHead label="Move-outs" sortKey="moveOuts" />
            <SortHead label="Net rentals" sortKey="netRentals" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.portfolio}>
              <TableCell className="font-medium">{r.portfolio}</TableCell>
              <TableCell className="text-right">
                <MoveCell value={formatNumber(r.moveIns)} current={r.moveIns} baseline={r.moveInsLY} />
              </TableCell>
              <TableCell className="text-right">
                <MoveCell
                  value={formatNumber(r.moveOuts)}
                  current={r.moveOuts}
                  baseline={r.moveOutsLY}
                  higherIsBetter={false}
                />
              </TableCell>
              <TableCell className="text-right">
                <MoveCell
                  value={formatSignedNumber(r.netRentals)}
                  current={r.netRentals}
                  baseline={r.netLY}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right">
              <MoveCell value={formatNumber(totals.moveIns)} current={totals.moveIns} baseline={totals.moveInsLY} />
            </TableCell>
            <TableCell className="text-right">
              <MoveCell
                value={formatNumber(totals.moveOuts)}
                current={totals.moveOuts}
                baseline={totals.moveOutsLY}
                higherIsBetter={false}
              />
            </TableCell>
            <TableCell className="text-right">
              <MoveCell value={formatSignedNumber(totals.netRentals)} current={totals.netRentals} baseline={totals.netLY} />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
