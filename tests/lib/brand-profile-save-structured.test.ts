import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findMembership } from "@/db/memberships";
import { scopedDb } from "@/db/scoped";
import {
  BRAND_PROFILE_BEISPIELTEXTE_CONFIG,
  BRAND_PROFILE_FORMAT_FLAG_KEY,
  BRAND_PROFILE_PFLICHTELEMENTE_CONFIG,
  readEditorSection,
  type BrandProfileEditorSection,
} from "@/lib/brand-profile/editor";
import {
  saveBrandProfile,
  type SaveBrandProfileDeps,
  type SaveBrandProfileResult,
} from "@/lib/brand-profile/save";
import { emptyBrandProfileFields } from "@/lib/brand-profile/schema";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants } from "../helpers/tenancy";

// The four structured sections through the REAL chain: FormData exactly as the
// browser sends it, the section reader builds the patch, saveBrandProfile
// writes it, PGlite runs the actual migrations. That covers the two things a
// unit test of the reader cannot: that the patch the form produces is one the
// boundary accepts, and that a section leaves every group it does not own
// alone (the task-20a proof, now for the new sections).
//
// It is also the offline half of the 20b DoD: a fully populated profile parses
// through the Zod boundary and comes back as the canonical field set.

const NAMES = BRAND_PROFILE_PFLICHTELEMENTE_CONFIG.fieldNames;
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function formDataFrom(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) {
    data.append(key, value);
  }
  return data;
}

