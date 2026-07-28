import { z } from "zod";

import {
  parseBrandProfileDescription,
  parseBrandProfileName,
} from "./input";
import type { SaveBrandProfileResult } from "./save";
import {
  BRAND_PROFILE_LIMITS,
  brandProfileFieldsSchema,
  type BrandProfileFields,
} from "./schema";

// The form boundary of the brand profile editor (task 20a): section registry,
// field descriptors, the FormData readers and the German messages. Pure and
// database-free — the only value import that reaches a database is the server
// action itself, which is a thin shell around saveBrandProfile.
//
// The one type import from ./save is erased at compile time and creates no
// runtime edge; it exists so the result mapping below cannot drift from the
// result union it maps.
//
// EXTENSION POINT for task 20b: add the section value, its reader and its
// field descriptors here. Action, form state and result mapping stay as they
// are — a new section never touches them.

// ---------------------------------------------------------------------------
// Sections

// A section decides which groups a submit owns, so it steers control flow and
// its values are ENGLISH even though the field keys are German (A15, same rule
// as the pflichtelement positions start | end).
export const BRAND_PROFILE_EDITOR_SECTIONS = ["profile", "freetext"] as const;
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
  // Progressive-enhancement comfort in the markup AND the number in the error
  // message — both read this one constant, the truth stays the Zod node.
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

// ---------------------------------------------------------------------------
// Messages

export const BRAND_PROFILE_EDITOR_FIELDS_MESSAGE =
  "Bitte prüfe die markierten Felder.";
// A section that arrives incomplete (missing field, unknown section value) is
// a broken form, not a user mistake: say what to do, change nothing.
export const BRAND_PROFILE_EDITOR_FORM_MESSAGE =
  "Das Formular war unvollständig. Bitte lade die Seite neu und speichere erneut.";
export const BRAND_PROFILE_EDITOR_CONFLICT_MESSAGE =
  "Gleichzeitig wurde an diesem Profil gespeichert. Lade die Seite neu und speichere erneut.";
export const BRAND_PROFILE_EDITOR_LOGIN_MESSAGE =
  "Bitte melde dich an, um dieses Marken-Profil zu speichern.";

const numberFormat = new Intl.NumberFormat("de-DE");

export function freetextTooLongMessage(
  maxLength: number,
  actualLength: number,
): string {
  return `Höchstens ${numberFormat.format(maxLength)} Zeichen, aktuell ${numberFormat.format(actualLength)}.`;
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
  | { ok: true; patch: BrandProfileEditorPatch; values: Record<string, string> }
  | {
      ok: false;
      message: string;
      fieldErrors: Record<string, string>;
      values: Record<string, string>;
    };

function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

// aktiv arrives pre-mapped from the action: an unchecked HTML checkbox sends
// nothing at all, and turning that absence into `false` is a form-boundary
// decision that stays at the boundary (task-19 note). The freetext section
// ignores it — it does not own the flag, so its patch does not mention it.
export function readEditorSection(
  section: BrandProfileEditorSection,
  formData: FormData,
  options: { aktiv: boolean },
): ReadEditorSectionResult {
  if (section === "profile") {
    const rawName = formData.get("name");
    const rawDescription = formData.get("description");
    const values = {
      name: formString(rawName),
      description: formString(rawDescription),
    };

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
    };
  }

  const values: Record<string, string> = {};
  const fieldErrors: Record<string, string> = {};
  const rawFields: Record<string, unknown> = {};

  for (const field of BRAND_PROFILE_FREETEXT_FIELDS) {
    const raw = formData.get(field.key);
    // A rendered textarea always submits at least "". Anything else means the
    // form was not the one we rendered — fail-closed, write nothing.
    if (typeof raw !== "string") {
      return {
        ok: false,
        message: BRAND_PROFILE_EDITOR_FORM_MESSAGE,
        fieldErrors: {},
        values,
      };
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
          ? freetextTooLongMessage(field.maxLength, trimmedLength)
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

  return { ok: true, patch: { rawFields }, values };
}

// ---------------------------------------------------------------------------
// Form state

export type BrandProfileEditorFormState =
  | { status: "idle" }
  | { status: "saved"; version: number; deduped: boolean }
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
): BrandProfileEditorFormState {
  switch (result.status) {
    case "saved":
      return {
        status: "saved",
        version: result.version,
        deduped: result.deduped,
      };
    case "conflict":
      return {
        status: "conflict",
        message: BRAND_PROFILE_EDITOR_CONFLICT_MESSAGE,
      };
    case "invalid":
      // Reached only by a patch the form boundary could not pre-check (a
      // direct POST): coarse message, no field markers, values echoed.
      return { status: "invalid", message: result.message, fieldErrors: {}, values };
    case "forbidden":
      return { status: "forbidden", message: result.message };
    case "not_found":
      return { status: "not_found", message: result.message };
  }
}
