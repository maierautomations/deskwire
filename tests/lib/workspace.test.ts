import { describe, expect, it, vi } from "vitest";

import type { Membership } from "@/db";
import {
  createWorkspaceForUser,
  parseWorkspaceName,
  postLoginSurface,
  requireWorkspaceMembership,
  WORKSPACE_NAME_INVALID_MESSAGE,
} from "@/lib/workspace";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function membershipRow(): Membership {
  return {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role: "member",
    createdAt: new Date("2026-07-27T00:00:00Z"),
    updatedAt: new Date("2026-07-27T00:00:00Z"),
  };
}

describe("parseWorkspaceName", () => {
  it("accepts a valid name and trims it", () => {
    expect(parseWorkspaceName("  Redaktion Nord ")).toEqual({
      ok: true,
      name: "Redaktion Nord",
    });
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["too long", "x".repeat(81)],
    ["non-string", null],
  ])("rejects %s with the German message", (_label, value) => {
    expect(parseWorkspaceName(value)).toEqual({
      ok: false,
      message: WORKSPACE_NAME_INVALID_MESSAGE,
    });
  });

  it("accepts exactly 80 characters after trimming", () => {
    const name = "x".repeat(80);
    expect(parseWorkspaceName(` ${name} `)).toEqual({ ok: true, name });
  });
});

describe("postLoginSurface", () => {
  // Loop-freeness invariant (task 10b): /start redirects to /onboarding
  // exactly when this returns "onboarding"; /onboarding itself never
  // redirects — it also serves members creating another workspace (operator
  // decision, deviating from the original 10b wording). Because only ONE of
  // the two surfaces ever redirects and it branches on this single function,
  // a redirect cycle between them is structurally impossible. If /onboarding
  // ever gets a redirect again, it must branch on this same function.
  it("sends a user without memberships to onboarding", () => {
    expect(postLoginSurface(0)).toBe("onboarding");
  });

  it.each([[1], [2], [7]])(
    "keeps a user with %i workspace(s) on the start list",
    (count) => {
      expect(postLoginSurface(count)).toBe("start");
    },
  );
});

describe("requireWorkspaceMembership", () => {
  it("returns the membership for a member", async () => {
    const row = membershipRow();
    const getMembership = vi.fn().mockResolvedValue(row);

    const result = await requireWorkspaceMembership(USER_ID, WORKSPACE_ID, {
      getMembership,
    });

    expect(result).toBe(row);
    expect(getMembership).toHaveBeenCalledExactlyOnceWith(
      USER_ID,
      WORKSPACE_ID,
    );
  });

  it("returns null for a non-member, never false, never a throw", async () => {
    const getMembership = vi.fn().mockResolvedValue(null);

    await expect(
      requireWorkspaceMembership(USER_ID, WORKSPACE_ID, { getMembership }),
    ).resolves.toBeNull();
  });

  it.each([
    ["arbitrary URL segment", "mein-workspace"],
    ["empty string", ""],
    ["almost a uuid", "22222222-2222-4222-8222-22222222222x"],
    ["SQL-ish input", "' or 1=1 --"],
  ])(
    "returns null for %s without touching the database",
    async (_label, workspaceId) => {
      const getMembership = vi.fn().mockResolvedValue(membershipRow());

      await expect(
        requireWorkspaceMembership(USER_ID, workspaceId, { getMembership }),
      ).resolves.toBeNull();
      expect(getMembership).not.toHaveBeenCalled();
    },
  );
});

describe("createWorkspaceForUser", () => {
  it("creates the workspace with the trimmed name and returns its id", async () => {
    const createWorkspaceAsOwner = vi.fn().mockResolvedValue({
      workspace: { id: WORKSPACE_ID, name: "Redaktion Nord" },
      membership: membershipRow(),
    });

    const result = await createWorkspaceForUser(
      { userId: USER_ID, rawName: "  Redaktion Nord " },
      { createWorkspaceAsOwner },
    );

    expect(result).toEqual({ status: "created", workspaceId: WORKSPACE_ID });
    expect(createWorkspaceAsOwner).toHaveBeenCalledExactlyOnceWith({
      name: "Redaktion Nord",
      userId: USER_ID,
    });
  });

  it("returns the invalid state without calling the dep", async () => {
    const createWorkspaceAsOwner = vi.fn();

    const result = await createWorkspaceForUser(
      { userId: USER_ID, rawName: "   " },
      { createWorkspaceAsOwner },
    );

    expect(result).toEqual({
      status: "invalid",
      message: WORKSPACE_NAME_INVALID_MESSAGE,
    });
    expect(createWorkspaceAsOwner).not.toHaveBeenCalled();
  });

  it("lets unexpected database errors throw into central logging", async () => {
    const createWorkspaceAsOwner = vi
      .fn()
      .mockRejectedValue(new Error("connection lost"));

    await expect(
      createWorkspaceForUser(
        { userId: USER_ID, rawName: "Redaktion Nord" },
        { createWorkspaceAsOwner },
      ),
    ).rejects.toThrow("connection lost");
  });
});
