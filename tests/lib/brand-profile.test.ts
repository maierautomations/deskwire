import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Membership } from "@/db";
import { findMembership } from "@/db/memberships";
import { scopedDb } from "@/db/scoped";
import {
  BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE,
  BRAND_PROFILE_FORBIDDEN_MESSAGE,
  BRAND_PROFILE_NAME_INVALID_MESSAGE,
  createBrandProfileForMember,
  formatBrandProfileDate,
  type CreateBrandProfileDeps,
} from "@/lib/brand-profile";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants } from "../helpers/tenancy";

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

describe("createBrandProfileForMember", () => {
  it("creates the profile with the trimmed name and trimmed description", async () => {
    const requireMembership = vi.fn().mockResolvedValue(membershipRow());
    const createBrandProfile = vi.fn().mockResolvedValue({});

    const result = await createBrandProfileForMember(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        rawName: "  Hausstil Print ",
        rawDescription: "  Tonalität und Regeln für Print-Artikel ",
      },
      { requireMembership, createBrandProfile },
    );

    expect(result).toEqual({ status: "created" });
    expect(requireMembership).toHaveBeenCalledExactlyOnceWith(
      USER_ID,
      WORKSPACE_ID,
    );
    expect(createBrandProfile).toHaveBeenCalledExactlyOnceWith(WORKSPACE_ID, {
      name: "Hausstil Print",
      description: "Tonalität und Regeln für Print-Artikel",
    });
  });

  it.each([
    ["an empty string", ""],
    ["a whitespace-only string", "   "],
    ["a missing form field (null)", null],
    ["undefined", undefined],
  ])("normalizes %s description to null", async (_label, rawDescription) => {
    const requireMembership = vi.fn().mockResolvedValue(membershipRow());
    const createBrandProfile = vi.fn().mockResolvedValue({});

    const result = await createBrandProfileForMember(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        rawName: "Hausstil Print",
        rawDescription,
      },
      { requireMembership, createBrandProfile },
    );

    expect(result).toEqual({ status: "created" });
    expect(createBrandProfile).toHaveBeenCalledExactlyOnceWith(WORKSPACE_ID, {
      name: "Hausstil Print",
      description: null,
    });
  });

  it("accepts the boundary lengths (80-char name, 500-char description)", async () => {
    const requireMembership = vi.fn().mockResolvedValue(membershipRow());
    const createBrandProfile = vi.fn().mockResolvedValue({});

    const name = "x".repeat(80);
    const description = "y".repeat(500);
    const result = await createBrandProfileForMember(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        rawName: ` ${name} `,
        rawDescription: description,
      },
      { requireMembership, createBrandProfile },
    );

    expect(result).toEqual({ status: "created" });
    expect(createBrandProfile).toHaveBeenCalledExactlyOnceWith(WORKSPACE_ID, {
      name,
      description,
    });
  });

  it.each([
    ["an empty string", ""],
    ["a whitespace-only string", "   "],
    ["a too long value", "x".repeat(81)],
    ["a non-string value", 42],
  ])(
    "rejects %s as name with the German message without touching deps",
    async (_label, rawName) => {
      const requireMembership = vi.fn();
      const createBrandProfile = vi.fn();

      const result = await createBrandProfileForMember(
        {
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          rawName,
          rawDescription: "egal",
        },
        { requireMembership, createBrandProfile },
      );

      expect(result).toEqual({
        status: "invalid",
        message: BRAND_PROFILE_NAME_INVALID_MESSAGE,
      });
      expect(requireMembership).not.toHaveBeenCalled();
      expect(createBrandProfile).not.toHaveBeenCalled();
    },
  );

  it("rejects a description over 500 characters without touching deps", async () => {
    const requireMembership = vi.fn();
    const createBrandProfile = vi.fn();

    const result = await createBrandProfileForMember(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        rawName: "Hausstil Print",
        rawDescription: "y".repeat(501),
      },
      { requireMembership, createBrandProfile },
    );

    expect(result).toEqual({
      status: "invalid",
      message: BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE,
    });
    expect(requireMembership).not.toHaveBeenCalled();
    expect(createBrandProfile).not.toHaveBeenCalled();
  });

  it("returns forbidden for a non-member without creating anything", async () => {
    const requireMembership = vi.fn().mockResolvedValue(null);
    const createBrandProfile = vi.fn();

    const result = await createBrandProfileForMember(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        rawName: "Hausstil Print",
        rawDescription: null,
      },
      { requireMembership, createBrandProfile },
    );

    expect(result).toEqual({
      status: "forbidden",
      message: BRAND_PROFILE_FORBIDDEN_MESSAGE,
    });
    expect(createBrandProfile).not.toHaveBeenCalled();
  });

  it("lets unexpected database errors throw into central logging", async () => {
    const requireMembership = vi.fn().mockResolvedValue(membershipRow());
    const createBrandProfile = vi
      .fn()
      .mockRejectedValue(new Error("connection lost"));

    await expect(
      createBrandProfileForMember(
        {
          userId: USER_ID,
          workspaceId: WORKSPACE_ID,
          rawName: "Hausstil Print",
          rawDescription: null,
        },
        { requireMembership, createBrandProfile },
      ),
    ).rejects.toThrow("connection lost");
  });
});

// PGlite proof for the task-13 requirement "creating lands in the right
// workspace": the SAME core logic runs through the real chain (real
// requireWorkspaceMembership with a PGlite-bound membership lookup, real
// scoped create against the real migrations). The full isolation matrix
// (foreign list empty, foreign id null, ...) lives in the task-12 tenancy
// suite and is deliberately NOT duplicated here.
describe("createBrandProfileForMember against PGlite", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it("creates the profile stamped with the member's workspace id", async () => {
    const { a } = await seedTwoTenants(handle.db);
    const deps: CreateBrandProfileDeps = {
      requireMembership: (userId, workspaceId) =>
        requireWorkspaceMembership(userId, workspaceId, {
          getMembership: (u, w) => findMembership(handle.db, u, w),
        }),
      createBrandProfile: (workspaceId, data) =>
        scopedDb(handle.db, workspaceId).brandProfiles.create(data),
    };

    const result = await createBrandProfileForMember(
      {
        userId: a.user.id,
        workspaceId: a.workspace.id,
        rawName: "  Hausstil Print ",
        rawDescription: " Tonalität und Regeln für Print-Artikel ",
      },
      deps,
    );

    expect(result).toEqual({ status: "created" });
    const rows = await a.scope.brandProfiles.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId: a.workspace.id,
      name: "Hausstil Print",
      description: "Tonalität und Regeln für Print-Artikel",
    });
  });
});

describe("formatBrandProfileDate", () => {
  it("formats in German with the day pinned to Europe/Berlin", () => {
    // 23:30 UTC on New Year's Eve is already January 1st in Berlin — a UTC
    // server (Vercel) must not shift the shown day.
    expect(formatBrandProfileDate(new Date("2026-12-31T23:30:00Z"))).toBe(
      "1. Januar 2027",
    );
  });
});
