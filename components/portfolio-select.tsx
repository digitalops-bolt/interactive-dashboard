"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

export function PortfolioSelect({
  portfolios,
  active,
}: {
  portfolios: string[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    const value = e.target.value;
    track("occupancy_trend_filtered", { portfolio: value });
    if (value === "all") sp.delete("portfolio");
    else sp.set("portfolio", value);
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Portfolio
      </span>
      {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      <select
        value={active}
        onChange={onChange}
        disabled={pending}
        aria-label="Filter occupancy trend by portfolio"
        aria-busy={pending}
        className="h-9 min-w-[170px] cursor-pointer rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-ring hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        <option value="all">All portfolios</option>
        {portfolios.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  );
}
