// Deliberately unscoped: redemption happens BEFORE membership exists, and the
// workspace_id is unknown until the token lookup — there is no scope this
// query could be asked with. Unscoped access lives only inside src/db/**
// (phase-0 decision no. 23); app code goes through the bound entry points in
// src/db/index.ts. Creating and renewing a link, by contrast, ARE scoped and
// live in scoped.ts.
//
// Typed against the generic DbClient so the same code runs on the Neon app
// client and the PGlite test client (task-5 finding).
import { randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { workspaceInvites } from "./schema";
import type { DbClient } from "./scoped";

export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;

// 32 random bytes = 256 bits of entropy, base64url-encoded to 43 URL-safe
// characters (A-Za-z0-9_-, no padding). Unguessable; the redemption lookup
// runs over the unique index on token.
export const INVITE_TOKEN_BYTES = 32;
export const INVITE_TOKEN_LENGTH = 43;

export const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

export function inviteExpiresAt(from: Date): Date {
  return new Date(from.getTime() + INVITE_TTL_MS);
}

// Expired and unknown tokens are deliberately indistinguishable (one null,
// one German error page): the redeemer gets no oracle about which tokens
// exist. `now` is a parameter so expiry is testable without clock mocking.
export async function findValidInviteByToken(
  db: DbClient,
  token: string,
  now: Date,
): Promise<WorkspaceInvite | null> {
  const [row] = await db
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.token, token),
        gt(workspaceInvites.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}
