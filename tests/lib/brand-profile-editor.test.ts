import { describe, expect, it } from "vitest";

import {
  BRAND_PROFILE_EDITOR_CONFLICT_MESSAGE,
  BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
  BRAND_PROFILE_EDITOR_FORM_MESSAGE,
  BRAND_PROFILE_FREETEXT_FIELDS,
  parseEditorSection,
  readEditorSection,
  toEditorFormState,
} from "@/lib/brand-profile/editor";
import {
  BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE,
  BRAND_PROFILE_NAME_INVALID_MESSAGE,
  parseBrandProfileDescription,
  parseBrandProfileInput,
  parseBrandProfileName,
} from "@/lib/brand-profile/input";
import { BRAND_PROFILE_LIMITS } from "@/lib/brand-profile/schema";

// The editor's form boundary (task 20a): section registry, FormData readers,
// per-field echo and result mapping. Pure — no database, no FormData quirks
// hidden anywhere else.

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function freetextEntries(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const field of BRAND_PROFILE_FREETEXT_FIELDS) {
    entries[field.key] = "";
  }
  return { ...entries, ...overrides };
}

describe("parseEditorSection", () => {
  it.each(["profile", "freetext"])("accepts the known section %s", (value) => {
    expect(parseEditorSection(value)).toBe(value);
  });

  it.each([
    ["a missing value", null],
    ["an empty string", ""],
    // The values steer control flow, so they are English (A15). The German
    // word is not a synonym here, it is an unknown section.
    ["the German word", "profil"],
    ["a number", 42],
    ["an unknown section", "pflichtelemente"],
  ])("rejects %s fail-closed", (_label, value) => {
    expect(parseEditorSection(value)).toBeNull();
  });
});

describe("readEditorSection: profile", () => {
  it("owns name, description and aktiv and touches no field group", () => {
    const read = readEditorSection(
      "profile",
      formData({ name: "  Hausstil  ", description: " Kurz " }),
      { aktiv: true },
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // Raw values go into the patch: this module produces messages, the save
    // boundary validates.
    expect(read.patch).toEqual({
      rawName: "  Hausstil  ",
      rawDescription: " Kurz ",
      rawAktiv: true,
      rawFields: {},
    });
    expect(read.values).toEqual({
      name: "  Hausstil  ",
      description: " Kurz ",
      // The checkbox echoes too (task 20b): React restores an uncontrolled
      // checkbox to its defaultChecked on re-render, so a rejected save would
      // otherwise drop a freshly changed tick.
      aktiv: "on",
    });
  });

  it("passes a false checkbox through as false, never as absent", () => {
    const read = readEditorSection(
      "profile",
      formData({ name: "Hausstil", description: "" }),
      { aktiv: false },
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.patch.rawAktiv).toBe(false);
    expect("rawAktiv" in read.patch).toBe(true);
  });

  it("echoes both field errors at once and produces no patch", () => {
    const read = readEditorSection(
      "profile",
      formData({ name: "   ", description: "y".repeat(501) }),
      { aktiv: true },
    );

    expect(read).toEqual({
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors: {
        name: BRAND_PROFILE_NAME_INVALID_MESSAGE,
        description: BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE,
      },
      values: { name: "   ", description: "y".repeat(501), aktiv: "on" },
    });
  });

  it("echoes the checkbox through a rejection, in both directions", () => {
    // Found in the 20b walkthrough: without this the tick a user just set is
    // gone after an unrelated field error, and the next save writes the old
    // value without ever saying so.
    const ticked = readEditorSection("profile", formData({ name: "   " }), {
      aktiv: true,
    });
    const unticked = readEditorSection("profile", formData({ name: "   " }), {
      aktiv: false,
    });

    expect(ticked.ok).toBe(false);
    expect(unticked.ok).toBe(false);
    if (ticked.ok || unticked.ok) return;
    expect(ticked.values.aktiv).toBe("on");
    expect(unticked.values.aktiv).toBe("");
  });
});

describe("readEditorSection: freetext", () => {
  it("owns exactly the six free text groups and no identity field", () => {
    const read = readEditorSection("freetext", formData(freetextEntries()), {
      aktiv: true,
    });

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Object.keys(read.patch.rawFields).sort()).toEqual(
      BRAND_PROFILE_FREETEXT_FIELDS.map((field) => field.key).sort(),
    );
    // The core of decision B: a section that does not own the identity fields
    // does not mention them, so the save leaves them unchanged.
    expect("rawName" in read.patch).toBe(false);
    expect("rawDescription" in read.patch).toBe(false);
    expect("rawAktiv" in read.patch).toBe(false);
  });

  it("ignores form entries it does not own", () => {
    const read = readEditorSection(
      "freetext",
      formData({
        ...freetextEntries({ zielgruppe: "Fachpublikum" }),
        name: "Von einem fremden Formular",
        pflichtelemente: "[]",
      }),
      { aktiv: true },
    );

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.patch.rawFields).toEqual(
      freetextEntries({ zielgruppe: "Fachpublikum" }),
    );
  });

  it("treats a missing declared field as a broken form, not as an empty field", () => {
    const entries = freetextEntries();
    delete entries.donts;

    const read = readEditorSection("freetext", formData(entries), {
      aktiv: true,
    });

    expect(read).toEqual({
      ok: false,
      message: BRAND_PROFILE_EDITOR_FORM_MESSAGE,
      fieldErrors: {},
      // Everything read before the gap; nothing is written either way.
      values: expect.any(Object),
    });
  });

  it("accepts whitespace as an empty field", () => {
    const read = readEditorSection(
      "freetext",
      formData(freetextEntries({ tonalitaet: "   \n  " })),
      { aktiv: true },
    );

    expect(read.ok).toBe(true);
  });

  it("measures the limit after trimming", () => {
    const exact = "x".repeat(BRAND_PROFILE_LIMITS.zielgruppe);
    const read = readEditorSection(
      "freetext",
      formData(freetextEntries({ zielgruppe: `  ${exact}  ` })),
      { aktiv: true },
    );

    expect(read.ok).toBe(true);
  });

  it("names limit and actual length in the inline message", () => {
    const read = readEditorSection(
      "freetext",
      formData(
        freetextEntries({
          zielgruppe: "x".repeat(BRAND_PROFILE_LIMITS.zielgruppe + 1),
        }),
      ),
      { aktiv: true },
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.message).toBe(BRAND_PROFILE_EDITOR_FIELDS_MESSAGE);
    expect(read.fieldErrors).toEqual({
      zielgruppe: "Höchstens 600 Zeichen, aktuell 601.",
    });
  });

  it("writes German thousands separators into the message", () => {
    const read = readEditorSection(
      "freetext",
      formData(
        freetextEntries({ dos: "x".repeat(BRAND_PROFILE_LIMITS.dos + 1) }),
      ),
      { aktiv: true },
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.fieldErrors.dos).toBe(
      "Höchstens 1.000 Zeichen, aktuell 1.001.",
    );
  });

  it("marks every offending field, not just the first", () => {
    const read = readEditorSection(
      "freetext",
      formData(
        freetextEntries({
          zielgruppe: "x".repeat(BRAND_PROFILE_LIMITS.zielgruppe + 1),
          donts: "y".repeat(BRAND_PROFILE_LIMITS.donts + 1),
        }),
      ),
      { aktiv: true },
    );

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(Object.keys(read.fieldErrors).sort()).toEqual([
      "donts",
      "zielgruppe",
    ]);
    // The typed values survive the rejection.
    expect(read.values.zielgruppe).toHaveLength(
      BRAND_PROFILE_LIMITS.zielgruppe + 1,
    );
  });
});

