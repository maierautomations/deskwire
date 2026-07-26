"use server";

import { auth } from "@/auth";
import { createWorkspaceForUser } from "@/lib/workspace";

export const WORKSPACE_LOGIN_REQUIRED_MESSAGE =
  "Bitte melde dich an, um einen Workspace anzulegen.";

export type CreateWorkspaceFormState =
  | { status: "idle" }
  | { status: "unauthenticated"; message: string }
  | { status: "invalid"; message: string; name: string }
  | { status: "created"; workspaceId: string };

// Thin shell only: session check plus formData extraction. The tested core
// (Zod parse, atomic tenant creation) lives in createWorkspaceForUser. The
// session check happens HERE because server actions are public POST
// endpoints, callable without any form. Form and redirect arrive with the
// onboarding page in task 10b; until then this action has no caller.
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
  return result;
}
