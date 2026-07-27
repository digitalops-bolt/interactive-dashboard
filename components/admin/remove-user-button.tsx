"use client";

import { removeUser } from "@/app/(dashboard)/admin/actions";
import { track } from "@/lib/analytics";

/**
 * Deletes a user's account (admin only). Client component because the /admin page is a server
 * component: it needs a confirm gate before the destructive submit and a PostHog event. The
 * server action re-checks admin + self-guard, so this is UX, not the security boundary.
 */
export function RemoveUserButton({ userId, email }: { userId: string; email: string }) {
  return (
    <form
      action={removeUser}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Remove ${email}? This permanently deletes their account. They'll need a fresh invite to regain access.`,
        );
        if (!ok) {
          e.preventDefault();
          return;
        }
        track("admin_user_removed", { userId });
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="rounded-md border px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-muted dark:text-red-500"
      >
        Remove
      </button>
    </form>
  );
}
