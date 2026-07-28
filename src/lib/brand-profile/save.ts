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
  parseBrandProfileDescription,
  parseBrandProfileName,
} from "./input";
import { brandProfileFieldsSchema, parseBrandProfileFields } from "./schema";

// Identical for "does not exist" and "belongs to another workspace" — no
// existence oracle (phase-0 decision 19, wording pattern from task 11/13).
export const BRAND_PROFILE_NOT_FOUND_MESSAGE =
  "Dieses Marken-Profil gibt es nicht.";
// The coarse fallback for a broken patch (a direct POST, a rolled-back
// deployment). The editor's per-field echo is built at the form boundary
// (task 20a) from the same schema nodes this function parses with.
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
// guess what a missing value meant — and "not sent at all" is expressed by
// omitting rawAktiv, not by sending undefined.
const brandProfileAktivSchema = z.boolean();

// A partial patch of field GROUPS, not of single values: an absent group stays
// untouched, a present group is replaced whole. The editor is split across
// sections (tasks 20a/20b), and a full-replacement contract would make the
// first section silently wipe what the second one saves.
export type BrandProfileFieldsPatch = Record<string, unknown>;

// ONE patch rule for the whole save (task 20a): name, description and aktiv
// follow exactly the same semantics as the field groups. An ABSENT key stays
// unchanged, a PRESENT key replaces — including with an empty value, which is
// how the editor clears a description. Presence is decided by the key being
// there at all, so `rawAktiv: undefined` is a present-but-broken value and
// fails loudly instead of silently flipping the flag to false.
//
// This is what lets a section save only what it owns without carrying the
// other sections' values as hidden fields (a stale-data trap) and without a
// second read before the membership gate: the row this function already holds
// after the gate supplies every absent value.
export interface SaveBrandProfileInput {
  userId: string;
  workspaceId: string;
  brandProfileId: string;
  rawName?: unknown;
  rawDescription?: unknown;
  rawAktiv?: unknown;
  rawFields: unknown;
}

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
  // The stored row is both the merge base for the field groups and the source
  // of every identity value the patch left out.
  getBrandProfile: (
    workspaceId: string,
    brandProfileId: string,
  ) => Promise<Pick<
    BrandProfile,
    "name" | "description" | "aktiv" | "fields"
  > | null>;
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
// decided without the database is decided first: id shape, then every value
// the patch actually carries, then the patch's top-level group keys, then the
// membership gate (server actions are public POST endpoints), then the profile
// read, then the merged Zod boundary, then the transactional write.
//
// The merge base is the PARSED stored field set, never the raw column: after a
// future schema_version bump the read migration in parseBrandProfileFields
// runs first, so a save can never carry an outdated shape forward and quietly
// undo that migration. It also makes the merge result shape-identical to the
// snapshot the version row stores.
export async function saveBrandProfile(
  input: SaveBrandProfileInput,
  deps: SaveBrandProfileDeps = saveDeps,
): Promise<SaveBrandProfileResult> {
  // A malformed id would otherwise reach Postgres as a raw string and throw
  // 22P02 (task-10b pattern); it is an addressing error, so it answers like an
  // unknown profile.
  if (!brandProfileIdSchema.safeParse(input.brandProfileId).success) {
    return { status: "not_found", message: BRAND_PROFILE_NOT_FOUND_MESSAGE };
  }

  // Zod first, on exactly the values the caller supplied. Absent identity
  // fields are not validated because they are not being written.
  const identity: { name?: string; description?: string | null; aktiv?: boolean } =
    {};
  const descriptionGiven = "rawDescription" in input;

  if ("rawName" in input) {
    const parsed = parseBrandProfileName(input.rawName);
    if (!parsed.ok) {
      return { status: "invalid", message: parsed.message };
    }
    identity.name = parsed.value;
  }
  if (descriptionGiven) {
    const parsed = parseBrandProfileDescription(input.rawDescription);
    if (!parsed.ok) {
      return { status: "invalid", message: parsed.message };
    }
    identity.description = parsed.value;
  }
  if ("rawAktiv" in input) {
    const parsed = brandProfileAktivSchema.safeParse(input.rawAktiv);
    if (!parsed.success) {
      return { status: "invalid", message: BRAND_PROFILE_AKTIV_INVALID_MESSAGE };
    }
    identity.aktiv = parsed.data;
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
    // A validated name is never empty and a validated aktiv is never
    // undefined, so ?? falls through exactly when the key was absent. The
    // description needs the explicit flag: null is a legitimate written value.
    name: identity.name ?? profile.name,
    description: descriptionGiven
      ? (identity.description ?? null)
      : profile.description,
    aktiv: identity.aktiv ?? profile.aktiv,
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
