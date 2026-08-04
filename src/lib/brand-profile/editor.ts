import { z } from "zod";

import { parseBrandProfileDescription, parseBrandProfileName } from "./input";
import type { SaveBrandProfileResult } from "./save";
import {
  BRAND_PROFILE_LIMITS,
  brandProfileBeispieltextSchema,
  brandProfileFieldsSchema,
  brandProfilePflichtelementSchema,
  brandProfileZeichenLimitSchema,
  inspectTermList,
  PFLICHTELEMENT_POSITIONS,
  type BrandProfileFields,
  type Formatregeln,
  type PflichtelementPosition,
} from "./schema";

// The form boundary of the brand profile editor (tasks 20a/20b): section
// registry, field descriptors, the FormData readers and the German messages.
// Pure and database-free — the only value import that reaches a database is the
// server action itself, which is a thin shell around saveBrandProfile.
//
// The one type import from ./save is erased at compile time and creates no
// runtime edge; it exists so the result mapping below cannot drift from the
// result union it maps.
//
// EXTENSION POINT: add the section value, its reader and its field descriptors
// here. The switch in readEditorSection is exhaustive over the section union,
// so a value without a reader is a compile error rather than a section that
// silently saves nothing.
//
// NOTHING here validates in place of saveBrandProfile. Every check below asks
// the very schema node the merged parse will use and only formulates the German
// sentence itself, so an inline message can never contradict the boundary that
// actually decides.

// ---------------------------------------------------------------------------
// Sections

// A section decides which groups a submit owns, so it steers control flow and
// its values are ENGLISH even though the field keys are German (A15, same rule
// as the pflichtelement positions start | end).
export const BRAND_PROFILE_EDITOR_SECTIONS = [
  "profile",
  "freetext",
  "mandatory",
  "format",
  "terms",
  "examples",
] as const;
export type BrandProfileEditorSection =
  (typeof BRAND_PROFILE_EDITOR_SECTIONS)[number];

const sectionSchema = z.enum(BRAND_PROFILE_EDITOR_SECTIONS);

