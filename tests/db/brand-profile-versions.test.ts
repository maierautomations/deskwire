import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillMissingFirstVersions } from "@/db/brand-profiles";
import {
  brandProfiles,
  brandProfileVersions,
  workspaces,
} from "@/db/schema";
import {
  emptyBrandProfileFields,
  type BrandProfileFields,
} from "@/lib/brand-profile/schema";
import {
  hashBrandProfileSnapshot,
  parseBrandProfileSnapshot,
} from "@/lib/brand-profile/snapshot";

import { FULL_BRAND_PROFILE_FIELDS } from "../fixtures/brand-profile";
import { createTestDb, messageChain, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants, type TwoTenants } from "../helpers/tenancy";

// Profile versioning against the REAL migration 0007 on PGlite (task 19).
// The isolation matrix lives in the task-12 suite; this file proves the
// mechanics: numbering, deduplication against the LATEST version only,
// atomicity, the conflict path and the cascades.

let handle: TestDbHandle;
let tenants: TwoTenants;

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
});

afterAll(async () => {
  await handle.close();
});

function saveParams(
  brandProfileId: string,
  overrides: {
    name?: string;
    description?: string | null;
    aktiv?: boolean;
    fields?: BrandProfileFields;
  } = {},
) {
  return {
    brandProfileId,
    name: overrides.name ?? "Hausstil",
    description: overrides.description ?? null,
    aktiv: overrides.aktiv ?? true,
    fields: overrides.fields ?? emptyBrandProfileFields(),
  };
}

async function versionsOf(brandProfileId: string) {
  return handle.db
    .select()
    .from(brandProfileVersions)
    .where(eq(brandProfileVersions.brandProfileId, brandProfileId))
    .orderBy(brandProfileVersions.version);
}

async function profileRow(id: string) {
  const [row] = await handle.db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.id, id))
    .limit(1);
  if (!row) throw new Error("profile row vanished");
  return row;
}

describe("creating a profile writes version 1", () => {
  it("stores a snapshot that is the parsed row while the row keeps its `{}`", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Frisch angelegt",
      description: "Mit Beschreibung",
    });

    // Task-18 behavior is untouched: the column still carries the database
    // default, only the snapshot materializes the parsed defaults.
    expect(profile.fields).toEqual({});
    expect(profile.aktiv).toBe(true);

    const versions = await versionsOf(profile.id);
    expect(versions).toHaveLength(1);
    const [version] = versions;
    if (!version) throw new Error("version 1 missing");
    expect(version.version).toBe(1);
    expect(version.workspaceId).toBe(tenants.a.workspace.id);
    expect(version.snapshot).toEqual({
      name: "Frisch angelegt",
      description: "Mit Beschreibung",
      aktiv: true,
      fields: emptyBrandProfileFields(),
    });
    expect(version.contentHash).toBe(
      hashBrandProfileSnapshot(parseBrandProfileSnapshot(version.snapshot)),
    );
  });

  it("carries an explicitly created field set into version 1", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Vollprofil",
      fields: FULL_BRAND_PROFILE_FIELDS,
    });
    const [version] = await versionsOf(profile.id);
    expect(version?.snapshot.fields).toEqual(FULL_BRAND_PROFILE_FIELDS);
  });
});

