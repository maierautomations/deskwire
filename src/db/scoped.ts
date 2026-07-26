// All domain data access MUST go through these scoped helpers. Every query
// is hard-bound to one workspace id (tenant isolation, CLAUDE.md principle 3).
// App code obtains an instance via getScopedDb(workspaceId) from "@/db";
// importing the raw client outside src/db/** is an ESLint error.
//
// Typed against the generic PgDatabase (not a concrete driver type) so the
// same helpers run against the Neon app client and the PGlite test client.
import type { InferInsertModel } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema";
import { brandProfiles } from "./schema";

export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;

// workspaceId and id never come from the caller: the scope provides the
// workspace, the database generates the id.
export type NewBrandProfile = Omit<
  InferInsertModel<typeof brandProfiles>,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>;

export function scopedDb(db: DbClient, workspaceId: string) {
  return {
    workspaceId,
    brandProfiles: {
      list: () =>
        db
          .select()
          .from(brandProfiles)
          .where(eq(brandProfiles.workspaceId, workspaceId))
          .orderBy(brandProfiles.createdAt),

      getById: async (id: string) => {
        const [row] = await db
          .select()
          .from(brandProfiles)
          .where(
            and(
              eq(brandProfiles.id, id),
              eq(brandProfiles.workspaceId, workspaceId),
            ),
          )
          .limit(1);
        return row ?? null;
      },

      create: async (data: NewBrandProfile) => {
        const [row] = await db
          .insert(brandProfiles)
          .values({ ...data, workspaceId })
          .returning();
        if (!row) {
          throw new Error("brand profile insert returned no row");
        }
        return row;
      },
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
