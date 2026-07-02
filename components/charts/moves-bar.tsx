"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatSignedNumber } from "@/lib/format";

interface Totals {
  moveIns: number;
  moveOuts: number;
  net: number;
}

/**
 * Grouped bar chart: previous-year period (left) vs current period (right), each with move-ins
 * (positive), move-outs (rendered negative, below the zero line), and net rentals (signed).
 */
export function MovesBarChart({
  current,
  lastYear,
}: {
  current: Totals;
  lastYear: { moveIns: number | null; moveOuts: number | null; net: number | null };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const hasLY = lastYear.moveIns != null || lastYear.moveOuts != null || lastYear.net != null;
  const data = [
    ...(hasLY
      ? [
          {
            period: "Last year",
            moveIns: lastYear.moveIns ?? 0,
            moveOuts: -(lastYear.moveOuts ?? 0), // below the axis
            net: lastYear.net ?? 0,
          },
        ]
      : []),
    {
      period: "Current",
      moveIns: current.moveIns,
      moveOuts: -current.moveOuts,
      net: current.net,
    },
  ];

  if (!mounted) {
    return <div className="h-[280px] w-full" aria-hidden />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }} barGap={4} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={10} className="text-xs" />
        <YAxis
          width={44}
          tickMargin={6}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatNumber(Number(v))}
          className="text-xs"
        />
        <ReferenceLine y={0} className="stroke-border" />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          formatter={(value, name) =>
            [name === "Net rentals" ? formatSignedNumber(Number(value)) : formatNumber(Math.abs(Number(value))), name] as [string, string]
          }
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
        <Bar dataKey="moveIns" name="Move-ins" fill="#10b981" radius={[2, 2, 0, 0]} />
        <Bar dataKey="moveOuts" name="Move-outs" fill="#ef4444" radius={[0, 0, 2, 2]} />
        <Bar dataKey="net" name="Net rentals" fill="#0ea5e9" radius={2} />
      </BarChart>
    </ResponsiveContainer>
  );
}
