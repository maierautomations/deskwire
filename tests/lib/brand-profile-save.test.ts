import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { BrandProfile, Membership } from "@/db";
import { findMembership } from "@/db/memberships";
import { scopedDb } from "@/db/scoped";
import {
  BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE,
  BRAND_PROFILE_FORBIDDEN_MESSAGE,
  BRAND_PROFILE_NAME_INVALID_MESSAGE,
} from "@/lib/brand-profile/input";
import {
  saveBrandProfile,
  BRAND_PROFILE_AKTIV_INVALID_MESSAGE,
  BRAND_PROFILE_FIELDS_INVALID_MESSAGE,
  BRAND_PROFILE_NOT_FOUND_MESSAGE,
  type SaveBrandProfileDeps,
} from "@/lib/brand-profile/save";
import { emptyBrandProfileFields } from "@/lib/brand-profile/schema";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { FULL_BRAND_PROFILE_FIELDS } from "../fixtures/brand-profile";
import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants } from "../helpers/tenancy";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";

function membershipRow(): Membership {
  return {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role: "member",
    createdAt: new Date("2026-07-28T00:00:00Z"),
    updatedAt: new Date("2026-07-28T00:00:00Z"),
  };
}

// The written row as the db layer returns it. saveBrandProfile only reads its
// version number, but the type is the real one, so a schema change shows up
// here instead of hiding behind a partial literal.
function savedProfileRow(): BrandProfile {
  return {
    id: PROFILE_ID,
    workspaceId: WORKSPACE_ID,
    name: "Hausstil",
    description: null,
    fields: {},
    aktiv: true,
    createdAt: new Date("2026-07-28T00:00:00Z"),
    updatedAt: new Date("2026-07-29T00:00:00Z"),
  };
}

// Fake deps with a stored field set of the caller's choosing. The default is
// the phase-0 stub shape (`{}`), because that is what every existing row
// carries until its first editor save.
function fakeDeps(
  overrides: {
    membership?: Membership | null;
    stored?: Record<string, unknown> | null;
    result?: Awaited<ReturnType<SaveBrandProfileDeps["saveBrandProfileRow"]>>;
  } = {},
) {
  const requireMembership = vi
    .fn()
    .mockResolvedValue(
      overrides.membership === undefined ? membershipRow() : overrides.membership,
    );
  const getBrandProfile = vi
    .fn()
    .mockResolvedValue(
      overrides.stored === null ? null : { fields: overrides.stored ?? {} },
    );
  const saveBrandProfileRow = vi
    .fn()
    .mockResolvedValue(
      overrides.result ?? {
        status: "saved",
        profile: savedProfileRow(),
        version: 2,
      },
    );
  return { requireMembership, getBrandProfile, saveBrandProfileRow };
}

function input(overrides: Partial<Parameters<typeof saveBrandProfile>[0]> = {}) {
  return {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    brandProfileId: PROFILE_ID,
    rawName: "Hausstil",
    rawDescription: null,
    rawAktiv: true,
    rawFields: {},
    ...overrides,
  };
}

describe("saveBrandProfile: everything decidable without the database", () => {
  it.each([
    ["a non-uuid string", "nicht-uuid"],
    ["an empty string", ""],
    ["a number", 42],
  ])(
    "answers not_found for %s as profile id without touching any dep",
    async (_label, brandProfileId) => {
      const deps = fakeDeps();
      const result = await saveBrandProfile(
        input({ brandProfileId: String(brandProfileId) }),
        deps,
      );

      expect(result).toEqual({
        status: "not_found",
        message: BRAND_PROFILE_NOT_FOUND_MESSAGE,
      });
      expect(deps.requireMembership).not.toHaveBeenCalled();
      expect(deps.getBrandProfile).not.toHaveBeenCalled();
      expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an empty name", { rawName: "   " }, BRAND_PROFILE_NAME_INVALID_MESSAGE],
    [
      "a name over 80 characters",
      { rawName: "x".repeat(81) },
      BRAND_PROFILE_NAME_INVALID_MESSAGE,
    ],
    [
      "a description over 500 characters",
      { rawDescription: "y".repeat(501) },
      BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE,
    ],
    [
      "a checkbox string instead of a boolean",
      { rawAktiv: "on" },
      BRAND_PROFILE_AKTIV_INVALID_MESSAGE,
    ],
    [
      "a missing aktiv value",
      { rawAktiv: undefined },
      BRAND_PROFILE_AKTIV_INVALID_MESSAGE,
    ],
    [
      "a fields patch that is not an object",
      { rawFields: "zielgruppe=alle" },
      BRAND_PROFILE_FIELDS_INVALID_MESSAGE,
    ],
    [
      "a fields patch that is an array",
      { rawFields: [] },
      BRAND_PROFILE_FIELDS_INVALID_MESSAGE,
    ],
    [
      "an unknown group in the fields patch",
      { rawFields: { zielgrupe: "Tippfehler" } },
      BRAND_PROFILE_FIELDS_INVALID_MESSAGE,
    ],
  ])("rejects %s before the database is touched", async (_label, patch, message) => {
    const deps = fakeDeps();
    const result = await saveBrandProfile(input(patch), deps);

    expect(result).toEqual({ status: "invalid", message });
    expect(deps.requireMembership).not.toHaveBeenCalled();
    expect(deps.getBrandProfile).not.toHaveBeenCalled();
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });
});

