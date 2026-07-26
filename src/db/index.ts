import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";
import { scopedDb, type ScopedDb } from "./scoped";

// The Neon driver needs an explicit WebSocket implementation in Node;
// wiring ws keeps the behavior identical across local dev and Vercel.
neonConfig.webSocketConstructor = ws;

export type Db = NeonDatabase<typeof schema>;
export type { DbClient, NewBrandProfile, ScopedDb } from "./scoped";
export { scopedDb } from "./scoped";

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
