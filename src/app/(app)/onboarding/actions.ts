"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createWorkspaceForUser } from "@/lib/workspace";

// NOT exported: a "use server" module may only export async functions —
// Turbopack enforces this as soon as a client component imports the module
// (type exports are erased and stay fine, task-8 precedent in login/actions).
const WORKSPACE_LOGIN_REQUIRED_MESSAGE =
  "Bitte melde dich an, um einen Workspace anzulegen.";

export type CreateWorkspaceFormState =
  | { status: "idle" }
  | { status: "unauthenticated"; message: string }
  | { status: "invalid"; message: string; name: string };

// Thin shell only: session check plus formData extraction. The tested core
// (Zod parse, atomic tenant creation) lives in createWorkspaceForUser. The
// session check happens HERE because server actions are public POST
// endpoints, callable without any form. On success the action redirects into
// the new workspace; redirect() throws NEXT_REDIRECT, so it must never be
// wrapped in try/catch (task-8 rule) — which is why there is no "created"
// form state: that path never returns.
export async function createWorkspaceAction(
  _prev: CreateWorkspaceFormState,
  formData: FormData,
): Promise<CreateWorkspaceFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      status: "unauthenticated",
      message: WORKSPACE_LOGIN_REQUIRED_MESSAGE,
    };
  }
  const rawName = formData.get("name");
  const result = await createWorkspaceForUser({ userId, rawName });
  if (result.status === "invalid") {
    return {
      status: "invalid",
      message: result.message,
      name: typeof rawName === "string" ? rawName : "",
    };
  }
  redirect(`/w/${result.workspaceId}`);
}
