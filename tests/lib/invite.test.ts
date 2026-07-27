import { describe, expect, it, vi } from "vitest";

import type { WorkspaceInvite } from "@/db";
import {
  formatInviteExpiry,
  isInviteExpired,
  parseInviteToken,
  redeemInvite,
  type RedeemInviteDeps,
} from "@/lib/invite";

const VALID_TOKEN = "A".repeat(43);
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function invite(overrides: Partial<WorkspaceInvite> = {}): WorkspaceInvite {
  return {
    workspaceId: WORKSPACE_ID,
    token: VALID_TOKEN,
    expiresAt: new Date(Date.now() + 1000 * 60),
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeDeps(
  found: WorkspaceInvite | null,
): RedeemInviteDeps & {
  getValidInvite: ReturnType<typeof vi.fn>;
  joinWorkspaceAsMember: ReturnType<typeof vi.fn>;
} {
  return {
    getValidInvite: vi.fn().mockResolvedValue(found),
    joinWorkspaceAsMember: vi.fn().mockResolvedValue(null),
  };
}

describe("parseInviteToken", () => {
  it("accepts exactly the generator's shape", () => {
    expect(parseInviteToken("Ab9_-".padEnd(43, "x"))).toBe(
      "Ab9_-".padEnd(43, "x"),
    );
  });

  it.each([
    ["too short", "A".repeat(42)],
    ["too long", "A".repeat(44)],
    ["standard base64 chars", `${"A".repeat(41)}+/`],
    ["path traversal", "../".repeat(14) + "x"],
    ["empty string", ""],
    ["a uuid", WORKSPACE_ID],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(parseInviteToken(value)).toBeNull();
  });
});

describe("redeemInvite", () => {
  it("rejects a malformed token WITHOUT any database roundtrip", async () => {
    const deps = fakeDeps(invite());
    const result = await redeemInvite(
      { userId: "user-1", token: "kaputt" },
      deps,
    );
    expect(result).toEqual({ status: "invalid" });
    expect(deps.getValidInvite).not.toHaveBeenCalled();
    expect(deps.joinWorkspaceAsMember).not.toHaveBeenCalled();
  });

  it("returns invalid for unknown or expired tokens without joining", async () => {
    const deps = fakeDeps(null);
    const result = await redeemInvite(
      { userId: "user-1", token: VALID_TOKEN },
      deps,
    );
    expect(result).toEqual({ status: "invalid" });
    expect(deps.getValidInvite).toHaveBeenCalledWith(
      VALID_TOKEN,
      expect.any(Date),
    );
    expect(deps.joinWorkspaceAsMember).not.toHaveBeenCalled();
  });

  it("joins with the workspaceId FROM THE INVITE ROW, never from input", async () => {
    const deps = fakeDeps(invite());
    const result = await redeemInvite(
      { userId: "user-1", token: VALID_TOKEN },
      deps,
    );
    expect(result).toEqual({ status: "joined", workspaceId: WORKSPACE_ID });
    expect(deps.joinWorkspaceAsMember).toHaveBeenCalledExactlyOnceWith({
      userId: "user-1",
      workspaceId: WORKSPACE_ID,
    });
  });

  it("reports joined for existing members too (idempotent redirect path)", async () => {
    // joinWorkspaceAsMember returns null when the membership already existed
    // (including owners); the flow result is identical.
    const deps = fakeDeps(invite());
    deps.joinWorkspaceAsMember.mockResolvedValue(null);
    const result = await redeemInvite(
      { userId: "user-1", token: VALID_TOKEN },
      deps,
    );
    expect(result).toEqual({ status: "joined", workspaceId: WORKSPACE_ID });
  });

  it("lets unexpected database errors throw into central logging", async () => {
    const deps = fakeDeps(invite());
    deps.getValidInvite.mockRejectedValue(new Error("connection lost"));
    await expect(
      redeemInvite({ userId: "user-1", token: VALID_TOKEN }, deps),
    ).rejects.toThrow("connection lost");
  });
});

describe("isInviteExpired", () => {
  it("treats a future expiry as valid and a past one as expired", () => {
    expect(
      isInviteExpired({ expiresAt: new Date(Date.now() + 60_000) }),
    ).toBe(false);
    expect(
      isInviteExpired({ expiresAt: new Date(Date.now() - 60_000) }),
    ).toBe(true);
  });
});

describe("formatInviteExpiry", () => {
  it("renders German date and time pinned to Europe/Berlin", () => {
    // 12:32 UTC in August = 14:32 in Berlin (CEST): the pinned time zone must
    // hold no matter where the server runs.
    expect(formatInviteExpiry(new Date("2026-08-03T12:32:00Z"))).toBe(
      "3. August 2026, 14:32 Uhr",
    );
  });
});
