import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { serverEnv } from "@/lib/env";

import {
  findMembership,
  listWorkspacesForUser,
  type WorkspaceForUser,
} from "./memberships";
import * as schema from "./schema";
import { scopedDb, type ScopedDb } from "./scoped";
import {
  createWorkspaceWithOwner,
  type CreateWorkspaceWithOwnerParams,
  type CreateWorkspaceWithOwnerResult,
  type Membership,
} from "./workspaces";

// The Neon driver needs an explicit WebSocket implementation in Node;
// wiring ws keeps the behavior identical across local dev and Vercel.
neonConfig.webSocketConstructor = ws;

export type Db = NeonDatabase<typeof schema>;
export type { WorkspaceForUser } from "./memberships";
export type { DbClient, NewBrandProfile, ScopedDb } from "./scoped";
export { scopedDb } from "./scoped";
export type {
  CreateWorkspaceWithOwnerParams,
  CreateWorkspaceWithOwnerResult,
  Membership,
  Workspace,
} from "./workspaces";

let db: Db | null = null;

// Lazy singleton: no env access or connection at import time, so builds
// and tests run without a database.
export function getDb(): Db {
  if (!db) {
    const pool = new Pool({ connectionString: serverEnv().DATABASE_URL });
    db = drizzle({ client: pool, schema });
  }
  return db;
}

// The only entry point for app code: a client hard-bound to one workspace.
// Unscoped access (getDb) is reserved for src/db/** internals.
export function getScopedDb(workspaceId: string): ScopedDb {
  return scopedDb(getDb(), workspaceId);
}

// Connectivity probe for the health endpoint: deliberately unscoped, touches
// no domain data, and lives here so app code never needs the raw client.
export async function pingDb(): Promise<void> {
  await getDb().execute(sql`select 1`);
}

// Bound tenancy entry points (task 10a), pattern as scopedDb/getScopedDb:
// the raw helpers in workspaces.ts/memberships.ts take a DbClient and stay
// testable against PGlite; these bound versions carry DIFFERENT names so a
// mixed-up import cannot typecheck-silently swap one for the other.
export function createWorkspaceAsOwner(
  params: CreateWorkspaceWithOwnerParams,
): Promise<CreateWorkspaceWithOwnerResult> {
  return createWorkspaceWithOwner(getDb(), params);
}

export function getWorkspacesForUser(
  userId: string,
): Promise<WorkspaceForUser[]> {
  return listWorkspacesForUser(getDb(), userId);
}

export function getMembership(
  userId: string,
  workspaceId: string,
): Promise<Membership | null> {
  return findMembership(getDb(), userId, workspaceId);
}