describe("saving a profile", () => {
  it("writes version 2 with the new content and updates the row", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Erster Name",
    });

    const result = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Zweiter Name", aktiv: false }),
    );

    expect(result).toMatchObject({ status: "saved", version: 2 });
    const row = await profileRow(profile.id);
    expect(row.name).toBe("Zweiter Name");
    expect(row.aktiv).toBe(false);
    // The save materializes the parsed field set in the column as well.
    expect(row.fields).toEqual(emptyBrandProfileFields());

    const versions = await versionsOf(profile.id);
    expect(versions.map((entry) => entry.version)).toEqual([1, 2]);
    expect(versions[1]?.snapshot).toEqual({
      name: "Zweiter Name",
      description: null,
      aktiv: false,
      fields: emptyBrandProfileFields(),
    });
  });

  it("writes nothing at all when the content is identical", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Unverändert",
    });
    const before = await profileRow(profile.id);

    const result = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Unverändert" }),
    );

    expect(result).toEqual({ status: "unchanged", version: 1 });
    const after = await profileRow(profile.id);
    // Not even updated_at moves: a save without a change is a no-op, and the
    // version's created_at stays the single truth for "last really changed".
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await versionsOf(profile.id)).toHaveLength(1);
  });

  it("deduplicates against the LATEST version only: A to B to A is three versions", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({ name: "A" });

    const toB = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "B" }),
    );
    const backToA = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "A" }),
    );

    expect(toB).toMatchObject({ status: "saved", version: 2 });
    expect(backToA).toMatchObject({ status: "saved", version: 3 });

    const versions = await versionsOf(profile.id);
    expect(versions.map((entry) => entry.version)).toEqual([1, 2, 3]);
    // Versions 1 and 3 share a hash ON PURPOSE. Deduplicating against ALL
    // versions would have skipped this save, and a run started afterwards
    // would pin version 2 (B) while A is live.
    expect(versions[2]?.contentHash).toBe(versions[0]?.contentHash);
    expect(versions[1]?.contentHash).not.toBe(versions[0]?.contentHash);
  });

  it("detects changes inside the field set, not just in the columns", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Feldwechsel",
    });
    const fields: BrandProfileFields = {
      ...emptyBrandProfileFields(),
      verbotene_begriffe: ["Kursrakete"],
    };

    const first = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Feldwechsel", fields }),
    );
    const second = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Feldwechsel", fields }),
    );

    expect(first).toMatchObject({ status: "saved", version: 2 });
    expect(second).toEqual({ status: "unchanged", version: 2 });
    const [, latest] = await versionsOf(profile.id);
    expect(latest?.snapshot.fields?.verbotene_begriffe).toEqual([
      "Kursrakete",
    ]);
  });

  it("survives the jsonb roundtrip with an identical hash", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Roundtrip",
    });
    await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, {
        name: "Roundtrip",
        description: "Mit Umlauten: ä ö ü ß",
        fields: FULL_BRAND_PROFILE_FIELDS,
      }),
    );

    const [, stored] = await versionsOf(profile.id);
    if (!stored) throw new Error("version 2 missing");
    // Read back through the boundary and re-hashed: key order, umlauts and
    // the newlines inside the example texts all survive.
    expect(
      hashBrandProfileSnapshot(parseBrandProfileSnapshot(stored.snapshot)),
    ).toBe(stored.contentHash);
  });

  it("returns not_found for a profile of another workspace and writes nothing", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Gehört A",
    });

    const result = await tenants.b.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Von B umbenannt" }),
    );

    expect(result).toEqual({ status: "not_found" });
    expect((await profileRow(profile.id)).name).toBe("Gehört A");
    expect(await versionsOf(profile.id)).toHaveLength(1);
  });

  it("starts legacy profiles without any version at version 1", async () => {
    // Pre-task-19 rows exist on the dev branch and in production (the backfill
    // script closes that gap). Even without it, the first save must not create
    // a version 2 that has no predecessor.
    const [legacy] = await handle.db
      .insert(brandProfiles)
      .values({ workspaceId: tenants.a.workspace.id, name: "Altbestand" })
      .returning();
    if (!legacy) throw new Error("legacy insert returned no row");

    const result = await tenants.a.scope.brandProfiles.save(
      saveParams(legacy.id, { name: "Altbestand" }),
    );

    expect(result).toMatchObject({ status: "saved", version: 1 });
    expect(await versionsOf(legacy.id)).toHaveLength(1);
  });
});

