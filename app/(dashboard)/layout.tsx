import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { getRole } from "@/lib/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already requires a signed-in user; here we enforce (a) the company domain
  // and (b) that the user has a role at all. Onboarding is invite-only with a preset role,
  // so no role = not granted access yet. Skipped entirely when auth is off (local dev).
  if (AUTH_ENABLED) {
    const user = await getCurrentUser();
    const domainOk = user?.emailAddresses?.some((e) =>
      e.emailAddress.toLowerCase().endsWith("@" + ALLOWED_EMAIL_DOMAIN.toLowerCase()),
    );
    if (!domainOk || !getRole(user)) redirect("/access-denied");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
