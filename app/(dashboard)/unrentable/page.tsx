import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { UnrentableLeaderboard } from "@/components/tables/unrentable-leaderboard";
import { getUnrentableByPortfolio } from "@/lib/queries/unrentable";
import { getCurrentUser } from "@/lib/current-user";
import { AUTH_ENABLED } from "@/lib/auth";
import { getRole, portfolioAccess } from "@/lib/roles";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

export const runtime = "nodejs";

// Snapshot page (no range filter): unrentable inventory is a stock, not a flow, so the
// page always shows the latest occupancy_daily snapshot with 30-day-ago arrows.
export default async function UnrentablePage() {
  const [{ rows, summary }, user] = await Promise.all([
    getUnrentableByPortfolio(),
    AUTH_ENABLED ? getCurrentUser() : Promise.resolve(null),
  ]);

  const role = AUTH_ENABLED ? getRole(user) : "admin";
  const allowed = portfolioAccess(role);
  const visibleRows = allowed ? rows.filter((r) => allowed.includes(r.portfolio)) : rows;

  const vs30d = "vs 30 days ago";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Unrentable Units</h1>
        <p className="text-sm text-muted-foreground">
          Units that can&apos;t be offered for rent (damaged, under maintenance, or offline)
          {summary.asOfDate ? ` · snapshot as of ${formatDate(summary.asOfDate)}` : ""}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Unrentable units"
          value={formatNumber(summary.unrentableUnits)}
          hint={`of ${formatNumber(summary.totalUnits)} total units`}
          tone="negative"
          higherIsBetter={false}
          comparisons={[
            {
              label: vs30d,
              current: summary.unrentableUnits,
              baseline: summary.prev.unrentableUnits,
              kind: "count",
            },
          ]}
        />
        <KpiCard
          title="% of all units"
          value={formatPercent(summary.unrentablePctOfUnits)}
          hint="Unrentable ÷ total units"
          higherIsBetter={false}
          comparisons={
            summary.unrentablePctOfUnits == null
              ? undefined
              : [
                  {
                    label: vs30d,
                    current: summary.unrentablePctOfUnits,
                    baseline: summary.prev.unrentablePctOfUnits,
                    kind: "pp",
                  },
                ]
          }
        />
        <KpiCard
          title="% of vacant units"
          value={formatPercent(summary.unrentablePctOfVacant)}
          hint="Share of empty units that can't be sold"
          higherIsBetter={false}
          comparisons={
            summary.unrentablePctOfVacant == null
              ? undefined
              : [
                  {
                    label: vs30d,
                    current: summary.unrentablePctOfVacant,
                    baseline: summary.prev.unrentablePctOfVacant,
                    kind: "pp",
                  },
                ]
          }
        />
        <KpiCard
          title="Portfolios affected"
          value={formatNumber(summary.portfoliosAffected)}
          hint={`of ${formatNumber(rows.length)} portfolios`}
          higherIsBetter={false}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Unrentable units by portfolio</CardTitle>
          <CardDescription>
            Latest snapshot · available = rentable − occupied · &ldquo;% of vacant&rdquo; =
            unrentable share of all empty units (the urgency signal: high means most of the
            portfolio&apos;s empty space can&apos;t be sold) · arrows compare to 30 days ago
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnrentableLeaderboard rows={visibleRows} />
        </CardContent>
      </Card>
    </div>
  );
}
