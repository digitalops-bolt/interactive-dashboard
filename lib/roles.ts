// Role-based access — single source of truth, used on both server (layout, /admin) and
// client (sidebar). No `server-only` import so it can be shared. Roles live on the Clerk
// user's publicMetadata.role; onboarding is invite-only with a preset role, so a user with
// NO role gets NO access (anomaly-safe default).

export const ROLES = ["admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];
// To add a role (e.g. "marketing", "ops"): add it here, then extend ROUTE_RULES /
// portfolioAccess below. Enforcement picks it up with no other code changes.

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  viewer: "Viewer",
};

/** Read a user's role from Clerk public metadata. null = unset/invalid = no access. */
export function getRole(
  user: { publicMetadata?: Record<string, unknown> | null } | null | undefined,
): Role | null {
  const r = user?.publicMetadata?.role;
  return typeof r === "string" && (ROLES as readonly string[]).includes(r)
    ? (r as Role)
    : null;
}

// Route-prefix → roles allowed. A path with no matching rule is open to any valid role.
const ROUTE_RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  // /overview, /portfolios, … → all roles (add rules here to gate more tabs)
];

/** Can this role load this path? (Server-enforced in the dashboard layout.) */
export function canAccessPath(role: Role | null, pathname: string): boolean {
  if (!role) return false; // no role = no access
  for (const rule of ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      if (!rule.roles.includes(role)) return false;
    }
  }
  return true;
}

/** Should this nav item be shown for this role? (UX hint; security is canAccessPath.) */
export function canSeeNav(role: Role | null, href: string): boolean {
  return canAccessPath(role, href);
}

/**
 * Portfolio names a role may see. `null` = no restriction (all portfolios).
 * Extend with a per-role allowlist when data-level gating is needed, e.g.:
 *   if (role === "marketing") return ["Elmira", "Ellijay"];
 */
export function portfolioAccess(role: Role | null): string[] | null {
  switch (role) {
    // case "marketing": return ["Elmira", "Ellijay"];
    default:
      return null; // no restriction — all portfolios
  }
}
