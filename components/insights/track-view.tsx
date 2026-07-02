"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

/** Fires a single PostHog event when this mounts (used to record briefing views). */
export function TrackOnView({
  event,
  props,
}: {
  event: string;
  props?: Record<string, unknown>;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
