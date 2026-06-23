# Bolt Storage — BigQuery Data Model Reference

> **Single source of truth** for all dashboard queries, data pipeline work, and AI agent context.
> All schemas verified against live BigQuery as of June 2026.

---

## 1. Business Structure

Bolt Storage operates **67 self-storage facilities** across **11 states**, organized into **34 portfolios**.

### Hierarchy
```
Bolt Storage (company)
  └── Portfolio           ← geographic/market group (e.g. "Elmira", "Ellijay", "Peru")
        └── Facility      ← individual physical location (facility_id, facility_name)
              └── Unit    ← rentable storage space (unit_id)
                    └── Lease  ← rental contract, active or historical (lease_id)
```

### Key identifiers
| Field | Type | Description |
|---|---|---|
| `facility_id` | STRING | Primary key for a facility (from Cubby PMS) |
| `org_id` | STRING | Bolt Storage's org identifier in Cubby |
| `lease_id` | STRING | Primary key for a lease |
| `portfolio` / `portfolio_name` / `facility_group_name` | STRING | Same concept — the portfolio/market name. Column name varies by table (see per-table notes) |

---

## 2. Data Architecture

### Two GCP projects

```
cubby-partner-data.analytics          ← Cubby PMS raw data, hourly refresh (READ via authorized views)
        │
        ▼  scheduled queries / transforms
cubbyboltdata.stg                     ← enriched row-level data (leases, payments, turnover, ads)
        │
        ▼  aggregations
cubbyboltdata.analytics               ← pre-aggregated, dashboard-ready tables
```

### Rules
- **App queries go to `cubbyboltdata` only** — one GCP project, one service account, one credential.
- **`cubbyboltdata` has no `raw` layer.** Raw Cubby data lives in `cubby-partner-data.analytics`. Go there only when you need something not yet in `stg` or `analytics`.
- **Prefer `analytics` tables** for dashboard queries. Use `stg` for row-level grain (individual leases, payments, ad campaigns). Use `cubby-partner-data` only as a last resort.

---

## 3. Datasets & Tables

### 3.1 `cubbyboltdata.stg` — Enriched row-level tables

| Table | Rows | Grain | Description |
|---|---|---|---|
| `stg.leases_enriched` | ~23,600 | lease | All leases (active + historical) with tenant, unit, and financial detail |
| `stg.payments_daily` | ~22,600 | facility × day | Daily payment totals by facility |
| `stg.ads_daily_spend` | ~9,500 | campaign × day | Daily Google Ads spend by campaign, mapped to facility |
| `stg.ads_daily_conversions` | ~1,260 | campaign × day | Daily Google Ads conversions by campaign, mapped to facility |
| `stg.unit_turnover_daily` | ~11,500 | facility × day | Daily move-ins and move-outs by facility |

---

#### `stg.leases_enriched`
```
lease_id                  STRING    PK
facility_id               STRING    FK
facility_name             STRING
org_id                    STRING
portfolio_name            STRING

unit_id                   STRING
unit_name                 STRING
unit_width                NUMERIC
unit_depth                NUMERIC
unit_pricing_group_name   STRING

is_active                 INTEGER   1 = active, 0 = ended  ← always filter on this
is_overlocked             INTEGER
is_in_auction             INTEGER
is_needs_overlock         INTEGER
lease_started             DATE
lease_ended               DATE
created_at                DATETIME

lease_rent_original       NUMERIC   rent at move-in
lease_rent_current        NUMERIC   current rate
lease_rent_next           NUMERIC
lease_rent_next_chg_date  DATE
lease_rent_last_chg_date  DATE
is_lease_paid             INTEGER
status_late_since_date    DATE
status_paid_through_date  DATE
balance_ar                NUMERIC
balance_deposit           NUMERIC
balance_prepaid           NUMERIC
lease_lifetime_payments   NUMERIC
ins_premium               NUMERIC
ins_coverage_level        NUMERIC

is_autopay_enabled        BOOLEAN
autopay_method_type       STRING

contact_id                STRING
contact_name              STRING
contact_email             STRING
contact_phone             STRING
contact_city              STRING
contact_state             STRING
contact_zip               STRING
is_military               INTEGER

lease_all_discounts       STRING
lease_created_by          STRING    online / phone / walk-in / etc.
```

---

#### `stg.payments_daily`
```
payment_date    DATE
facility_id     STRING
facility_name   STRING
portfolio       STRING    ← "portfolio" (not "portfolio_name")
net_revenue     NUMERIC   ← primary revenue metric
gross_revenue   NUMERIC
refunds         NUMERIC
```

---

