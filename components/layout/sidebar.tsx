"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/layout/nav";
import { AUTH_ENABLED } from "@/lib/auth";
import { canSeeNav, getRole, type Role } from "@/lib/roles";

// useUser() requires a ClerkProvider, which only exists when auth is enabled. So the hook
// lives in a child that's mounted only in that case; with auth off we render as "admin"
// (local dev convenience — everything visible).
export function Sidebar() {
  return AUTH_ENABLED ? <SidebarWithRole /> : <SidebarView role="admin" />;
}

function SidebarWithRole() {
  const { user } = useUser();
  return <SidebarView role={getRole(user)} />;
}

function SidebarView({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => canSeeNav(role, item.href));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          B
        </div>
        <span className="font-semibold tracking-tight">Bolt Storage</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;

          if (!item.enabled) {
            return (
              <div
                key={item.href}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  Soon
                </span>
              </div>
            );
          }

          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">Internal · v1</div>
    </aside>
  );
}
