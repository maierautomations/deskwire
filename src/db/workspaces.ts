// Deliberately unscoped: this helper CREATES the tenant, so no workspace
// scope can exist yet. Unscoped access lives only inside src/db/**
// (phase-0 decision no. 23); app code goes through the bound entry point
// in src/db/index.ts.
//
// Typed against the generic DbClient so the same code runs on the Neon app
// client and the PGlite test client (task-5 finding). db.transaction, never
// db.batch: batch only exists on neon-http and would break PGlite parity.
import { memberships, workspaces } from "./schema";
import type { DbClient } from "./scoped";

export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;

export interface CreateWorkspaceWithOwnerParams {
  name: string;
  userId: string;
}

export interface CreateWorkspaceWithOwnerResult {
  workspace: Workspace;
  membership: Membership;
}

// Workspace and owner membership are one atomic unit: a workspace without an
// owner would be unreachable for everyone, so both rows commit together or
// not at all.
export async function createWorkspaceWithOwner(
  db: DbClient,
  { name, userId }: CreateWorkspaceWithOwnerParams,
): Promise<CreateWorkspaceWithOwnerResult> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name })
      .returning();
    if (!workspace) {
      throw new Error("workspace insert returned no row");
    }
    const [membership] = await tx
      .insert(memberships)
      .values({ userId, workspaceId: workspace.id, role: "owner" })
      .returning();
    if (!membership) {
      throw new Error("membership insert returned no row");
    }
    return { workspace, membership };
  });
}