describe("the version number constraint", () => {
  it("rejects a duplicate (brand_profile_id, version) pair", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Doppelte Nummer",
    });
    const snapshot = {
      name: "Doppelte Nummer",
      description: null,
      aktiv: true,
      fields: emptyBrandProfileFields(),
    };

    await expect(
      handle.db.insert(brandProfileVersions).values({
        workspaceId: tenants.a.workspace.id,
        brandProfileId: profile.id,
        version: 1,
        snapshot,
        contentHash: hashBrandProfileSnapshot(snapshot),
      }),
    ).rejects.toThrow();
  });

  it("turns a taken version number into a typed conflict without touching the profile", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Wettlauf",
    });
    // In production this happens when two saves race for the same number.
    // PGlite is single-connection (stumbling block 8), so the state is seeded
    // instead: a version row for A's profile carrying B's workspace id is
    // invisible to A's scoped "latest" read but very much visible to the
    // unique constraint, which is exactly the race's outcome. The app itself
    // can never write such a row — the scope stamps the workspace id.
    const snapshot = {
      name: "Wettlauf",
      description: null,
      aktiv: true,
      fields: emptyBrandProfileFields(),
    };
    await handle.db.insert(brandProfileVersions).values({
      workspaceId: tenants.b.workspace.id,
      brandProfileId: profile.id,
      version: 2,
      snapshot,
      contentHash: "seeded-by-the-other-writer",
    });

    const result = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Wettlauf, umbenannt" }),
    );

    // Typed result, not a throw: two browser tabs are fremd-auslösbar, so this
    // is a business outcome (retry) and never a Sentry event.
    expect(result).toEqual({ status: "conflict" });
    // The catch sits outside the transaction, so the rollback already
    // happened: the profile is untouched and the user simply saves again.
    expect((await profileRow(profile.id)).name).toBe("Wettlauf");
    const own = await tenants.a.scope.brandProfileVersions.listByProfile(
      profile.id,
    );
    expect(own.map((entry) => entry.version)).toEqual([1]);
  });

  it("lets an unrelated unique violation stay an unexpected error", async () => {
    // Only OUR numbering constraint becomes a conflict; every other unique
    // violation must keep throwing. Injected as a partial unique index on
    // content_hash for one profile: going A -> B -> A then violates a
    // DIFFERENT unique constraint at the very same insert, with the same
    // Postgres error code 23505.
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Fremder Unique",
    });
    await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Fremder Unique, geändert" }),
    );
    await handle.db.execute(
      sql.raw(
        `CREATE UNIQUE INDEX tmp_hash_uq ON brand_profile_versions (content_hash) ` +
          `WHERE brand_profile_id = '${profile.id}'`,
      ),
    );
    try {
      await expect(
        tenants.a.scope.brandProfiles.save(
          saveParams(profile.id, { name: "Fremder Unique" }),
        ),
      ).rejects.toThrow();
    } finally {
      await handle.db.execute(sql.raw(`DROP INDEX tmp_hash_uq`));
    }
    // Rolled back like any unexpected failure: no third version, name intact.
    expect((await profileRow(profile.id)).name).toBe(
      "Fremder Unique, geändert",
    );
    expect(await versionsOf(profile.id)).toHaveLength(2);
  });
});

describe("transaction atomicity (fault injection)", () => {
  it("rolls the profile update back when the version insert fails", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Atomar",
    });
    const before = await profileRow(profile.id);

    // Data-level fault injection, no mocks: a CHECK constraint that only THIS
    // profile's second version can violate. The profile update runs first
    // inside the transaction, so if it survived the failed insert, it would be
    // visible afterwards. Scoped to the one profile id because other profiles
    // in this database already carry versions 2 and 3, and a table-wide
    // `version < 2` could not even be added.
    await handle.db.execute(
      sql.raw(
        `ALTER TABLE brand_profile_versions ADD CONSTRAINT tmp_no_second_version ` +
          `CHECK (brand_profile_id <> '${profile.id}' OR version < 2)`,
      ),
    );
    try {
      await expect(
        tenants.a.scope.brandProfiles.save(
          saveParams(profile.id, { name: "Darf nicht bleiben" }),
        ),
      ).rejects.toThrow();

      const after = await profileRow(profile.id);
      expect(after.name).toBe("Atomar");
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(await versionsOf(profile.id)).toHaveLength(1);
    } finally {
      await handle.db.execute(
        sql`ALTER TABLE brand_profile_versions DROP CONSTRAINT tmp_no_second_version`,
      );
    }

    // With the obstacle gone the very same save succeeds — proof that the
    // constraint was the only reason it failed, not something else.
    const result = await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Darf nicht bleiben" }),
    );
    expect(result).toMatchObject({ status: "saved", version: 2 });
    expect((await profileRow(profile.id)).name).toBe("Darf nicht bleiben");
  });
});

