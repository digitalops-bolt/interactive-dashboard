# Bolt Storage Dashboard — Implementation Plan (PLAN.md)

> Planning document. No application code has been written yet. Approved 2026-06-16.

---

## Context

Bolt Storage needs a production-grade internal dashboard over its BigQuery warehouse: 67 facilities, 11 states, 34 portfolios. The data model is documented in `data_model_doc.md`, which is the schema source of truth. Before writing this plan the live `cubbyboltdata` warehouse was verified via the BigQuery MCP and reconciled against the doc. Several things differ from the doc in ways that materially change the build — captured in **§1 Data Reality Check**. Confirmed product decisions:

- **State filter:** dropped for v1 (facility→state isn't in `stg`/`analytics`; the only source was the `raw` dataset, which is being deleted).
- **Auth:** anyone with an `@boltstorage.com` email gets a default read-only role; specific users are elevated.
- **Ads / marketing — deferred past v1.** Ads attribution is the least trustworthy area (stale mapping tables, §1). v1 ships **no ads/marketing** and **ignores `facility_daily`'s `ads_*` columns**. When built later it uses labels→portfolio + campaign type (§4 `/marketing`).
- **v1 = one portfolio-information dashboard, proven end-to-end and secure**, then expand (§0).

### Two GCP projects (access model)
- **`cubbyboltdata`** — your project, full control. Holds the dashboard-ready `analytics`/`stg` tables (+ ads / search-console). **The app reads only this project.**
- **`cubby-partner-data`** — owned by Cubby; you have **no control**. Accessed via a Cubby-provided service-account JSON used **only by the upstream pipeline** (raw → stg → analytics), **never by the dashboard app**.
- The dashboard uses a **separate, dedicated, read-only service account in `cubbyboltdata`** (§0b).

---

## 0. V1 Scope (build this first)

Goal: **one Portfolio Information dashboard**, live against BigQuery, behind secure auth — proven before expanding.

**In v1:**
- Secure BigQuery access (dedicated read-only SA) + working `lib/bigquery.ts`.
- Clerk auth, domain-restricted, `viewer` default.
- One route `/overview`:
  - Company KPI cards: occupancy %, total MRR, move-ins MTD, move-outs MTD, net rentals MTD.
  - Occupancy trend (90d).
  - **Portfolio leaderboard table** (all 34): occupancy %, MRR, move-ins MTD, net MTD — sortable.
  - AI executive summary (sequenced last; the dashboard works without it).

**Deferred:** `/operations`, `/revenue` (AR aging, rent roll), `/marketing` (ads + GSC), `/facilities/[id]`, the state filter, per-portfolio drill-down — and anything depending on ads attribution.

**v1 data sources (all reliable, no ads mapping):** `portfolio_occ_daily`, `occupancy_daily`, `rent_roll_monthly`, `facility_daily` (move-ins/outs/revenue only — **not** `ads_*`).

---

## 0b. BigQuery Access & Security — setup guide

The dashboard uses a **dedicated, least-privilege, read-only** service account in **`cubbyboltdata`** (never the Cubby SA). Walkthrough in Phase 0:

**1 — Create the service account** (in `cubbyboltdata`):
```
gcloud iam service-accounts create bolt-dashboard-reader \
  --project=cubbyboltdata --display-name="Bolt Dashboard (read-only)"
```

**2 — Grant least privilege** (read + run queries, nothing more):
- **BigQuery Job User** (project-level — required to run queries):
```
gcloud projects add-iam-policy-binding cubbyboltdata \
  --member="serviceAccount:bolt-dashboard-reader@cubbyboltdata.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"
```
- **BigQuery Data Viewer scoped to only the datasets used** — `analytics`, `stg` (add `searchconsole` / `bolt_g_ads_data` only when those ship). Prefer **dataset-level** sharing over project-wide (Console → dataset → Sharing → Add principal → *BigQuery Data Viewer*).
- ❌ No Editor/Owner/Admin. The app only `SELECT`s.

**3 — Create one JSON key** (the only secret the app holds):
```
gcloud iam service-accounts keys create key.json \
  --iam-account=bolt-dashboard-reader@cubbyboltdata.iam.gserviceaccount.com
```
Put the **single-line JSON** into `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Never commit it.

**4 — Store secrets securely:**
- Local: `.env.local` (gitignored — verify). Never a committed `.env`.
- Vercel: Settings → Environment Variables → add as **encrypted** vars; never prefix BQ / Anthropic / Clerk-secret vars with `NEXT_PUBLIC_`.

**5 — Defense in depth (code):** `import 'server-only'` in `lib/bigquery.ts`; BQ routes/RSC on **Node runtime**; **parameterized queries only**; per-query **`maximumBytesBilled`** cap (~100 MB); SELECT-only.

**6 — Verify before UI** — run through `lib/bigquery.ts` with the new SA to confirm credential + roles:
```
SELECT COUNT(*) FROM `cubbyboltdata.analytics.portfolio_occ_daily`
```

**Hygiene:** rotate the key periodically; if it ever leaks, disable it in IAM immediately and issue a new one.

---

## 1. Data Reality Check (verified live, June 2026)

These findings override the doc where they conflict.

| # | Finding | Impact on build |
|---|---|---|
| 1 | **`cubbyboltdata.raw` exists today but you are deleting it.** Its `raw.facilities` was the only place with facility address/geo. | App references `raw` **nowhere**. Facility list/portfolio come from `analytics` tables. **State filter dropped for v1** (no source). |
| 2 | **`analytics.ads_label_to_portfolio` (doc §4) does not exist.** Two problem tables exist instead. | Do not depend on either (below). Build correct attribution in-query. |
| 3 | `analytics.ads_portfolio_mapping` = campaign_id→facility_id, **52 hand-maintained rows**. Feeds `facility_daily.ads_spend/ads_conversions`. | Treat `facility_daily` ads columns as **suspect/stale**. Don't use them for `/marketing`. |
| 4 | `analytics.google_ads_portfolio_mapping` = `raw_location_token`→portfolio (43 rows) is **mis-keyed**: tokens are individual cities (`Cory`,`Moneta`,`Union City`) but real `label_name`s are slash-combined (`Erie/Corry/Union`). **9 of 34 labels join to NULL.** | Do **not** use this table for the dashboard. Use a `label_name`-keyed normalization (below). |
| 5 | Real Ads labels confirmed: most equal the portfolio name; the non-identity ones are `Christiansburg/Moneta`→Christiansburg, `Erie/Corry/Union`→Erie, `Fairview/McKean`→Fairview, `Ithaca/Freeville`→Ithaca, `Risign Fawn`→Rising Fawn (sic), `Robinsonville/Walls`→Robinsonville, `Trion/Summerville/Lyerly`→Trion, `Troy/Cropseyville`→Troy. Plus exclude `Paused 18 March'25`. | ~8 inline override rows + `COALESCE(label, label)` identity. New normal campaigns need **zero** BQ changes. |
| 6 | Campaign type lives in `ads_Campaign_2921271203.campaign_advertising_channel_type`: today **PERFORMANCE_MAX ×32, SEARCH ×14, DEMAND_GEN ×1** (`sub_type` always `UNSPECIFIED`). "AI Max" is **not** a channel type. | Break out by `channel_type`. "AI Max" bucket needs a naming/label signal → open question. |
| 7 | `ads_Campaign_*` and `ads_CampaignLabel_*` are **views** exposing `_LATEST_DATE`/`_DATA_DATE`. `p_ads_CampaignStats_*` is day-partitioned (~19 MB, 51k rows). | Filter dims with `_DATA_DATE = _LATEST_DATE`. Stats metrics: `metrics_cost_micros/1e6`, `metrics_conversions`, `metrics_conversions_value`, `metrics_clicks`, `metrics_impressions`, `segments_date`. |
| 8 | All `analytics` tables are tiny (KB–low MB; `occupancy_daily` ~1.5 MB physical). BigQuery bills a **10 MB minimum per query**. | Query cost is negligible. Optimize for **latency/redundancy via caching**, not bytes. |
| 9 | `searchconsole.searchdata_url_impression` confirmed (`url, query, impressions, clicks, sum_position, data_date`). `analytics_308940958` (likely GA4) exists. | GSC view is real. GA4 stays a placeholder for v1. |

**Portfolio column name varies by table** (doc §5) — the single biggest bug source:
`portfolio` → `facility_daily`, `payments_daily`, `unit_turnover_daily`. `portfolio_name` → `occupancy_daily`, `portfolio_occ_daily`, `rent_roll_monthly`, `lease_cohorts`, `collection_monthly`, `leases_enriched`.

---

## 2. Tech Stack — Confirmation & Flags

| Layer | Choice | Verdict / Notes |
|---|---|---|
| Framework | Next.js 14, App Router, TS | ✅ |
| Auth | Clerk (admin/ops/finance/marketing + default viewer) | ✅ Restrict sign-ups to `boltstorage.com`; roles in `publicMetadata.role`. |
| UI | Tailwind + shadcn/ui + Recharts | ✅ |
| Data | `@google-cloud/bigquery`, server-only | ✅ ⚠️ **Node runtime only** (not Edge); set `export const runtime = 'nodejs'`. |
| AI | Anthropic API, `claude-sonnet-4-6` | ✅ Use streaming. |
| Hosting | Vercel | ✅ ⚠️ Set serverless `maxDuration` (~30s); SA JSON as env var (no file). |

- BigQuery client never imported into a Client Component. Keep behind `lib/queries/*`, enforce with `import 'server-only'`.
- Credentials from `GOOGLE_APPLICATION_CREDENTIALS_JSON` → `JSON.parse` → `credentials` on the `BigQuery` constructor.

---

## 3. Project Structure

```
interactive_dashboard/
  data_model_doc.md                 # source of truth
  PLAN.md
  .env.example  .env.local          # secrets gitignored
  middleware.ts                     # Clerk + role gating
  app/
    layout.tsx  globals.css  page.tsx           # root → redirect /overview
    (auth)/sign-in/[[...sign-in]]/page.tsx
    (auth)/sign-up/[[...sign-up]]/page.tsx
    (dashboard)/
      layout.tsx                    # sidebar + topbar shell, role-gated nav
      access-pending/page.tsx
      overview/page.tsx
      operations/page.tsx  revenue/page.tsx  marketing/page.tsx
      facilities/page.tsx  facilities/[id]/page.tsx
    api/ai-summary/route.ts         # POST, streams Claude (runtime=nodejs)
  lib/
    bigquery.ts  anthropic.ts  auth.ts  ads.ts  format.ts  types.ts
    queries/{overview,operations,revenue,marketing,facilities,facility-detail}.ts
  components/
    ui/                             # shadcn primitives
    layout/{sidebar,topbar}.tsx  layout/nav.ts
    kpi-card.tsx  ai-insights.tsx  placeholder-card.tsx  skeletons.tsx
    charts/{occupancy-trend,move-in-out-bar,net-rentals-trend,mrr-trend,
            revenue-by-portfolio,los-distribution,ads-by-campaign-type,channel-split}.tsx
    tables/{data-table,portfolio-leaderboard,ar-aging,rent-roll,
            facilities-table,ads-by-portfolio,search-console}.tsx
```

---

## 4. Data Layer Design (per view)

Conventions: daily tables use latest complete day `CURRENT_DATE()-1`; "MTD" = `date >= DATE_TRUNC(CURRENT_DATE(), MONTH)`; occupancy is **summed across `unit_category`**. Each `lib/queries/*` function returns typed rows, wrapped by cached `query()` (§7).

### `/overview` — all roles
| Metric | Table(s) | Logic |
|---|---|---|
| Occupancy % | `analytics.portfolio_occ_daily` | `SUM(occupied_units)/SUM(total_units)` (latest snapshot; weighted) |
| Total MRR | `analytics.rent_roll_monthly` | latest `snapshot_date`, `SUM(total_rent_roll)` |
| Move-ins / outs / net MTD | `analytics.facility_daily` | `SUM(move_ins/move_outs/net_rentals)` WHERE MTD |
| Occupancy trend 90d | `analytics.occupancy_daily` | GROUP BY `date`, `SUM(occupied_units)/SUM(rentable_units)` |
| Portfolio leaderboard (34) | `analytics.portfolio_occ_daily` | `portfolio_name, occupied_units, total_units, occ_pct` ORDER BY `occ_pct` DESC |

### `/operations` — ops, admin (v2)
Move-ins vs outs 30d, online/phone split, net rentals trend → `facility_daily`. LOS distribution → `lease_cohorts`. Overlock/auction + autopay → `stg.leases_enriched` (`is_active=1`).

### `/revenue` — finance, admin (v2)
MRR trend + revenue by portfolio + rent roll → `rent_roll_monthly`. Gross/net 30d → `facility_daily`. AR aging → `collection_monthly`.

### `/marketing` — marketing, admin (v3) *(label-based, per §1.3–1.6)*
Spend/conv/CPA by portfolio: `p_ads_CampaignStats_*` ⋈ `ads_CampaignLabel_*` ⋈ inline label-map (`COALESCE(override[label], label)`, exclude `Paused 18 March'25`, dedupe one label/campaign). By campaign type: + `ads_Campaign_*.campaign_advertising_channel_type`. GSC by page → `searchconsole.searchdata_url_impression`. GA4/CallRail → placeholders.

### `/facilities` — all roles (v2/v4)
Facility set from `occupancy_daily` (~67). Occupancy % per facility; MRR from `rent_roll_monthly`; move-ins MTD from `facility_daily`. Portfolio filter only (state dropped v1).

### `/facilities/[id]` (v4)
Occupancy/revenue/move-in-out trends + active lease count + AR balance, filtered `facility_id=@id`.

---

## 5. Auth & Routing

**Roles:** `admin`, `ops`, `finance`, `marketing`, `viewer` (default). Stored in Clerk `publicMetadata.role`.

**Default:** sign-ups restricted to `boltstorage.com`. A signed-in domain user with no role = `viewer` (read-time default in `lib/auth.ts`). Admins elevate users in the Clerk dashboard. Non-domain/no role → `/access-pending`.

| Route | admin | ops | finance | marketing | viewer |
|---|:--:|:--:|:--:|:--:|:--:|
| /overview | ✅ | ✅ | ✅ | ✅ | ✅ |
| /facilities[/id] | ✅ | ✅ | ✅ | ✅ | ✅ |
| /operations | ✅ | ✅ | — | — | — |
| /revenue | ✅ | — | ✅ | — | — |
| /marketing | ✅ | — | — | ✅ | — |

**Enforcement (defense in depth):** `middleware.ts` (clerkMiddleware) protects `(dashboard)` + checks role↔route map; each page re-checks via server `hasAccess(section, role)`. Sidebar renders permitted links from one `nav.ts` config.

---

## 6. Component Inventory

Layout: `Sidebar` (role-gated), `Topbar` (Clerk `<UserButton>`, role badge), dashboard `layout.tsx`.
Primitives (shadcn): card, button, table, select, tabs, badge, skeleton, separator, dropdown-menu, scroll-area.
Display: `KpiCard`, `PlaceholderCard`, `Skeletons`, empty/error states.
Charts (Recharts): `OccupancyTrend`, `MoveInOutBar`, `NetRentalsTrend`, `MrrTrend`, `RevenueByPortfolio`, `LosDistribution`, `AdsByCampaignType`, `ChannelSplit`.
Tables: `DataTable` (TanStack + shadcn), `PortfolioLeaderboard`, `ArAgingTable`, `RentRollTable`, `FacilitiesTable`, `AdsByPortfolioTable`, `SearchConsoleTable`.
AI: `AiInsights` (client) — skeleton → POSTs KPIs to `/api/ai-summary` → streams tokens.

---

## 7. Cross-cutting: BigQuery client, caching, AI

**`lib/bigquery.ts`** — singleton `BigQuery` from parsed `GOOGLE_APPLICATION_CREDENTIALS_JSON` (+ `projectId`). `query<T>(sql, params, {cacheKey, revalidate})` wrapping `next/cache` `unstable_cache`. Parameterized only (`@param`). Default `revalidate: 3600s`. Per-query `maximumBytesBilled` cap.

**`lib/ads.ts`** (v3) — `LABEL_TO_PORTFOLIO` overrides + `PAUSED_LABEL` + channel-type labels. In version control so attribution can't silently drift.

**AI** — `app/api/ai-summary/route.ts` (POST, `runtime='nodejs'`): receives `{section, metrics}`; builds user message; calls `claude-sonnet-4-6` with the fixed system prompt; streams a `ReadableStream`. Page passes already-fetched KPIs (no extra BQ round-trip).

---

## 8. `.env.example`

```bash
# BigQuery (server-only)
GOOGLE_APPLICATION_CREDENTIALS_JSON=   # full service-account JSON, single line
BIGQUERY_PROJECT_ID=cubbyboltdata

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/overview
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/overview

# App
ALLOWED_EMAIL_DOMAIN=boltstorage.com
```

---

## 9. Build Order

### v1 — ship & prove
- **Phase 0 — BigQuery access & security.** Dedicated read-only SA, dataset-scoped Data Viewer + Job User, JSON key, env vars (§0b). *Milestone: health-check query returns live rows.*
- **Phase 1 — Scaffold.** Next.js 14 (TS, App Router, Tailwind), shadcn, Recharts, deps. *Milestone: app boots.*
- **Phase 2 — Data layer.** `lib/bigquery.ts` (server-only, cached, `maximumBytesBilled`), `lib/types.ts`, v1 queries. *Milestone: live data on a debug route.*
- **Phase 3 — Auth.** Clerk + `middleware.ts` + `lib/auth.ts`, domain restriction, `viewer` default, `access-pending`. *Milestone: only signed-in domain users reach the dashboard.*
- **Phase 4 — Portfolio dashboard `/overview`.** Layout shell, KPI cards, occupancy trend, portfolio leaderboard. *Milestone: live, secure dashboard.*
- **Phase 5 — AI summary.** `/api/ai-summary` streaming + `AiInsights`. *Milestone: streaming exec summary.*
- **Phase 6 — Deploy.** Vercel encrypted env, `maxDuration`, smoke test. *Milestone: v1 live.*

### Later versions (only after v1 confirmed working)
- **v2:** `/operations` + `/revenue` (AR aging, rent roll), per-portfolio drill-down.
- **v3:** `/marketing` — labels→portfolio + campaign type + Search Console; retire stale ads mapping tables.
- **v4:** `/facilities/[id]` detail; state filter once a facility dimension exists.

---

## 10. Open Questions

1. **"AI Max" bucket** — not a channel type and absent from current data (only Search/PMax/Demand Gen). Signal = campaign-name token or label? (v3)
2. **GA4** — `analytics_308940958` looks like a live export. Placeholder for v1, or wire later? (v3)
3. **Deprecate stale tables?** Flag/retire `ads_portfolio_mapping` + `google_ads_portfolio_mapping`?
4. **MRR definition** — using `rent_roll_monthly.total_rent_roll` for Overview "Total MRR" (consistent with revenue trend). OK vs `SUM(lease_rent_current)` of active leases?
5. **Secrets ready?** Service-account JSON (read `cubbyboltdata`), Clerk keys, Anthropic key, Vercel project.
6. **Facility count** — confirm `occupancy_daily` yields 67 (old `raw.facilities` had 68).

---

## 11. Verification

- **Query validation:** each `lib/queries/*` SQL dry-run via BigQuery MCP first; sanity — leaderboard ~34 portfolios, facilities ~67, occupancy % believable.
- **Auth:** domain test user → Overview only; elevate per role → confirm matrix; non-domain → `/access-pending`.
- **Live data + AI:** `npm run dev`, `/overview` KPIs match MCP numbers; AI card skeletons then streams.
- **Browser:** Claude Preview MCP screenshot of `/overview`.
- **Deploy:** Vercel serverless BQ works from SA env var; routes respect `maxDuration`.
