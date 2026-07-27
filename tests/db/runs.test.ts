import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runs, workspaces } from "@/db/schema";
import { scopedDb } from "@/db/scoped";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants, type TwoTenants } from "../helpers/tenancy";

// Functional coverage for the runs metering record (task 16) against the real
// migration 0005 on PGlite. The isolation matrix lives in the task-12 suite
// (tests/tenancy/isolation.test.ts), not here.
let handle: TestDbHandle;
let tenants: TwoTenants;

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
});

afterAll(async () => {
  await handle.close();
});

describe("runs metering record", () => {
  it("stores and returns a finished run with all token and cost fields", async () => {
    const startedAt = new Date("2026-07-27T10:00:00.000Z");
    const finishedAt = new Date("2026-07-27T10:00:42.000Z");
    const created = await tenants.a.scope.runs.create({
      status: "succeeded",
      startedAt,
      finishedAt,
      tokensIn: 1200,
      tokensOut: 800,
      costCents: 42,
    });

    const read = await tenants.a.scope.runs.getById(created.id);
    expect(read).not.toBeNull();
    expect(read?.status).toBe("succeeded");
    expect(read?.startedAt).toEqual(startedAt);
    expect(read?.finishedAt).toEqual(finishedAt);
    expect(read?.tokensIn).toBe(1200);
    expect(read?.tokensOut).toBe(800);
    expect(read?.costCents).toBe(42);
    expect(read?.error).toBeNull();
  });

  it.each(["running", "succeeded", "failed"] as const)(
    "the migration carries the enum value %s",
    async (status) => {
      const run = await tenants.a.scope.runs.create({ status });
      expect(run.status).toBe(status);
    },
  );

  it("a running run has no finish data yet: nullable fields stay null", async () => {
    // "Not measured" must stay distinguishable from "measured zero" — the
    // schema has no 0-defaults on tokens/cost on purpose.
    const run = await tenants.a.scope.runs.create({ status: "running" });
    expect(run.finishedAt).toBeNull();
    expect(run.tokensIn).toBeNull();
    expect(run.tokensOut).toBeNull();
    expect(run.costCents).toBeNull();
    expect(run.error).toBeNull();
    // started_at defaults to now(): row creation is the start.
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.createdAt).toBeInstanceOf(Date);
    expect(run.updatedAt).toBeInstanceOf(Date);
  });

  it("a failed run carries its error text", async () => {
    const run = await tenants.a.scope.runs.create({
      status: "failed",
      error: "model timeout",
    });
    expect((await tenants.a.scope.runs.getById(run.id))?.error).toBe(
      "model timeout",
    );
  });

  it("deleting the workspace cascades its runs", async () => {
    // Fresh tenants: this case destroys its workspace.
    const pair = await seedTwoTenants(handle.db);
    const scope = scopedDb(handle.db, pair.a.workspace.id);
    await scope.runs.create({ status: "running" });

    await handle.db
      .delete(workspaces)
      .where(eq(workspaces.id, pair.a.workspace.id));

    const orphans = await handle.db
      .select()
      .from(runs)
      .where(eq(runs.workspaceId, pair.a.workspace.id));
    expect(orphans).toEqual([]);
  });
});
