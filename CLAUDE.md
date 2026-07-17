# Bolt Storage Dashboard — working rules

Internal BigQuery dashboard (Next.js 14 App Router) at dashboard.boltstorage.com.
**Deep context (read on demand, both gitignored/local):** `PROJECT_SUMMARY.md` = architecture,
every table + relationships, incidents log, ops gotchas. `data_model_doc.md` = raw schemas.

## Metric rules (never deviate)
- Revenue = net = APPROVED − REFUNDED from `stg.payments_daily`, **always excluding Athens
  (`fac_N6KyhPVbCX3`)** — matches the company's Weekly Revenue Summary.
- Occupancy = **unit occupancy** (occupied/total units), a **snapshot at the window's last day**,
  never averaged. Label it "Unit occupancy".
- Occupancy deltas display as **point difference with a % sign**: 80%→70% = **−10%** (never "pp",
  never relative %). Revenue/ads deltas = relative %; move counts = absolute.
- Flow windows are half-open `[start, end)` and **exclude today**. `DATA_FLOOR = 2025-05-01`
  (Jan–Apr 2025 are NOT backfillable — 6-facility pilot / partial April).
- Move-ins exclude `IMPORT` leases. Ads: use `p_ads_CampaignBasicStats` (never `CampaignStats`);
  label→portfolio attribution lives in `lib/ads.ts`. Ads history starts 2025-12-01.

## Security rules (never deviate)
- BigQuery/Anthropic/Clerk-secret/PostHog-personal keys are **server-only** — never `NEXT_PUBLIC_`,
  never imported into `"use client"` files (type-only imports are fine). `lib/bigquery.ts`,
  `lib/posthog-admin.ts`, `lib/ai/*` carry `import "server-only"`.
- BigQuery: **parameterized queries only** for user input; `maximumBytesBilled` cap stays.
- Auth is invite-only and fail-closed. New pages go under `app/(dashboard)/` (middleware + layout
  gate them automatically). Role-gated pages: add to `ROUTE_RULES` in `lib/roles.ts` **and**
  re-check the role server-side in the page (see `/admin`, `/decision-tree`).
- Next 14 gotcha: dynamic route `params` arrive **percent-encoded** — `decodeURIComponent` them.

## Reuse before writing new
- Queries: `cachedQuery()` (`lib/bigquery.ts`) + `RangeSpec`/`windowBounds`/`comparisonPredicate`
  (`lib/metrics.ts`). Deltas: `computeDelta` (`lib/format.ts`, kind `pp` for occupancy).
- UI: `KpiCard`, `Card` primitives, `TrendDelta`, `RangeFilter`, sortable-table pattern in
  `components/tables/*`, `CollapsibleSection`. Nav items: `components/layout/nav.ts`.
- Every new interactive control fires a PostHog event via `track()` (`lib/analytics.ts`) —
  autocapture is off by design.
- AI features: numbers computed deterministically first (`lib/insights.ts` pattern), Claude only
  narrates; cache with `unstable_cache` (briefing = per data-day, decision-tree = per month);
  graceful fallback when `ANTHROPIC_API_KEY` is absent.

## Workflow
- **Feature branch → local test → merge to `main`.** Pushing `main` auto-deploys Vercel prod.
  Env-var changes need a **manual Redeploy** (they don't trigger builds).
- **Git push/pull/fetch only inside WSL** (`wsl -d ubuntu-22.04 bash -lc "cd '/home/pipesco93/bolt
  storage/interactive_dashboard' && git push …"`) — the `github.com-bolt` SSH alias exists only there.
- Verify before commit (run in WSL): `npx tsc --noEmit && npx next lint && npx next build`.
- Local auth-off testing (to curl gated pages): run dev with Clerk keys blanked —
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= npx next dev -p 3003` (dev-mode middleware
  passes through; prod mode fails closed). Dev server for browser use: launch config `bolt-dashboard`.
- n8n owns the data syncs ("BQ Daily Sync" etc.); rewrite windows: payments 95d, turnover/ads-spend
  3d, conversions/facility_daily 7d. The May 2025 backfill sits outside these — don't "fix" it.