describe("structured sections against PGlite", () => {
  let handle: TestDbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it("fills every group, one section at a time, without disturbing the others", async () => {
    const { a, b } = await seedTwoTenants(handle.db);
    const scope = scopedDb(handle.db, a.workspace.id);
    const profile = await scope.brandProfiles.create({ name: "Vollprofil" });

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

    // One submit, end to end: the form boundary reads, the save decides.
    async function submit(
      section: BrandProfileEditorSection,
      entries: [string, string][],
      options = { aktiv: true },
    ): Promise<{ result: SaveBrandProfileResult; notes: string[] }> {
      const read = readEditorSection(section, formDataFrom(entries), options);
      expect(read.ok).toBe(true);
      if (!read.ok) throw new Error(read.message);
      const result = await saveBrandProfile(
        {
          userId: a.user.id,
          workspaceId: a.workspace.id,
          brandProfileId: profile.id,
          ...read.patch,
        },
        deps,
      );
      return { result, notes: read.notes };
    }

    // Section "freetext" first, so every later section has something it could
    // destroy but must not.
    const freetext = await submit("freetext", [
      ["zielgruppe", "Fachpublikum im Finanzressort"],
      ["tonalitaet", "Nüchtern, keine Ausrufezeichen"],
      ["dos", "Zahlen belegen"],
      ["donts", "Keine Superlative"],
      ["harte_verbote", "Keine Kauf- oder Verkaufsempfehlung"],
      ["stil_fingerabdruck", "Kurze Sätze, aktive Verben"],
    ]);
    expect(freetext.result).toEqual({
      status: "saved",
      version: 2,
      deduped: false,
    });

    const mandatory = await submit("mandatory", [
      [NAMES.id, ID_A],
      [NAMES.text, "Dieser Text wurde mit KI erstellt."],
      [NAMES.position, "end"],
      [NAMES.id, ID_B],
      [NAMES.text, "Keine Anlageberatung."],
      [NAMES.position, "start"],
    ]);
    expect(mandatory.result).toEqual({
      status: "saved",
      version: 3,
      deduped: false,
    });

    const format = await submit("format", [
      ["max_kicker_zeichen", "30"],
      ["max_titel_zeichen", "70"],
      ["max_seo_titel_zeichen", "60"],
      ["max_teaser_zeichen", "200"],
      [BRAND_PROFILE_FORMAT_FLAG_KEY, "on"],
    ]);
    expect(format.result).toEqual({
      status: "saved",
      version: 4,
      deduped: false,
    });

    const terms = await submit("terms", [
      // A duplicate and two blank lines: the note says so, the stored list is
      // free of both.
      ["verbotene_begriffe", "Kursziel\n\nGeheimtipp\nkursziel\n"],
      ["bevorzugte_begriffe", "Aktiengesellschaft\nGeschäftsjahr"],
    ]);
    expect(terms.result).toEqual({
      status: "saved",
      version: 5,
      deduped: false,
    });
    expect(terms.notes).toEqual([
      "Verbotene Begriffe: 1 Doppelung und 2 leere Zeilen entfernt.",
    ]);

    const examples = await submit("examples", [
      [BRAND_PROFILE_BEISPIELTEXTE_CONFIG.fieldName, "Erster Musterartikel."],
      [BRAND_PROFILE_BEISPIELTEXTE_CONFIG.fieldName, "Zweiter Musterartikel."],
    ]);
    expect(examples.result).toEqual({
      status: "saved",
      version: 6,
      deduped: false,
    });

    // And the identity section last: it must not touch a single group.
    const identity = await submit(
      "profile",
      [
        ["name", "Vollprofil, redigiert"],
        ["description", "Alle Gruppen befüllt"],
      ],
      { aktiv: false },
    );
    expect(identity.result).toEqual({
      status: "saved",
      version: 7,
      deduped: false,
    });

    // Everything six submits wrote, in one object — the fully populated
    // profile the 20b DoD asks for, parsed through the Zod boundary.
    const expectedFields = {
      ...emptyBrandProfileFields(),
      zielgruppe: "Fachpublikum im Finanzressort",
      tonalitaet: "Nüchtern, keine Ausrufezeichen",
      dos: "Zahlen belegen",
      donts: "Keine Superlative",
      harte_verbote: "Keine Kauf- oder Verkaufsempfehlung",
      stil_fingerabdruck: "Kurze Sätze, aktive Verben",
      pflichtelemente: [
        {
          id: ID_A,
          text: "Dieser Text wurde mit KI erstellt.",
          position: "end",
        },
        { id: ID_B, text: "Keine Anlageberatung.", position: "start" },
      ],
      formatregeln: {
        max_kicker_zeichen: 30,
        max_titel_zeichen: 70,
        max_seo_titel_zeichen: 60,
        max_teaser_zeichen: 200,
        keine_relativen_zeitangaben: true,
      },
      verbotene_begriffe: ["Kursziel", "Geheimtipp"],
      bevorzugte_begriffe: ["Aktiengesellschaft", "Geschäftsjahr"],
      beispieltexte: ["Erster Musterartikel.", "Zweiter Musterartikel."],
    };

    const latest = await scope.brandProfileVersions.getLatest(profile.id);
    expect(latest?.version).toBe(7);
    expect(latest?.snapshot).toEqual({
      name: "Vollprofil, redigiert",
      description: "Alle Gruppen befüllt",
      aktiv: false,
      fields: expectedFields,
    });

    const stored = await scope.brandProfiles.getById(profile.id);
    expect(stored?.fields).toEqual(expectedFields);

    // The other tenant is untouched by all of it.
    expect(
      await scopedDb(handle.db, b.workspace.id).brandProfiles.list(),
    ).toEqual([]);
  });

  it("clears exactly one group and leaves the rest standing", async () => {
    const { a } = await seedTwoTenants(handle.db);
    const scope = scopedDb(handle.db, a.workspace.id);
    const profile = await scope.brandProfiles.create({ name: "Leeren" });

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

    await saveBrandProfile(
      {
        ...base,
        rawFields: {
          pflichtelemente: [{ id: ID_A, text: "Disclaimer", position: "end" }],
          verbotene_begriffe: ["Kursziel"],
        },
      },
      deps,
    );

    // Removing the last row is a legitimate save, not a broken form: the
    // section sends an empty list and the group is cleared.
    const read = readEditorSection("mandatory", new FormData(), {
      aktiv: true,
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(
      await saveBrandProfile({ ...base, ...read.patch }, deps),
    ).toEqual({ status: "saved", version: 3, deduped: false });

    const stored = await scope.brandProfiles.getById(profile.id);
    expect(stored?.fields.pflichtelemente).toEqual([]);
    // The group the section does not own survived the clearing.
    expect(stored?.fields.verbotene_begriffe).toEqual(["Kursziel"]);
  });

  it("deduplicates a structured save that changes nothing", async () => {
    const { a } = await seedTwoTenants(handle.db);
    const scope = scopedDb(handle.db, a.workspace.id);
    const profile = await scope.brandProfiles.create({ name: "Doppelt" });

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
    const entries: [string, string][] = [
      ["verbotene_begriffe", "Kursziel"],
      ["bevorzugte_begriffe", ""],
    ];

    const first = readEditorSection("terms", formDataFrom(entries), {
      aktiv: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(
      await saveBrandProfile(
        {
          userId: a.user.id,
          workspaceId: a.workspace.id,
          brandProfileId: profile.id,
          ...first.patch,
        },
        deps,
      ),
    ).toEqual({ status: "saved", version: 2, deduped: false });

    // The user typed the same list again, formatted differently. The content
    // hash is identical, so nothing is written and the editor says so.
    const again = readEditorSection(
      "terms",
      formDataFrom([
        ["verbotene_begriffe", "\nKursziel\n\n"],
        ["bevorzugte_begriffe", ""],
      ]),
      { aktiv: true },
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(
      await saveBrandProfile(
        {
          userId: a.user.id,
          workspaceId: a.workspace.id,
          brandProfileId: profile.id,
          ...again.patch,
        },
        deps,
      ),
    ).toEqual({ status: "saved", version: 2, deduped: true });
  });
});
