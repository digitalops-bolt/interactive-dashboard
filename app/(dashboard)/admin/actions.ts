"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { getRole, ROLES, type Role } from "@/lib/roles";

// Every action re-verifies the caller is an admin — a non-admin could POST directly.
async function assertAdmin() {
  const me = await currentUser();
  if (getRole(me) !== "admin") throw new Error("Not authorized");
}

function asRole(v: unknown): Role | null {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v)
    ? (v as Role)
    : null;
}

/** Change an existing user's role (merges into publicMetadata). */
export async function setUserRole(formData: FormData) {
  await assertAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = asRole(formData.get("role"));
  if (!userId || !role) return;
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { role } });
  revalidatePath("/admin");
}

/** Invite a new user with their role preset (invite-only onboarding). */
export async function inviteUser(formData: FormData) {
  await assertAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = asRole(formData.get("role"));
  if (!email || !role) return;
  const h = headers();
  const origin = h.get("origin") ?? `https://${h.get("host") ?? ""}`;
  const client = await clerkClient();
  try {
    await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role },
      redirectUrl: `${origin}/sign-up`,
      ignoreExisting: true,
    });
  } catch {
    // Swallow duplicates / already-a-member; the pending list reflects the real state.
  }
  revalidatePath("/admin");
}

/** Revoke a pending invitation. */
export async function revokeInvite(formData: FormData) {
  await assertAdmin();
  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return;
  const client = await clerkClient();
  try {
    await client.invitations.revokeInvitation(invitationId);
  } catch {
    // Already accepted/revoked — ignore.
  }
  revalidatePath("/admin");
}
