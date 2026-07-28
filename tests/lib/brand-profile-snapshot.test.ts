import { describe, expect, it } from "vitest";

import {
  emptyBrandProfileFields,
  type BrandProfileFields,
} from "@/lib/brand-profile/schema";
import {
  hashBrandProfileSnapshot,
  parseBrandProfileSnapshot,
  serializeBrandProfileSnapshot,
  type BrandProfileSnapshot,
} from "@/lib/brand-profile/snapshot";

import {
  FULL_BRAND_PROFILE_FIELDS,
  FULL_BRAND_PROFILE_SNAPSHOT,
} from "../fixtures/brand-profile";

// The canonical serialization and its hash (task 19). Pure module, no
// database: the same function computes the hash in the transaction, in the
// backfill script and here.

function snapshotWith(
  fields: Partial<BrandProfileFields> = {},
): BrandProfileSnapshot {
  return {
    name: "Hausstil",
    description: null,
    aktiv: true,
    fields: { ...emptyBrandProfileFields(), ...fields },
  };
}

describe("serializeBrandProfileSnapshot", () => {
  it("ignores key order, so a snapshot read back from jsonb hashes identically", () => {
    // Postgres jsonb normalizes key order on storage, so the hash must not
    // depend on it — otherwise every roundtrip would look like a change.
    const forward = FULL_BRAND_PROFILE_SNAPSHOT;
    const reversed: BrandProfileSnapshot = {
      fields: {
        beispieltexte: FULL_BRAND_PROFILE_FIELDS.beispieltexte,
        bevorzugte_begriffe: FULL_BRAND_PROFILE_FIELDS.bevorzugte_begriffe,
        verbotene_begriffe: FULL_BRAND_PROFILE_FIELDS.verbotene_begriffe,
        formatregeln: {
          keine_relativen_zeitangaben:
            FULL_BRAND_PROFILE_FIELDS.formatregeln.keine_relativen_zeitangaben,
          max_teaser_zeichen:
            FULL_BRAND_PROFILE_FIELDS.formatregeln.max_teaser_zeichen,
          max_seo_titel_zeichen:
            FULL_BRAND_PROFILE_FIELDS.formatregeln.max_seo_titel_zeichen,
          max_titel_zeichen:
            FULL_BRAND_PROFILE_FIELDS.formatregeln.max_titel_zeichen,
          max_kicker_zeichen:
            FULL_BRAND_PROFILE_FIELDS.formatregeln.max_kicker_zeichen,
        },
        pflichtelemente: FULL_BRAND_PROFILE_FIELDS.pflichtelemente,
        stil_fingerabdruck: FULL_BRAND_PROFILE_FIELDS.stil_fingerabdruck,
        harte_verbote: FULL_BRAND_PROFILE_FIELDS.harte_verbote,
        donts: FULL_BRAND_PROFILE_FIELDS.donts,
        dos: FULL_BRAND_PROFILE_FIELDS.dos,
        tonalitaet: FULL_BRAND_PROFILE_FIELDS.tonalitaet,
        zielgruppe: FULL_BRAND_PROFILE_FIELDS.zielgruppe,
        schema_version: FULL_BRAND_PROFILE_FIELDS.schema_version,
      },
      aktiv: FULL_BRAND_PROFILE_SNAPSHOT.aktiv,
      description: FULL_BRAND_PROFILE_SNAPSHOT.description,
      name: FULL_BRAND_PROFILE_SNAPSHOT.name,
    };

    expect(serializeBrandProfileSnapshot(reversed)).toBe(
      serializeBrandProfileSnapshot(forward),
    );
    expect(hashBrandProfileSnapshot(reversed)).toBe(
      hashBrandProfileSnapshot(forward),
    );
  });

  it("keeps umlauts as literal characters instead of escaping them", () => {
    const serialized = serializeBrandProfileSnapshot(
      snapshotWith({ tonalitaet: "Nüchtern, präzise, ohne Superlative." }),
    );
    expect(serialized).toContain("Nüchtern, präzise");
    expect(serialized).not.toContain("\\u00fc");
  });

  it("treats array order as content", () => {
    const [first, second] = FULL_BRAND_PROFILE_FIELDS.pflichtelemente;
    if (!first || !second) throw new Error("fixture needs two elements");
    const swapped = snapshotWith({ pflichtelemente: [second, first] });
    const original = snapshotWith({ pflichtelemente: [first, second] });
    // The sequence of mandatory elements decides where code writes them
    // (task 28), so swapping two entries IS a change, unlike key order.
    expect(hashBrandProfileSnapshot(swapped)).not.toBe(
      hashBrandProfileSnapshot(original),
    );
  });
});

