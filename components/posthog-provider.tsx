"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useUser } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/auth";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

function loaded() {
  return (posthog as unknown as { __loaded?: boolean }).__loaded === true;
}

/**
 * Initializes PostHog (only if a key is configured) and captures a pageview per route.
 * Renders children untouched when analytics is off, so the app runs without a key.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!KEY || loaded()) return;
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false, // we capture manually on route change
      capture_pageleave: true,
    });
  }, []);

  useEffect(() => {
    if (!KEY || !loaded()) return;
    posthog.capture("$pageview");
  }, [pathname]);

  return (
    <>
      {AUTH_ENABLED ? <IdentifyUser /> : null}
      {children}
    </>
  );
}

/** Ties PostHog events to the signed-in user (only mounted when Clerk is active). */
function IdentifyUser() {
  const { user, isLoaded } = useUser();
  useEffect(() => {
    if (!KEY || !loaded() || !isLoaded) return;
    if (user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
      });
    } else {
      posthog.reset();
    }
  }, [user, isLoaded]);
  return null;
}