describe("field descriptors", () => {
  it("reads its maximum from BRAND_PROFILE_LIMITS, with no second number set", () => {
    for (const field of BRAND_PROFILE_FREETEXT_FIELDS) {
      expect(field.maxLength).toBe(BRAND_PROFILE_LIMITS[field.key]);
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.hint.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the six free text groups", () => {
    expect(BRAND_PROFILE_FREETEXT_FIELDS.map((field) => field.key)).toEqual([
      "zielgruppe",
      "tonalitaet",
      "dos",
      "donts",
      "harte_verbote",
      "stil_fingerabdruck",
    ]);
  });
});

describe("input parity: the per-field parsers and the coarse composite", () => {
  // The composite is built on the per-field parsers, and this proves the two
  // shapes cannot drift: whatever the field parser says is what the composite
  // reports, in field order.
  it.each([
    ["both valid", "Hausstil", "Kurz"],
    ["name blank", "   ", "Kurz"],
    ["name too long", "x".repeat(81), "Kurz"],
    ["description too long", "Hausstil", "y".repeat(501)],
    ["both wrong", "", "y".repeat(501)],
  ])("agrees for %s", (_label, rawName, rawDescription) => {
    const name = parseBrandProfileName(rawName);
    const description = parseBrandProfileDescription(rawDescription);
    const composite = parseBrandProfileInput(rawName, rawDescription);

    if (!name.ok) {
      expect(composite).toEqual({ ok: false, message: name.message });
      return;
    }
    if (!description.ok) {
      expect(composite).toEqual({ ok: false, message: description.message });
      return;
    }
    expect(composite).toEqual({
      ok: true,
      name: name.value,
      description: description.value,
    });
  });
});

describe("toEditorFormState", () => {
  const values = { name: "Hausstil" };

  it("reports a written version", () => {
    // notes are what a section's normalization removed (task 20b); the 20a
    // sections normalize nothing and send an empty list.
    expect(
      toEditorFormState({ status: "saved", version: 4, deduped: false }, values),
    ).toEqual({ status: "saved", version: 4, deduped: false, notes: [] });
  });

  it("reports a deduplicated save as its own state", () => {
    // Not silence: the editor says the version stayed where it is.
    expect(
      toEditorFormState({ status: "saved", version: 3, deduped: true }, values),
    ).toEqual({ status: "saved", version: 3, deduped: true, notes: [] });
  });

  it("gives the version conflict its German sentence", () => {
    expect(toEditorFormState({ status: "conflict" }, values)).toEqual({
      status: "conflict",
      message: BRAND_PROFILE_EDITOR_CONFLICT_MESSAGE,
    });
  });

  it.each([
    ["forbidden", "Dafür fehlt dir die Berechtigung."],
    ["not_found", "Dieses Marken-Profil gibt es nicht."],
  ] as const)("passes %s through with its message", (status, message) => {
    // Both are reachable between render and save (membership revoked, profile
    // deleted) and must reach the user as a sentence, not as silence.
    expect(toEditorFormState({ status, message }, values)).toEqual({
      status,
      message,
    });
  });

  it("echoes the typed values on a late invalid", () => {
    expect(
      toEditorFormState({ status: "invalid", message: "Passt nicht." }, values),
    ).toEqual({
      status: "invalid",
      message: "Passt nicht.",
      fieldErrors: {},
      values,
    });
  });
});
