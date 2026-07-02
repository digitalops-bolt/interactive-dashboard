import "server-only";

// Server-side PostHog analytics for the /admin Usage tab. Uses a PERSONAL API key (read
// scope) — never exposed to the client. Distinct from the public NEXT_PUBLIC_ ingestion key.
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
// REST API lives on the app host (us.posthog.com), not the ingestion host (us.i.posthog.com).
const API_HOST = process.env.POSTHOG_API_HOST ?? "https://us.posthog.com";

export const POSTHOG_ADMIN_CONFIGURED = !!(PROJECT_ID && API_KEY);

export interface UsageStats {
  topPages: { path: string; views: number }[];
  topEvents: { event: string; count: number }[];
  activeUsers: { last7: number; last30: number };
}

export interface UserUsageRow {
  email: string;
  events: number;
  pageviews: number;
  lastSeen: string;
}

async function hogql(query: string): Promise<unknown[][]> {
  const res = await fetch(`${API_HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  const json = (await res.json()) as { results?: unknown[][] };
  return json.results ?? [];
}

/**
 * Clerk user ids are `user_<alphanumeric>`. We only ever pass an id that already matched the
 * fetched Clerk user list, but we also hard-restrict the characters as defense-in-depth before
 * it touches a query string.
 */
function safeDistinctId(id: string | undefined): string | null {
  if (!id) return null;
  return /^[A-Za-z0-9_]+$/.test(id) ? id : null;
}

/** Usage summary for the admin page. Optionally scoped to one user. Returns null on error. */
export async function getUsageStats(opts?: {
  distinctId?: string;
}): Promise<UsageStats | null> {
  if (!POSTHOG_ADMIN_CONFIGURED) return null;
  const uid = safeDistinctId(opts?.distinctId);
  const userClause = uid ? `AND distinct_id = '${uid}'` : "";
  try {
    const [pages, events, active] = await Promise.all([
      hogql(
        "SELECT properties.$pathname AS path, count() AS views FROM events " +
          `WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY ${userClause} ` +
          "GROUP BY path ORDER BY views DESC LIMIT 10",
      ),
      hogql(
        "SELECT event, count() AS n FROM events " +
          `WHERE event NOT LIKE '$%' AND timestamp > now() - INTERVAL 30 DAY ${userClause} ` +
          "GROUP BY event ORDER BY n DESC LIMIT 10",
      ),
      hogql(
        "SELECT uniqIf(person_id, timestamp > now() - INTERVAL 7 DAY) AS u7, " +
          `uniq(person_id) AS u30 FROM events WHERE timestamp > now() - INTERVAL 30 DAY ${userClause}`,
      ),
    ]);
    return {
      topPages: pages.map((r) => ({ path: String(r[0] ?? "—"), views: Number(r[1] ?? 0) })),
      topEvents: events.map((r) => ({ event: String(r[0] ?? "—"), count: Number(r[1] ?? 0) })),
      activeUsers: { last7: Number(active[0]?.[0] ?? 0), last30: Number(active[0]?.[1] ?? 0) },
    };
  } catch {
    return null;
  }
}

/** Per-user activity (last 30d), keyed on the identified email. Returns null on error. */
export async function getUsageByUser(): Promise<UserUsageRow[] | null> {
  if (!POSTHOG_ADMIN_CONFIGURED) return null;
  try {
    const rows = await hogql(
      "SELECT person.properties.email AS email, count() AS events, " +
        "countIf(event = '$pageview') AS pageviews, max(timestamp) AS last_seen " +
        "FROM events WHERE timestamp > now() - INTERVAL 30 DAY " +
        "AND person.properties.email IS NOT NULL " +
        "GROUP BY email ORDER BY events DESC LIMIT 50",
    );
    return rows.map((r) => ({
      email: String(r[0] ?? "—"),
      events: Number(r[1] ?? 0),
      pageviews: Number(r[2] ?? 0),
      lastSeen: String(r[3] ?? "").slice(0, 10) || "—",
    }));
  } catch {
    return null;
  }
}