describe("hashBrandProfileSnapshot", () => {
  it("hashes an empty field set exactly like a fully defaulted one", () => {
    // This is the dedupe foundation: a phase-0 stub row (fields `{}`) and an
    // editor save that leaves every group at its default are the same
    // effective profile and must not produce a second version.
    const fromEmpty = parseBrandProfileSnapshot({
      name: "Hausstil",
      description: null,
      aktiv: true,
      fields: {},
    });
    expect(hashBrandProfileSnapshot(fromEmpty)).toBe(
      hashBrandProfileSnapshot(snapshotWith()),
    );
  });

  it("is idempotent across the read boundary", () => {
    const reparsed = parseBrandProfileSnapshot(FULL_BRAND_PROFILE_SNAPSHOT);
    expect(hashBrandProfileSnapshot(reparsed)).toBe(
      hashBrandProfileSnapshot(FULL_BRAND_PROFILE_SNAPSHOT),
    );
  });

  it("distinguishes decomposed from precomposed umlauts", () => {
    // Deliberate: no unicode normalization. "ä" as U+00E4 and as "a" + U+0308
    // look identical but hash differently, which produces ONE VERSION TOO MANY
    // instead of silently merging two different texts — the safe direction.
    // If real copy-paste input ever makes this a nuisance, normalizing is a
    // conscious change to the task-18 schema boundary, not a hash tweak.
    // The two literals below look identical in an editor: the first carries
    // U+00E4, the second an "a" followed by the combining diaeresis U+0308.
    const precomposed = snapshotWith({ zielgruppe: "Anlässe" });
    const decomposed = snapshotWith({ zielgruppe: "Anlässe" });
    expect(hashBrandProfileSnapshot(decomposed)).not.toBe(
      hashBrandProfileSnapshot(precomposed),
    );
  });

  it("distinguishes line endings", () => {
    const unix = snapshotWith({ beispieltexte: ["Zeile eins\nZeile zwei"] });
    const windows = snapshotWith({
      beispieltexte: ["Zeile eins\r\nZeile zwei"],
    });
    expect(hashBrandProfileSnapshot(windows)).not.toBe(
      hashBrandProfileSnapshot(unix),
    );
  });

  it("reacts to every part of the snapshot, not just the fields", () => {
    const base = snapshotWith();
    const hashes = new Set([
      hashBrandProfileSnapshot(base),
      hashBrandProfileSnapshot({ ...base, name: "Anderer Name" }),
      hashBrandProfileSnapshot({ ...base, description: "Jetzt mit Text" }),
      hashBrandProfileSnapshot({ ...base, aktiv: false }),
      hashBrandProfileSnapshot(snapshotWith({ dos: "Zahlen mit Quelle." })),
    ]);
    expect(hashes.size).toBe(5);
  });

  // CANARY. This literal pins the canonical form itself. If it changes, the
  // serialization changed — and then EVERY existing version row loses its
  // dedupe base: the next save of an unchanged profile would write a new
  // version, and old hashes would no longer be comparable to new ones. That
  // may be a deliberate decision (e.g. introducing unicode normalization),
  // but it is never a test to "fix" quietly. Editing the fixture changes this
  // value too — that is legitimate and equally deliberate: re-pin it in the
  // same commit that changes the fixture, never in a separate "make it green".
  it("pins the canonical hash of the full profile snapshot", () => {
    expect(hashBrandProfileSnapshot(FULL_BRAND_PROFILE_SNAPSHOT)).toBe(
      "2f48cc8c549fd93408327b8fc081362a67e1d0f76a86ddd2ac222a7a1d0168c2",
    );
  });
});

describe("parseBrandProfileSnapshot", () => {
  it("accepts a null description and applies the field defaults", () => {
    const parsed = parseBrandProfileSnapshot({
      name: "Hausstil",
      description: null,
      aktiv: false,
      fields: {},
    });
    expect(parsed.description).toBeNull();
    expect(parsed.aktiv).toBe(false);
    expect(parsed.fields).toEqual(emptyBrandProfileFields());
  });

  it("rejects an unknown top-level key", () => {
    expect(() =>
      parseBrandProfileSnapshot({
        ...FULL_BRAND_PROFILE_SNAPSHOT,
        workspace_id: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow();
  });

  it.each([
    ["name", { description: null, aktiv: true, fields: {} }],
    ["aktiv", { name: "Hausstil", description: null, fields: {} }],
    ["fields", { name: "Hausstil", description: null, aktiv: true }],
    [
      "description",
      { name: "Hausstil", aktiv: true, fields: {} },
    ],
  ])("rejects a snapshot without %s", (_label, value) => {
    expect(() => parseBrandProfileSnapshot(value)).toThrow();
  });
});
