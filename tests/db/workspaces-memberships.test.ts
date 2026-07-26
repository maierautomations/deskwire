import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findMembership, listWorkspacesForUser } from "@/db/memberships";
import { memberships, users, workspaces } from "@/db/schema";
import { createWorkspaceWithOwner } from "@/db/workspaces";

import {
  createTestDb,
  messageChain,
  type TestDbHandle,
} from "../helpers/db";

// One PGlite instance per test file (single-connection), migrated with the
// real migration files — migration 0002 itself is under test here.
let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

async function createUser(email: string) {
  const [user] = await handle.db
    .insert(users)
    .values({ email })
    .returning();
  if (!user) throw new Error("user insert returned no row");
  return user;
}

describe("createWorkspaceWithOwner", () => {
  it("creates workspace and owner membership together", async () => {
    const user = await createUser("owner@example.com");
    const { workspace, membership } = await createWorkspaceWithOwner(
      handle.db,
      { name: "Redaktion Nord", userId: user.id },
    );

    expect(workspace.name).toBe("Redaktion Nord");
    expect(membership.workspaceId).toBe(workspace.id);
    expect(membership.userId).toBe(user.id);
    expect(membership.role).toBe("owner");

    const stored = await handle.db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, workspace.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.role).toBe("owner");
  });

  it("rolls back the workspace when the membership insert fails", async () => {
    const before = await handle.db.select().from(workspaces);

    // Non-existent user id: the membership insert violates its FK inside the
    // transaction, so the already-inserted workspace row must vanish too.
    const missingUserId = "00000000-0000-0000-0000-000000000000";
    await expect(
      createWorkspaceWithOwner(handle.db, {
        name: "Verwaister Workspace",
        userId: missingUserId,
      }),
    ).rejects.toSatisfy((err: unknown) =>
      messageChain(err).includes("foreign key constraint"),
    );

    const after = await handle.db.select().from(workspaces);
    expect(after).toHaveLength(before.length);
    expect(after.map((w) => w.name)).not.toContain("Verwaister Workspace");
  });

  it("rejects a second membership for the same user and workspace", async () => {
    const user = await createUser("duplicate@example.com");
    const { workspace } = await createWorkspaceWithOwner(handle.db, {
      name: "Doppel-Test",
      userId: user.id,
    });

    await expect(
      handle.db
        .insert(memberships)
        .values({ userId: user.id, workspaceId: workspace.id, role: "member" }),
    ).rejects.toSatisfy((err: unknown) =>
      messageChain(err).includes("duplicate key"),
    );
  });

  it("cascades membership deletion from both sides", async () => {
    const workspaceSideUser = await createUser("cascade-ws@example.com");
    const userSideUser = await createUser("cascade-user@example.com");
    const { workspace: wsA } = await createWorkspaceWithOwner(handle.db, {
      name: "Cascade A",
      userId: workspaceSideUser.id,
    });
    const { workspace: wsB } = await createWorkspaceWithOwner(handle.db, {
      name: "Cascade B",
      userId: userSideUser.id,
    });

    await handle.db.delete(workspaces).where(eq(workspaces.id, wsA.id));
    expect(
      await findMembership(handle.db, workspaceSideUser.id, wsA.id),
    ).toBeNull();

    await handle.db.delete(users).where(eq(users.id, userSideUser.id));
    expect(
      await findMembership(handle.db, userSideUser.id, wsB.id),
    ).toBeNull();
  });
});

describe("listWorkspacesForUser", () => {
  it("lists exactly the user's workspaces, oldest membership first", async () => {
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");

    const { workspace: first } = await createWorkspaceWithOwner(handle.db, {
      name: "Alice Eins",
      userId: alice.id,
    });
    const { workspace: second } = await createWorkspaceWithOwner(handle.db, {
      name: "Alice Zwei",
      userId: alice.id,
    });
    const { workspace: foreign } = await createWorkspaceWithOwner(handle.db, {
      name: "Bob Fremd",
      userId: bob.id,
    });

    const listed = await listWorkspacesForUser(handle.db, alice.id);
    expect(listed.map((entry) => entry.workspace.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(listed.map((entry) => entry.role)).toEqual(["owner", "owner"]);
    expect(listed.map((entry) => entry.workspace.id)).not.toContain(
      foreign.id,
    );
  });

  it("returns an empty list for a user without memberships", async () => {
    const loner = await createUser("loner@example.com");
    expect(await listWorkspacesForUser(handle.db, loner.id)).toEqual([]);
  });
});

describe("findMembership", () => {
  it("returns the membership with role for a member", async () => {
    const member = await createUser("member@example.com");
    const { workspace } = await createWorkspaceWithOwner(handle.db, {
      name: "Mitglieder-Test",
      userId: member.id,
    });

    const found = await findMembership(handle.db, member.id, workspace.id);
    expect(found).not.toBeNull();
    expect(found?.role).toBe("owner");
    expect(found?.workspaceId).toBe(workspace.id);
  });

  it("returns null for a non-member", async () => {
    const outsider = await createUser("outsider@example.com");
    const insider = await createUser("insider@example.com");
    const { workspace } = await createWorkspaceWithOwner(handle.db, {
      name: "Fremder Workspace",
      userId: insider.id,
    });

    expect(
      await findMembership(handle.db, outsider.id, workspace.id),
    ).toBeNull();
  });
});
