"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  BRAND_PROFILE_EDITOR_FORM_MESSAGE,
  BRAND_PROFILE_EDITOR_LOGIN_MESSAGE,
  parseEditorSection,
  readEditorSection,
  toEditorFormState,
  type BrandProfileEditorFormState,
} from "@/lib/brand-profile/editor";
import { saveBrandProfile } from "@/lib/brand-profile/save";

// ONE action for every editor section (task 20b adds sections, not actions).
// Thin shell: session check plus formData extraction, the section reader
// builds the patch, saveBrandProfile decides. Each form has its own
// useActionState, so one action still means one state per section.
//
// The session check happens HERE because server actions are public POST
// endpoints; workspaceId and profileId arrive as form data (task-11 pattern)
// and are worthless until the core's membership gate and scope accept them.
export async function saveBrandProfileAction(
  _prev: BrandProfileEditorFormState,
  formData: FormData,
): Promise<BrandProfileEditorFormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      status: "unauthenticated",
      message: BRAND_PROFILE_EDITOR_LOGIN_MESSAGE,
    };
  }

  const section = parseEditorSection(formData.get("section"));
  if (!section) {
    return {
      status: "invalid",
      message: BRAND_PROFILE_EDITOR_FORM_MESSAGE,
      fieldErrors: {},
      values: {},
    };
  }

  const rawWorkspaceId = formData.get("workspaceId");
  const workspaceId = typeof rawWorkspaceId === "string" ? rawWorkspaceId : "";
  const rawProfileId = formData.get("profileId");
  const brandProfileId = typeof rawProfileId === "string" ? rawProfileId : "";

  // An unchecked checkbox sends nothing at all. Reading that absence as false
  // is an HTML quirk, so the decision is made HERE at the form boundary;
  // saveBrandProfile takes a strict boolean and never guesses (task-19 note).
  const aktiv = formData.get("aktiv") === "on";

  const read = readEditorSection(section, formData, { aktiv });
  if (!read.ok) {
    return {
      status: "invalid",
      message: read.message,
      fieldErrors: read.fieldErrors,
      values: read.values,
    };
  }

  const result = await saveBrandProfile({
    userId,
    workspaceId,
    brandProfileId,
    ...read.patch,
  });

  if (result.status === "saved") {
    revalidatePath(`/w/${workspaceId}/brand-profiles/${brandProfileId}`);
    // The list shows the name, which this save may have changed.
    revalidatePath(`/w/${workspaceId}/brand-profiles`);
  }
  return toEditorFormState(result, read.values);
}
