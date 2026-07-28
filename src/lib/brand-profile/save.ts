import { z } from "zod";

import {
  getScopedDb,
  type BrandProfile,
  type SaveBrandProfileRowParams,
  type SaveBrandProfileRowResult,
} from "@/db";
import { requireWorkspaceMembership } from "@/lib/workspace";

import {
  BRAND_PROFILE_FORBIDDEN_MESSAGE,
  parseBrandProfileInput,
} from "./input";
import { brandProfileFieldsSchema, parseBrandProfileFields } from "./schema";

// Identical for "does not exist" and "belongs to another workspace" — no
// existence oracle (phase-0 decision 19, wording pattern from task 11/13).
export const BRAND_PROFILE_NOT_FOUND_MESSAGE =
  "Dieses Marken-Profil gibt es nicht.";
// Deliberately coarse: the per-field echo needs the form and arrives with the
// editor (task 20a). Until then a rejected save says what to do, not which
// Zod issue fired.
export const BRAND_PROFILE_FIELDS_INVALID_MESSAGE =
  "Die Angaben im Profil passen nicht. Bitte prüfe die Felder und speichere erneut.";
export const BRAND_PROFILE_AKTIV_INVALID_MESSAGE =
  "Der Status des Profils ist ungültig. Bitte lade die Seite neu.";

// The known top-level groups, derived from the schema itself so a group added
// in task 20b is accepted here without a second list to maintain.
const BRAND_PROFILE_FIELD_KEYS: ReadonlySet<string> = new Set(
  Object.keys(brandProfileFieldsSchema.shape),
);

const brandProfileIdSchema = z.uuid();
// Strict boolean: an HTML checkbox arrives as "on" or not at all, and turning
// that into a boolean is the action's job (task 20a). The library must not
// guess what a missing value meant.
const brandProfileAktivSchema = z.boolean();

// A partial patch of field GROUPS, not of single values: an absent group stays
// untouched, a present group is replaced whole. The editor is split across
// sections (tasks 20a/20b), and a full-replacement contract would make the
// first section silently wipe what the second one saves.
export type BrandProfileFieldsPatch = Record<string, unknown>;

function isFieldsPatch(value: unknown): value is BrandProfileFieldsPatch {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type SaveBrandProfileResult =
  | { status: "invalid"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "not_found"; message: string }
  // Two saves raced for the same version number. Fremd-auslösbar (two tabs),
  // therefore a typed result and no Sentry event; the German message belongs
  // to the editor that offers the retry (task 20a).
  | { status: "conflict" }
  | { status: "saved"; version: number; deduped: boolean };

export interface SaveBrandProfileDeps {
  requireMembership: typeof requireWorkspaceMembership;
  // Only the stored field set is needed: it is the merge base. Name,
  // description and aktiv always come from the caller.
  getBrandProfile: (
    workspaceId: string,
    brandProfileId: string,
  ) => Promise<Pick<BrandProfile, "fields"> | null>;
  saveBrandProfileRow: (
    workspaceId: string,
    params: SaveBrandProfileRowParams,
  ) => Promise<SaveBrandProfileRowResult>;
}

const saveDeps: SaveBrandProfileDeps = {
  requireMembership: requireWorkspaceMembership,
  getBrandProfile: (workspaceId, brandProfileId) =>
    getScopedDb(workspaceId).brandProfiles.getById(brandProfileId),
  saveBrandProfileRow: (workspaceId, params) =>
    getScopedDb(workspaceId).brandProfiles.save(params),
};

// Core logic of the brand profile editor save (pattern:
// createBrandProfileForMember). Order is deliberate and everything that can be
// decided without the database is decided first: id shape, name, description,
// aktiv and the patch's top-level keys, then the membership gate (server
// actions are public POST endpoints), then the profile read, then the merged
// Zod boundary, then the transactional write.
//
// The merge base is the PARSED stored field set, never the raw column: after a
// future schema_version bump the read migration in parseBrandProfileFields
// runs first, so a save can never carry an outdated shape forward and quietly
// undo that migration. It also makes the merge result shape-identical to the
// snapshot the version row stores.
export async function saveBrandProfile(
  input: {
    userId: string;
    workspaceId: string;
    brandProfileId: string;
    rawName: unknown;
    rawDescription: unknown;
    rawAktiv: unknown;
    rawFields: unknown;
  },
  deps: SaveBrandProfileDeps = saveDeps,
): Promise<SaveBrandProfileResult> {
  // A malformed id would otherwise reach Postgres as a raw string and throw
  // 22P02 (task-10b pattern); it is an addressing error, so it answers like an
  // unknown profile.
  if (!brandProfileIdSchema.safeParse(input.brandProfileId).success) {
    return { status: "not_found", message: BRAND_PROFILE_NOT_FOUND_MESSAGE };
  }

  const parsed = parseBrandProfileInput(input.rawName, input.rawDescription);
  if (!parsed.ok) {
    return { status: "invalid", message: parsed.message };
  }

  const aktiv = brandProfileAktivSchema.safeParse(input.rawAktiv);
  if (!aktiv.success) {
    return { status: "invalid", message: BRAND_PROFILE_AKTIV_INVALID_MESSAGE };
  }

  // Unknown group names are rejected BEFORE the database is touched. The
  // values themselves are validated after the merge, because only the merged
  // object is the complete field set.
  if (!isFieldsPatch(input.rawFields)) {
    return { status: "invalid", message: BRAND_PROFILE_FIELDS_INVALID_MESSAGE };
  }
  for (const key of Object.keys(input.rawFields)) {
    if (!BRAND_PROFILE_FIELD_KEYS.has(key)) {
      return {
        status: "invalid",
        message: BRAND_PROFILE_FIELDS_INVALID_MESSAGE,
      };
    }
  }

  const membership = await deps.requireMembership(
    input.userId,
    input.workspaceId,
  );
  if (!membership) {
    return { status: "forbidden", message: BRAND_PROFILE_FORBIDDEN_MESSAGE };
  }

  const profile = await deps.getBrandProfile(
    input.workspaceId,
    input.brandProfileId,
  );
  if (!profile) {
    return { status: "not_found", message: BRAND_PROFILE_NOT_FOUND_MESSAGE };
  }

  // Stored data that does not parse is OUR data gone wrong and throws into
  // central logging (task 18), it is not a user-facing result.
  const base = parseBrandProfileFields(profile.fields);
  const merged = brandProfileFieldsSchema.safeParse({
    ...base,
    ...input.rawFields,
  });
  if (!merged.success) {
    return { status: "invalid", message: BRAND_PROFILE_FIELDS_INVALID_MESSAGE };
  }

  const result = await deps.saveBrandProfileRow(input.workspaceId, {
    brandProfileId: input.brandProfileId,
    name: parsed.name,
    description: parsed.description,
    aktiv: aktiv.data,
    fields: merged.data,
  });

  switch (result.status) {
    case "saved":
      return { status: "saved", version: result.version, deduped: false };
    case "unchanged":
      return { status: "saved", version: result.version, deduped: true };
    case "conflict":
      return { status: "conflict" };
    case "not_found":
      return { status: "not_found", message: BRAND_PROFILE_NOT_FOUND_MESSAGE };
  }
}