#### `stg.ads_daily_spend`
```
date            DATE
campaign_id     INTEGER
campaign_name   STRING
facility_id     STRING    ← mapped to facility; use to join portfolio via facility lookup
cost_usd        FLOAT     ← already in USD (not micros)
```

---

#### `stg.ads_daily_conversions`
```
date              DATE
campaign_id       INTEGER
campaign_name     STRING
facility_id       STRING
conversions       FLOAT
conversions_value FLOAT
```

> `stg.ads_daily_spend` and `stg.ads_daily_conversions` already have `facility_id` mapped.
> Join to `analytics.occupancy_daily` or `stg.leases_enriched` via `facility_id` to get `portfolio_name`.

---

#### `stg.unit_turnover_daily`
```
activity_date     DATE
facility_id       STRING
facility_name     STRING
portfolio         STRING    ← "portfolio" (not "portfolio_name")
move_ins          INTEGER
move_outs         INTEGER
net_rentals       INTEGER
online_move_ins   INTEGER
phone_move_ins    INTEGER
```

---

### 3.2 `cubbyboltdata.analytics` — Aggregated dashboard tables

| Table | Grain | Description |
|---|---|---|
| `analytics.facility_daily` | facility × day | Move-ins, move-outs, revenue, ads spend/conversions — primary ops table |
| `analytics.occupancy_daily` | facility × unit_category × day | Occupancy by unit size — primary occupancy table |
| `analytics.portfolio_occ_daily` | portfolio × day | Portfolio-level occupancy rollup (pre-aggregated) |
| `analytics.rent_roll_monthly` | facility × month | Monthly rent roll snapshot — primary revenue table |
| `analytics.lease_cohorts` | lease | Cohort analytics: LOS, rent changes, active status |
| `analytics.collection_monthly` | facility × month × late_days_range | AR aging buckets by facility |
| `analytics.active_customers_table` | tenant | Current active tenant snapshot |
| `analytics.google_ads_portfolio_mapping` | label_name | Maps Google Ads label names → portfolio names (see Section 4) |

---

#### `analytics.facility_daily` ⭐ PRIMARY OPERATIONS TABLE
```
date                  DATE
facility_id           STRING
facility_name         STRING
portfolio             STRING    ← "portfolio" (not "portfolio_name")
move_ins              INTEGER
move_outs             INTEGER
net_rentals           INTEGER
online_move_ins       INTEGER
phone_move_ins        INTEGER
net_revenue           NUMERIC   ← primary revenue metric
gross_revenue         NUMERIC
refunds               NUMERIC
ads_spend             FLOAT
ads_conversions       FLOAT
ads_conversions_value FLOAT
```

---

#### `analytics.occupancy_daily` ⭐ PRIMARY OCCUPANCY TABLE
```
date                DATE
facility_id         STRING
facility_name       STRING
portfolio_name      STRING    ← "portfolio_name"
pricing_group_name  STRING
unit_category       STRING    Small / Medium / Large / Climate / etc.
total_units         INTEGER
rentable_units      INTEGER
occupied_units      INTEGER
unrentable_units    INTEGER
total_sqft          NUMERIC
rentable_sqft       NUMERIC
occupied_sqft       NUMERIC
unrentable_sqft     NUMERIC
```
> Occupancy % = `occupied_units / rentable_units`
> One row per `facility × unit_category × date` — **always SUM across unit_category** unless drilling into unit mix.

---

#### `analytics.portfolio_occ_daily` ⭐ USE THIS FOR PORTFOLIO-LEVEL OCCUPANCY
```
portfolio_name    STRING
occupied_units    INTEGER
total_units       INTEGER
occ_pct           FLOAT     ← pre-calculated occupancy %
as_of_date        DATE
```
> Only contains the latest snapshot (36 rows = 34 portfolios + 2 others). Use for current-state portfolio cards.

---

#### `analytics.rent_roll_monthly` ⭐ PRIMARY REVENUE TABLE
```
snapshot_date     DATE      partitioned
portfolio_name    STRING    ← "portfolio_name"
facility_id       STRING
facility_name     STRING
occupied_units    INTEGER
rentable_units    INTEGER
total_rent_roll   NUMERIC   total MRR for that facility that month
_loaded_at        TIMESTAMP
```

---

#### `analytics.lease_cohorts` ⭐ PRIMARY COHORT TABLE
```
lease_id                  STRING
facility_id               STRING
facility_name             STRING
portfolio_name            STRING
unit_category             STRING
unit_pricing_group_name   STRING
lease_start_year          INTEGER
lease_start_month         INTEGER
is_active                 INTEGER
is_in_auction             INTEGER
length_of_stay_days       INTEGER
length_of_stay_months     FLOAT
lease_rent_current        NUMERIC
lease_rent_original       NUMERIC
lease_rent_last_chg_date  DATE
lease_lifetime_payments   NUMERIC
lease_started             DATE
```

