import { redirect } from "next/navigation";
import { getPortfolioNames } from "@/lib/queries/portfolio-detail";

export const runtime = "nodejs";

// Bare /portfolios has no view of its own — send the user to the first
// portfolio alphabetically (getPortfolioNames is already ORDER BY name),
// preserving any active date range.
export default async function PortfoliosIndexPage({
  searchParams,
}: {
  searchParams: {
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
  };
}) {
  const names = await getPortfolioNames();
  if (names.length === 0) redirect("/overview");

  // Forward the active date selection (range + any custom from/to) to the default portfolio.
  const sp = new URLSearchParams();
  for (const key of ["range", "from", "to"] as const) {
    const v = Array.isArray(searchParams?.[key])
      ? searchParams[key]![0]
      : searchParams?.[key];
    if (v) sp.set(key, v);
  }
  const qs = sp.toString();
  redirect(`/portfolios/${encodeURIComponent(names[0])}${qs ? `?${qs}` : ""}`);
}
