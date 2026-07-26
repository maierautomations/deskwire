// Deliberately unscoped: these reads ESTABLISH tenancy ("which workspaces
// does this user belong to") before any workspace scope exists. They live
// only inside src/db/** (phase-0 decision no. 23); app code goes through the
// bound entry points in src/db/index.ts.
//
// Typed against the generic DbClient so the same code runs on the Neon app
// client and the PGlite test client (task-5 finding).
import { and, eq } from "drizzle-orm";

import { memberships, workspaces } from "./schema";
import type { DbClient } from "./scoped";
import type { Membership, Workspace } from "./workspaces";

export interface WorkspaceForUser {
  workspace: Workspace;
  role: Membership["role"];
}

export async function listWorkspacesForUser(
  db: DbClient,
  userId: string,
): Promise<WorkspaceForUser[]> {
  return db
    .select({ workspace: workspaces, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt);
}

export async function findMembership(
  db: DbClient,
  userId: string,
  workspaceId: string,
): Promise<Membership | null> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}
