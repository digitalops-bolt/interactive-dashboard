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

/** Usage summary for the admin page. Returns null if not configured or the API errors. */
export async function getUsageStats(): Promise<UsageStats | null> {
  if (!POSTHOG_ADMIN_CONFIGURED) return null;
  try {
    const [pages, events, active] = await Promise.all([
      hogql(
        "SELECT properties.$pathname AS path, count() AS views FROM events " +
          "WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY " +
          "GROUP BY path ORDER BY views DESC LIMIT 10",
      ),
      hogql(
        "SELECT event, count() AS n FROM events " +
          "WHERE event NOT LIKE '$%' AND timestamp > now() - INTERVAL 30 DAY " +
          "GROUP BY event ORDER BY n DESC LIMIT 10",
      ),
      hogql(
        "SELECT uniqIf(person_id, timestamp > now() - INTERVAL 7 DAY) AS u7, " +
          "uniq(person_id) AS u30 FROM events WHERE timestamp > now() - INTERVAL 30 DAY",
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
