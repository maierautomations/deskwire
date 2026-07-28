import { randomUUID } from "node:crypto";

import { getTableName } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findValidInviteByToken } from "@/db/invites";
import {
  createMembershipFromInvite,
  findMembership,
  listWorkspacesForUser,
} from "@/db/memberships";
import { users } from "@/db/schema";
import type { ScopedDb } from "@/db/scoped";
import { emptyBrandProfileFields } from "@/lib/brand-profile/schema";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import {
  SCOPE_EXEMPT_TABLES,
  schemaTables,
  seedTwoTenants,
  type TwoTenants,
} from "../helpers/tenancy";

// The systematic tenant-isolation suite (task 12). Running the scoped helpers
// against PGlite doubles as the type-parity proof from task 6: this file
// would not compile if scopedDb were typed against a concrete driver.
//
// Adding a new scoped entity = one entry in `entities` below (table, shape,
// accessors). The completeness guards turn a forgotten entry into a red test
// with instructions, so nobody has to remember this suite exists.

// A collection entity exposes the standard scoped CRUD surface. The accessors
// adapt the namespace to the generic runner; `create` must not need any
// foreign keys beyond the workspace (keep phase-0 factories that simple).
interface CollectionAccessors {
  create(scope: ScopedDb): Promise<{ id: string; workspaceId: string }>;
  list(scope: ScopedDb): Promise<Array<{ id: string; workspaceId: string }>>;
  getById(
    scope: ScopedDb,
    id: string,
  ): Promise<{ id: string; workspaceId: string } | null>;
}

// Every entry declares its shape. "collection" runs the generic four-case
// runner below; "singleton" and "custom" entries MUST have a hand-written
// describe in this file covering the named methods — the shape assertion in
// the completeness guards makes sure no namespace slips through with an
// undeclared shape or an empty case set.
//
// A collection namespace may carry extraMethods beyond the standard surface
// (task 19: brandProfiles.save). Those keep the generic runner AND demand
// their own named cases, so a method can never arrive without isolation
// coverage just because its namespace already had some.
const COLLECTION_METHODS = ["create", "getById", "list"] as const;

type EntityDeclaration = { table: string } & (
  | {
      shape: "collection";
      accessors: CollectionAccessors;
      extraMethods?: readonly string[];
      extraCases?: readonly string[];
    }
  | { shape: "singleton"; methods: readonly string[] }
  | { shape: "custom"; methods: readonly string[]; cases: readonly string[] }
);

const entities: Record<string, EntityDeclaration> = {
  brandProfiles: {
    table: "brand_profiles",
    shape: "collection",
    accessors: {
      create: (scope) => scope.brandProfiles.create({ name: "Isolationsprofil" }),
      list: (scope) => scope.brandProfiles.list(),
      getById: (scope, id) => scope.brandProfiles.getById(id),
    },
    // Task 19: the only write path for an existing profile. Covered by the
    // hand-written "brandProfiles.save (scoped write)" describe below.
    extraMethods: ["save"],
    extraCases: [
      "save refuses a foreign workspace's profile and writes nothing",
    ],
  },
  // Append-only profile history (task 19); covered by the hand-written
  // "brandProfileVersions (custom)" describe below. No create: versions are
  // written exclusively as a side effect of a profile write.
  brandProfileVersions: {
    table: "brand_profile_versions",
    shape: "custom",
    methods: ["getById", "listByProfile"],
    cases: [
      "listByProfile never returns a foreign workspace's versions",
      "getById returns null for a foreign workspace's version row",
      "a save in one workspace creates no version in the other",
    ],
  },
  runs: {
    table: "runs",
    shape: "collection",
    accessors: {
      // status is a required field with no DB default (lifecycle rules are
      // phase-1 executor territory), so the factory states it explicitly.
      create: (scope) => scope.runs.create({ status: "running" }),
      list: (scope) => scope.runs.list(),
      getById: (scope, id) => scope.runs.getById(id),
    },
  },
  // One invite row per workspace (phase-0 decision 22); covered by the
  // hand-written "invites (singleton)" describe below.
  invites: {
    table: "workspace_invites",
    shape: "singleton",
    methods: ["get", "regenerate"],
  },
  // Append-only ledger (task 16, phase-0 decision 30); covered by the
  // hand-written "creditLedger (custom)" describe below.
  creditLedger: {
    table: "credit_ledger",
    shape: "custom",
    methods: ["balance", "book"],
    cases: [
      "book stamps the scope's workspaceId",
      "an empty workspace's balance is 0 even while foreign bookings exist",
      "balance sums only the own workspace's bookings",
    ],
  },
};

