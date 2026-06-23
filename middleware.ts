import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-denied",
]);

// When Clerk keys aren't configured yet, auth is a no-op pass-through (keeps the app
// runnable locally before setup). With keys present, every non-public route requires login;
// the company email-domain check lives in app/(dashboard)/layout.tsx (where currentUser() is
// available) plus Clerk's own dashboard allowlist.
const handler = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : () => NextResponse.next();

export default handler;

export const config = {
  matcher: [
    // Skip Next internals and static assets; run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|svg|png|ico|webp|woff2?|ttf|map)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
