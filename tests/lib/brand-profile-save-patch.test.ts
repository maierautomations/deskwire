import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { BrandProfile, Membership } from "@/db";
import { findMembership } from "@/db/memberships";
import { scopedDb } from "@/db/scoped";
import { BRAND_PROFILE_NAME_INVALID_MESSAGE } from "@/lib/brand-profile/input";
import {
  saveBrandProfile,
  BRAND_PROFILE_AKTIV_INVALID_MESSAGE,
  type SaveBrandProfileDeps,
} from "@/lib/brand-profile/save";
import { emptyBrandProfileFields } from "@/lib/brand-profile/schema";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants } from "../helpers/tenancy";

// ONE patch rule for the whole save (task 20a, decision B): name, description
// and aktiv behave exactly like the field groups — an absent key stays
// unchanged, a present key replaces. This is what lets a section save only
// what it owns, without hidden fields carrying the other sections' values and
// without a second read before the membership gate.
//
// The task-19 cases (which always send all three) live untouched in
// brand-profile-save.test.ts; this file covers only the new semantics.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";

function membershipRow(): Membership {
  return {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    role: "member",
    createdAt: new Date("2026-07-29T00:00:00Z"),
    updatedAt: new Date("2026-07-29T00:00:00Z"),
  };
}

// The row as it sits in the database before the save. Every value the patch
// leaves out must survive from here into the write.
function storedRow(): Pick<
  BrandProfile,
  "name" | "description" | "aktiv" | "fields"
> {
  return {
    name: "Hausstil Print",
    description: "Tonalität und Regeln für Print-Artikel",
    aktiv: true,
    fields: { zielgruppe: "Fachpublikum" },
  };
}

function fakeDeps(
  stored: Pick<
    BrandProfile,
    "name" | "description" | "aktiv" | "fields"
  > = storedRow(),
) {
  return {
    requireMembership: vi.fn().mockResolvedValue(membershipRow()),
    getBrandProfile: vi.fn().mockResolvedValue(stored),
    saveBrandProfileRow: vi
      .fn()
      .mockResolvedValue({ status: "unchanged", version: 7 }),
  };
}

function writtenParams(deps: ReturnType<typeof fakeDeps>) {
  const [, params] = deps.saveBrandProfileRow.mock.calls[0] ?? [];
  return params;
}

describe("saveBrandProfile: absent identity fields stay unchanged", () => {
  it("writes the stored name, description and aktiv when only fields are patched", async () => {
    const deps = fakeDeps();

    await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawFields: { tonalitaet: "Nüchtern." },
      },
      deps,
    );

    expect(writtenParams(deps)).toEqual({
      brandProfileId: PROFILE_ID,
      name: "Hausstil Print",
      description: "Tonalität und Regeln für Print-Artikel",
      aktiv: true,
      fields: {
        ...emptyBrandProfileFields(),
        zielgruppe: "Fachpublikum",
        tonalitaet: "Nüchtern.",
      },
    });
  });

  it("does not flip aktiv to false just because the key is absent", async () => {
    // The trap this rule exists for: a section that does not own the flag must
    // never deactivate a profile by staying silent about it.
    const deps = fakeDeps({ ...storedRow(), aktiv: true });

    await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawFields: {},
      },
      deps,
    );

    expect(writtenParams(deps)?.aktiv).toBe(true);
  });

  it("keeps a stored null description when the key is absent", async () => {
    const deps = fakeDeps({ ...storedRow(), description: null });

    await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawFields: {},
      },
      deps,
    );

    expect(writtenParams(deps)?.description).toBeNull();
  });

  it("validates nothing it was not given", async () => {
    // An absent name is not an empty name: no message, no rejection.
    const deps = fakeDeps();

    const result = await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawFields: {},
      },
      deps,
    );

    expect(result).toEqual({ status: "saved", version: 7, deduped: true });
  });
});

describe("saveBrandProfile: present identity fields replace", () => {
  it("clears the description when an empty string is sent", async () => {
    const deps = fakeDeps();

    await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawDescription: "   ",
        rawFields: {},
      },
      deps,
    );

    expect(writtenParams(deps)?.description).toBeNull();
    // Untouched by this patch.
    expect(writtenParams(deps)?.name).toBe("Hausstil Print");
  });

  it("deactivates when aktiv is sent as false", async () => {
    const deps = fakeDeps();

    await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawAktiv: false,
        rawFields: {},
      },
      deps,
    );

    expect(writtenParams(deps)?.aktiv).toBe(false);
  });

  it("still validates a present value and never reaches the database", async () => {
    const deps = fakeDeps();

    const result = await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawName: "   ",
        rawFields: {},
      },
      deps,
    );

    expect(result).toEqual({
      status: "invalid",
      message: BRAND_PROFILE_NAME_INVALID_MESSAGE,
    });
    expect(deps.requireMembership).not.toHaveBeenCalled();
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });

  it("treats a present-but-undefined aktiv as broken, not as absent", async () => {
    // Presence is the key being there at all. `rawAktiv: undefined` is a
    // broken form value and fails loudly instead of silently keeping the flag.
    const deps = fakeDeps();

    const result = await saveBrandProfile(
      {
        userId: USER_ID,
        workspaceId: WORKSPACE_ID,
        brandProfileId: PROFILE_ID,
        rawAktiv: undefined,
        rawFields: {},
      },
      deps,
    );

    expect(result).toEqual({
      status: "invalid",
      message: BRAND_PROFILE_AKTIV_INVALID_MESSAGE,
    });
    expect(deps.saveBrandProfileRow).not.toHaveBeenCalled();
  });
});

// The real chain: two section saves in a row against the real migrations,
// exactly what the editor does. Neither section may undo the other.
describe("two section saves against PGlite", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it("keeps both sections' values across two saves", async () => {
    const { a } = await seedTwoTenants(handle.db);
    const scope = scopedDb(handle.db, a.workspace.id);
    const profile = await scope.brandProfiles.create({ name: "Sektionen" });

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
    const base = {
      userId: a.user.id,
      workspaceId: a.workspace.id,
      brandProfileId: profile.id,
    };

    // Section "profile": identity only, no field group.
    expect(
      await saveBrandProfile(
        {
          ...base,
          rawName: "Sektionen, umbenannt",
          rawDescription: "Kurz erklärt",
          rawAktiv: false,
          rawFields: {},
        },
        deps,
      ),
    ).toEqual({ status: "saved", version: 2, deduped: false });

    // Section "freetext": field groups only, no identity value.
    expect(
      await saveBrandProfile(
        { ...base, rawFields: { zielgruppe: "Fachpublikum" } },
        deps,
      ),
    ).toEqual({ status: "saved", version: 3, deduped: false });

    const latest = await scope.brandProfileVersions.getLatest(profile.id);
    expect(latest?.snapshot).toEqual({
      name: "Sektionen, umbenannt",
      description: "Kurz erklärt",
      aktiv: false,
      fields: { ...emptyBrandProfileFields(), zielgruppe: "Fachpublikum" },
    });

    // And back the other way: the identity section leaves the field group
    // alone.
    await saveBrandProfile(
      { ...base, rawName: "Sektionen, final", rawFields: {} },
      deps,
    );
    const current = await scope.brandProfiles.getById(profile.id);
    expect(current?.name).toBe("Sektionen, final");
    expect(current?.aktiv).toBe(false);
    expect(current?.fields.zielgruppe).toBe("Fachpublikum");
  });
});