let handle: TestDbHandle;
let tenants: TwoTenants;

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
});

afterAll(async () => {
  await handle.close();
});

// Function members per scopedDb namespace, sorted for stable comparison.
function namespaceMethods(scope: ScopedDb): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [key, value] of Object.entries(scope)) {
    if (typeof value !== "object" || value === null) continue; // workspaceId
    const methods = Object.entries(value)
      .filter(([, member]) => typeof member === "function")
      .map(([name]) => name)
      .sort();
    result.set(key, methods);
  }
  return result;
}

describe("suite completeness (forgetting guards)", () => {
  it("every scopedDb namespace has an entity entry and none is stale", () => {
    const actual = [...namespaceMethods(tenants.a.scope).keys()].sort();
    const declared = Object.keys(entities).sort();
    expect(
      actual,
      "scopedDb namespaces and the entity list in this file must match 1:1. " +
        "A new namespace needs an entry (table, shape, accessors or cases); " +
        "a removed namespace needs its entry deleted. Without an entry, a " +
        "new entity would ship without isolation tests.",
    ).toEqual(declared);
  });

  it("every non-exempt schema table is covered by an entity entry", () => {
    const tableNames = schemaTables().map((table) => getTableName(table));
    const declaredTables = Object.values(entities).map((entry) => entry.table);
    const uncovered = tableNames.filter(
      (name) =>
        !SCOPE_EXEMPT_TABLES.includes(name) && !declaredTables.includes(name),
    );
    expect(
      uncovered,
      "This domain table is reachable by no scopedDb namespace and covered " +
        "by no entity entry. Wire it into src/db/scoped.ts and add an entry " +
        "here — a workspace_id column alone does not prove isolation.",
    ).toEqual([]);
    const phantom = declaredTables.filter((name) => !tableNames.includes(name));
    expect(
      phantom,
      "Entity entries must reference existing schema tables (stale entry?).",
    ).toEqual([]);
  });

  it("each namespace's methods match its declared shape", () => {
    // A green suite without matching checks is the one silent failure mode
    // of this construct: a collection entry whose namespace lost a method,
    // or a namespace that grew methods outside its declared shape, would
    // otherwise pass with an empty or partial case set.
    const problems: string[] = [];
    const methodsByNamespace = namespaceMethods(tenants.a.scope);
    for (const [name, entry] of Object.entries(entities)) {
      const actual = methodsByNamespace.get(name);
      if (!actual) continue; // already reported by the namespace guard
      const expected =
        entry.shape === "collection"
          ? [...COLLECTION_METHODS, ...(entry.extraMethods ?? [])].sort()
          : [...entry.methods].sort();
      if (actual.join(",") !== expected.join(",")) {
        problems.push(
          `${name}: namespace has methods [${actual.join(", ")}] but its ` +
            `"${entry.shape}" declaration expects exactly [${expected.join(", ")}]. ` +
            `Either the namespace changed shape (update the declaration and ` +
            `add cases for the new methods) or a method went missing.`,
        );
      }
      if (entry.shape === "custom" && entry.cases.length === 0) {
        problems.push(
          `${name}: custom entries must name at least one case and back it ` +
            `with a hand-written describe in this file.`,
        );
      }
      if (
        entry.shape === "collection" &&
        (entry.extraMethods?.length ?? 0) > 0 &&
        (entry.extraCases?.length ?? 0) === 0
      ) {
        problems.push(
          `${name}: a collection with extraMethods [${(entry.extraMethods ?? []).join(", ")}] ` +
            `must name at least one extraCase and back it with a hand-written ` +
            `describe in this file. The generic runner only covers create, ` +
            `getById and list.`,
        );
      }
    }
    expect(problems).toEqual([]);
  });
});

// Generic runner: the same four cases for every collection entity. Writing
// into a foreign workspace is impossible by construction — create() accepts
// no workspaceId (Omit type), the scope stamps it — which the first case
// proves at runtime.
for (const [name, entry] of Object.entries(entities)) {
  if (entry.shape !== "collection") continue;
  const { accessors } = entry;

  describe(`${name} (collection isolation)`, () => {
    it("create stamps the scope's workspaceId onto the row", async () => {
      const row = await accessors.create(tenants.a.scope);
      expect(row.workspaceId).toBe(tenants.a.workspace.id);
      expect(row.id).toBeTruthy();
    });

    it("list never returns a foreign workspace's rows", async () => {
      const rowA = await accessors.create(tenants.a.scope);
      const listB = await accessors.list(tenants.b.scope);
      expect(listB.map((row) => row.id)).not.toContain(rowA.id);
      expect(
        listB.every((row) => row.workspaceId === tenants.b.workspace.id),
      ).toBe(true);
    });

    it("getById returns null for a foreign workspace's row", async () => {
      const rowA = await accessors.create(tenants.a.scope);
      expect(await accessors.getById(tenants.b.scope, rowA.id)).toBeNull();
    });

    it("getById returns null for an unknown id", async () => {
      expect(await accessors.getById(tenants.a.scope, randomUUID())).toBeNull();
    });
  });
}

