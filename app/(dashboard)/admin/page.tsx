import { redirect } from "next/navigation";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AUTH_ENABLED } from "@/lib/auth";
import { getRole, ROLES, ROLE_LABELS } from "@/lib/roles";
import {
  getUsageStats,
  POSTHOG_ADMIN_CONFIGURED,
} from "@/lib/posthog-admin";
import { formatNumber } from "@/lib/format";
import { inviteUser, revokeInvite, setUserRole } from "./actions";

export const runtime = "nodejs";

// Deterministic UTC date (avoids server/client hydration drift). Input is epoch ms or null.
function fmtDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

const roleSelectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default async function AdminPage() {
  // The dashboard layout already blocks no-role users; this enforces admin-only.
  if (AUTH_ENABLED) {
    const me = await currentUser();
    if (getRole(me) !== "admin") redirect("/access-denied");
  }

  if (!AUTH_ENABLED) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Authentication isn&apos;t configured in this environment, so user management is
            unavailable. Set the Clerk keys to enable the admin tools.
          </CardContent>
        </Card>
      </div>
    );
  }

  const client = await clerkClient();
  const [userList, inviteList, usage] = await Promise.all([
    client.users.getUserList({ limit: 100, orderBy: "-created_at" }),
    client.invitations.getInvitationList({ status: "pending" }),
    getUsageStats(),
  ]);
  const users = userList.data;
  const invites = inviteList.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Invite teammates, manage roles, and review access. Onboarding is invite-only.
        </p>
      </header>

      {/* Invite */}
      <Card>
        <CardHeader>
          <CardTitle>Invite a user</CardTitle>
          <CardDescription>
            Sends a Clerk invitation to a @boltstorage.com email with the chosen role preset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={inviteUser} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@boltstorage.com"
                className="h-9 w-72 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-xs font-medium text-muted-foreground">
                Role
              </label>
              <select id="role" name="role" defaultValue="viewer" className={roleSelectClass}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Send invite
            </button>
          </form>
        </CardContent>
      </Card>

      {/* Pending invitations */}
      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>{invites.length} awaiting acceptance</CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.emailAddress}</TableCell>
                      <TableCell>
                        {ROLE_LABELS[getRole({ publicMetadata: inv.publicMetadata }) ?? "viewer"]}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtDate(inv.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={revokeInvite}>
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <button
                            type="submit"
                            className="rounded-md border px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-muted dark:text-red-500"
                          >
                            Revoke
                          </button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>{users.length} with access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const email =
                    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
                      ?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? "—";
                  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                  const role = getRole(u) ?? "viewer";
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-muted-foreground">{email}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtDate(u.lastSignInAt)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={setUserRole} className="inline-flex items-center gap-1.5">
                          <input type="hidden" name="userId" value={u.id} />
                          <select name="role" defaultValue={role} className={roleSelectClass}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                          >
                            Save
                          </button>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Usage (PostHog) */}
      <Card>
        <CardHeader>
          <CardTitle>Usage · last 30 days</CardTitle>
          <CardDescription>From PostHog — which tabs and actions get used</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!POSTHOG_ADMIN_CONFIGURED ? (
            <p className="text-sm text-muted-foreground">
              Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">POSTHOG_PERSONAL_API_KEY</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">POSTHOG_PROJECT_ID</code> to
              show usage here. Until then, view it in PostHog directly.
            </p>
          ) : !usage ? (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load usage — check the PostHog admin key / project ID.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Active users · 7d</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatNumber(usage.activeUsers.last7)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Active users · 30d</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatNumber(usage.activeUsers.last30)}
                  </p>
                </div>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Most-visited tab</TableHead>
                        <TableHead className="text-right">Views</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.topPages.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-muted-foreground">
                            No pageviews yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        usage.topPages.map((p) => (
                          <TableRow key={p.path}>
                            <TableCell className="font-medium">{p.path}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(p.views)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Top interaction</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.topEvents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-muted-foreground">
                            No events yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        usage.topEvents.map((e) => (
                          <TableRow key={e.event}>
                            <TableCell className="font-medium">{e.event}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(e.count)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
