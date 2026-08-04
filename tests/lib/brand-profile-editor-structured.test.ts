import { describe, expect, it } from "vitest";

import {
  BRAND_PROFILE_BEISPIELTEXTE_CONFIG,
  BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
  BRAND_PROFILE_EDITOR_FORM_MESSAGE,
  BRAND_PROFILE_EDITOR_SECTIONS,
  BRAND_PROFILE_FORMAT_FIELDS,
  BRAND_PROFILE_FORMAT_FLAG_KEY,
  BRAND_PROFILE_FORMAT_INVALID_MESSAGE,
  BRAND_PROFILE_PFLICHTELEMENT_EMPTY_MESSAGE,
  BRAND_PROFILE_PFLICHTELEMENTE_CONFIG,
  BRAND_PROFILE_TERM_FIELDS,
  BRAND_PROFILE_TERM_LIMITS,
  parseEditorSection,
  readEditorSection,
  type ReadEditorSectionResult,
} from "@/lib/brand-profile/editor";
import {
  BRAND_PROFILE_LIMITS,
  PFLICHTELEMENT_POSITIONS,
} from "@/lib/brand-profile/schema";

// The four structured sections of the editor (task 20b). Pure: no database,
// no client, and every check here asks the same schema node the merged parse
// in saveBrandProfile uses.

const AKTIV = { aktiv: true };

function read(
  section: Parameters<typeof readEditorSection>[0],
  entries: [string, string][],
): ReadEditorSectionResult {
  const formData = new FormData();
  for (const [key, value] of entries) {
    formData.append(key, value);
  }
  return readEditorSection(section, formData, AKTIV);
}

const NAMES = BRAND_PROFILE_PFLICHTELEMENTE_CONFIG.fieldNames;
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function row(id: string, text: string, position = "end"): [string, string][] {
  return [
    [NAMES.id, id],
    [NAMES.text, text],
    [NAMES.position, position],
  ];
}

function formatEntries(
  overrides: Record<string, string> = {},
): [string, string][] {
  return BRAND_PROFILE_FORMAT_FIELDS.map((field) => [
    field.key,
    overrides[field.key] ?? "",
  ]);
}

describe("section registry", () => {
  it("holds exactly the six sections and parses every one of them", () => {
    expect([...BRAND_PROFILE_EDITOR_SECTIONS]).toEqual([
      "profile",
      "freetext",
      "mandatory",
      "format",
      "terms",
      "examples",
    ]);
    for (const section of BRAND_PROFILE_EDITOR_SECTIONS) {
      expect(parseEditorSection(section)).toBe(section);
    }
  });

  it("keeps the German group names out of the registry (A15)", () => {
    // The values steer control flow, so they are English. The German words are
    // unknown sections, not synonyms.
    for (const german of ["pflichtelemente", "formatregeln", "beispieltexte"]) {
      expect(parseEditorSection(german)).toBeNull();
    }
  });
});

