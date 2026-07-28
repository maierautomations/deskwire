// Brand profile writes (task 19, phase-1 Vorgabe 8). Deliberately unscoped
// helpers encapsulated in src/db/** (phase-0 decision 23); app code reaches
// them exclusively through the scoped namespace in scoped.ts.
//
// The ONE rule this module exists to enforce: a profile row is never written
// without its version row. There is no bare update — that would be a hole
// through which a profile could change while its history stayed silent, and
// task 31 pins those versions. Both writers are therefore transactions, and
// the content hash is computed HERE from the snapshot that is about to be
// stored, so no caller can hand in a hash that does not match.
//
// Typed against the generic DbClient so the same code runs on the Neon app
// client and the PGlite test client (task-5 finding).
import { and, desc, eq, isNull } from "drizzle-orm";

import {
  parseBrandProfileFields,
  type BrandProfileFields,
} from "@/lib/brand-profile/schema";
import {
  hashBrandProfileSnapshot,
  type BrandProfileSnapshot,
} from "@/lib/brand-profile/snapshot";

import { brandProfiles, brandProfileVersions } from "./schema";
import type { DbClient, NewBrandProfile } from "./scoped";

export type BrandProfile = typeof brandProfiles.$inferSelect;
export type BrandProfileVersion = typeof brandProfileVersions.$inferSelect;

export const FIRST_BRAND_PROFILE_VERSION = 1;

// Postgres unique_violation. Only OUR numbering constraint is turned into a
// typed conflict below; any other unique violation stays an unexpected error.
const UNIQUE_VIOLATION = "23505";
const VERSION_NUMBER_CONSTRAINT = "brand_profile_versions_profile_version_uq";

export interface SaveBrandProfileRowParams {
  brandProfileId: string;
  name: string;
  description: string | null;
  aktiv: boolean;
  // Already through the Zod boundary: the caller parsed it, this layer stores
  // it verbatim and snapshots exactly what it stores.
  fields: BrandProfileFields;
}

// Discriminated union, not a nullable row: in the dedupe case there IS no
// written row, and a shape that pretends otherwise would invite a non-null
// assertion at every call site.
export type SaveBrandProfileRowResult =
  | { status: "saved"; profile: BrandProfile; version: number }
  | { status: "unchanged"; version: number }
  | { status: "conflict" }
  | { status: "not_found" };

// A snapshot is ALWAYS the persisted row, parsed: name, description and aktiv
// verbatim, fields through the read boundary so the stored defaults are
// materialized (a pinned version must not re-resolve today's defaults when a
// run reads it, task 31).
function snapshotFromRow(row: BrandProfile): BrandProfileSnapshot {
  return {
    name: row.name,
    description: row.description,
    aktiv: row.aktiv,
    fields: parseBrandProfileFields(row.fields),
  };
}

// The one query that answers both questions of a save: what to compare the
// hash against, and which number comes next. Exported for the scoped
// namespace's read path so there is never a second hand-written "latest".
export async function selectLatestBrandProfileVersion(
  db: DbClient,
  workspaceId: string,
  brandProfileId: string,
): Promise<BrandProfileVersion | null> {
  const [row] = await db
    .select()
    .from(brandProfileVersions)
    .where(
      and(
        eq(brandProfileVersions.workspaceId, workspaceId),
        eq(brandProfileVersions.brandProfileId, brandProfileId),
      ),
    )
    .orderBy(desc(brandProfileVersions.version))
    .limit(1);
  return row ?? null;
}

// Two concurrent saves can compute the same next version; the loser hits the
// unique constraint. That is fremd-auslösbar (two browser tabs), so it is a
// typed result and NOT a Sentry event (7a/15a classification). The catch sits
// OUTSIDE the transaction on purpose: the rollback must happen first, so a
// conflict leaves the profile row untouched and the user simply saves again.
function isVersionNumberConflict(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const code = "code" in current ? current.code : undefined;
    const constraint = "constraint" in current ? current.constraint : undefined;
    if (
      code === UNIQUE_VIOLATION &&
      (constraint === VERSION_NUMBER_CONSTRAINT ||
        current.message.includes(VERSION_NUMBER_CONSTRAINT))
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

// Creating a profile IS its first save: row plus version 1, atomically. The
// row keeps whatever the caller passed (no fields means the column default
// `{}`, task 18 unchanged), while the snapshot carries the parsed defaults —
// both describe the same effective profile, which is why a save that changes
// nothing right after creation deduplicates against version 1.
export async function createProfileWithFirstVersion(
  db: DbClient,
  workspaceId: string,
  data: NewBrandProfile,
): Promise<BrandProfile> {
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(brandProfiles)
      .values({ ...data, workspaceId })
      .returning();
    if (!profile) {
      throw new Error("brand profile insert returned no row");
    }
    const snapshot = snapshotFromRow(profile);
    await tx.insert(brandProfileVersions).values({
      workspaceId,
      brandProfileId: profile.id,
      version: FIRST_BRAND_PROFILE_VERSION,
      snapshot,
      contentHash: hashBrandProfileSnapshot(snapshot),
    });
    return profile;
  });
}

