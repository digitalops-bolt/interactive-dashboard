import "server-only";
import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";

/**
 * Request-deduped, transient-tolerant wrapper around Clerk's currentUser().
 *
 * - `cache()` dedupes the Backend API call within a single request, so the layout AND the page
 *   share ONE fetch instead of each making their own (halves Clerk load per page).
 * - One short retry rides out a transient `ClerkAPIResponseError` (dev-instance latency or a
 *   brief rate limit from concurrent route prefetches). A persistent failure still throws, so
 *   the auth gate stays fail-closed.
 */
export const getCurrentUser = cache(async () => {
  try {
    return await currentUser();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    return await currentUser();
  }
});