describe("saveBrandProfile: gates", () => {
  it("answers forbidden for a non-member and reads nothing", async () => {
    const deps = fakeDeps({ membership: null });
    const result = await saveBrandProfile(input(), deps);

    expect(result).toEqual({
      status: "forbidden",
      message: BRAND_PROFILE_FORBIDDEN_MESSAGE,
    });
    expect(deps.getBrandProfile).not.toHaveBeenCalled();
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });

  it("answers not_found for a profile the scope does not know", async () => {
    const deps = fakeDeps({ stored: null });
    const result = await saveBrandProfile(input(), deps);

    expect(result).toEqual({
      status: "not_found",
      message: BRAND_PROFILE_NOT_FOUND_MESSAGE,
    });
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });

  it("answers not_found when the row disappears between read and write", async () => {
    const deps = fakeDeps({ result: { status: "not_found" } });
    const result = await saveBrandProfile(input(), deps);

    expect(result).toEqual({
      status: "not_found",
      message: BRAND_PROFILE_NOT_FOUND_MESSAGE,
    });
  });
});

describe("saveBrandProfile: the fields patch", () => {
  it("merges a single group onto the parsed stored field set", async () => {
    const deps = fakeDeps({
      stored: {
        zielgruppe: "Fachpublikum",
        verbotene_begriffe: ["Kursrakete"],
      },
    });

    await saveBrandProfile(
      input({ rawFields: { tonalitaet: "  Nüchtern.  " } }),
      deps,
    );

    expect(deps.saveBrandProfileRow).toHaveBeenCalledExactlyOnceWith(
      WORKSPACE_ID,
      {
        brandProfileId: PROFILE_ID,
        name: "Hausstil",
        description: null,
        aktiv: true,
        fields: {
          ...emptyBrandProfileFields(),
          // untouched groups survive the save
          zielgruppe: "Fachpublikum",
          verbotene_begriffe: ["Kursrakete"],
          // the patched group is normalized by the Zod boundary
          tonalitaet: "Nüchtern.",
        },
      },
    );
  });

  it("replaces a patched group whole, so an empty array clears it", async () => {
    const deps = fakeDeps({ stored: { verbotene_begriffe: ["Kursrakete"] } });

    await saveBrandProfile(
      input({ rawFields: { verbotene_begriffe: [] } }),
      deps,
    );

    const [, params] = deps.saveBrandProfileRow.mock.calls[0] ?? [];
    expect(params?.fields.verbotene_begriffe).toEqual([]);
  });

  it("materializes the defaults of a phase-0 stub row", async () => {
    const deps = fakeDeps({ stored: {} });

    await saveBrandProfile(input({ rawFields: {} }), deps);

    const [, params] = deps.saveBrandProfileRow.mock.calls[0] ?? [];
    expect(params?.fields).toEqual(emptyBrandProfileFields());
  });

  it("accepts a full field set as the patch", async () => {
    const deps = fakeDeps({ stored: {} });

    await saveBrandProfile(
      input({ rawFields: FULL_BRAND_PROFILE_FIELDS }),
      deps,
    );

    const [, params] = deps.saveBrandProfileRow.mock.calls[0] ?? [];
    expect(params?.fields).toEqual(FULL_BRAND_PROFILE_FIELDS);
  });

  it.each([
    [
      "a term over 60 characters",
      { verbotene_begriffe: ["x".repeat(61)] },
    ],
    [
      "a sixth mandatory element",
      {
        pflichtelemente: Array.from({ length: 6 }, (_, index) => ({
          id: `0000000${index}-0000-4000-8000-000000000000`,
          text: `Hinweis ${index}`,
          position: "end",
        })),
      },
    ],
    ["a format rule of 0 characters", { formatregeln: { max_titel_zeichen: 0 } }],
    ["a free text that is not a string", { zielgruppe: 42 }],
  ])("rejects %s after the read, without writing", async (_label, patch) => {
    const deps = fakeDeps({ stored: {} });
    const result = await saveBrandProfile(input({ rawFields: patch }), deps);

    expect(result).toEqual({
      status: "invalid",
      message: BRAND_PROFILE_FIELDS_INVALID_MESSAGE,
    });
    expect(deps.getBrandProfile).toHaveBeenCalledOnce();
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });

  it("throws when the STORED field set does not parse", async () => {
    // Our own data gone wrong (a hand edit, a rolled-back deployment): an
    // unexpected error for central logging, not a user-facing result.
    const deps = fakeDeps({ stored: { unbekannte_gruppe: "x" } });
    await expect(saveBrandProfile(input(), deps)).rejects.toThrow();
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });
});