// Unknown or missing section: fail-closed. A submit that cannot say what it
// owns must never be guessed into a patch — the guess would either wipe groups
// it does not own or silently save nothing.
export function parseEditorSection(
  raw: unknown,
): BrandProfileEditorSection | null {
  const parsed = sectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Field descriptors
//
// Every descriptor carries the numbers the markup and the messages need, all
// read from BRAND_PROFILE_LIMITS. The client components receive them as PROPS:
// a value import of this module would drag zod into the client bundle (measured
// in task 20a: a 284 KB chunk the build has none of otherwise).

// `satisfies` against the parsed field set: a typo in a key is a compile
// error here instead of a group that silently never saves.
const FREETEXT_KEYS = [
  "zielgruppe",
  "tonalitaet",
  "dos",
  "donts",
  "harte_verbote",
  "stil_fingerabdruck",
] as const satisfies readonly (keyof BrandProfileFields)[];

export type BrandProfileFreetextKey = (typeof FREETEXT_KEYS)[number];

export interface BrandProfileFreetextField {
  key: BrandProfileFreetextKey;
  label: string;
  hint: string;
  // The number in the error message. Deliberately NOT a maxLength attribute:
  // maxLength truncates a paste silently, and this message could then never
  // appear because the field could not hold the overshoot.
  maxLength: number;
  rows: number;
}

const FREETEXT_LABELS: Record<
  BrandProfileFreetextKey,
  { label: string; hint: string; rows: number }
> = {
  zielgruppe: {
    label: "Zielgruppe",
    hint: "Für wen schreibt ihr? Drei bis fünf Sätze reichen.",
    rows: 4,
  },
  tonalitaet: {
    label: "Tonalität",
    hint: "Wie klingt ihr? Ansprache, Satzlänge, Haltung.",
    rows: 4,
  },
  dos: {
    label: "Do's",
    hint: "Regeln, die jeder Artikel einhält.",
    rows: 5,
  },
  donts: {
    label: "Don'ts",
    hint: "Muster und Formulierungen, die nicht vorkommen sollen.",
    rows: 5,
  },
  harte_verbote: {
    label: "Harte Verbote",
    hint: "Aussagen, die nie vorkommen dürfen, zum Beispiel Kauf- oder Verkaufsempfehlungen.",
    rows: 5,
  },
  stil_fingerabdruck: {
    label: "Stil-Fingerabdruck",
    hint: "Wie eure Texte gebaut sind: Satzlänge, Einstiege, typische Wendungen.",
    rows: 6,
  },
};

export const BRAND_PROFILE_FREETEXT_FIELDS: readonly BrandProfileFreetextField[] =
  FREETEXT_KEYS.map((key) => ({
    key,
    label: FREETEXT_LABELS[key].label,
    hint: FREETEXT_LABELS[key].hint,
    rows: FREETEXT_LABELS[key].rows,
    maxLength: BRAND_PROFILE_LIMITS[key],
  }));

// --- mandatory elements ---

export const PFLICHTELEMENT_FIELD_NAMES = {
  id: "pflichtelement_id",
  text: "pflichtelement_text",
  position: "pflichtelement_position",
} as const;

export interface BrandProfilePflichtelementeConfig {
  // The VALUES come from the schema; the German labels are a UI mapping in the
  // client component (A15). Sending them from here keeps the order stable.
  positions: readonly PflichtelementPosition[];
  defaultPosition: PflichtelementPosition;
  maxElements: number;
  maxTextLength: number;
  fieldNames: typeof PFLICHTELEMENT_FIELD_NAMES;
}

export const BRAND_PROFILE_PFLICHTELEMENTE_CONFIG: BrandProfilePflichtelementeConfig =
  {
    positions: PFLICHTELEMENT_POSITIONS,
    // The PRD's own example is the AI notice at the end of an article.
    defaultPosition: "end",
    maxElements: BRAND_PROFILE_LIMITS.pflichtelemente_max,
    maxTextLength: BRAND_PROFILE_LIMITS.pflichtelement_text,
    fieldNames: PFLICHTELEMENT_FIELD_NAMES,
  };

// --- format rules ---

const FORMAT_NUMBER_KEYS = [
  "max_kicker_zeichen",
  "max_titel_zeichen",
  "max_seo_titel_zeichen",
  "max_teaser_zeichen",
] as const satisfies readonly (keyof Formatregeln)[];

export type BrandProfileFormatNumberKey = (typeof FORMAT_NUMBER_KEYS)[number];

export const BRAND_PROFILE_FORMAT_FLAG_KEY = "keine_relativen_zeitangaben";

export interface BrandProfileFormatField {
  key: BrandProfileFormatNumberKey;
  label: string;
}

const FORMAT_LABELS: Record<BrandProfileFormatNumberKey, string> = {
  max_kicker_zeichen: "Kicker",
  max_titel_zeichen: "Titel",
  max_seo_titel_zeichen: "SEO-Titel",
  max_teaser_zeichen: "Teaser",
};

export const BRAND_PROFILE_FORMAT_FIELDS: readonly BrandProfileFormatField[] =
  FORMAT_NUMBER_KEYS.map((key) => ({ key, label: FORMAT_LABELS[key] }));

export const BRAND_PROFILE_FORMAT_FLAG_LABEL = "Keine relativen Zeitangaben";
export const BRAND_PROFILE_FORMAT_FLAG_HINT =
  "Prüft den Artikel auf Wörter wie gestern, heute oder kürzlich.";

// --- terms ---

const TERM_KEYS = [
  "verbotene_begriffe",
  "bevorzugte_begriffe",
] as const satisfies readonly (keyof BrandProfileFields)[];

export type BrandProfileTermKey = (typeof TERM_KEYS)[number];

export interface BrandProfileTermField {
  key: BrandProfileTermKey;
  label: string;
  hint: string;
  rows: number;
}

const TERM_LABELS: Record<
  BrandProfileTermKey,
  { label: string; hint: string; rows: number }
> = {
  verbotene_begriffe: {
    label: "Verbotene Begriffe",
    hint: "Kommt einer davon im Artikel vor, kann er nicht BEREIT werden.",
    rows: 6,
  },
  bevorzugte_begriffe: {
    label: "Bevorzugte Begriffe",
    hint: "Diese Schreibweisen gibt das System dem Modell vor, erzwungen werden sie nicht.",
    rows: 6,
  },
};

export const BRAND_PROFILE_TERM_FIELDS: readonly BrandProfileTermField[] =
  TERM_KEYS.map((key) => ({ key, ...TERM_LABELS[key] }));

export const BRAND_PROFILE_TERM_LIMITS = {
  maxTerms: BRAND_PROFILE_LIMITS.begriffe_max,
  maxTermLength: BRAND_PROFILE_LIMITS.begriff,
} as const;

// --- example texts ---

export const BEISPIELTEXT_FIELD_NAME = "beispieltext";

export interface BrandProfileBeispieltexteConfig {
  maxTexts: number;
  maxTextLength: number;
  fieldName: typeof BEISPIELTEXT_FIELD_NAME;
}

export const BRAND_PROFILE_BEISPIELTEXTE_CONFIG: BrandProfileBeispieltexteConfig =
  {
    maxTexts: BRAND_PROFILE_LIMITS.beispieltexte_max,
    maxTextLength: BRAND_PROFILE_LIMITS.beispieltext,
    fieldName: BEISPIELTEXT_FIELD_NAME,
  };

// ---------------------------------------------------------------------------
// Messages

export const BRAND_PROFILE_EDITOR_FIELDS_MESSAGE =
  "Bitte prüfe die markierten Felder.";
// A section that arrives incomplete (missing field, unknown section value,
// misaligned rows) is a broken form, not a user mistake: say what to do,
// change nothing.
export const BRAND_PROFILE_EDITOR_FORM_MESSAGE =
  "Das Formular war unvollständig. Bitte lade die Seite neu und speichere erneut.";
export const BRAND_PROFILE_EDITOR_CONFLICT_MESSAGE =
  "Gleichzeitig wurde an diesem Profil gespeichert. Lade die Seite neu und speichere erneut.";
export const BRAND_PROFILE_EDITOR_LOGIN_MESSAGE =
  "Bitte melde dich an, um dieses Marken-Profil zu speichern.";
export const BRAND_PROFILE_PFLICHTELEMENT_EMPTY_MESSAGE =
  "Bitte gib den Text ein oder entferne die Zeile.";
export const BRAND_PROFILE_FORMAT_INVALID_MESSAGE = `Bitte gib eine ganze Zahl zwischen 1 und ${new Intl.NumberFormat(
  "de-DE",
).format(BRAND_PROFILE_LIMITS.formatregel_zeichen)} ein.`;

const numberFormat = new Intl.NumberFormat("de-DE");
const listFormat = new Intl.ListFormat("de-DE", {
  style: "long",
  type: "conjunction",
});

export function tooLongMessage(maxLength: number, actualLength: number): string {
  return `Höchstens ${numberFormat.format(maxLength)} Zeichen, aktuell ${numberFormat.format(actualLength)}.`;
}

export function tooManyMessage(
  noun: string,
  maxCount: number,
  actualCount: number,
): string {
  return `Höchstens ${numberFormat.format(maxCount)} ${noun}, aktuell ${numberFormat.format(actualCount)}.`;
}

// Names WHICH entry is too long, never just that one is. One offending line
// gets the exact numbers; several get named together in one sentence.
export function termsTooLongMessage(
  lines: number[],
  maxLength: number,
  actualLength: number,
): string {
  if (lines.length === 1) {
    return `Zeile ${numberFormat.format(lines[0])} ist zu lang. ${tooLongMessage(maxLength, actualLength)}`;
  }
  const named = listFormat.format(lines.map((line) => numberFormat.format(line)));
  return `Zeilen ${named} sind zu lang. Höchstens ${numberFormat.format(maxLength)} Zeichen je Begriff.`;
}

// What the save removed from what the user typed. The textarea shows the
// stored result afterwards, so this sentence explains a change the user can
// see rather than announcing an invisible one (no silent state, brand book
// 6.1). No note at all when nothing was dropped.
export function termsRemovedNote(
  label: string,
  duplicates: number,
  blanks: number,
): string | null {
  const parts: string[] = [];
  if (duplicates > 0) {
    parts.push(
      duplicates === 1 ? "1 Doppelung" : `${numberFormat.format(duplicates)} Doppelungen`,
    );
  }
  if (blanks > 0) {
    parts.push(
      blanks === 1 ? "1 leere Zeile" : `${numberFormat.format(blanks)} leere Zeilen`,
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return `${label}: ${parts.join(" und ")} entfernt.`;
}

// ---------------------------------------------------------------------------
// Reading a section

// Exactly the shape saveBrandProfile takes as a patch: an absent key means
// unchanged. A section therefore lists only what it owns, and no section has
// to carry another section's values.
export interface BrandProfileEditorPatch {
  rawName?: unknown;
  rawDescription?: unknown;
  rawAktiv?: unknown;
  rawFields: Record<string, unknown>;
}

export type ReadEditorSectionResult =
  | {
      ok: true;
      patch: BrandProfileEditorPatch;
      values: Record<string, string>;
      notes: string[];
    }
  | {
      ok: false;
      message: string;
      fieldErrors: Record<string, string>;
      values: Record<string, string>;
    };

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

// A checkbox in the echo. "on" is what the browser sends for a ticked box, and
// an unticked one sends nothing — the empty string stands for that absence.
export function checkboxValue(checked: boolean): string {
  return checked ? "on" : "";
}

function brokenForm(values: Record<string, string>): ReadEditorSectionResult {
  return {
    ok: false,
    message: BRAND_PROFILE_EDITOR_FORM_MESSAGE,
    fieldErrors: {},
    values,
  };
}

function sectionMessage(
  message: string,
  values: Record<string, string>,
): ReadEditorSectionResult {
  return { ok: false, message, fieldErrors: {}, values };
}

// aktiv arrives pre-mapped from the action: an unchecked HTML checkbox sends
// nothing at all, and turning that absence into `false` is a form-boundary
// decision that stays at the boundary (task-19 note). Every section that does
// not own the flag ignores it — its patch does not mention it.
export function readEditorSection(
  section: BrandProfileEditorSection,
  formData: FormData,
  options: { aktiv: boolean },
): ReadEditorSectionResult {
  switch (section) {
    case "profile":
      return readProfileSection(formData, options);
    case "freetext":
      return readFreetextSection(formData);
    case "mandatory":
      return readMandatorySection(formData);
    case "format":
      return readFormatSection(formData);
    case "terms":
      return readTermsSection(formData);
    case "examples":
      return readExamplesSection(formData);
  }
}

function readProfileSection(
  formData: FormData,
  options: { aktiv: boolean },
): ReadEditorSectionResult {
  const rawName = formData.get("name");
  const rawDescription = formData.get("description");
  const values: Record<string, string> = {
    name: formString(rawName),
    description: formString(rawDescription),
  };

  // The checkbox echoes like every other field. Without it a rejected save
  // would silently drop a freshly set tick: React restores an uncontrolled
  // checkbox to its defaultChecked on re-render, so the flag has to travel
  // back with the values (found in the 20b walkthrough).
  values.aktiv = checkboxValue(options.aktiv);

  const fieldErrors: Record<string, string> = {};
  const name = parseBrandProfileName(rawName);
  if (!name.ok) {
    fieldErrors.name = name.message;
  }
  const description = parseBrandProfileDescription(rawDescription);
  if (!description.ok) {
    fieldErrors.description = description.message;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors,
      values,
    };
  }

  // The RAW values go into the patch, not the parsed ones: this module
  // produces messages, saveBrandProfile stays the validating boundary.
  return {
    ok: true,
    patch: {
      rawName,
      rawDescription,
      rawAktiv: options.aktiv,
      rawFields: {},
    },
    values,
    notes: [],
  };
}

function readFreetextSection(formData: FormData): ReadEditorSectionResult {
  const values: Record<string, string> = {};
  const fieldErrors: Record<string, string> = {};
  const rawFields: Record<string, unknown> = {};

  for (const field of BRAND_PROFILE_FREETEXT_FIELDS) {
    const raw = formData.get(field.key);
    // A rendered textarea always submits at least "". Anything else means the
    // form was not the one we rendered — fail-closed, write nothing.
    if (typeof raw !== "string") {
      return brokenForm(values);
    }
    values[field.key] = raw;
    rawFields[field.key] = raw;

    // The very same schema node the merged parse in saveBrandProfile uses —
    // no second validation, so the inline message can never contradict the
    // boundary that actually decides.
    if (!brandProfileFieldsSchema.shape[field.key].safeParse(raw).success) {
      const trimmedLength = raw.trim().length;
      fieldErrors[field.key] =
        trimmedLength > field.maxLength
          ? tooLongMessage(field.maxLength, trimmedLength)
          : BRAND_PROFILE_EDITOR_FORM_MESSAGE;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors,
      values,
    };
  }

  return { ok: true, patch: { rawFields }, values, notes: [] };
}

// The three controls of a row are read with getAll and zipped by position.
// They cannot drift apart because none of them is a checkbox: a hidden input,
// a textarea and a select always submit, so every row contributes exactly one
// entry to each list, in document order — and that order is content (the
// task-19 hash canonicalizer keeps array order).
function readMandatorySection(formData: FormData): ReadEditorSectionResult {
  const config = BRAND_PROFILE_PFLICHTELEMENTE_CONFIG;
  const ids = formData.getAll(config.fieldNames.id);
  const texts = formData.getAll(config.fieldNames.text);
  const positions = formData.getAll(config.fieldNames.position);
  const values: Record<string, string> = {};

  if (ids.length !== texts.length || ids.length !== positions.length) {
    return brokenForm(values);
  }
  if (ids.length > config.maxElements) {
    return sectionMessage(
      tooManyMessage("Pflichtelemente", config.maxElements, ids.length),
      values,
    );
  }

  const rows: { id: string; text: string; position: string }[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const text = texts[index];
    const position = positions[index];
    if (
      typeof id !== "string" ||
      typeof text !== "string" ||
      typeof position !== "string"
    ) {
      return brokenForm(values);
    }
    values[`${config.fieldNames.text}:${id}`] = text;
    rows.push({ id, text, position });
  }

  const fieldErrors: Record<string, string> = {};
  for (const row of rows) {
    const parsed = brandProfilePflichtelementSchema.safeParse(row);
    if (parsed.success) {
      continue;
    }
    // An id we did not generate or a position value we never rendered is a
    // broken form, not something a user can fix in a text field.
    const structural = parsed.error.issues.some(
      (issue) => issue.path[0] === "id" || issue.path[0] === "position",
    );
    if (structural) {
      return brokenForm(values);
    }
    const trimmedLength = row.text.trim().length;
    fieldErrors[`${config.fieldNames.text}:${row.id}`] =
      trimmedLength > config.maxTextLength
        ? tooLongMessage(config.maxTextLength, trimmedLength)
        : BRAND_PROFILE_PFLICHTELEMENT_EMPTY_MESSAGE;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors,
      values,
    };
  }

  return { ok: true, patch: { rawFields: { pflichtelemente: rows } }, values, notes: [] };
}

// The patch replaces a group WHOLE, so this section always sends all five
// keys. A partial group would silently reset the flag to its default and drop
// the three rules the user did not touch in this submit.
function readFormatSection(formData: FormData): ReadEditorSectionResult {
  const flag = formData.get(BRAND_PROFILE_FORMAT_FLAG_KEY) === "on";
  // Echoed like every other field, so a rejection somewhere else cannot drop a
  // freshly set tick (see the note in readProfileSection).
  const values: Record<string, string> = {
    [BRAND_PROFILE_FORMAT_FLAG_KEY]: checkboxValue(flag),
  };
  const fieldErrors: Record<string, string> = {};
  const formatregeln: Record<string, unknown> = {
    [BRAND_PROFILE_FORMAT_FLAG_KEY]: flag,
  };

  for (const field of BRAND_PROFILE_FORMAT_FIELDS) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string") {
      return brokenForm(values);
    }
    values[field.key] = raw;

    const trimmed = raw.trim();
    // Empty is the canonical "not configured" and must not become 0 or NaN.
    const value = trimmed === "" ? null : Number(trimmed);
    formatregeln[field.key] = value;

    if (!brandProfileZeichenLimitSchema.safeParse(value).success) {
      fieldErrors[field.key] = BRAND_PROFILE_FORMAT_INVALID_MESSAGE;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors,
      values,
    };
  }

  return { ok: true, patch: { rawFields: { formatregeln } }, values, notes: [] };
}

