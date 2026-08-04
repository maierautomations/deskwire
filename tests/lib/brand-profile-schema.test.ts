import { describe, expect, it } from "vitest";

import {
  BRAND_PROFILE_LIMITS,
  BRAND_PROFILE_SCHEMA_VERSION,
  brandProfileFieldsSchema,
  brandProfileWorstCaseChars,
  casefoldTerm,
  emptyBrandProfileFields,
  inspectTermList,
  parseBrandProfileFields,
  PFLICHTELEMENT_POSITIONS,
  type BrandProfileFields,
} from "@/lib/brand-profile/schema";

import { FULL_BRAND_PROFILE_FIELDS } from "../fixtures/brand-profile";

// Written out literally instead of derived from the schema: this states what a
// reader gets, independent of how the schema produces it. If a default ever
// changes silently, this object is what fails.
const FULL_DEFAULTS: BrandProfileFields = {
  schema_version: 1,
  zielgruppe: "",
  tonalitaet: "",
  dos: "",
  donts: "",
  harte_verbote: "",
  stil_fingerabdruck: "",
  pflichtelemente: [],
  formatregeln: {
    max_kicker_zeichen: null,
    max_titel_zeichen: null,
    max_seo_titel_zeichen: null,
    max_teaser_zeichen: null,
    keine_relativen_zeitangaben: false,
  },
  verbotene_begriffe: [],
  bevorzugte_begriffe: [],
  beispieltexte: [],
};

const FREE_TEXT_FIELDS = [
  ["zielgruppe", BRAND_PROFILE_LIMITS.zielgruppe],
  ["tonalitaet", BRAND_PROFILE_LIMITS.tonalitaet],
  ["dos", BRAND_PROFILE_LIMITS.dos],
  ["donts", BRAND_PROFILE_LIMITS.donts],
  ["harte_verbote", BRAND_PROFILE_LIMITS.harte_verbote],
  ["stil_fingerabdruck", BRAND_PROFILE_LIMITS.stil_fingerabdruck],
] as const;

const TERM_LIST_FIELDS = ["verbotene_begriffe", "bevorzugte_begriffe"] as const;

const FORMAT_NUMBER_FIELDS = [
  "max_kicker_zeichen",
  "max_titel_zeichen",
  "max_seo_titel_zeichen",
  "max_teaser_zeichen",
] as const;

const UUID_A = "3f1b6a90-1c2d-4e3f-8a5b-6c7d8e9f0a1b";
const UUID_B = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

const pflichtelement = (id: string, text = "Hinweis", position = "end") => ({
  id,
  text,
  position,
});

describe("brand profile fields: defaults and legacy rows", () => {
  // The phase-0 stub rows contain exactly this, in production.
  it("parses an empty object into the complete default set", () => {
    expect(parseBrandProfileFields({})).toEqual(FULL_DEFAULTS);
  });

  it("treats a missing schema_version as version 1", () => {
    expect(parseBrandProfileFields({}).schema_version).toBe(
      BRAND_PROFILE_SCHEMA_VERSION,
    );
    expect(parseBrandProfileFields({ schema_version: 1 })).toEqual(
      FULL_DEFAULTS,
    );
  });

  // Guards the zod-4 .default() short circuit: .default({}) on the nested
  // object would produce a bare {} while the type claims all keys exist.
  it("fills the nested formatregeln object completely", () => {
    expect(parseBrandProfileFields({}).formatregeln).toEqual(
      FULL_DEFAULTS.formatregeln,
    );
  });

  it("hands out a fresh defaults object on every call", () => {
    const first = emptyBrandProfileFields();
    first.verbotene_begriffe.push("mutiert");
    first.formatregeln.max_titel_zeichen = 42;
    expect(emptyBrandProfileFields()).toEqual(FULL_DEFAULTS);
  });
});

describe("brand profile fields: schema_version", () => {
  it.each([2, 0, -1, "1", null])(
    "rejects schema_version %p with an explanatory message",
    (schema_version) => {
      const result = brandProfileFieldsSchema.safeParse({ schema_version });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toContain("read migration");
      expect(result.error?.issues[0]?.message).toContain("expected 1");
    },
  );
});

