// Auth activates only when Clerk keys are present. This lets the app run locally before
// the Clerk account exists; once NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set, login turns on
// automatically (middleware protects routes, the dashboard enforces the email domain).
export const AUTH_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Only @<this-domain> accounts may use the dashboard (defense-in-depth alongside Clerk's
// dashboard allowlist). Server-only env var; defaults to boltstorage.com.
export const ALLOWED_EMAIL_DOMAIN =
  process.env.ALLOWED_EMAIL_DOMAIN ?? "boltstorage.com";
