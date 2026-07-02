import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AUTH_ENABLED } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { getRole } from "@/lib/roles";
import { getPortfolioTrends } from "@/lib/queries/decision-tree";
import { getDecisionTreeOverview } from "@/lib/ai/decision-tree-overview";
import { DecisionTreeTable } from "@/components/decision-tree-table";
import { DecisionTreeOverviewCard } from "@/components/insights/decision-tree-overview";
import { CollapsibleSection } from "@/components/insights/collapsible-section";

export const runtime = "nodejs";

export default async function DecisionTreePage() {
  // Restricted to the digital-ops team (and admin). The dashboard layout only checks "has a
  // role"; per-route gating is enforced here (mirrors /admin).
  if (AUTH_ENABLED) {
    const me = await getCurrentUser();
    const role = getRole(me);
    if (role !== "admin" && role !== "digital-ops") redirect("/access-denied");
  }

  const [trends, overview] = await Promise.all([
    getPortfolioTrends(),
    getDecisionTreeOverview(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Decision Tree</h1>
        <p className="text-sm text-muted-foreground">
          Last 6 complete months per portfolio — is unit occupancy and revenue growing or
          declining?
        </p>
      </header>

      {overview.items.length > 0 ? (
        <CollapsibleSection title="AI overview" storageKey="decisionTreeOverviewHidden">
          <DecisionTreeOverviewCard overview={overview} />
        </CollapsibleSection>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Portfolio trends</CardTitle>
          <CardDescription>
            Toggle the monthly values between unit occupancy and revenue. Trend arrows and status
            reflect both metrics. Sorted with the portfolios that need attention first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionTreeTable trends={trends} />
        </CardContent>
      </Card>
    </div>
  );
}
