import { z } from "zod";

import { getScopedDb, type NewBrandProfile } from "@/db";
import { requireWorkspaceMembership } from "@/lib/workspace";

export const BRAND_PROFILE_NAME_MAX_LENGTH = 80;
export const BRAND_PROFILE_DESCRIPTION_MAX_LENGTH = 500;

export const BRAND_PROFILE_NAME_INVALID_MESSAGE = `Bitte gib einen Namen mit 1 bis ${BRAND_PROFILE_NAME_MAX_LENGTH} Zeichen ein.`;
export const BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE = `Die Beschreibung darf höchstens ${BRAND_PROFILE_DESCRIPTION_MAX_LENGTH} Zeichen lang sein.`;
// Same wording as the invite action (task 11) and identical for foreign and
// non-existent workspace ids — no existence oracle (phase-0 decision 19).
export const BRAND_PROFILE_FORBIDDEN_MESSAGE =
  "Dafür fehlt dir die Berechtigung.";

const brandProfileNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(BRAND_PROFILE_NAME_MAX_LENGTH));

// Optional field: a missing form entry (null/undefined) and a blank string
// both mean "no description" and normalize to null, never to "".
const brandProfileDescriptionSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .pipe(z.string().max(BRAND_PROFILE_DESCRIPTION_MAX_LENGTH))
  .transform((value) => (value.length === 0 ? null : value));

type ParsedBrandProfileInput =
  | { ok: true; name: string; description: string | null }
  | { ok: false; message: string };

// Boundary validation (CLAUDE.md: Zod at every boundary). Expected failures
// come back as a typed result with the German message, never as a throw.
function parseBrandProfileInput(
  rawName: unknown,
  rawDescription: unknown,
): ParsedBrandProfileInput {
  const name = brandProfileNameSchema.safeParse(rawName);
  if (!name.success) {
    return { ok: false, message: BRAND_PROFILE_NAME_INVALID_MESSAGE };
  }
  const description = brandProfileDescriptionSchema.safeParse(rawDescription);
  if (!description.success) {
    return { ok: false, message: BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE };
  }
  return { ok: true, name: name.data, description: description.data };
}

export type CreateBrandProfileResult =
  | { status: "invalid"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "created" };

export interface CreateBrandProfileDeps {
  requireMembership: typeof requireWorkspaceMembership;
  createBrandProfile: (
    workspaceId: string,
    data: NewBrandProfile,
  ) => Promise<unknown>;
}

const createDeps: CreateBrandProfileDeps = {
  requireMembership: requireWorkspaceMembership,
  createBrandProfile: (workspaceId, data) =>
    getScopedDb(workspaceId).brandProfiles.create(data),
};

// Core logic of the create-brand-profile server action (pattern:
// createWorkspaceForUser), extracted so it is testable with fake deps while
// the action stays a thin shell of auth() plus formData extraction. Order is
// deliberate: pure input validation first (invalid input never touches the
// database), then the membership gate (server actions are public POST
// endpoints — the page's own guard proves nothing here), then the scoped
// create, which stamps the workspace id itself; this function never writes
// one into the row. Unexpected database errors throw into central logging.
export async function createBrandProfileForMember(
  input: {
    userId: string;
    workspaceId: string;
    rawName: unknown;
    rawDescription: unknown;
  },
  deps: CreateBrandProfileDeps = createDeps,
): Promise<CreateBrandProfileResult> {
  const parsed = parseBrandProfileInput(input.rawName, input.rawDescription);
  if (!parsed.ok) {
    return { status: "invalid", message: parsed.message };
  }
  const membership = await deps.requireMembership(
    input.userId,
    input.workspaceId,
  );
  if (!membership) {
    return { status: "forbidden", message: BRAND_PROFILE_FORBIDDEN_MESSAGE };
  }
  await deps.createBrandProfile(input.workspaceId, {
    name: parsed.name,
    description: parsed.description,
  });
  return { status: "created" };
}

// German date for the profile list, pinned to Europe/Berlin so server
// rendering (Vercel runs UTC) cannot shift the shown day (pattern:
// formatInviteExpiry). Machine voice, used in mono context only.
const createdAtFormat = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

export function formatBrandProfileDate(date: Date): string {
  return createdAtFormat.format(date);
}
