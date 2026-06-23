import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ALLOWED_EMAIL_DOMAIN, AUTH_ENABLED } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already requires a signed-in user; here we enforce the company domain
  // (defense-in-depth with Clerk's allowlist). Skipped entirely when auth is off.
  if (AUTH_ENABLED) {
    const user = await currentUser();
    const ok = user?.emailAddresses?.some((e) =>
      e.emailAddress.toLowerCase().endsWith("@" + ALLOWED_EMAIL_DOMAIN.toLowerCase()),
    );
    if (!ok) redirect("/access-denied");
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