describe("readEditorSection: mandatory", () => {
  it("zips the three controls in document order and owns only its group", () => {
    const result = read("mandatory", [
      ...row(ID_A, "Hinweis zur KI", "end"),
      ...row(ID_B, "Disclaimer", "start"),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields).toEqual({
      pflichtelemente: [
        { id: ID_A, text: "Hinweis zur KI", position: "end" },
        { id: ID_B, text: "Disclaimer", position: "start" },
      ],
    });
    expect("rawName" in result.patch).toBe(false);
    expect("rawDescription" in result.patch).toBe(false);
    expect("rawAktiv" in result.patch).toBe(false);
  });

  it("keeps the row order, because the order is content", () => {
    const result = read("mandatory", [
      ...row(ID_B, "Zuerst"),
      ...row(ID_A, "Danach"),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields.pflichtelemente).toEqual([
      { id: ID_B, text: "Zuerst", position: "end" },
      { id: ID_A, text: "Danach", position: "end" },
    ]);
  });

  it("clears the group when the last row was removed", () => {
    const result = read("mandatory", []);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields).toEqual({ pflichtelemente: [] });
  });

  it.each([
    ["a missing text", [[NAMES.id, ID_A] as [string, string], [NAMES.position, "end"] as [string, string]]],
    ["a missing position", [[NAMES.id, ID_A] as [string, string], [NAMES.text, "x"] as [string, string]]],
    ["a missing id", [[NAMES.text, "x"] as [string, string], [NAMES.position, "end"] as [string, string]]],
  ])("treats %s as a broken form, not as an empty row", (_label, entries) => {
    const result = read("mandatory", entries);

    expect(result).toEqual({
      ok: false,
      message: BRAND_PROFILE_EDITOR_FORM_MESSAGE,
      fieldErrors: {},
      values: expect.any(Object),
    });
  });

  it.each([
    ["an id we never generated", row(ID_A, "Text").map(([k, v]) => [k, k === NAMES.id ? "nicht-uuid" : v] as [string, string])],
    ["a position we never rendered", row(ID_A, "Text", "anfang")],
  ])("treats %s as a broken form", (_label, entries) => {
    const result = read("mandatory", entries);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(BRAND_PROFILE_EDITOR_FORM_MESSAGE);
    expect(result.fieldErrors).toEqual({});
  });

  it("marks an empty row at its own id and writes nothing", () => {
    const result = read("mandatory", [
      ...row(ID_A, "Steht"),
      ...row(ID_B, "   "),
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(BRAND_PROFILE_EDITOR_FIELDS_MESSAGE);
    expect(result.fieldErrors).toEqual({
      [`${NAMES.text}:${ID_B}`]: BRAND_PROFILE_PFLICHTELEMENT_EMPTY_MESSAGE,
    });
  });

  it("names limit and actual length of the over-long row", () => {
    const tooLong = "x".repeat(BRAND_PROFILE_LIMITS.pflichtelement_text + 1);
    const result = read("mandatory", row(ID_A, tooLong));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toEqual({
      [`${NAMES.text}:${ID_A}`]: "Höchstens 500 Zeichen, aktuell 501.",
    });
    // The rejected text survives in the echo, in full.
    expect(result.values[`${NAMES.text}:${ID_A}`]).toHaveLength(tooLong.length);
  });

  it("measures the row limit after trimming", () => {
    const exact = "x".repeat(BRAND_PROFILE_LIMITS.pflichtelement_text);
    const result = read("mandatory", row(ID_A, `  ${exact}  `));

    expect(result.ok).toBe(true);
  });

  it("rejects more rows than the schema allows, with the count", () => {
    const entries: [string, string][] = [];
    for (let index = 0; index <= BRAND_PROFILE_LIMITS.pflichtelemente_max; index += 1) {
      entries.push(...row(`3333333${index}-3333-4333-8333-333333333333`, `Text ${index}`));
    }

    const result = read("mandatory", entries);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("Höchstens 5 Pflichtelemente, aktuell 6.");
  });

  it("ignores form entries it does not own", () => {
    const result = read("mandatory", [
      ...row(ID_A, "Hinweis"),
      ["name", "Von einem fremden Formular"],
      ["zielgruppe", "Fachpublikum"],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.patch.rawFields)).toEqual(["pflichtelemente"]);
  });

  it("offers exactly the positions the schema defines", () => {
    expect(BRAND_PROFILE_PFLICHTELEMENTE_CONFIG.positions).toEqual(
      PFLICHTELEMENT_POSITIONS,
    );
    expect(PFLICHTELEMENT_POSITIONS).toContain(
      BRAND_PROFILE_PFLICHTELEMENTE_CONFIG.defaultPosition,
    );
  });
});

describe("readEditorSection: format", () => {
  it("always sends all five keys, so a submit cannot reset the flag", () => {
    // The patch replaces a group WHOLE: a partial group would silently drop
    // the rules this submit did not mention and reset the flag to false.
    const result = read("format", [
      ...formatEntries({ max_titel_zeichen: "70" }),
      [BRAND_PROFILE_FORMAT_FLAG_KEY, "on"],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields).toEqual({
      formatregeln: {
        max_kicker_zeichen: null,
        max_titel_zeichen: 70,
        max_seo_titel_zeichen: null,
        max_teaser_zeichen: null,
        keine_relativen_zeitangaben: true,
      },
    });
  });

  it("reads an unchecked flag as false", () => {
    const result = read("format", formatEntries());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.patch.rawFields.formatregeln as Record<string, unknown>)[
        BRAND_PROFILE_FORMAT_FLAG_KEY
      ],
    ).toBe(false);
  });

  it("echoes the flag through a rejection, in both directions", () => {
    // Found in the 20b walkthrough: React restores an uncontrolled checkbox to
    // its defaultChecked on re-render, so a tick set just before an unrelated
    // field error would disappear without a word.
    const ticked = read("format", [
      ...formatEntries({ max_kicker_zeichen: "0" }),
      [BRAND_PROFILE_FORMAT_FLAG_KEY, "on"],
    ]);
    const unticked = read("format", formatEntries({ max_kicker_zeichen: "0" }));

    expect(ticked.ok).toBe(false);
    expect(unticked.ok).toBe(false);
    if (ticked.ok || unticked.ok) return;
    expect(ticked.values[BRAND_PROFILE_FORMAT_FLAG_KEY]).toBe("on");
    expect(unticked.values[BRAND_PROFILE_FORMAT_FLAG_KEY]).toBe("");
  });

  it.each([
    ["an empty field", "", null],
    ["whitespace only", "   ", null],
    ["a number", "24", 24],
    ["a number with spaces", " 24 ", 24],
    ["the upper bound", "1000", 1000],
  ])("maps %s to %s", (_label, raw, expected) => {
    const result = read("format", formatEntries({ max_kicker_zeichen: raw }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.patch.rawFields.formatregeln as Record<string, unknown>)
        .max_kicker_zeichen,
    ).toBe(expected);
  });

  it("accepts exponential notation, because it is the same number", () => {
    // Documented, not overlooked: Number("1e3") is 1000, so the field means
    // exactly what it says and the boundary lets it through.
    const result = read("format", formatEntries({ max_kicker_zeichen: "1e3" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.patch.rawFields.formatregeln as Record<string, unknown>)
        .max_kicker_zeichen,
    ).toBe(1000);
  });

  it.each([["0"], ["-1"], ["12.5"], ["abc"], ["1001"], ["1 000"]])(
    "rejects %s with the German sentence and writes nothing",
    (raw) => {
      const result = read("format", formatEntries({ max_teaser_zeichen: raw }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toBe(BRAND_PROFILE_EDITOR_FIELDS_MESSAGE);
      expect(result.fieldErrors).toEqual({
        max_teaser_zeichen: BRAND_PROFILE_FORMAT_INVALID_MESSAGE,
      });
      expect(result.values.max_teaser_zeichen).toBe(raw);
    },
  );

  it("marks every offending field, not just the first", () => {
    const result = read(
      "format",
      formatEntries({ max_kicker_zeichen: "0", max_titel_zeichen: "abc" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      "max_kicker_zeichen",
      "max_titel_zeichen",
    ]);
  });

  it("names the bound in the message and reads it from the limits", () => {
    expect(BRAND_PROFILE_FORMAT_INVALID_MESSAGE).toBe(
      "Bitte gib eine ganze Zahl zwischen 1 und 1.000 ein.",
    );
    expect(BRAND_PROFILE_LIMITS.formatregel_zeichen).toBe(1000);
  });

  it("treats a missing declared field as a broken form", () => {
    const result = read(
      "format",
      formatEntries().filter(([key]) => key !== "max_teaser_zeichen"),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(BRAND_PROFILE_EDITOR_FORM_MESSAGE);
  });
});

describe("readEditorSection: terms", () => {
  it("splits both groups by line and owns exactly them", () => {
    const result = read("terms", [
      ["verbotene_begriffe", "Kursziel\r\nGeheimtipp"],
      ["bevorzugte_begriffe", "Aktiengesellschaft"],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields).toEqual({
      verbotene_begriffe: ["Kursziel", "Geheimtipp"],
      bevorzugte_begriffe: ["Aktiengesellschaft"],
    });
    expect("rawName" in result.patch).toBe(false);
  });

  it("echoes the canonical text, so the field shows what was stored", () => {
    const result = read("terms", [
      ["verbotene_begriffe", "Kursziel\n\nkursziel\nGeheimtipp\n"],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.verbotene_begriffe).toBe("Kursziel\nGeheimtipp");
  });

  it("says what it removed, per group and by count", () => {
    const result = read("terms", [
      ["verbotene_begriffe", "Kursziel\n\nkursziel\n\nKURSZIEL\n"],
      ["bevorzugte_begriffe", "Aktie\nAktie"],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes).toEqual([
      "Verbotene Begriffe: 2 Doppelungen und 3 leere Zeilen entfernt.",
      "Bevorzugte Begriffe: 1 Doppelung entfernt.",
    ]);
  });

  it("stays quiet when nothing was removed", () => {
    const result = read("terms", [
      ["verbotene_begriffe", "Kursziel\nGeheimtipp"],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes).toEqual([]);
  });

  it.each([
    ["an empty field", ""],
    ["a field holding nothing but blank lines", "\n\n\n"],
  ])("says nothing about %s", (_label, raw) => {
    // Announcing a removal where the user typed nothing would be noise, the
    // other failure mode of "no silent state".
    const result = read("terms", [
      ["verbotene_begriffe", raw],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes).toEqual([]);
    expect(result.patch.rawFields.verbotene_begriffe).toEqual([]);
  });

  it("names the offending line when one term is too long", () => {
    const long = "x".repeat(BRAND_PROFILE_TERM_LIMITS.maxTermLength + 14);
    const result = read("terms", [
      ["verbotene_begriffe", `Kursziel\nGeheimtipp\n${long}`],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toEqual({
      verbotene_begriffe: "Zeile 3 ist zu lang. Höchstens 60 Zeichen, aktuell 74.",
    });
  });

  it("names every offending line when several are too long", () => {
    const long = "x".repeat(BRAND_PROFILE_TERM_LIMITS.maxTermLength + 1);
    const result = read("terms", [
      ["verbotene_begriffe", `${long}a\nok\n${long}b\n${long}c`],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.verbotene_begriffe).toBe(
      "Zeilen 1, 3 und 4 sind zu lang. Höchstens 60 Zeichen je Begriff.",
    );
  });

  it("counts the raw line the user sees, not the index after normalization", () => {
    const long = "x".repeat(BRAND_PROFILE_TERM_LIMITS.maxTermLength + 1);
    // Two blank lines and a duplicate sit before the offending one: the
    // normalized array index would be 1, the line in the textarea is 5.
    const result = read("terms", [
      ["verbotene_begriffe", `Kursziel\n\nkursziel\n\n${long}`],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.verbotene_begriffe).toContain("Zeile 5");
  });

  it("keeps every typed line when the section is rejected", () => {
    const long = "x".repeat(BRAND_PROFILE_TERM_LIMITS.maxTermLength + 1);
    const typed = `Kursziel\n\nkursziel\n${long}`;
    const result = read("terms", [
      ["verbotene_begriffe", typed],
      ["bevorzugte_begriffe", "Aktie"],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.values.verbotene_begriffe).toBe(typed);
    expect(result.values.bevorzugte_begriffe).toBe("Aktie");
  });

  it("rejects more terms than the schema allows, counted after deduplication", () => {
    const lines = Array.from(
      { length: BRAND_PROFILE_TERM_LIMITS.maxTerms + 3 },
      (_value, index) => `Begriff ${index}`,
    );
    const result = read("terms", [
      ["verbotene_begriffe", lines.join("\n")],
      ["bevorzugte_begriffe", ""],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.verbotene_begriffe).toBe(
      "Höchstens 50 Begriffe, aktuell 53.",
    );
  });

  it("treats a missing declared field as a broken form", () => {
    const result = read("terms", [["verbotene_begriffe", "Kursziel"]]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(BRAND_PROFILE_EDITOR_FORM_MESSAGE);
  });

  it("reads its limits from BRAND_PROFILE_LIMITS, with no second number set", () => {
    expect(BRAND_PROFILE_TERM_LIMITS.maxTerms).toBe(
      BRAND_PROFILE_LIMITS.begriffe_max,
    );
    expect(BRAND_PROFILE_TERM_LIMITS.maxTermLength).toBe(
      BRAND_PROFILE_LIMITS.begriff,
    );
    expect(BRAND_PROFILE_TERM_FIELDS.map((field) => field.key)).toEqual([
      "verbotene_begriffe",
      "bevorzugte_begriffe",
    ]);
  });
});

describe("readEditorSection: examples", () => {
  const NAME = BRAND_PROFILE_BEISPIELTEXTE_CONFIG.fieldName;

  it("reads the rows in order and owns only its group", () => {
    const result = read("examples", [
      [NAME, "Erster Artikel"],
      [NAME, "Zweiter Artikel"],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields).toEqual({
      beispieltexte: ["Erster Artikel", "Zweiter Artikel"],
    });
    expect("rawAktiv" in result.patch).toBe(false);
  });

  it("passes a blank row through, because the schema drops it", () => {
    const result = read("examples", [
      [NAME, "Erster Artikel"],
      [NAME, "   "],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields.beispieltexte).toEqual([
      "Erster Artikel",
      "   ",
    ]);
  });

  it("clears the group when the last row was removed", () => {
    const result = read("examples", []);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.rawFields).toEqual({ beispieltexte: [] });
  });

  it("names limit and actual length at the offending row", () => {
    const tooLong = "x".repeat(BRAND_PROFILE_LIMITS.beispieltext + 412);
    const result = read("examples", [
      [NAME, "Kurz"],
      [NAME, tooLong],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors).toEqual({
      [`${NAME}:1`]: "Höchstens 3.000 Zeichen, aktuell 3.412.",
    });
    // Nothing is truncated: the rejected text comes back in full.
    expect(result.values[`${NAME}:1`]).toHaveLength(tooLong.length);
  });

  it("rejects more rows than the schema allows, with the count", () => {
    const entries: [string, string][] = Array.from(
      { length: BRAND_PROFILE_BEISPIELTEXTE_CONFIG.maxTexts + 1 },
      (_value, index) => [NAME, `Artikel ${index}`],
    );

    const result = read("examples", entries);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("Höchstens 3 Beispieltexte, aktuell 4.");
  });

  it("reads its limits from BRAND_PROFILE_LIMITS, with no second number set", () => {
    expect(BRAND_PROFILE_BEISPIELTEXTE_CONFIG.maxTexts).toBe(
      BRAND_PROFILE_LIMITS.beispieltexte_max,
    );
    expect(BRAND_PROFILE_BEISPIELTEXTE_CONFIG.maxTextLength).toBe(
      BRAND_PROFILE_LIMITS.beispieltext,
    );
    expect(BRAND_PROFILE_PFLICHTELEMENTE_CONFIG.maxElements).toBe(
      BRAND_PROFILE_LIMITS.pflichtelemente_max,
    );
    expect(BRAND_PROFILE_PFLICHTELEMENTE_CONFIG.maxTextLength).toBe(
      BRAND_PROFILE_LIMITS.pflichtelement_text,
    );
  });
});
