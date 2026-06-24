import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/access-denied",
]);

// With Clerk keys present, every non-public route requires login; the company email-domain
// check lives in app/(dashboard)/layout.tsx (where currentUser() is available) plus Clerk's
// own dashboard allowlist.
//
// Without keys: in development we pass through (so the app is runnable before Clerk is set up),
// but in PRODUCTION we FAIL CLOSED — refuse every request — so a missing/typo'd Clerk key can
// never silently expose the financial dashboard to the public.
const handler = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : () =>
      process.env.NODE_ENV === "production"
        ? new NextResponse(
            "Authentication is not configured. Set the Clerk keys before serving this app.",
            { status: 503 },
          )
        : NextResponse.next();

export default handler;

export const config = {
  matcher: [
    // Skip Next internals and static assets; run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|svg|png|ico|webp|woff2?|ttf|map)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