function readTermsSection(formData: FormData): ReadEditorSectionResult {
  const values: Record<string, string> = {};
  const fieldErrors: Record<string, string> = {};
  const rawFields: Record<string, unknown> = {};
  const notes: string[] = [];

  for (const field of BRAND_PROFILE_TERM_FIELDS) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string") {
      return brokenForm(values);
    }
    // Echo the typed text while something is wrong; the canonical text below
    // replaces it once the section is accepted.
    values[field.key] = raw;

    // An empty field has no lines at all. Splitting "" would produce one
    // blank entry and the note would announce a removal that never happened —
    // noise is the other failure mode of "no silent state".
    const lines = raw.trim() === "" ? [] : raw.split(/\r?\n/);
    // The schema module normalizes, this module only reports: one
    // implementation, two views (inspectTermList).
    const report = inspectTermList(lines);
    rawFields[field.key] = report.terms;

    const tooLong = report.entries.filter((entry) => entry.status === "too_long");
    if (tooLong.length > 0) {
      fieldErrors[field.key] = termsTooLongMessage(
        tooLong.map((entry) => entry.line),
        BRAND_PROFILE_TERM_LIMITS.maxTermLength,
        tooLong[0].term.length,
      );
      continue;
    }
    if (report.terms.length > BRAND_PROFILE_TERM_LIMITS.maxTerms) {
      fieldErrors[field.key] = tooManyMessage(
        "Begriffe",
        BRAND_PROFILE_TERM_LIMITS.maxTerms,
        report.terms.length,
      );
      continue;
    }

    values[field.key] = report.terms.join("\n");
    const note = termsRemovedNote(
      field.label,
      report.entries.filter((entry) => entry.status === "duplicate").length,
      report.entries.filter((entry) => entry.status === "blank").length,
    );
    if (note) {
      notes.push(note);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors,
      // A rejected section keeps every typed line, including the blank ones.
      values: Object.fromEntries(
        BRAND_PROFILE_TERM_FIELDS.map((field) => [
          field.key,
          formString(formData.get(field.key)),
        ]),
      ),
    };
  }

  return { ok: true, patch: { rawFields }, values, notes };
}

