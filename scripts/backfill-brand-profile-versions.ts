// Operator tool (task 19). Gives every brand profile that predates profile
// versioning its version 1, computed from the profile's CURRENT state with the
// real snapshot and hash code — never a second implementation.
//
//   node --import ./scripts/ts-resolve.mjs \
//     --env-file=.env --env-file=.env.local \
//     scripts/backfill-brand-profile-versions.ts
//
// Reads DATABASE_URL_UNPOOLED (the same direct connection the migrations use)
// and PRINTS THE HOST before writing anything: running it against production
// is a deliberate operator act, so it must be visible which database is meant.
// Idempotent: a second run writes nothing (backfillMissingFirstVersions only
// looks at profiles without any version, and its insert additionally does
// nothing on a unique-constraint hit).
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { backfillMissingFirstVersions } from "@/db/brand-profiles";
import * as schema from "@/db/schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is missing. Run with --env-file=.env --env-file=.env.local",
  );
}

console.log(`database host: ${new URL(connectionString).host}`);

const pool = new Pool({ connectionString });
try {
  const db = drizzle({ client: pool, schema });
  const backfilled = await backfillMissingFirstVersions(db);
  if (backfilled.length === 0) {
    console.log("nothing to do: every brand profile already has a version");
  } else {
    console.log(`backfilled ${backfilled.length} profile(s) with version 1:`);
    for (const entry of backfilled) {
      console.log(`  ${entry.profileId}  ${entry.name}`);
    }
  }
} finally {
  await pool.end();
}
