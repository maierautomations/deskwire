"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getScopedDb } from "@/db";
import { requireWorkspaceMembership } from "@/lib/workspace";

// Not exported: a "use server" module may only export async functions
// (task-10b finding).
const INVITE_LOGIN_REQUIRED_MESSAGE =
  "Bitte melde dich an, um den Einladungslink zu verwalten.";
const INVITE_FORBIDDEN_MESSAGE = "Dafür fehlt dir die Berechtigung.";

export type RegenerateInviteFormState =
  | { status: "idle" }
  | { status: "error"; message: string };

// Creates or renews the workspace's single invite link (one upsert in the
// scoped helper covers both). Server actions are public POST endpoints, so
// session AND membership are checked here regardless of the form; the
// membership answer is identical for foreign and non-existent workspace ids
// (no existence leak, decision no. 19). ANY member may regenerate — an
// owner-only restriction would be permission logic, which is deliberately
// phase 4 (decision no. 21). On success the page revalidates and re-renders
// with the new link; there is no success form state.
export async function regenerateInviteAction(
  _prev: RegenerateInviteFormState,
  formData: FormData,
): Promise<RegenerateInviteFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { status: "error", message: INVITE_LOGIN_REQUIRED_MESSAGE };
  }
  const rawWorkspaceId = formData.get("workspaceId");
  const workspaceId = typeof rawWorkspaceId === "string" ? rawWorkspaceId : "";
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  if (!membership) {
    return { status: "error", message: INVITE_FORBIDDEN_MESSAGE };
  }
  await getScopedDb(workspaceId).invites.regenerate({ createdBy: userId });
  revalidatePath(`/w/${workspaceId}/settings`);
  return { status: "idle" };
}
