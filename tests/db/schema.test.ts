import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { brandProfiles, workspaces } from "@/db/schema";
import { createTestDb, type TestDb } from "../helpers/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Drizzle wraps driver errors, so the Postgres detail (e.g. "violates
// foreign key constraint") may live anywhere in the cause chain.
function messageChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

describe("PGlite test harness (real migrations from src/db/migrations)", () => {
  let db: TestDb;
  let closeDb: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const handle = await createTestDb();
    db = handle.db;
    closeDb = handle.close;
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("applies migration 0000 and generates ids via gen_random_uuid()", async () => {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Redaktion Alpha" })
      .returning();

    expect(workspace.id).toMatch(UUID_RE);
    expect(workspace.createdAt).toBeInstanceOf(Date);
    expect(workspace.updatedAt).toBeInstanceOf(Date);
  });

  it("round-trips brand_profiles scoped by workspace_id", async () => {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Roundtrip" })
      .returning();
    await db.insert(brandProfiles).values({
      workspaceId: workspace.id,
      name: "Profil A",
      description: "Testprofil",
    });

    const rows = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, workspace.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Profil A");
    expect(rows[0].description).toBe("Testprofil");
  });

  it("enforces the foreign key on brand_profiles.workspace_id", async () => {
    const orphanWorkspaceId = randomUUID();

    const err = await db
      .insert(brandProfiles)
      .values({ workspaceId: orphanWorkspaceId, name: "Verwaist" })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err, "insert with unknown workspace_id must be rejected").not.toBeNull();
    expect(messageChain(err)).toMatch(/foreign key/i);

    const rows = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, orphanWorkspaceId));
    expect(rows).toHaveLength(0);
  });

  it("cascades workspace deletion to its brand_profiles", async () => {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Kaskade" })
      .returning();
    await db
      .insert(brandProfiles)
      .values({ workspaceId: workspace.id, name: "Wird mitgelöscht" });

    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));

    const rows = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, workspace.id));
    expect(rows).toHaveLength(0);
  });

  it("isolates each createTestDb() instance completely", async () => {
    await db.insert(workspaces).values({ name: "Nur in Instanz A" });

    const second = await createTestDb();
    try {
      const rows = await second.db.select().from(workspaces);
      expect(rows).toHaveLength(0);
    } finally {
      await second.close();
    }
  });
});
