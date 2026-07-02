import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RangeFilter } from "@/components/range-filter";
import { MovesBarChart } from "@/components/charts/moves-bar";
import { MovesTable, type MovesRow } from "@/components/tables/moves-table";
import { getPortfolioLeaderboard } from "@/lib/queries/overview";
import { parseRangeSpec, rangeLabel } from "@/lib/metrics";
import { AUTH_ENABLED } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { getRole, portfolioAccess } from "@/lib/roles";

export const runtime = "nodejs";

export default async function MovesPage({
  searchParams,
}: {
  searchParams: { range?: string | string[]; from?: string | string[]; to?: string | string[] };
}) {
  const range = parseRangeSpec(searchParams ?? {});
  const label = rangeLabel(range);

  const [leaderboard, user] = await Promise.all([
    getPortfolioLeaderboard(range),
    AUTH_ENABLED ? getCurrentUser() : Promise.resolve(null),
  ]);

  const role = AUTH_ENABLED ? getRole(user) : "admin";
  const allowed = portfolioAccess(role);
  const visible = allowed
    ? leaderboard.filter((r) => r.isUnmapped || allowed.includes(r.portfolio))
    : leaderboard;

  // Move-outs last year is derived: moveIns_LY − netRentals_LY. Occupancy is the snapshot at
  // the last day of the selected range, compared to the last day of the previous range.
  const rows: MovesRow[] = visible.map((r) => ({
    portfolio: r.portfolio,
    occPct: r.occPct,
    occPctPrev: r.occPctPrevPeriod,
    moveIns: r.moveIns,
    moveInsLY: r.moveInsPrevYear,
    moveOuts: r.moveOuts,
    moveOutsLY:
      r.moveInsPrevYear != null && r.netRentalsPrevYear != null
        ? r.moveInsPrevYear - r.netRentalsPrevYear
        : null,
    netRentals: r.netRentals,
    netLY: r.netRentalsPrevYear,
  }));

  const sum = visible.reduce(
    (acc, r) => ({
      moveIns: acc.moveIns + r.moveIns,
      moveOuts: acc.moveOuts + r.moveOuts,
      netRentals: acc.netRentals + r.netRentals,
      moveInsLY: acc.moveInsLY + (r.moveInsPrevYear ?? 0),
      moveOutsLY:
        acc.moveOutsLY +
        (r.moveInsPrevYear != null && r.netRentalsPrevYear != null
          ? r.moveInsPrevYear - r.netRentalsPrevYear
          : 0),
      netLY: acc.netLY + (r.netRentalsPrevYear ?? 0),
      occupied: acc.occupied + (r.occupiedUnits ?? 0),
      total: acc.total + (r.totalUnits ?? 0),
    }),
    { moveIns: 0, moveOuts: 0, netRentals: 0, moveInsLY: 0, moveOutsLY: 0, netLY: 0, occupied: 0, total: 0 },
  );
  const totals: Omit<MovesRow, "portfolio"> = {
    // Unit-weighted company occupancy; no prev-period unit counts, so no total delta ("—").
    occPct: sum.total > 0 ? Math.round((sum.occupied / sum.total) * 1000) / 10 : null,
    occPctPrev: null,
    moveIns: sum.moveIns,
    moveInsLY: sum.moveInsLY || null,
    moveOuts: sum.moveOuts,
    moveOutsLY: sum.moveOutsLY || null,
    netRentals: sum.netRentals,
    netLY: sum.netLY || null,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Moves</h1>
          <p className="text-sm text-muted-foreground">
            Move-ins, move-outs &amp; net rentals per portfolio for {label.toLowerCase()} (excl.
            today) · compared to the same period last year
          </p>
        </div>
        <RangeFilter active={range} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Company totals · {label} vs last year</CardTitle>
          <CardDescription>
            Move-ins (up), move-outs (shown below the line), and net rentals — left is the same
            period last year, right is the current period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MovesBarChart
            current={{
              moveIns: totals.moveIns,
              moveOuts: totals.moveOuts,
              net: totals.netRentals,
            }}
            lastYear={{
              moveIns: totals.moveInsLY,
              moveOuts: totals.moveOutsLY,
              net: totals.netLY,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Move-ins &amp; move-outs</CardTitle>
          <CardDescription>
            Net rentals = move-ins − move-outs. The colored figure beside each move value is the
            change vs the same period last year (blank where last-year data isn&apos;t available
            yet). Unit occupancy is the snapshot on the range&apos;s last day, compared to the last
            day of the previous range. Click any column to sort.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MovesTable rows={rows} totals={totals} />
        </CardContent>
      </Card>
    </div>
  );
}
