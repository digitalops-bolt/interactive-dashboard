import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/kpi-card";
import { RangeFilter } from "@/components/range-filter";
import { PortfolioPicker } from "@/components/portfolio-picker";
import { PerFacilityTable } from "@/components/tables/per-facility-table";
import { PricingGroupTable } from "@/components/tables/pricing-group-table";
import { MarketingCard } from "@/components/marketing-card";
import {
  getAdsByType,
  getConversionsByAction,
  getOccupancyByCategory,
  getPerFacilityBreakdown,
  getPortfolioKpis,
  getPortfolioNames,
  getPricingGroupStatus,
  getUnitStatus,
} from "@/lib/queries/portfolio-detail";
import { parseRangeSpec, prevPeriodLabel, rangeLabel } from "@/lib/metrics";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatSignedNumber,
  type DeltaKind,
} from "@/lib/format";

export const runtime = "nodejs";

function occBadgeClass(pct: number | null) {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct >= 85)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (pct >= 75)
    return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export default async function PortfolioDetailPage({
  params,
  searchParams,
}: {
  params: { portfolio: string };
  searchParams: {
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
  };
}) {
  const portfolio = params.portfolio;
  const range = parseRangeSpec(searchParams ?? {});
  const label = rangeLabel(range);

  const names = await getPortfolioNames();
  if (!names.includes(portfolio)) notFound();

  const [kpis, categories, status, facilities, ads, pricingGroups, conversionRows] =
    await Promise.all([
      getPortfolioKpis(portfolio, range),
      getOccupancyByCategory(portfolio, range),
      getUnitStatus(portfolio),
      getPerFacilityBreakdown(portfolio, range),
      getAdsByType(portfolio, range).catch(() => null),
      getPricingGroupStatus(portfolio, range),
      getConversionsByAction(portfolio, range).catch(() => []),
    ]);

  const adSpend = ads ? ads.reduce((s, a) => s + a.spend, 0) : null;
  const adPctRevenue =
    adSpend != null && kpis.revenue > 0 ? (adSpend / kpis.revenue) * 100 : null;
  const netRentals = kpis.moveIns - kpis.moveOuts;

  // Two comparison lines per summary card: previous period + same period last year.
  const ppLabel = prevPeriodLabel(range);
  const cmp = (current: number, kind: DeltaKind, pp: number | null, py: number | null) => [
    { label: ppLabel, current, baseline: pp, kind },
    { label: "vs last year", current, baseline: py, kind },
  ];

  const stripPrefix = (f: string) =>
    f.startsWith(`${portfolio} - `) ? f.slice(portfolio.length + 3) : f;

  const multiFacility = facilities.length > 1;
  const facilityRows = facilities.map((f) => ({
    ...f,
    facility: stripPrefix(f.facility),
  }));
  const facilityNames = facilityRows.map((f) => f.facility);
  const pricingRows = pricingGroups.map((r) => ({
    ...r,
    facility: stripPrefix(r.facility),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-3">
        <Link
          href="/overview"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Overview
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{portfolio}</h1>
            <p className="text-sm text-muted-foreground">
              {facilities.length}{" "}
              {facilities.length === 1 ? "facility" : "facilities"}
              {kpis.occAsOfDate ? ` · occupancy as of ${formatDate(kpis.occAsOfDate)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PortfolioPicker portfolios={names} active={portfolio} />
            <RangeFilter active={range} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Occupancy"
          value={formatPercent(kpis.occPct)}
          hint="Latest snapshot"
          comparisons={cmp(
            kpis.occPct,
            "pct",
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
          hint={`${formatNumber(kpis.onlineMoveIns)} online · ${formatNumber(kpis.phoneMoveIns)} phone`}
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
          value={formatSignedNumber(netRentals)}
          hint={label}
          tone={netRentals >= 0 ? "positive" : "negative"}
          comparisons={cmp(
            netRentals,
            "count",
            kpis.prevPeriod.netRentals,
            kpis.prevYear.netRentals,
          )}
        />
        <KpiCard
          title="Ad spend"
          value={adSpend == null ? "—" : formatCurrency(adSpend, { compact: true })}
          hint={adSpend == null ? "needs ads access" : `${label} · portfolio-level`}
        />
        <KpiCard
          title="Ad % of revenue"
          value={adPctRevenue == null ? "—" : formatPercent(adPctRevenue)}
          hint="spend ÷ revenue"
        />
        <KpiCard
          title="Unavailable units"
          value={formatNumber(kpis.unavailable)}
          hint={`of ${formatNumber(kpis.total)} total`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Unit status</CardTitle>
            <CardDescription>
              Current snapshot · {formatNumber(status.activeLeases)} active leases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                label="Occupied"
                value={formatNumber(status.occupied)}
                tone="text-emerald-600 dark:text-emerald-500"
              />
              <Stat label="Vacant" value={formatNumber(status.vacant)} />
              <Stat
                label="Unavailable"
                value={formatNumber(status.unavailable)}
                tone="text-muted-foreground"
              />
              <Stat label="Overlocked" value={formatNumber(status.overlocked)} />
              <Stat
                label="In auction"
                value={formatNumber(status.inAuction)}
                tone="text-red-600 dark:text-red-500"
              />
              <Stat
                label="Autopay"
                value={
                  status.activeLeases > 0
                    ? formatPercent((status.autopay / status.activeLeases) * 100)
                    : "—"
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Occupancy by unit category</CardTitle>
            <CardDescription>Latest snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Occupancy</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Unavail.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.category}>
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={occBadgeClass(c.occPct)}>
                          {formatPercent(c.occPct)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(c.occupied)}/{formatNumber(c.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(c.unavailable)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marketing</CardTitle>
          <CardDescription>
            Ad spend &amp; conversions by campaign type for {label.toLowerCase()} ·
            portfolio-level (Google Ads labels target the market, not individual facilities)
            · filter which conversion actions count — spend stays constant
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ads == null ? (
            <p className="text-sm text-muted-foreground">
              Ad data needs the dashboard service account granted{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">BigQuery Data Viewer</code>{" "}
              on the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">bolt_g_ads_data</code>{" "}
              dataset. Once granted, spend, conversions, CPA and % of revenue on ads appear here.
            </p>
          ) : ads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No ad spend recorded for {label.toLowerCase()}.
            </p>
          ) : (
            <MarketingCard
              key={`${portfolio}:${range}`}
              spendByChannel={ads}
              conversionRows={conversionRows}
              revenue={kpis.revenue}
            />
          )}
        </CardContent>
      </Card>

      {multiFacility && (
        <Card>
          <CardHeader>
            <CardTitle>By facility</CardTitle>
            <CardDescription>
              Occupancy (latest) · revenue &amp; flows for {label.toLowerCase()} · click a
              column to sort
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerFacilityTable rows={facilityRows} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pricing group status</CardTitle>
          <CardDescription>
            Total / occupied / available / unavailable per pricing tier · latest snapshot ·
            sorted worst-occupancy first
            {multiFacility ? " · filter by facility to drill in" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PricingGroupTable
            rows={pricingRows}
            facilities={facilityNames}
            multiFacility={multiFacility}
          />
        </CardContent>
      </Card>
    </div>
  );
}