---

#### `analytics.collection_monthly`
```
snapshot_month    DATE
facility_id       STRING
facility_name     STRING
portfolio_name    STRING
late_days_range   STRING    e.g. "0-30", "31-60", "61-90", "90+"
lease_count       INTEGER
total_balance_ar  NUMERIC
_loaded_at        TIMESTAMP
```

---

### 3.3 `cubbyboltdata.bolt_g_ads_data` — Google Ads raw export (BQ Transfer Service)

All tables end in `_2921271203` (Google Ads customer ID).
Always use `p_` prefixed tables (partitioned) — never the unprefixed versions.

| Table | Description |
|---|---|
| `p_ads_CampaignBasicStats_2921271203` | **Use this for campaign-level daily spend/conversions.** Unsegmented daily campaign metrics — matches the Google Ads platform totals exactly |
| `p_ads_CampaignStats_2921271203` | Daily campaign metrics segmented by device/network/slot — **do NOT sum for daily campaign totals**, its exported rows omit cost and understate spend (~27% low on Demand Gen) |
| `p_ads_AccountStats_2921271203` | Account-level daily rollup |
| `p_ads_KeywordStats_2921271203` | Keyword performance |
| `p_ads_SearchQueryStats_2921271203` | Search term report |
| `ads_Campaign_2921271203` | Campaign dimension — **has `campaign_name` and `campaign_id`** |
| `ads_CampaignLabel_2921271203` | Campaign → label mapping — **use this for portfolio attribution** |

> **Stats tables only have `campaign_id` (INTEGER), not campaign name.**
> `metrics_cost_micros` is in micros — divide by `1e6` to get USD.
> **For spend, always use `CampaignBasicStats`, not `CampaignStats`** — the segmented `CampaignStats` table systematically understates daily campaign spend (verified against the platform: it dropped 27% of Demand Gen cost). `CampaignBasicStats` has the identical columns (`campaign_id`, `segments_date`, `metrics_cost_micros`, `metrics_clicks`, `metrics_impressions`, `metrics_conversions`) and matches platform totals to the cent.
> For most dashboard use cases, prefer `stg.ads_daily_spend` and `stg.ads_daily_conversions` which already have `facility_id` mapped.

---

### 3.4 `cubbyboltdata.searchconsole` — Google Search Console
Key table: `searchconsole.searchdata_url_impression`
Columns: `url`, `query`, `impressions`, `clicks`, `sum_position`, `data_date`

### 3.5 `cubbyboltdata.analytics_308940958` — Likely GA4 export
Standard GA4 → BigQuery export format. **Verify tables before setting up a new GA4 connection.**

---

## 4. Ads → Portfolio Mapping

Campaigns are linked to portfolios via **Google Ads Labels**, which are already applied to all active campaigns and export natively to BQ via `ads_CampaignLabel_2921271203`.

### Why labels, not campaign name parsing
- Labels are explicit, not regex-based — no risk of mismatch when naming conventions drift
- Multi-facility campaigns (e.g. `D - Search - Storage | NY Elmira, Southport, Pine City`) are correctly grouped under one label (`Elmira`) without parsing
- New campaigns only need a label applied in Google Ads — no BQ table updates needed

### Current labels (35 total)
Most labels match portfolio names exactly. The ones that don't:

| Label Name | Portfolio Name | Reason |
|---|---|---|
| Christiansburg/Moneta | Christiansburg | Two cities, one portfolio |
| Erie/Corry/Union | Erie | Three cities, one portfolio |
| Fairview/McKean | Fairview | Two cities, one portfolio |
| Ithaca/Freeville | Ithaca | Two cities, one portfolio |
| Risign Fawn | Rising Fawn | Typo in Google Ads — fix when possible |
| Robinsonville/Walls | Robinsonville | Two cities, one portfolio |
| Trion/Summerville/Lyerly | Trion | Three cities, one portfolio |
| Troy/Cropseyville | Troy | Two cities, one portfolio |

> There is also a `Paused 18 March'25` label used as a status tag — **exclude this from portfolio attribution queries.**

### Normalization table to create: `analytics.ads_label_to_portfolio`
A small static lookup (only needs updating when a new portfolio is added):
```
label_name      STRING    PK  (from ads_CampaignLabel)
portfolio_name  STRING        (canonical name matching other tables)
```
Rows only needed for the non-obvious mappings above. For all others, `label_name = portfolio_name`.

