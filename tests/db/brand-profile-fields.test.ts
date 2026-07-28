import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { brandProfiles } from "@/db/schema";
import {
  emptyBrandProfileFields,
  parseBrandProfileFields,
  type BrandProfileFields,
} from "@/lib/brand-profile/schema";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { FULL_BRAND_PROFILE_FIELDS } from "../fixtures/brand-profile";
import { seedTwoTenants, type TwoTenants } from "../helpers/tenancy";

// jsonb persistence of the brand profile field set against the REAL migration
// 0006 on PGlite. The isolation matrix stays in the task-12 suite
// (tests/tenancy/isolation.test.ts); this file proves the column, its defaults
// and the round trip through the Zod boundary.
let handle: TestDbHandle;
let tenants: TwoTenants;

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
});

afterAll(async () => {
  await handle.close();
});

describe("brand_profiles.fields and aktiv", () => {
  // This is the production case: every phase-0 stub row was written before the
  // column existed and now carries the database default.
  it("defaults a row created without fields to an empty object that parses to full defaults", async () => {
    const created = await tenants.a.scope.brandProfiles.create({
      name: "Stub aus Phase 0",
    });

    expect(created.fields).toEqual({});
    expect(created.aktiv).toBe(true);
    expect(parseBrandProfileFields(created.fields)).toEqual(
      emptyBrandProfileFields(),
    );
  });

  it("keeps the columns on every read path", async () => {
    const created = await tenants.a.scope.brandProfiles.create({
      name: "Leseprofil",
    });

    const byId = await tenants.a.scope.brandProfiles.getById(created.id);
    expect(byId?.fields).toEqual({});
    expect(byId?.aktiv).toBe(true);

    const listed = (await tenants.a.scope.brandProfiles.list()).find(
      (row) => row.id === created.id,
    );
    expect(listed?.fields).toEqual({});
    expect(listed?.aktiv).toBe(true);
  });

  it("round-trips a fully populated profile through jsonb", async () => {
    const created = await tenants.a.scope.brandProfiles.create({
      name: "Vollprofil",
      fields: FULL_BRAND_PROFILE_FIELDS,
    });

    const read = await tenants.a.scope.brandProfiles.getById(created.id);
    expect(read).not.toBeNull();
    // Through the read boundary, byte for byte: umlauts, newlines inside the
    // example texts, nested objects and arrays all survive.
    expect(parseBrandProfileFields(read?.fields)).toEqual(
      FULL_BRAND_PROFILE_FIELDS,
    );
  });

  // Postgres jsonb normalizes key order on storage, so the read boundary must
  // never depend on it. Written in reverse order to state that explicitly.
  it("does not depend on key order in the stored object", async () => {
    // satisfies, so a future field added to the schema makes this copy red
    // instead of quietly going stale next to the fixture.
    const reordered = {
      beispieltexte: FULL_BRAND_PROFILE_FIELDS.beispieltexte,
      bevorzugte_begriffe: FULL_BRAND_PROFILE_FIELDS.bevorzugte_begriffe,
      verbotene_begriffe: FULL_BRAND_PROFILE_FIELDS.verbotene_begriffe,
      formatregeln: FULL_BRAND_PROFILE_FIELDS.formatregeln,
      pflichtelemente: FULL_BRAND_PROFILE_FIELDS.pflichtelemente,
      stil_fingerabdruck: FULL_BRAND_PROFILE_FIELDS.stil_fingerabdruck,
      harte_verbote: FULL_BRAND_PROFILE_FIELDS.harte_verbote,
      donts: FULL_BRAND_PROFILE_FIELDS.donts,
      dos: FULL_BRAND_PROFILE_FIELDS.dos,
      tonalitaet: FULL_BRAND_PROFILE_FIELDS.tonalitaet,
      zielgruppe: FULL_BRAND_PROFILE_FIELDS.zielgruppe,
      schema_version: FULL_BRAND_PROFILE_FIELDS.schema_version,
    } satisfies BrandProfileFields;
    const created = await tenants.a.scope.brandProfiles.create({
      name: "Andere Reihenfolge",
      fields: reordered,
    });

    const read = await tenants.a.scope.brandProfiles.getById(created.id);
    expect(parseBrandProfileFields(read?.fields)).toEqual(
      FULL_BRAND_PROFILE_FIELDS,
    );
  });

  it("stores aktiv false and back", async () => {
    const created = await tenants.b.scope.brandProfiles.create({
      name: "Stillgelegt",
      aktiv: false,
    });
    expect(created.aktiv).toBe(false);

    await handle.db
      .update(brandProfiles)
      .set({ aktiv: true })
      .where(eq(brandProfiles.id, created.id));

    const read = await tenants.b.scope.brandProfiles.getById(created.id);
    expect(read?.aktiv).toBe(true);
  });
});
