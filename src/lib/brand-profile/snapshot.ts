import { createHash } from "node:crypto";

import { z } from "zod";

import {
  brandProfileFieldsSchema,
  type BrandProfileFieldsInput,
} from "./schema";

// The versioned brand profile snapshot (task 19, phase-1 Vorgabe 8): the whole
// profile object as one immutable record. Pure module — no database, no clock,
// no randomness — so the hash can be computed identically in the db layer, in
// the backfill script and in tests.
//
// CONTENT only: name, description, aktiv, fields. Deliberately no id, no
// workspace_id, no timestamps and no version number — those are identity and
// time, not content, and including them would give every snapshot a unique
// hash, which would silently disable deduplication.

export const brandProfileSnapshotSchema = z.strictObject({
  name: z.string(),
  description: z.string().nullable(),
  aktiv: z.boolean(),
  // Parsing the fields again applies every default; task 18 proved the whole
  // field schema is idempotent, so a snapshot re-parses to itself.
  fields: brandProfileFieldsSchema,
});

export type BrandProfileSnapshot = z.infer<typeof brandProfileSnapshotSchema>;

// The shape as STORED in brand_profile_versions.snapshot. Same reasoning as
// brand_profiles.fields (task 18): what sits in the column is not what a
// reader gets once BRAND_PROFILE_SCHEMA_VERSION moves, because older rows keep
// the shape they were written with. Every read goes through
// parseBrandProfileSnapshot, which is where a future read migration lands.
export interface BrandProfileSnapshotStored {
  name: string;
  description: string | null;
  aktiv: boolean;
  fields: BrandProfileFieldsInput;
}

// The single read boundary for stored snapshots. Throws like
// parseBrandProfileFields: a snapshot that does not parse is OUR data gone
// wrong, an unexpected error for central logging, not a user-facing result.
export function parseBrandProfileSnapshot(
  value: unknown,
): BrandProfileSnapshot {
  return brandProfileSnapshotSchema.parse(value);
}

// Canonical form for hashing. Recursive on purpose instead of a hand-written
// field list: a group added in task 20b would silently fall out of a hand-kept
// list, and two profiles differing only in that group would deduplicate into
// ONE version — data loss without a red test. Recursion covers every future
// field automatically, schema_version included (a version bump IS a content
// change).
//
// Object keys are sorted by CODE POINT (a < b), never with localeCompare,
// which would make the hash depend on the runtime's ICU data. Arrays keep
// their order: order is content here (the sequence of pflichtelemente, of
// terms, of example texts), so swapping two entries is a change.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

// Key order is irrelevant (jsonb normalizes it on storage anyway), so a
// snapshot read back from the database serializes byte-identically to the one
// that was written.
export function serializeBrandProfileSnapshot(
  snapshot: BrandProfileSnapshot,
): string {
  return JSON.stringify(canonical(snapshot));
}

// sha256 over the canonical form, hashed explicitly as utf8. Umlauts stay
// literal characters (JSON.stringify only escapes control characters), and
// unicode normalization is deliberately NOT applied: "ä" as U+00E4 and as
// "a" + U+0308 hash differently, which produces one version too many rather
// than silently merging two different texts — the safe direction. Line
// endings are content too: "\r\n" and "\n" are different snapshots.
export function hashBrandProfileSnapshot(snapshot: BrandProfileSnapshot): string {
  return createHash("sha256")
    .update(serializeBrandProfileSnapshot(snapshot), "utf8")
    .digest("hex");
}