// The scoped write path of an existing profile (task 19). It is the only way
// to change a profile row, so it is also the only place where a foreign
// workspace could otherwise reach one.
describe("brandProfiles.save (scoped write)", () => {
  it("refuses a foreign workspace's profile and writes nothing", async () => {
    const own = await seedTwoTenants(handle.db);
    const profile = await own.a.scope.brandProfiles.create({
      name: "Gehört A",
    });

    const result = await own.b.scope.brandProfiles.save({
      brandProfileId: profile.id,
      name: "Von B umbenannt",
      description: null,
      aktiv: false,
      fields: emptyBrandProfileFields(),
    });

    expect(result).toEqual({ status: "not_found" });
    expect((await own.a.scope.brandProfiles.getById(profile.id))?.name).toBe(
      "Gehört A",
    );
    // Not even a version row leaked into B.
    expect(
      await own.b.scope.brandProfileVersions.listByProfile(profile.id),
    ).toEqual([]);
    expect(
      (await own.a.scope.brandProfileVersions.listByProfile(profile.id)).map(
        (entry) => entry.version,
      ),
    ).toEqual([1]);
  });
});

// Custom entity: the append-only profile history (task 19). Fresh tenants so
// the version lists start clean; cases build on each other in file order.
describe("brandProfileVersions (custom isolation)", () => {
  let ver: TwoTenants;
  let profileA: string;
  let profileB: string;

  beforeAll(async () => {
    ver = await seedTwoTenants(handle.db);
    profileA = (await ver.a.scope.brandProfiles.create({ name: "Profil A" }))
      .id;
    profileB = (await ver.b.scope.brandProfiles.create({ name: "Profil B" }))
      .id;
  });

  it("listByProfile never returns a foreign workspace's versions", async () => {
    // Scope-blind lookup: B asking for A's profile id must get nothing, not
    // A's history (the pattern of the scope-blind invites.get).
    expect(await ver.b.scope.brandProfileVersions.listByProfile(profileA)).toEqual(
      [],
    );
    const own = await ver.a.scope.brandProfileVersions.listByProfile(profileA);
    expect(own).toHaveLength(1);
    expect(own[0]?.workspaceId).toBe(ver.a.workspace.id);
  });

  it("getById returns null for a foreign workspace's version row", async () => {
    const [versionA] = await ver.a.scope.brandProfileVersions.listByProfile(
      profileA,
    );
    if (!versionA) throw new Error("version 1 missing");
    expect(await ver.b.scope.brandProfileVersions.getById(versionA.id)).toBeNull();
    expect(
      (await ver.a.scope.brandProfileVersions.getById(versionA.id))?.version,
    ).toBe(1);
  });

  it("a save in one workspace creates no version in the other", async () => {
    await ver.a.scope.brandProfiles.save({
      brandProfileId: profileA,
      name: "Profil A, geändert",
      description: null,
      aktiv: true,
      fields: emptyBrandProfileFields(),
    });

    expect(
      (await ver.a.scope.brandProfileVersions.listByProfile(profileA)).map(
        (entry) => entry.version,
      ),
    ).toEqual([2, 1]);
    expect(
      (await ver.b.scope.brandProfileVersions.listByProfile(profileB)).map(
        (entry) => entry.version,
      ),
    ).toEqual([1]);
  });
});

// Singleton entity: one invite row per workspace. Fresh tenants for this
// describe so "B has no invite yet" holds regardless of other tests. The
// cases build on each other in file order (vitest runs them sequentially).
describe("invites (singleton isolation)", () => {
  let inv: TwoTenants;

  beforeAll(async () => {
    inv = await seedTwoTenants(handle.db);
  });

  it("regenerate stamps the scope's workspaceId", async () => {
    const invite = await inv.a.scope.invites.regenerate({
      createdBy: inv.a.user.id,
    });
    expect(invite.workspaceId).toBe(inv.a.workspace.id);
  });

  it("get does not see a foreign workspace's invite", async () => {
    // A has an invite from the previous case; B never created one.
    expect(await inv.b.scope.invites.get()).toBeNull();
    expect((await inv.a.scope.invites.get())?.workspaceId).toBe(
      inv.a.workspace.id,
    );
  });

  it("regenerate leaves the foreign workspace's invite untouched", async () => {
    const inviteB = await inv.b.scope.invites.regenerate({
      createdBy: inv.b.user.id,
    });
    await inv.a.scope.invites.regenerate({ createdBy: inv.a.user.id });
    expect((await inv.b.scope.invites.get())?.token).toBe(inviteB.token);
  });
});

