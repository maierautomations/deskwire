import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  findValidInviteByToken,
  generateInviteToken,
  INVITE_TOKEN_LENGTH,
  INVITE_TTL_DAYS,
} from "@/db/invites";
import {
  createMembershipFromInvite,
  findMembership,
} from "@/db/memberships";
import { memberships, users, workspaceInvites } from "@/db/schema";
import { scopedDb } from "@/db/scoped";
import { createWorkspaceWithOwner } from "@/db/workspaces";

import {
  createTestDb,
  messageChain,
  type TestDbHandle,
} from "../helpers/db";

// One PGlite instance per test file (single-connection), migrated with the
// real migration files — migration 0003 itself is under test here.
let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

async function createUser(email: string) {
  const [user] = await handle.db.insert(users).values({ email }).returning();
  if (!user) throw new Error("user insert returned no row");
  return user;
}

async function createWorkspace(name: string, ownerId: string) {
  const { workspace } = await createWorkspaceWithOwner(handle.db, {
    name,
    userId: ownerId,
  });
  return workspace;
}

const TOKEN_SHAPE = new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`);

describe("scopedDb invites", () => {
  it("regenerate creates the workspace's invite with token shape and 7-day expiry", async () => {
    const owner = await createUser("invite-owner@example.com");
    const workspace = await createWorkspace("Invite-Test", owner.id);

    const before = Date.now();
    const invite = await scopedDb(handle.db, workspace.id).invites.regenerate({
      createdBy: owner.id,
    });
    const after = Date.now();

    expect(invite.workspaceId).toBe(workspace.id);
    expect(invite.token).toMatch(TOKEN_SHAPE);
    expect(invite.createdBy).toBe(owner.id);

    const ttlMs = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
    expect(invite.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + ttlMs,
    );
    expect(invite.expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMs);
  });

  it("get returns only the scope's own invite", async () => {
    const owner = await createUser("scope-a@example.com");
    const other = await createUser("scope-b@example.com");
    const workspaceA = await createWorkspace("Scope A", owner.id);
    const workspaceB = await createWorkspace("Scope B", other.id);

    const created = await scopedDb(handle.db, workspaceA.id).invites.regenerate(
      { createdBy: owner.id },
    );

    const gotA = await scopedDb(handle.db, workspaceA.id).invites.get();
    expect(gotA?.token).toBe(created.token);

    expect(await scopedDb(handle.db, workspaceB.id).invites.get()).toBeNull();
  });

  it("regenerate replaces the single row: old token dead, count stays one", async () => {
    const owner = await createUser("renew@example.com");
    const workspace = await createWorkspace("Erneuern", owner.id);
    const scoped = scopedDb(handle.db, workspace.id);

    const first = await scoped.invites.regenerate({ createdBy: owner.id });
    const second = await scoped.invites.regenerate({ createdBy: owner.id });
    expect(second.token).not.toBe(first.token);

    const rows = await handle.db
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.workspaceId, workspace.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token).toBe(second.token);

    const now = new Date();
    expect(
      await findValidInviteByToken(handle.db, first.token, now),
    ).toBeNull();
    expect(
      (await findValidInviteByToken(handle.db, second.token, now))
        ?.workspaceId,
    ).toBe(workspace.id);
  });

  it("rejects the same token for a second workspace (unique lookup index)", async () => {
    const owner = await createUser("unique-a@example.com");
    const other = await createUser("unique-b@example.com");
    const workspaceA = await createWorkspace("Unique A", owner.id);
    const workspaceB = await createWorkspace("Unique B", other.id);

    const invite = await scopedDb(handle.db, workspaceA.id).invites.regenerate(
      { createdBy: owner.id },
    );

    await expect(
      handle.db.insert(workspaceInvites).values({
        workspaceId: workspaceB.id,
        token: invite.token,
        expiresAt: new Date(Date.now() + 1000 * 60),
      }),
    ).rejects.toSatisfy((err: unknown) =>
      messageChain(err).includes("duplicate key"),
    );
  });
});

describe("findValidInviteByToken", () => {
  it("returns null for an unknown token", async () => {
    expect(
      await findValidInviteByToken(
        handle.db,
        generateInviteToken(),
        new Date(),
      ),
    ).toBeNull();
  });

  it("returns null for an expired invite and finds it again after renewal", async () => {
    const owner = await createUser("expired@example.com");
    const workspace = await createWorkspace("Abgelaufen", owner.id);
    const scoped = scopedDb(handle.db, workspace.id);
    const invite = await scoped.invites.regenerate({ createdBy: owner.id });

    // Fixture, not clock mocking: expiry sits in the past relative to `now`.
    await handle.db
      .update(workspaceInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(workspaceInvites.workspaceId, workspace.id));

    expect(
      await findValidInviteByToken(handle.db, invite.token, new Date()),
    ).toBeNull();

    const renewed = await scoped.invites.regenerate({ createdBy: owner.id });
    expect(
      (await findValidInviteByToken(handle.db, renewed.token, new Date()))
        ?.workspaceId,
    ).toBe(workspace.id);
  });
});

describe("createMembershipFromInvite", () => {
  it("creates a member membership in the right workspace, idempotently", async () => {
    const owner = await createUser("join-owner@example.com");
    const joiner = await createUser("join-member@example.com");
    const workspace = await createWorkspace("Beitritt", owner.id);

    const created = await createMembershipFromInvite(handle.db, {
      userId: joiner.id,
      workspaceId: workspace.id,
    });
    expect(created?.role).toBe("member");

    // Second redemption: no error, no second row, role untouched.
    const repeat = await createMembershipFromInvite(handle.db, {
      userId: joiner.id,
      workspaceId: workspace.id,
    });
    expect(repeat).toBeNull();

    const rows = await handle.db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, workspace.id));
    expect(rows).toHaveLength(2); // owner + joiner
    expect(
      (await findMembership(handle.db, joiner.id, workspace.id))?.role,
    ).toBe("member");
  });

  it("keeps the owner an owner when redeeming their own workspace's invite", async () => {
    const owner = await createUser("own-invite@example.com");
    const workspace = await createWorkspace("Eigener Link", owner.id);

    const result = await createMembershipFromInvite(handle.db, {
      userId: owner.id,
      workspaceId: workspace.id,
    });
    expect(result).toBeNull();

    const membership = await findMembership(handle.db, owner.id, workspace.id);
    expect(membership?.role).toBe("owner");

    const rows = await handle.db
      .select()
      .from(memberships)
      .where(eq(memberships.workspaceId, workspace.id));
    expect(rows).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  it("a workspace-A token never grants access to workspace B", async () => {
    const ownerA = await createUser("tenant-a@example.com");
    const ownerB = await createUser("tenant-b@example.com");
    const joiner = await createUser("tenant-joiner@example.com");
    const workspaceA = await createWorkspace("Tenant A", ownerA.id);
    const workspaceB = await createWorkspace("Tenant B", ownerB.id);

    const inviteA = await scopedDb(handle.db, workspaceA.id).invites.regenerate(
      { createdBy: ownerA.id },
    );
    const inviteB = await scopedDb(handle.db, workspaceB.id).invites.regenerate(
      { createdBy: ownerB.id },
    );

    // The token lookup resolves to A and only A.
    const resolved = await findValidInviteByToken(
      handle.db,
      inviteA.token,
      new Date(),
    );
    expect(resolved?.workspaceId).toBe(workspaceA.id);
    expect(resolved?.workspaceId).not.toBe(workspaceB.id);

    // Redeeming A's token (the full flow: lookup result feeds the write)
    // creates a membership in A and leaves B untouched.
    await createMembershipFromInvite(handle.db, {
      userId: joiner.id,
      workspaceId: resolved?.workspaceId ?? "",
    });
    expect(
      (await findMembership(handle.db, joiner.id, workspaceA.id))?.role,
    ).toBe("member");
    expect(await findMembership(handle.db, joiner.id, workspaceB.id)).toBeNull();

    // Regenerating A's link never touches B's invite row.
    await scopedDb(handle.db, workspaceA.id).invites.regenerate({
      createdBy: ownerA.id,
    });
    const inviteBAfter = await scopedDb(
      handle.db,
      workspaceB.id,
    ).invites.get();
    expect(inviteBAfter?.token).toBe(inviteB.token);
  });
});
