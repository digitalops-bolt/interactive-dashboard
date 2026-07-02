import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { RangeFilter } from "@/components/range-filter";
import { PortfolioSelect } from "@/components/portfolio-select";
import { PortfolioLeaderboard } from "@/components/tables/portfolio-leaderboard";
import { OccupancyTrendChart } from "@/components/charts/occupancy-trend";
import { BriefingCard } from "@/components/insights/briefing-card";
import { CollapsibleSection } from "@/components/insights/collapsible-section";
import {
  getOccupancyTrend,
  getOverviewKpis,
  getPortfolioLeaderboard,
} from "@/lib/queries/overview";
import { getBriefing } from "@/lib/ai/briefing";
import { getAdsByPortfolio } from "@/lib/queries/ads-overview";
import { getCurrentUser } from "@/lib/current-user";
import { parseRangeSpec, prevPeriodLabel, rangeLabel } from "@/lib/metrics";
import { AUTH_ENABLED } from "@/lib/auth";
import { getBriefingPrefs } from "@/lib/briefing-prefs";
import { getRole, portfolioAccess } from "@/lib/roles";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatSignedNumber,
  type DeltaKind,
} from "@/lib/format";

export const runtime = "nodejs";

// The AI briefing is pinned to a rolling 30-day window, decoupled from the page's range filter,
// so it generates at most once per day total (shared by everyone) and never hits the month-start
// emptiness of MTD. The KPI cards below still follow the selected range.
const BRIEFING_RANGE = { kind: "preset", key: "30d" } as const;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: {
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
    portfolio?: string | string[];
  };
}) {
  const range = parseRangeSpec(searchParams ?? {});
  const label = rangeLabel(range);
  const portfolioParam = Array.isArray(searchParams?.portfolio)
    ? searchParams.portfolio[0]
    : searchParams?.portfolio;
  const activePortfolio = portfolioParam || "all";

  const [kpis, trend, leaderboard, ads, briefing, user] = await Promise.all([
    getOverviewKpis(range),
    getOccupancyTrend(activePortfolio),
    getPortfolioLeaderboard(range),
    getAdsByPortfolio(range),
    getBriefing(BRIEFING_RANGE),
    AUTH_ENABLED ? getCurrentUser() : Promise.resolve(null),
  ]);

  // Role-based data gating (no-op until a role gets a portfolio allowlist in lib/roles.ts).
  const role = AUTH_ENABLED ? getRole(user) : "admin";
  const briefingPrefs = getBriefingPrefs(user);

  // Company ad totals for the Ad-spend KPI card, on the SELECTED range (like the other cards).
  const companyAdSpend = ads.reduce((s, a) => s + a.spend, 0);
  const companyAdSpendPrev = ads.reduce((s, a) => s + a.spendPrevPeriod, 0);
  const companyConversions = ads.reduce((s, a) => s + a.conversions, 0);
  const allowed = portfolioAccess(role);
  const visibleLeaderboard = allowed
    ? leaderboard.filter((r) => r.isUnmapped || allowed.includes(r.portfolio))
    : leaderboard;

  const portfolioOptions = visibleLeaderboard
    .filter((r) => !r.isUnmapped)
    .map((r) => r.portfolio)
    .sort((a, b) => a.localeCompare(b));
  const portfolioCount = portfolioOptions.length;

  // Two comparison lines per card: previous period + same period last year.
  const ppLabel = prevPeriodLabel(range);
  const cmp = (current: number, kind: DeltaKind, pp: number | null, py: number | null) => [
    { label: ppLabel, current, baseline: pp, kind },
    { label: "vs last year", current, baseline: py, kind },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Company Overview</h1>
          <p className="text-sm text-muted-foreground">
            Portfolio performance across {portfolioCount} portfolios
            {kpis.occAsOfDate ? ` · unit occupancy as of ${formatDate(kpis.occAsOfDate)}` : ""}
          </p>
        </div>
        <RangeFilter active={range} />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard
          title="Unit occupancy"
          value={formatPercent(kpis.companyOccPct)}
          hint="Latest snapshot"
          comparisons={cmp(
            kpis.companyOccPct,
            "pp",
            kpis.prevPeriod.occPct,
            kpis.prevYear.occPct,
          )}
        />
        <KpiCard
          title="Revenue"
          value={formatCurrency(kpis.revenue)}
          hint={`Net · ${label}`}
          comparisons={cmp(
            kpis.revenue,
            "pct",
            kpis.prevPeriod.revenue,
            kpis.prevYear.revenue,
          )}
        />
        <KpiCard
          title="Move-ins"
          value={formatNumber(kpis.moveIns)}
          hint={label}
          tone="positive"
          comparisons={cmp(
            kpis.moveIns,
            "count",
            kpis.prevPeriod.moveIns,
            kpis.prevYear.moveIns,
          )}
        />
        <KpiCard
          title="Move-outs"
          value={formatNumber(kpis.moveOuts)}
          hint={label}
          tone="negative"
          higherIsBetter={false}
          comparisons={cmp(
            kpis.moveOuts,
            "count",
            kpis.prevPeriod.moveOuts,
            kpis.prevYear.moveOuts,
          )}
        />
        <KpiCard
          title="Net rentals"
          value={formatSignedNumber(kpis.netRentals)}
          hint={label}
          tone={kpis.netRentals >= 0 ? "positive" : "negative"}
          comparisons={cmp(
            kpis.netRentals,
            "count",
            kpis.prevPeriod.netRentals,
            kpis.prevYear.netRentals,
          )}
        />
        <KpiCard
          title="Ad spend"
          value={formatCurrency(companyAdSpend)}
          hint={`${formatNumber(companyConversions)} conv · ${label}`}
          higherIsBetter={false}
          comparisons={[
            {
              label: ppLabel,
              current: companyAdSpend,
              baseline: companyAdSpendPrev,
              kind: "pct",
            },
          ]}
        />
      </section>

      <CollapsibleSection title="Management briefing" storageKey="briefingHidden">
        <BriefingCard briefing={briefing} prefs={briefingPrefs} />
      </CollapsibleSection>

      <Card>
        <CardHeader className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Occupancy trend</CardTitle>
            <CardDescription>
              Unit &amp; area occupancy, last 90 days ·{" "}
              {activePortfolio === "all" ? "all portfolios" : activePortfolio}
            </CardDescription>
          </div>
          <PortfolioSelect portfolios={portfolioOptions} active={activePortfolio} />
        </CardHeader>
        <CardContent>
          <OccupancyTrendChart data={trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio leaderboard</CardTitle>
          <CardDescription>
            Latest unit occupancy snapshot · revenue &amp; flows for {label.toLowerCase()} (excl. today)
            · arrows compare to the same period last year (blank where last-year data isn&apos;t
            available yet)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortfolioLeaderboard rows={visibleLeaderboard} />
        </CardContent>
      </Card>
    </div>
  );
}
