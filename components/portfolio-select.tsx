"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    const value = e.target.value;
    if (value === "all") sp.delete("portfolio");
    else sp.set("portfolio", value);
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Portfolio
      </span>
      <select
        value={active}
        onChange={onChange}
        aria-label="Filter occupancy trend by portfolio"
        className="h-9 min-w-[170px] cursor-pointer rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-ring hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
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
