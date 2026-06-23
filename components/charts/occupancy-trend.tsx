"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OccupancyTrendPoint } from "@/lib/types";

function formatTick(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function OccupancyTrendChart({ data }: { data: OccupancyTrendPoint[] }) {
  // Recharts' ResponsiveContainer can't measure on the server, so its SSR markup
  // differs from the client render and trips a hydration mismatch. Render the chart
  // only after mount; the server and first client render both show the placeholder.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No occupancy data available.
      </div>
    );
  }

  if (!mounted) {
    return <div className="h-[300px] w-full" aria-hidden />;
  }

  const values = data.flatMap((d) => [d.unitOccPct, d.areaOccPct]);
  const min = Math.max(0, Math.floor(Math.min(...values) - 3));
  const max = Math.min(100, Math.ceil(Math.max(...values) + 3));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 16, right: 32, left: 8, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          interval="preserveStartEnd"
          minTickGap={36}
          tickMargin={10}
          padding={{ left: 6, right: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-xs"
        />
        <YAxis
          domain={[min, max]}
          tickFormatter={(v) => `${v}%`}
          width={48}
          tickMargin={6}
          tickLine={false}
          axisLine={false}
          className="text-xs"
        />
        <Tooltip
          formatter={(value, name) => [`${value}%`, name] as [string, string]}
          labelFormatter={(l) => formatTick(String(l))}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
        <Line
          type="monotone"
          dataKey="unitOccPct"
          name="Unit occupancy"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="areaOccPct"
          name="Area (sqft)"
          stroke="#0ea5e9"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
