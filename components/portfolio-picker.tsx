"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function PortfolioPicker({
  portfolios,
  active,
}: {
  portfolios: string[];
  active: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const qs = params?.toString();
    router.push(
      `/portfolios/${encodeURIComponent(e.target.value)}${qs ? `?${qs}` : ""}`,
    );
  }

  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Portfolio
      </span>
      <select
        value={active}
        onChange={onChange}
        aria-label="Switch portfolio"
        className="h-9 min-w-[180px] cursor-pointer rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {portfolios.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  );
}