// Profile update plus version insert in ONE transaction. Deduplication runs
// against the LATEST version only: A -> B -> A is three versions, and versions
// 1 and 3 share a content_hash on purpose. Deduplicating against ALL versions
// would either skip a real change (a run started afterwards would pin B while
// A is live) or rewrite history in an append-only table.
//
// A dedupe hit writes NOTHING — not even updated_at. "Saved without a change"
// is a no-op, and the version's created_at stays the single truth for "last
// really changed" (the editor shows exactly that, task 20a).
export async function saveProfileWithVersion(
  db: DbClient,
  workspaceId: string,
  params: SaveBrandProfileRowParams,
): Promise<SaveBrandProfileRowResult> {
  const snapshot: BrandProfileSnapshot = {
    name: params.name,
    description: params.description,
    aktiv: params.aktiv,
    fields: params.fields,
  };
  const contentHash = hashBrandProfileSnapshot(snapshot);

  try {
    return await db.transaction(async (tx) => {
      const latest = await selectLatestBrandProfileVersion(
        tx,
        workspaceId,
        params.brandProfileId,
      );
      if (latest && latest.contentHash === contentHash) {
        return { status: "unchanged", version: latest.version };
      }

      const [profile] = await tx
        .update(brandProfiles)
        .set({
          name: params.name,
          description: params.description,
          aktiv: params.aktiv,
          fields: params.fields,
        })
        .where(
          and(
            eq(brandProfiles.id, params.brandProfileId),
            eq(brandProfiles.workspaceId, workspaceId),
          ),
        )
        .returning();
      // No row means the profile does not exist or belongs to another
      // workspace — the scope decides, not the caller.
      if (!profile) {
        return { status: "not_found" };
      }

      // A profile without any version can only be legacy data from before
      // this task (backfill script). Starting it at 1 keeps the invariant
      // "no profile without a version" true even if the backfill was missed.
      const version = latest
        ? latest.version + 1
        : FIRST_BRAND_PROFILE_VERSION;
      await tx.insert(brandProfileVersions).values({
        workspaceId,
        brandProfileId: profile.id,
        version,
        snapshot,
        contentHash,
      });
      return { status: "saved", profile, version };
    });
  } catch (error) {
    if (isVersionNumberConflict(error)) {
      return { status: "conflict" };
    }
    throw error;
  }
}

// One-off maintenance for rows created before this task: profiles that have no
// version at all get version 1 from their CURRENT state. Deliberately unscoped
// and across workspaces — it is an operator tool (scripts/), not app surface,
// and it stays encapsulated in src/db/** like every other unscoped helper
// (phase-0 decision 23).
//
// Idempotent by construction: it only looks at profiles without any version,
// and the insert additionally does nothing on a unique-constraint hit, so a
// second run writes nothing even if a save happened in between.
export async function backfillMissingFirstVersions(
  db: DbClient,
): Promise<Array<{ profileId: string; workspaceId: string; name: string }>> {
  const orphans = await db
    .select({ profile: brandProfiles })
    .from(brandProfiles)
    .leftJoin(
      brandProfileVersions,
      eq(brandProfileVersions.brandProfileId, brandProfiles.id),
    )
    .where(isNull(brandProfileVersions.id))
    .orderBy(brandProfiles.createdAt);

  const backfilled: Array<{
    profileId: string;
    workspaceId: string;
    name: string;
  }> = [];
  for (const { profile } of orphans) {
    const snapshot = snapshotFromRow(profile);
    const inserted = await db
      .insert(brandProfileVersions)
      .values({
        workspaceId: profile.workspaceId,
        brandProfileId: profile.id,
        version: FIRST_BRAND_PROFILE_VERSION,
        snapshot,
        contentHash: hashBrandProfileSnapshot(snapshot),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      backfilled.push({
        profileId: profile.id,
        workspaceId: profile.workspaceId,
        name: profile.name,
      });
    }
  }
  return backfilled;
}
