"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { createBrandProfileForMember } from "@/lib/brand-profile";

// Not exported: a "use server" module may only export async functions
// (task-10b finding).
const BRAND_PROFILE_LOGIN_REQUIRED_MESSAGE =
  "Bitte melde dich an, um ein Marken-Profil anzulegen.";

export type CreateBrandProfileFormState =
  | { status: "idle" }
  | { status: "unauthenticated"; message: string }
  | { status: "error"; message: string; name: string; description: string };

// Thin shell only: session check plus formData extraction; the tested core
// (Zod, membership gate, scoped create) lives in createBrandProfileForMember.
// The session check happens HERE because server actions are public POST
// endpoints, callable without any form; the workspaceId arrives as form data
// (task-11 pattern) and is worthless until the core's membership gate accepts
// it. On success the page revalidates and re-renders with the new row — the
// entry appearing in the list is the feedback, there is no success state.
export async function createBrandProfileAction(
  _prev: CreateBrandProfileFormState,
  formData: FormData,
): Promise<CreateBrandProfileFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      status: "unauthenticated",
      message: BRAND_PROFILE_LOGIN_REQUIRED_MESSAGE,
    };
  }
  const rawWorkspaceId = formData.get("workspaceId");
  const workspaceId = typeof rawWorkspaceId === "string" ? rawWorkspaceId : "";
  const rawName = formData.get("name");
  const rawDescription = formData.get("description");
  const result = await createBrandProfileForMember({
    userId,
    workspaceId,
    rawName,
    rawDescription,
  });
  if (result.status !== "created") {
    return {
      status: "error",
      message: result.message,
      name: typeof rawName === "string" ? rawName : "",
      description: typeof rawDescription === "string" ? rawDescription : "",
    };
  }
  revalidatePath(`/w/${workspaceId}/brand-profiles`);
  return { status: "idle" };
}
