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

import { generateInviteToken, inviteExpiresAt } from "./invites";
import * as schema from "./schema";
import { brandProfiles, workspaceInvites } from "./schema";

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

    // The workspace's single invite link (phase-0 decision no. 22). Reads may
    // return an expired row on purpose: the settings page shows "abgelaufen"
    // instead of pretending no link exists. Validity checks belong to the
    // redemption path (findValidInviteByToken).
    invites: {
      get: async () => {
        const [row] = await db
          .select()
          .from(workspaceInvites)
          .where(eq(workspaceInvites.workspaceId, workspaceId))
          .limit(1);
        return row ?? null;
      },

      // Create and renew are ONE race-safe upsert on the workspace_id primary
      // key. Renewing replaces the token, which invalidates the previous link
      // no matter who created it. updatedAt is set explicitly: drizzle's
      // $onUpdate only fires on update(), not inside onConflictDoUpdate.
      regenerate: async ({ createdBy }: { createdBy: string }) => {
        const token = generateInviteToken();
        const expiresAt = inviteExpiresAt(new Date());
        const [row] = await db
          .insert(workspaceInvites)
          .values({ workspaceId, token, expiresAt, createdBy })
          .onConflictDoUpdate({
            target: workspaceInvites.workspaceId,
            set: { token, expiresAt, createdBy, updatedAt: new Date() },
          })
          .returning();
        if (!row) {
          throw new Error("workspace invite upsert returned no row");
        }
        return row;
      },
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