describe("brand profile fields: free text groups", () => {
  it.each(FREE_TEXT_FIELDS)("fills %s on its own", (field) => {
    const parsed = parseBrandProfileFields({ [field]: "Ein Wert" });
    expect(parsed[field]).toBe("Ein Wert");
    expect({ ...parsed, [field]: "" }).toEqual(FULL_DEFAULTS);
  });

  it.each(FREE_TEXT_FIELDS)("trims %s and collapses blank input", (field) => {
    expect(parseBrandProfileFields({ [field]: "  Ein Wert  " })[field]).toBe(
      "Ein Wert",
    );
    expect(parseBrandProfileFields({ [field]: "   " })[field]).toBe("");
  });

  it.each(FREE_TEXT_FIELDS)(
    "accepts %s at exactly the limit and rejects one character more",
    (field, limit) => {
      expect(
        parseBrandProfileFields({ [field]: "a".repeat(limit) })[field],
      ).toHaveLength(limit);
      expect(
        brandProfileFieldsSchema.safeParse({ [field]: "a".repeat(limit + 1) })
          .success,
      ).toBe(false);
    },
  );

  it("measures the limit after trimming, not before", () => {
    const padded = ` ${"a".repeat(BRAND_PROFILE_LIMITS.zielgruppe)} `;
    expect(
      parseBrandProfileFields({ zielgruppe: padded }).zielgruppe,
    ).toHaveLength(BRAND_PROFILE_LIMITS.zielgruppe);
  });
});

describe("brand profile fields: term lists", () => {
  it.each(TERM_LIST_FIELDS)("drops blank lines in %s", (field) => {
    expect(
      parseBrandProfileFields({ [field]: ["Kursrakete", "", "   ", "Blitz"] })[
        field
      ],
    ).toEqual(["Kursrakete", "Blitz"]);
  });

  it.each(TERM_LIST_FIELDS)("shapes whitespace inside %s entries", (field) => {
    expect(
      parseBrandProfileFields({ [field]: ["  Kurs   rakete  "] })[field],
    ).toEqual(["Kurs rakete"]);
  });

  it.each(TERM_LIST_FIELDS)(
    "deduplicates %s case-insensitively and keeps the first spelling",
    (field) => {
      expect(
        parseBrandProfileFields({
          [field]: ["Kursrakete", "kursrakete", "KURSRAKETE", "Blitzcrash"],
        })[field],
      ).toEqual(["Kursrakete", "Blitzcrash"]);
    },
  );

  it.each(TERM_LIST_FIELDS)(
    "counts %s entries after filtering, not before",
    (field) => {
      const full = Array.from(
        { length: BRAND_PROFILE_LIMITS.begriffe_max },
        (_, index) => `Begriff ${index}`,
      );
      expect(
        parseBrandProfileFields({ [field]: [...full, "", "  ", ""] })[field],
      ).toHaveLength(BRAND_PROFILE_LIMITS.begriffe_max);
      expect(
        brandProfileFieldsSchema.safeParse({ [field]: [...full, "Einer zuviel"] })
          .success,
      ).toBe(false);
    },
  );

  it.each(TERM_LIST_FIELDS)(
    "rejects an over-long %s entry instead of truncating it",
    (field) => {
      expect(
        parseBrandProfileFields({
          [field]: ["a".repeat(BRAND_PROFILE_LIMITS.begriff)],
        })[field],
      ).toHaveLength(1);
      expect(
        brandProfileFieldsSchema.safeParse({
          [field]: ["a".repeat(BRAND_PROFILE_LIMITS.begriff + 1)],
        }).success,
      ).toBe(false);
    },
  );

  // Task 28 matches forbidden terms with exactly this fold. If the two ever
  // drift, a term deduplicated here would be matched differently there.
  it("exports the casefold used for deduplication", () => {
    expect(casefoldTerm("  Kurs   RAKETE  ")).toBe("kurs rakete");
    expect(casefoldTerm("Übernahme")).toBe("übernahme");
  });
});