// Custom entity: the append-only credit ledger (task 16). Fresh tenants so
// balances start clean regardless of other tests; cases build on each other
// in file order (vitest runs them sequentially). Writing into a foreign
// workspace is impossible by construction here too: book() accepts no
// workspaceId (Omit type), the scope stamps it.
describe("creditLedger (custom isolation)", () => {
  let led: TwoTenants;

  beforeAll(async () => {
    led = await seedTwoTenants(handle.db);
  });

  it("book stamps the scope's workspaceId", async () => {
    const entry = await led.a.scope.creditLedger.book({
      delta: 10,
      reason: "isolation seed",
    });
    expect(entry.workspaceId).toBe(led.a.workspace.id);
  });

  it("an empty workspace's balance is 0 even while foreign bookings exist", async () => {
    // The sharpest form of the empty-sum trap: SUM over zero rows is NULL in
    // Postgres, and A's rows already sit in the table. B must still get the
    // NUMBER 0 — not null, not a string.
    expect(await led.b.scope.creditLedger.balance()).toBe(0);
  });

  it("balance sums only the own workspace's bookings", async () => {
    await led.a.scope.creditLedger.book({
      delta: -3,
      reason: "isolation burn",
    });
    await led.b.scope.creditLedger.book({
      delta: 100,
      reason: "isolation seed",
    });
    expect(await led.a.scope.creditLedger.balance()).toBe(7);
    expect(await led.b.scope.creditLedger.balance()).toBe(100);
  });
});

// The memberships view (task 10a): tenancy-establishing, deliberately
// unscoped-encapsulated in src/db/** — its isolation is user-centric, not
// scope-centric. Functional cases (ordering, cascades, atomicity) stay in
// tests/db/workspaces-memberships.test.ts.
describe("memberships view isolation", () => {
  it("listWorkspacesForUser returns only the user's own workspaces", async () => {
    const listed = await listWorkspacesForUser(handle.db, tenants.a.user.id);
    const ids = listed.map((entry) => entry.workspace.id);
    expect(ids).toContain(tenants.a.workspace.id);
    expect(ids).not.toContain(tenants.b.workspace.id);
  });

  it("findMembership returns null for a non-member", async () => {
    expect(
      await findMembership(handle.db, tenants.a.user.id, tenants.b.workspace.id),
    ).toBeNull();
    expect(
      (await findMembership(handle.db, tenants.a.user.id, tenants.a.workspace.id))
        ?.role,
    ).toBe("owner");
  });
});

// Cross-tenant redemption flow (moved here from tests/db/invites.test.ts,
// task 11): the workspaceId of a join comes exclusively from the invite row
// the token resolves to, so an A token can never grant access to B.
describe("invite redemption flow (cross-tenant)", () => {
  it("a workspace-A token never grants access to workspace B", async () => {
    const flow = await seedTwoTenants(handle.db);
    const [joiner] = await handle.db
      .insert(users)
      .values({ email: `joiner-${randomUUID()}@example.com` })
      .returning();
    if (!joiner) throw new Error("user insert returned no row");

    const inviteA = await flow.a.scope.invites.regenerate({
      createdBy: flow.a.user.id,
    });
    const inviteB = await flow.b.scope.invites.regenerate({
      createdBy: flow.b.user.id,
    });

    // The token lookup resolves to A and only A.
    const resolved = await findValidInviteByToken(
      handle.db,
      inviteA.token,
      new Date(),
    );
    expect(resolved?.workspaceId).toBe(flow.a.workspace.id);

    // Redeeming A's token (the full flow: lookup result feeds the write)
    // creates a membership in A and leaves B untouched.
    await createMembershipFromInvite(handle.db, {
      userId: joiner.id,
      workspaceId: resolved?.workspaceId ?? "",
    });
    expect(
      (await findMembership(handle.db, joiner.id, flow.a.workspace.id))?.role,
    ).toBe("member");
    expect(
      await findMembership(handle.db, joiner.id, flow.b.workspace.id),
    ).toBeNull();
    expect((await flow.b.scope.invites.get())?.token).toBe(inviteB.token);
  });
});