// The operator tool behind scripts/backfill-brand-profile-versions.ts. Tested
// BEFORE it ever runs against grown data: a wrong hash written here would sit
// in an append-only table that has no delete path.
describe("backfillMissingFirstVersions", () => {
  it("gives every version-less profile version 1 and leaves the others alone", async () => {
    const tenant = await seedTwoTenants(handle.db);
    const legacy = await handle.db
      .insert(brandProfiles)
      .values([
        { workspaceId: tenant.a.workspace.id, name: "Profil Alpha" },
        {
          workspaceId: tenant.b.workspace.id,
          name: "Profil Beta",
          fields: FULL_BRAND_PROFILE_FIELDS,
        },
      ])
      .returning();
    const regular = await tenant.a.scope.brandProfiles.create({
      name: "Schon versioniert",
    });

    const backfilled = await backfillMissingFirstVersions(handle.db);

    expect(backfilled.map((entry) => entry.name).sort()).toEqual([
      "Profil Alpha",
      "Profil Beta",
    ]);
    for (const profile of legacy) {
      const versions = await versionsOf(profile.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.version).toBe(1);
      expect(versions[0]?.workspaceId).toBe(profile.workspaceId);
      // The snapshot is the row parsed: the stub keeps `{}` in the column and
      // gets the full defaults in its snapshot, the populated one keeps its
      // field set.
      expect(versions[0]?.snapshot).toEqual({
        name: profile.name,
        description: null,
        aktiv: true,
        fields:
          profile.name === "Profil Beta"
            ? FULL_BRAND_PROFILE_FIELDS
            : emptyBrandProfileFields(),
      });
      expect(versions[0]?.contentHash).toBe(
        hashBrandProfileSnapshot(
          parseBrandProfileSnapshot(versions[0]?.snapshot),
        ),
      );
    }
    expect(await versionsOf(regular.id)).toHaveLength(1);
  });

  it("writes nothing on a second run", async () => {
    const before = await handle.db.select().from(brandProfileVersions);
    expect(await backfillMissingFirstVersions(handle.db)).toEqual([]);
    const after = await handle.db.select().from(brandProfileVersions);
    expect(after).toHaveLength(before.length);
  });
});

describe("reads and cascades", () => {
  it("getById is bound to the scope and unknown ids return null", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Leseprofil",
    });
    const [version] = await versionsOf(profile.id);
    if (!version) throw new Error("version 1 missing");

    expect(
      (await tenants.a.scope.brandProfileVersions.getById(version.id))?.version,
    ).toBe(1);
    expect(
      await tenants.a.scope.brandProfileVersions.getById(randomUUID()),
    ).toBeNull();
  });

  it("listByProfile returns the newest version first", async () => {
    const profile = await tenants.a.scope.brandProfiles.create({
      name: "Historie",
    });
    await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Historie 2" }),
    );
    await tenants.a.scope.brandProfiles.save(
      saveParams(profile.id, { name: "Historie 3" }),
    );

    const listed = await tenants.a.scope.brandProfileVersions.listByProfile(
      profile.id,
    );
    expect(listed.map((entry) => entry.version)).toEqual([3, 2, 1]);
    expect(listed[0]?.snapshot.name).toBe("Historie 3");
  });

  it("deleting the profile deletes its versions", async () => {
    const profile = await tenants.b.scope.brandProfiles.create({
      name: "Wird gelöscht",
    });
    expect(await versionsOf(profile.id)).toHaveLength(1);

    await handle.db
      .delete(brandProfiles)
      .where(
        and(
          eq(brandProfiles.id, profile.id),
          eq(brandProfiles.workspaceId, tenants.b.workspace.id),
        ),
      );

    expect(await versionsOf(profile.id)).toHaveLength(0);
  });

  it("deleting the workspace deletes profiles and versions", async () => {
    const tenant = await seedTwoTenants(handle.db);
    const profile = await tenant.a.scope.brandProfiles.create({
      name: "Mandant verschwindet",
    });
    expect(await versionsOf(profile.id)).toHaveLength(1);

    await handle.db
      .delete(workspaces)
      .where(eq(workspaces.id, tenant.a.workspace.id));

    expect(await versionsOf(profile.id)).toHaveLength(0);
  });

  it("reports a foreign-key violation for a version without its profile", async () => {
    const snapshot = {
      name: "Ohne Profil",
      description: null,
      aktiv: true,
      fields: emptyBrandProfileFields(),
    };
    const error = await handle.db
      .insert(brandProfileVersions)
      .values({
        workspaceId: tenants.a.workspace.id,
        brandProfileId: randomUUID(),
        version: 1,
        snapshot,
        contentHash: hashBrandProfileSnapshot(snapshot),
      })
      .catch((err: unknown) => err);
    expect(messageChain(error)).toContain("foreign key constraint");
  });
});
