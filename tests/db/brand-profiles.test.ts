import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scopedDb, type ScopedDb } from "@/db/scoped";
import { workspaces } from "@/db/schema";
import { createTestDb, type TestDb } from "../helpers/db";

// Running the scoped helpers against the PGlite client proves they are typed
// against the generic PgDatabase, not the Neon driver type: this file would
// not compile otherwise.
describe("scoped query helpers (brand_profiles)", () => {
  let db: TestDb;
  let closeDb: (() => Promise<void>) | undefined;
  let scopeA: ScopedDb;
  let scopeB: ScopedDb;
  let profileAId: string;

  beforeAll(async () => {
    const handle = await createTestDb();
    db = handle.db;
    closeDb = handle.close;

    // Workspace creation is deliberately raw here: tenancy-establishing
    // access lives in src/db/** (task 10a); tests/** is exempt from the
    // lint rule and PGlite instances are throwaway.
    const [workspaceA] = await db
      .insert(workspaces)
      .values({ name: "Redaktion Alpha" })
      .returning();
    const [workspaceB] = await db
      .insert(workspaces)
      .values({ name: "Redaktion Beta" })
      .returning();

    scopeA = scopedDb(db, workspaceA.id);
    scopeB = scopedDb(db, workspaceB.id);

    const profileA = await scopeA.brandProfiles.create({
      name: "Profil Alpha",
      description: "gehört zu Alpha",
    });
    profileAId = profileA.id;
    await scopeB.brandProfiles.create({ name: "Profil Beta" });
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("create stamps the scope's workspaceId onto the row", async () => {
    const row = await scopeA.brandProfiles.create({ name: "Zweites Alpha" });
    expect(row.workspaceId).toBe(scopeA.workspaceId);
    expect(row.id).toBeTruthy();
  });

  it("list returns only the own workspace's profiles", async () => {
    const listA = await scopeA.brandProfiles.list();
    const listB = await scopeB.brandProfiles.list();

    expect(listA.map((p) => p.name)).toContain("Profil Alpha");
    expect(listB.map((p) => p.name)).toEqual(["Profil Beta"]);
    expect(listA.every((p) => p.workspaceId === scopeA.workspaceId)).toBe(true);
    expect(listB.every((p) => p.workspaceId === scopeB.workspaceId)).toBe(true);
  });

  it("getById returns the row inside the own scope", async () => {
    const row = await scopeA.brandProfiles.getById(profileAId);
    expect(row?.name).toBe("Profil Alpha");
  });

  it("getById returns null for a foreign workspace's profile", async () => {
    expect(await scopeB.brandProfiles.getById(profileAId)).toBeNull();
  });

  it("getById returns null for an unknown id", async () => {
    expect(await scopeA.brandProfiles.getById(randomUUID())).toBeNull();
  });
});
