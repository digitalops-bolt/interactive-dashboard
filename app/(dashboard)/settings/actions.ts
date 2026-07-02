"use server";

import { revalidatePath } from "next/cache";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { AUTH_ENABLED } from "@/lib/auth";
import { sanitizePrefs } from "@/lib/briefing-prefs";

/**
 * Saves the CURRENT user's own briefing preferences to their Clerk publicMetadata.
 * Self-service (not admin) — a user can only edit their own prefs. Preserves other
 * metadata (e.g. role) by spreading the existing object.
 */
export async function saveBriefingPrefs(formData: FormData) {
  if (!AUTH_ENABLED) return;
  const me = await currentUser();
  if (!me) return;

  const prefs = sanitizePrefs({
    focus: formData.getAll("focus").map(String),
    compare: String(formData.get("compare") ?? ""),
  });

  const client = await clerkClient();
  await client.users.updateUser(me.id, {
    publicMetadata: { ...me.publicMetadata, briefingPrefs: prefs },
  });

  revalidatePath("/settings");
  revalidatePath("/overview");
}
