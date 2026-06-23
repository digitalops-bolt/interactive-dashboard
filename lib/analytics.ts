"use client";

import posthog from "posthog-js";

/**
 * Safe event capture: no-ops unless PostHog is initialized (i.e. NEXT_PUBLIC_POSTHOG_KEY
 * is set). Use for product events like range_changed, portfolio_opened, etc.
 */
export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window !== "undefined" && (posthog as unknown as { __loaded?: boolean }).__loaded) {
    posthog.capture(event, props);
  }
}