describe("saveBrandProfile: results", () => {
  it("reports a written version", async () => {
    const deps = fakeDeps({
      result: { status: "saved", profile: savedProfileRow(), version: 4 },
    });
    expect(await saveBrandProfile(input(), deps)).toEqual({
      status: "saved",
      version: 4,
      deduped: false,
    });
  });

  it("reports an unchanged save as deduped", async () => {
    const deps = fakeDeps({ result: { status: "unchanged", version: 3 } });
    expect(await saveBrandProfile(input(), deps)).toEqual({
      status: "saved",
      version: 3,
      deduped: true,
    });
  });

  it("passes a version conflict through as a typed result without a message", async () => {
    // Two tabs racing is fremd-auslösbar: a business outcome with a retry,
    // never a Sentry event. The German wording belongs to the editor.
    const deps = fakeDeps({ result: { status: "conflict" } });
    expect(await saveBrandProfile(input(), deps)).toEqual({
      status: "conflict",
    });
  });

  it("lets unexpected database errors throw into central logging", async () => {
    const deps = fakeDeps();
    deps.saveBrandProfileRow.mockRejectedValue(new Error("connection lost"));
    await expect(saveBrandProfile(input(), deps)).rejects.toThrow(
      "connection lost",
    );
  });
});

// The same core logic through the REAL chain (real membership lookup, real
// scoped save against the real migrations), mirroring the task-13 proof.
describe("saveBrandProfile against PGlite", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it("writes version 2 with the merged field set", async () => {
    const { a } = await seedTwoTenants(handle.db);
    const scope = scopedDb(handle.db, a.workspace.id);
    const profile = await scope.brandProfiles.create({ name: "Echte Kette" });

    const deps: SaveBrandProfileDeps = {
      requireMembership: (userId, workspaceId) =>
        requireWorkspaceMembership(userId, workspaceId, {
          getMembership: (u, w) => findMembership(handle.db, u, w),
        }),
      getBrandProfile: (workspaceId, brandProfileId) =>
        scopedDb(handle.db, workspaceId).brandProfiles.getById(brandProfileId),
      saveBrandProfileRow: (workspaceId, params) =>
        scopedDb(handle.db, workspaceId).brandProfiles.save(params),
    };

    const result = await saveBrandProfile(
      {
        userId: a.user.id,
        workspaceId: a.workspace.id,
        brandProfileId: profile.id,
        rawName: "  Echte Kette  ",
        rawDescription: " Mit Beschreibung ",
        rawAktiv: false,
        rawFields: { zielgruppe: "Fachpublikum" },
      },
      deps,
    );

    expect(result).toEqual({ status: "saved", version: 2, deduped: false });
    const versions = await scope.brandProfileVersions.listByProfile(profile.id);
    expect(versions.map((entry) => entry.version)).toEqual([2, 1]);
    expect(versions[0]?.snapshot).toEqual({
      name: "Echte Kette",
      description: "Mit Beschreibung",
      aktiv: false,
      fields: { ...emptyBrandProfileFields(), zielgruppe: "Fachpublikum" },
    });

    // A repeat of the very same save deduplicates.
    const again = await saveBrandProfile(
      {
        userId: a.user.id,
        workspaceId: a.workspace.id,
        brandProfileId: profile.id,
        rawName: "Echte Kette",
        rawDescription: "Mit Beschreibung",
        rawAktiv: false,
        rawFields: { zielgruppe: "Fachpublikum" },
      },
      deps,
    );
    expect(again).toEqual({ status: "saved", version: 2, deduped: true });
  });

  it("refuses a member of another workspace", async () => {
    const { a, b } = await seedTwoTenants(handle.db);
    const profile = await scopedDb(handle.db, a.workspace.id).brandProfiles.create(
      { name: "Gehört A" },
    );

    const deps: SaveBrandProfileDeps = {
      requireMembership: (userId, workspaceId) =>
        requireWorkspaceMembership(userId, workspaceId, {
          getMembership: (u, w) => findMembership(handle.db, u, w),
        }),
      getBrandProfile: (workspaceId, brandProfileId) =>
        scopedDb(handle.db, workspaceId).brandProfiles.getById(brandProfileId),
      saveBrandProfileRow: (workspaceId, params) =>
        scopedDb(handle.db, workspaceId).brandProfiles.save(params),
    };

    // B's user against A's workspace: the membership gate answers first.
    expect(
      await saveBrandProfile(
        {
          userId: b.user.id,
          workspaceId: a.workspace.id,
          brandProfileId: profile.id,
          rawName: "Von B",
          rawDescription: null,
          rawAktiv: true,
          rawFields: {},
        },
        deps,
      ),
    ).toEqual({
      status: "forbidden",
      message: BRAND_PROFILE_FORBIDDEN_MESSAGE,
    });

    // B's own workspace with A's profile id: the scope answers not_found.
    expect(
      await saveBrandProfile(
        {
          userId: b.user.id,
          workspaceId: b.workspace.id,
          brandProfileId: profile.id,
          rawName: "Von B",
          rawDescription: null,
          rawAktiv: true,
          rawFields: {},
        },
        deps,
      ),
    ).toEqual({
      status: "not_found",
      message: BRAND_PROFILE_NOT_FOUND_MESSAGE,
    });
  });
});
