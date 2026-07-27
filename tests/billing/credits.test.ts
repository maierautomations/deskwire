import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { creditLedger, workspaces } from "@/db/schema";
import { scopedDb } from "@/db/scoped";
import {
  bookCredits,
  getCreditBalance,
  type CreditsDeps,
} from "@/lib/billing/credits";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants, type TwoTenants } from "../helpers/tenancy";

// Real-chain proof (task-13 pattern): the lib functions run against the real
// scoped helpers on PGlite with the real migration 0005 — no fakes, because
// bookCredits/getCreditBalance contain no branching of their own; the deps
// parameter only swaps the bound Neon client for the test client. The
// cross-tenant matrix lives in the task-12 isolation suite, not here.
let handle: TestDbHandle;
let tenants: TwoTenants;
let deps: CreditsDeps;

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
  deps = { getScopedDb: (workspaceId) => scopedDb(handle.db, workspaceId) };
});

afterAll(async () => {
  await handle.close();
});

// Cases build on each other in file order (vitest runs them sequentially):
// A accumulates +50, -12, +5, -3 = 40 across the first two cases.
describe("bookCredits / getCreditBalance", () => {
  it("books an entry with the workspace stamped and reference defaulting to null", async () => {
    const entry = await bookCredits(
      { workspaceId: tenants.a.workspace.id, delta: 50, reason: "test grant" },
      deps,
    );
    expect(entry.workspaceId).toBe(tenants.a.workspace.id);
    expect(entry.delta).toBe(50);
    expect(entry.reason).toBe("test grant");
    expect(entry.reference).toBeNull();
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.id).toBeTruthy();
  });

  it("sums multiple bookings including negative deltas", async () => {
    const burn = await bookCredits(
      {
        workspaceId: tenants.a.workspace.id,
        delta: -12,
        reason: "test burn",
        reference: "run-fixture-1",
      },
      deps,
    );
    expect(burn.reference).toBe("run-fixture-1");
    await bookCredits(
      { workspaceId: tenants.a.workspace.id, delta: 5, reason: "test bonus" },
      deps,
    );
    await bookCredits(
      { workspaceId: tenants.a.workspace.id, delta: -3, reason: "test burn" },
      deps,
    );
    expect(await getCreditBalance(tenants.a.workspace.id, deps)).toBe(40);
  });

  it("an empty ledger's balance is the number 0", async () => {
    // The empty-sum trap: SUM over zero rows is NULL in Postgres. toBe(0)
    // fails for null and for a "0" string alike.
    expect(await getCreditBalance(tenants.b.workspace.id, deps)).toBe(0);
  });

  it.each([0, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects delta %s without touching the ledger",
    async (delta) => {
      await expect(
        bookCredits(
          { workspaceId: tenants.a.workspace.id, delta, reason: "invalid" },
          deps,
        ),
      ).rejects.toThrow(/non-zero integer/);
    },
  );

  it.each(["", "   "])(
    "rejects the empty reason %j without touching the ledger",
    async (reason) => {
      await expect(
        bookCredits(
          { workspaceId: tenants.a.workspace.id, delta: 1, reason },
          deps,
        ),
      ).rejects.toThrow(/reason/);
    },
  );

  it("the rejected bookings left no rows behind", async () => {
    const rows = await handle.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, tenants.a.workspace.id));
    expect(rows).toHaveLength(4);
    expect(await getCreditBalance(tenants.a.workspace.id, deps)).toBe(40);
  });

  it("performs no balance check: the ledger may go negative", async () => {
    // Deliberate phase-0 decision (see src/lib/billing/credits.ts): append
    // stays append, insufficiency handling belongs to the phase-1 gates.
    await bookCredits(
      { workspaceId: tenants.b.workspace.id, delta: -5, reason: "test burn" },
      deps,
    );
    expect(await getCreditBalance(tenants.b.workspace.id, deps)).toBe(-5);
  });

  it("deleting the workspace cascades its ledger rows", async () => {
    // Fresh tenants: this case destroys its workspace. Cascade is correct in
    // phase 0 because the workspace IS the tenant; revisit once billing hangs
    // on real money (see schema comment).
    const pair = await seedTwoTenants(handle.db);
    await bookCredits(
      { workspaceId: pair.a.workspace.id, delta: 7, reason: "test grant" },
      deps,
    );

    await handle.db
      .delete(workspaces)
      .where(eq(workspaces.id, pair.a.workspace.id));

    const orphans = await handle.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, pair.a.workspace.id));
    expect(orphans).toEqual([]);
  });
});
