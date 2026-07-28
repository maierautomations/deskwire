import { z } from "zod";

// The shared input boundary of the brand profile forms: the create action
// (task 13) and the editor save (task 19/20a) validate name and description
// identically, so the schemas and their German messages live in ONE place.
//
// Deliberately free of database imports: the editor's client components
// (tasks 20a/20b) can import the limits without dragging the Neon driver into
// the client bundle (the bundle trap from task 13).
//
// Two shapes of the same validation (task 20a): per FIELD for the editor's
// inline echo, and the coarse composite the create path uses. The composite is
// built ON TOP of the per-field parsers, so there is exactly one validation
// site and a parity test can prove the two shapes can never drift.

export const BRAND_PROFILE_NAME_MAX_LENGTH = 80;
export const BRAND_PROFILE_DESCRIPTION_MAX_LENGTH = 500;

export const BRAND_PROFILE_NAME_INVALID_MESSAGE = `Bitte gib einen Namen mit 1 bis ${BRAND_PROFILE_NAME_MAX_LENGTH} Zeichen ein.`;
export const BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE = `Die Beschreibung darf höchstens ${BRAND_PROFILE_DESCRIPTION_MAX_LENGTH} Zeichen lang sein.`;
// Same wording as the invite action (task 11) and identical for foreign and
// non-existent workspace ids — no existence oracle (phase-0 decision 19).
export const BRAND_PROFILE_FORBIDDEN_MESSAGE =
  "Dafür fehlt dir die Berechtigung.";

const brandProfileNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(BRAND_PROFILE_NAME_MAX_LENGTH));

// Optional field: a missing form entry (null/undefined) and a blank string
// both mean "no description" and normalize to null, never to "".
const brandProfileDescriptionSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .pipe(z.string().max(BRAND_PROFILE_DESCRIPTION_MAX_LENGTH))
  .transform((value) => (value.length === 0 ? null : value));

export type ParsedBrandProfileField<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function parseBrandProfileName(
  raw: unknown,
): ParsedBrandProfileField<string> {
  const parsed = brandProfileNameSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: BRAND_PROFILE_NAME_INVALID_MESSAGE };
}

export function parseBrandProfileDescription(
  raw: unknown,
): ParsedBrandProfileField<string | null> {
  const parsed = brandProfileDescriptionSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: BRAND_PROFILE_DESCRIPTION_INVALID_MESSAGE };
}

export type ParsedBrandProfileInput =
  | { ok: true; name: string; description: string | null }
  | { ok: false; message: string };

// Boundary validation (CLAUDE.md: Zod at every boundary). Expected failures
// come back as a typed result with the German message, never as a throw. The
// name is checked first, so its message wins when both fields are wrong.
export function parseBrandProfileInput(
  rawName: unknown,
  rawDescription: unknown,
): ParsedBrandProfileInput {
  const name = parseBrandProfileName(rawName);
  if (!name.ok) {
    return { ok: false, message: name.message };
  }
  const description = parseBrandProfileDescription(rawDescription);
  if (!description.ok) {
    return { ok: false, message: description.message };
  }
  return { ok: true, name: name.value, description: description.value };
}