function readExamplesSection(formData: FormData): ReadEditorSectionResult {
  const config = BRAND_PROFILE_BEISPIELTEXTE_CONFIG;
  const raw = formData.getAll(config.fieldName);
  const values: Record<string, string> = {};

  if (raw.length > config.maxTexts) {
    return sectionMessage(
      tooManyMessage("Beispieltexte", config.maxTexts, raw.length),
      values,
    );
  }

  const texts: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    if (typeof value !== "string") {
      return brokenForm(values);
    }
    values[`${config.fieldName}:${index}`] = value;
    texts.push(value);
  }

  const fieldErrors: Record<string, string> = {};
  texts.forEach((text, index) => {
    const trimmed = text.trim();
    // A blank row is an unused slot, not an error: the schema drops it and the
    // row disappears when the section re-renders from what was stored.
    if (trimmed === "") {
      return;
    }
    if (!brandProfileBeispieltextSchema.safeParse(trimmed).success) {
      fieldErrors[`${config.fieldName}:${index}`] = tooLongMessage(
        config.maxTextLength,
        trimmed.length,
      );
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: BRAND_PROFILE_EDITOR_FIELDS_MESSAGE,
      fieldErrors,
      values,
    };
  }

  return { ok: true, patch: { rawFields: { beispieltexte: texts } }, values, notes: [] };
}

