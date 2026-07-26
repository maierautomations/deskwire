import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";

// Structurally compatible with the app's Db type: both PgliteDatabase and
// NeonDatabase extend PgDatabase over the same schema. Code that should run
// against both (e.g. the scoped query helpers from task 6) must be typed
// against the generic PgDatabase, not against a concrete driver type.
export type TestDb = PgliteDatabase<typeof schema>;

export interface TestDbHandle {
  db: TestDb;
  close: () => Promise<void>;
}

// Resolved from this file, not from the cwd, so tests work no matter where
// vitest was started from.
const migrationsFolder = fileURLToPath(
  new URL("../../src/db/migrations", import.meta.url),
);

// Fresh in-memory Postgres per call, migrated with the real migration files
// from src/db/migrations (never pushSchema), so the migrations themselves are
// under test. Isolation: every handle is its own database; nothing is shared.
// PGlite is single-connection, so use one instance per test file.
export async function createTestDb(): Promise<TestDbHandle> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