describe("brand profile fields: pflichtelemente", () => {
  it("keeps a valid element unchanged", () => {
    expect(
      parseBrandProfileFields({
        pflichtelemente: [pflichtelement(UUID_A, "KI-Hinweis", "start")],
      }).pflichtelemente,
    ).toEqual([{ id: UUID_A, text: "KI-Hinweis", position: "start" }]);
  });

  it.each(PFLICHTELEMENT_POSITIONS)("accepts position %s", (position) => {
    expect(
      parseBrandProfileFields({
        pflichtelemente: [pflichtelement(UUID_A, "Hinweis", position)],
      }).pflichtelemente[0]?.position,
    ).toBe(position);
  });

  it.each(["mitte", "anfang", "ende", "START", ""])(
    "rejects position %p",
    (position) => {
      expect(
        brandProfileFieldsSchema.safeParse({
          pflichtelemente: [pflichtelement(UUID_A, "Hinweis", position)],
        }).success,
      ).toBe(false);
    },
  );

  it("requires a uuid id", () => {
    expect(
      brandProfileFieldsSchema.safeParse({
        pflichtelemente: [{ text: "Hinweis", position: "end" }],
      }).success,
    ).toBe(false);
    expect(
      brandProfileFieldsSchema.safeParse({
        pflichtelemente: [pflichtelement("ki-hinweis")],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate ids with an explanatory message", () => {
    const result = brandProfileFieldsSchema.safeParse({
      pflichtelemente: [pflichtelement(UUID_A), pflichtelement(UUID_A, "Zwei")],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(
      "duplicate pflichtelement id",
    );
    expect(result.error?.issues[0]?.path).toEqual(["pflichtelemente", 1, "id"]);
  });

  it("trims the text and rejects blank or over-long text", () => {
    expect(
      parseBrandProfileFields({
        pflichtelemente: [pflichtelement(UUID_A, "  Hinweis  ")],
      }).pflichtelemente[0]?.text,
    ).toBe("Hinweis");
    expect(
      brandProfileFieldsSchema.safeParse({
        pflichtelemente: [pflichtelement(UUID_A, "   ")],
      }).success,
    ).toBe(false);
    expect(
      brandProfileFieldsSchema.safeParse({
        pflichtelemente: [
          pflichtelement(
            UUID_A,
            "a".repeat(BRAND_PROFILE_LIMITS.pflichtelement_text),
          ),
        ],
      }).success,
    ).toBe(true);
    expect(
      brandProfileFieldsSchema.safeParse({
        pflichtelemente: [
          pflichtelement(
            UUID_A,
            "a".repeat(BRAND_PROFILE_LIMITS.pflichtelement_text + 1),
          ),
        ],
      }).success,
    ).toBe(false);
  });

  it("caps the number of elements", () => {
    const elements = Array.from(
      { length: BRAND_PROFILE_LIMITS.pflichtelemente_max },
      (_, index) => pflichtelement(`0000000${index}-0000-4000-8000-000000000000`),
    );
    expect(
      parseBrandProfileFields({ pflichtelemente: elements }).pflichtelemente,
    ).toHaveLength(BRAND_PROFILE_LIMITS.pflichtelemente_max);
    expect(
      brandProfileFieldsSchema.safeParse({
        pflichtelemente: [...elements, pflichtelement(UUID_B)],
      }).success,
    ).toBe(false);
  });
});

describe("brand profile fields: formatregeln", () => {
  it.each(FORMAT_NUMBER_FIELDS)("accepts %s at both bounds", (field) => {
    expect(
      parseBrandProfileFields({ formatregeln: { [field]: 1 } }).formatregeln[
        field
      ],
    ).toBe(1);
    expect(
      parseBrandProfileFields({
        formatregeln: { [field]: BRAND_PROFILE_LIMITS.formatregel_zeichen },
      }).formatregeln[field],
    ).toBe(BRAND_PROFILE_LIMITS.formatregel_zeichen);
  });

  it.each(FORMAT_NUMBER_FIELDS)(
    "rejects implausible values for %s",
    (field) => {
      for (const value of [
        0,
        -1,
        12.5,
        BRAND_PROFILE_LIMITS.formatregel_zeichen + 1,
        "70",
      ]) {
        expect(
          brandProfileFieldsSchema.safeParse({ formatregeln: { [field]: value } })
            .success,
        ).toBe(false);
      }
    },
  );

  // null is the ONE legitimate null in this schema: "not configured".
  it.each(FORMAT_NUMBER_FIELDS)("accepts null for %s", (field) => {
    expect(
      parseBrandProfileFields({ formatregeln: { [field]: null } }).formatregeln[
        field
      ],
    ).toBeNull();
  });

  it("carries the relative-time flag and defaults it to off", () => {
    expect(
      parseBrandProfileFields({
        formatregeln: { keine_relativen_zeitangaben: true },
      }).formatregeln.keine_relativen_zeitangaben,
    ).toBe(true);
    expect(
      parseBrandProfileFields({ formatregeln: {} }).formatregeln
        .keine_relativen_zeitangaben,
    ).toBe(false);
  });

  it("rejects an unknown key inside formatregeln", () => {
    expect(
      brandProfileFieldsSchema.safeParse({
        formatregeln: { max_dachzeile_zeichen: 20 },
      }).success,
    ).toBe(false);
  });
});

describe("brand profile fields: beispieltexte", () => {
  it("accepts exactly three and rejects a fourth", () => {
    expect(
      parseBrandProfileFields({ beispieltexte: ["a", "b", "c"] }).beispieltexte,
    ).toEqual(["a", "b", "c"]);
    expect(
      brandProfileFieldsSchema.safeParse({ beispieltexte: ["a", "b", "c", "d"] })
        .success,
    ).toBe(false);
  });

  it("counts entries after dropping blank ones", () => {
    expect(
      parseBrandProfileFields({ beispieltexte: ["a", "", "b", "  ", "c", ""] })
        .beispieltexte,
    ).toEqual(["a", "b", "c"]);
  });

  it("bounds the length and keeps inner formatting", () => {
    expect(
      parseBrandProfileFields({
        beispieltexte: ["a".repeat(BRAND_PROFILE_LIMITS.beispieltext)],
      }).beispieltexte[0],
    ).toHaveLength(BRAND_PROFILE_LIMITS.beispieltext);
    expect(
      brandProfileFieldsSchema.safeParse({
        beispieltexte: ["a".repeat(BRAND_PROFILE_LIMITS.beispieltext + 1)],
      }).success,
    ).toBe(false);
    expect(
      parseBrandProfileFields({ beispieltexte: ["  Zeile eins.\n\nZeile zwei.  "] })
        .beispieltexte[0],
    ).toBe("Zeile eins.\n\nZeile zwei.");
  });
});

describe("brand profile fields: strictness", () => {
  it("rejects an unknown top-level key and names it", () => {
    const result = brandProfileFieldsSchema.safeParse({ tonfall: "nüchtern" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("tonfall");
  });

  // Defines the contract for the task-20a form mapping: an empty field arrives
  // as "" (or [] / an absent key), never as null. A silent default for null
  // would hide a broken mapping.
  it.each([
    "zielgruppe",
    "harte_verbote",
    "verbotene_begriffe",
    "bevorzugte_begriffe",
    "pflichtelemente",
    "beispieltexte",
    "formatregeln",
  ])("rejects null for %s instead of defaulting", (field) => {
    expect(brandProfileFieldsSchema.safeParse({ [field]: null }).success).toBe(
      false,
    );
  });
});

describe("brand profile fields: complete profile", () => {
  it("parses every group at once and returns the canonical fixture unchanged", () => {
    expect(parseBrandProfileFields(FULL_BRAND_PROFILE_FIELDS)).toEqual(
      FULL_BRAND_PROFILE_FIELDS,
    );
  });

  // The save-load cycle from task 20a onwards: what was stored parses back to
  // itself, so a round trip through the editor never changes content.
  it("is idempotent", () => {
    const once = parseBrandProfileFields(FULL_BRAND_PROFILE_FIELDS);
    expect(parseBrandProfileFields(once)).toEqual(once);
  });
});

describe("inspectTermList", () => {
  // The editor reports what the normalization removed and which line is too
  // long (task 20b). This is the same implementation the schema transform
  // uses, and the first test is the guard that keeps it that way: whatever the
  // report says was kept is exactly what the schema stores.
  it("agrees with what the schema actually stores", () => {
    const lines = ["Kursziel", "", "kursziel", "Geheimtipp", "  Kursziel  "];

    const report = inspectTermList(lines);
    const stored = brandProfileFieldsSchema.parse({
      verbotene_begriffe: lines,
    }).verbotene_begriffe;

    expect(report.terms).toEqual(stored);
    expect(stored).toEqual(["Kursziel", "Geheimtipp"]);
  });

  it("numbers the entries by raw line, blanks and duplicates included", () => {
    const report = inspectTermList(["Kursziel", "", "kursziel", "Geheimtipp"]);

    expect(report.entries).toEqual([
      { line: 1, term: "Kursziel", status: "kept" },
      { line: 2, term: "", status: "blank" },
      { line: 3, term: "kursziel", status: "duplicate" },
      { line: 4, term: "Geheimtipp", status: "kept" },
    ]);
  });

  it("flags an over-long term without dropping it", () => {
    const long = "x".repeat(BRAND_PROFILE_LIMITS.begriff + 1);
    const report = inspectTermList(["ok", long]);

    // It stays in `terms` and the schema rejects it there: too long is
    // rejected, never truncated.
    expect(report.terms).toEqual(["ok", long]);
    expect(report.entries[1].status).toBe("too_long");
    expect(
      brandProfileFieldsSchema.safeParse({ verbotene_begriffe: ["ok", long] })
        .success,
    ).toBe(false);
  });

  it("drops a duplicate before it is ever measured", () => {
    // Mirrors the schema order exactly: blank, then duplicate, then length.
    const long = "x".repeat(BRAND_PROFILE_LIMITS.begriff + 1);
    const report = inspectTermList([long, long.toUpperCase()]);

    expect(report.entries.map((entry) => entry.status)).toEqual([
      "too_long",
      "duplicate",
    ]);
  });

  it("shapes the term the way the stored list does", () => {
    const report = inspectTermList(["  Anleger    sollten   jetzt  "]);

    expect(report.entries[0].term).toBe("Anleger sollten jetzt");
    expect(report.terms).toEqual(["Anleger sollten jetzt"]);
  });
});

describe("brand profile fields: prompt budget guard", () => {
  // Not a style rule: this number is the ceiling task 23 computes the per-run
  // cents caps against. If it fails, a limit changed — restate the prompt
  // budget in the comment block of schema.ts and in the cents caps before
  // adjusting this expectation.
  it("pins the worst-case profile size", () => {
    expect(brandProfileWorstCaseChars()).toBe(23_200);
  });
});
