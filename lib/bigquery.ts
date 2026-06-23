import "server-only";
import { BigQuery } from "@google-cloud/bigquery";
import { unstable_cache } from "next/cache";

const projectId = process.env.BIGQUERY_PROJECT_ID || "cubbyboltdata";

function createClient(): BigQuery {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set");
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON");
  }
  return new BigQuery({ projectId, credentials });
}

// Reuse one client across hot reloads (dev) and warm serverless invocations.
const globalForBq = globalThis as unknown as { __boltBq?: BigQuery };
const bq: BigQuery = globalForBq.__boltBq ?? createClient();
if (process.env.NODE_ENV !== "production") globalForBq.__boltBq = bq;

const MAX_BYTES_BILLED = "100000000"; // 100 MB per-query safety cap

export type QueryParams = Record<string, string | number | boolean | null>;

/** Unwrap BigQuery wrapper objects ({ value }) like DATE/TIMESTAMP/NUMERIC. */
function normalizeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (
      v !== null &&
      typeof v === "object" &&
      "value" in (v as Record<string, unknown>) &&
      Object.keys(v as Record<string, unknown>).length === 1
    ) {
      out[k] = (v as { value: unknown }).value;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

async function runQuery<T>(sql: string, params?: QueryParams): Promise<T[]> {
  const [rows] = await bq.query({
    query: sql,
    params: params ?? {},
    maximumBytesBilled: MAX_BYTES_BILLED,
  });
  return (rows as Record<string, unknown>[]).map((r) => normalizeRow<T>(r));
}

/**
 * Cached read-only query. `cacheKey` identifies the query shape; include any
 * dynamic param values in `keyParts` so distinct inputs cache separately.
 * Default revalidate is 1h (the source tables refresh daily/monthly).
 */
export function cachedQuery<T>(
  sql: string,
  opts: {
    cacheKey: string;
    keyParts?: string[];
    params?: QueryParams;
    revalidate?: number;
  },
): Promise<T[]> {
  const { cacheKey, keyParts = [], params, revalidate = 3600 } = opts;
  // In development, bypass the cache so query/SQL edits reflect immediately.
  if (process.env.NODE_ENV !== "production") {
    return runQuery<T>(sql, params);
  }
  const load = unstable_cache(
    () => runQuery<T>(sql, params),
    [cacheKey, ...keyParts],
    { revalidate, tags: [cacheKey] },
  );
  return load();
}

export { runQuery };
