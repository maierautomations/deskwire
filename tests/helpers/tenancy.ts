import { randomUUID } from "node:crypto";

import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import { scopedDb, type DbClient, type ScopedDb } from "@/db/scoped";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";
import { createWorkspaceWithOwner } from "@/db/workspaces";

// RULE, not a coincidence: seedTwoTenants stays MINIMAL. Two users, two
// workspaces with owner membership, two scopes — nothing else. No pre-seeded
// domain entities: every test creates the rows it needs itself. This helper
// is shared across suites and will be the most-used test tool of the coming
// phases; fixtures in the seed would couple suites to each other's data and
// turn every fixture change into a cross-suite hunt.
export interface TenantSeed {
  user: typeof users.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
  scope: ScopedDb;
}

export interface TwoTenants {
  a: TenantSeed;
  b: TenantSeed;
}

export async function seedTwoTenants(db: DbClient): Promise<TwoTenants> {
  // Unique emails so the seed can run multiple times against one PGlite
  // instance (single connection, one instance per test file).
  const seedTenant = async (label: string): Promise<TenantSeed> => {
    const [user] = await db
      .insert(users)
      .values({ email: `tenant-${label}-${randomUUID()}@example.com` })
      .returning();
    if (!user) throw new Error("user insert returned no row");
    const { workspace } = await createWorkspaceWithOwner(db, {
      name: `Tenant ${label.toUpperCase()}`,
      userId: user.id,
    });
    return { user, workspace, scope: scopedDb(db, workspace.id) };
  };
  return { a: await seedTenant("a"), b: await seedTenant("b") };
}

// Tables exempt from the workspace_id requirement (schema meta test) and from
// the entity-coverage check (isolation suite). Single source for both tenancy
// tests so the two lists cannot drift apart. Keep it explicit, documented and
// deliberately SHORT: everything not listed here is a domain table and must
// carry a NOT NULL workspace_id (CLAUDE.md principle 3, phase-0 decision 24).
export const SCOPE_EXEMPT_TABLES: readonly string[] = [
  // Auth.js adapter tables (task 7a): identity infrastructure, not tenancy.
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  // The tenant itself.
  "workspaces",
  // Tenancy-establishing tables (tasks 10a/11): they do carry workspace_id,
  // but their access is deliberately unscoped-encapsulated in src/db/**
  // (phase-0 decision 23) and covered by dedicated cases in the isolation
  // suite, not by a collection-shaped scopedDb entity entry.
  "memberships",
  "workspace_invites",
  // Stripe webhook idempotency ledger (task 14, phase-0 decision 27):
  // transport infrastructure. Event ids are Stripe-account-global and get
  // recorded before any workspace resolution happens; a row carries no
  // tenant data, only "this delivery was already processed".
  "stripe_events",
];

// All Drizzle table objects exported from the schema module. Programmatic on
// purpose: a future table is picked up automatically, nobody has to remember
// to register it anywhere for the meta test to see it.
export function schemaTables(): PgTable[] {
  // Widen to unknown[] first: the concrete schema export types are narrower
  // than PgTable, which a type predicate on the union would reject.
  const exports: unknown[] = Object.values(schema);
  return exports.filter((value): value is PgTable => is(value, PgTable));
}