### Canonical ads → portfolio join
```sql
SELECT
  COALESCE(lp.portfolio_name, cl.label_name) AS portfolio,
  s.segments_date                             AS date,
  SUM(s.metrics_cost_micros) / 1e6           AS spend_usd,
  SUM(s.metrics_conversions)                 AS conversions,
  SUM(s.metrics_clicks)                      AS clicks,
  SUM(s.metrics_impressions)                 AS impressions
FROM `cubbyboltdata.bolt_g_ads_data.p_ads_CampaignBasicStats_2921271203` s
JOIN `cubbyboltdata.bolt_g_ads_data.ads_CampaignLabel_2921271203` cl
  ON s.campaign_id = cl.campaign_id
  AND cl._DATA_DATE = cl._LATEST_DATE
  AND cl.label_name != 'Paused 18 March\'25'
LEFT JOIN `cubbyboltdata.analytics.ads_label_to_portfolio` lp
  ON cl.label_name = lp.label_name
WHERE s.segments_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY portfolio, date
ORDER BY date, portfolio
```

### Workflow for new campaigns
1. Create campaign in Google Ads with standard naming
2. Apply the existing portfolio label (one click)
3. Done — appears in BQ on next sync, no table updates needed

---

## 5. Portfolio Field Name Reference

This is the most common source of bugs. Always check column names per table:

| Table | Portfolio Column |
|---|---|
| `analytics.facility_daily` | `portfolio` |
| `analytics.portfolio_occ_daily` | `portfolio_name` |
| `analytics.occupancy_daily` | `portfolio_name` |
| `analytics.rent_roll_monthly` | `portfolio_name` |
| `analytics.lease_cohorts` | `portfolio_name` |
| `analytics.collection_monthly` | `portfolio_name` |
| `stg.leases_enriched` | `portfolio_name` |
| `stg.payments_daily` | `portfolio` |
| `stg.unit_turnover_daily` | `portfolio` |

---

## 6. Standard Query Patterns

### Current company-wide occupancy
```sql
SELECT
  SUM(occupied_units) AS occupied,
  SUM(total_units)    AS total,
  ROUND(occ_pct * 100, 1) AS occ_pct   -- already calculated
FROM `cubbyboltdata.analytics.portfolio_occ_daily`
-- single latest snapshot, no date filter needed
```

### Portfolio occupancy leaderboard
```sql
SELECT portfolio_name, occupied_units, total_units, ROUND(occ_pct * 100, 1) AS occ_pct
FROM `cubbyboltdata.analytics.portfolio_occ_daily`
ORDER BY occ_pct DESC
```

### MRR trend (company-wide)
```sql
SELECT snapshot_date, SUM(total_rent_roll) AS mrr
FROM `cubbyboltdata.analytics.rent_roll_monthly`
GROUP BY snapshot_date ORDER BY snapshot_date
```

### Move-ins vs move-outs (last 30 days)
```sql
SELECT date, SUM(move_ins) AS move_ins, SUM(move_outs) AS move_outs, SUM(net_rentals) AS net
FROM `cubbyboltdata.analytics.facility_daily`
WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY date ORDER BY date
```

### Active leases summary by portfolio
```sql
SELECT portfolio_name, COUNT(*) AS leases, SUM(lease_rent_current) AS total_rent, AVG(lease_rent_current) AS avg_rent
FROM `cubbyboltdata.stg.leases_enriched`
WHERE is_active = 1
GROUP BY portfolio_name ORDER BY total_rent DESC
```

### AR aging summary
```sql
SELECT snapshot_month, late_days_range, SUM(lease_count) AS leases, SUM(total_balance_ar) AS ar
FROM `cubbyboltdata.analytics.collection_monthly`
WHERE snapshot_month = DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY snapshot_month, late_days_range ORDER BY late_days_range
```

---

## 7. Developer Reminders

1. **No `cubbyboltdata.raw`** — it does not exist. Raw data is in `cubby-partner-data.analytics`.
2. **`occupancy_daily` is multi-row per facility** — always `SUM()` across `unit_category`.
3. **Active leases only** — filter `WHERE is_active = 1` in `stg.leases_enriched` and `analytics.lease_cohorts`.
4. **Latest complete day** — use `CURRENT_DATE() - 1` for daily tables to avoid partial-day data.
5. **Ads cost** — `metrics_cost_micros / 1e6` = USD. `stg.ads_daily_spend.cost_usd` is already in USD.
6. **Partitioned ads tables** — always `p_ads_*`, never `ads_*` for stats tables.
7. **Paused label** — exclude `label_name = 'Paused 18 March\'25'` from all portfolio attribution queries.

---

## 8. Planned Integrations (not yet in BQ)

| Source | Path | Priority | Notes |
|---|---|---|---|
| GA4 | Native BQ export (free) | High | Check `analytics_308940958` first — may already exist |
| CallRail | CallRail BQ connector (paid) | High | Calls = rentals; critical for marketing attribution |
