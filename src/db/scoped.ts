// All domain data access MUST go through these scoped helpers. Every query
// is hard-bound to one workspace id (tenant isolation, CLAUDE.md principle 3).
// App code obtains an instance via getScopedDb(workspaceId) from "@/db";
// importing the raw client outside src/db/** is an ESLint error.
//
// Typed against the generic PgDatabase (not a concrete driver type) so the
// same helpers run against the Neon app client and the PGlite test client.
import type { InferInsertModel } from "drizzle-orm";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { generateInviteToken, inviteExpiresAt } from "./invites";
import * as schema from "./schema";
import { brandProfiles, creditLedger, runs, workspaceInvites } from "./schema";

export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;

// workspaceId and id never come from the caller: the scope provides the
// workspace, the database generates the id.
export type NewBrandProfile = Omit<
  InferInsertModel<typeof brandProfiles>,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>;

export type NewRun = Omit<
  InferInsertModel<typeof runs>,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>;
export type Run = typeof runs.$inferSelect;

export type NewCreditLedgerEntry = Omit<
  InferInsertModel<typeof creditLedger>,
  "id" | "workspaceId" | "createdAt"
>;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;

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

    // Run metering records (task 16). Collection shape on purpose — create,
    // getById, list and nothing else: finishing a run (status, tokens, cost)
    // is a status transition and belongs to the phase-1 executor, not here.
    runs: {
      list: () =>
        db
          .select()
          .from(runs)
          .where(eq(runs.workspaceId, workspaceId))
          .orderBy(runs.createdAt),

      getById: async (id: string) => {
        const [row] = await db
          .select()
          .from(runs)
          .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)))
          .limit(1);
        return row ?? null;
      },

      create: async (data: NewRun) => {
        const [row] = await db
          .insert(runs)
          .values({ ...data, workspaceId })
          .returning();
        if (!row) {
          throw new Error("run insert returned no row");
        }
        return row;
      },
    },

    // Append-only credit ledger (task 16, phase-0 decision 30). Deliberately
    // NOT a collection: a ledger is appended to and summed, getById/list would
    // be invented surface without a phase-0 caller. book() is the single write
    // path, so the integrity guards live here: credits are non-zero integers
    // and a booking without a reason is meaningless. These are integrity
    // rules, not business rules — whether a booking may push the balance
    // negative is a phase-1 consumption decision (src/lib/billing/credits.ts).
    creditLedger: {
      book: async (entry: NewCreditLedgerEntry) => {
        if (!Number.isInteger(entry.delta) || entry.delta === 0) {
          throw new Error(
            `credit ledger delta must be a non-zero integer, got ${entry.delta}`,
          );
        }
        if (entry.reason.trim() === "") {
          throw new Error("credit ledger reason must not be empty");
        }
        const [row] = await db
          .insert(creditLedger)
          .values({ ...entry, workspaceId })
          .returning();
        if (!row) {
          throw new Error("credit ledger insert returned no row");
        }
        return row;
      },

      // The balance IS the sum — no stored balance column that could drift
      // (decision 30). SUM over zero rows is NULL in Postgres and int8 sums
      // arrive as strings from both drivers; coalesce plus the int4 cast
      // guarantees the JS number 0 for an empty ledger. int4 overflows past
      // ~2.1e9 credits, far beyond any real balance, and would fail loudly,
      // never silently.
      balance: async () => {
        const [row] = await db
          .select({
            total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int`,
          })
          .from(creditLedger)
          .where(eq(creditLedger.workspaceId, workspaceId));
        return row?.total ?? 0;
      },
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
