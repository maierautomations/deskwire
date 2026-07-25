import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

// The Neon driver needs an explicit WebSocket implementation in Node;
// wiring ws keeps the behavior identical across local dev and Vercel.
neonConfig.webSocketConstructor = ws;

export type Db = NeonDatabase<typeof schema>;

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
