import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import {
  handleStripeWebhook,
  type StripeWebhookTransport,
} from "@/lib/billing/webhook";
import { serverEnv } from "@/lib/env";

import {
  findValidInviteByToken,
  type WorkspaceInvite,
} from "./invites";
import {
  createMembershipFromInvite,
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
export {
  INVITE_TOKEN_LENGTH,
  INVITE_TTL_DAYS,
  type WorkspaceInvite,
} from "./invites";
export type { WorkspaceForUser } from "./memberships";
export type {
  CreditLedgerEntry,
  DbClient,
  NewBrandProfile,
  NewCreditLedgerEntry,
  NewRun,
  Run,
  ScopedDb,
} from "./scoped";
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

// Bound invite entry points (task 11), same different-name pattern as above.
// Redemption is the one flow that legitimately runs without a workspace
// scope: the workspace_id is unknown until the token lookup resolves it.
export function getValidInvite(
  token: string,
  now: Date,
): Promise<WorkspaceInvite | null> {
  return findValidInviteByToken(getDb(), token, now);
}

export function joinWorkspaceAsMember(params: {
  userId: string;
  workspaceId: string;
}): Promise<Membership | null> {
  return createMembershipFromInvite(getDb(), params);
}

// Bound Stripe webhook entry (task 15a), same different-name pattern: the
// webhook resolves the tenant FROM the delivery (stripe_customer_id), so it
// is the one route flow that legitimately needs the raw client. This binds
// ONLY the db; the transport deps (Stripe client, webhook secret) stay with
// the route wrapper, which keeps this barrel free of the Stripe SDK
// (webhook.ts imports Stripe as a type only).
export function processStripeWebhook(
  request: Request,
  transport: StripeWebhookTransport,
): Promise<Response> {
  return handleStripeWebhook(request, { db: getDb(), ...transport });
}