// ---------------------------------------------------------------------------
// Form state

export type BrandProfileEditorFormState =
  | { status: "idle" }
  | { status: "saved"; version: number; deduped: boolean; notes: string[] }
  | {
      status: "invalid";
      message: string;
      fieldErrors: Record<string, string>;
      values: Record<string, string>;
    }
  | { status: "conflict"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "not_found"; message: string }
  | { status: "unauthenticated"; message: string };

// Every branch of the save result reaches the user with a German sentence —
// including the two that only happen when a profile disappears or the
// membership is revoked between render and save (no silent failure, DoD 4).
export function toEditorFormState(
  result: SaveBrandProfileResult,
  values: Record<string, string>,
  notes: string[] = [],
): BrandProfileEditorFormState {
  switch (result.status) {
    case "saved":
      return {
        status: "saved",
        version: result.version,
        deduped: result.deduped,
        notes,
      };
    case "conflict":
      return {
        status: "conflict",
        message: BRAND_PROFILE_EDITOR_CONFLICT_MESSAGE,
      };
    case "invalid":
      // Reached only by a patch the form boundary could not pre-check (a
      // direct POST): coarse message, no field markers, values echoed.
      return {
        status: "invalid",
        message: result.message,
        fieldErrors: {},
        values,
      };
    case "forbidden":
      return { status: "forbidden", message: result.message };
    case "not_found":
      return { status: "not_found", message: result.message };
  }
}
