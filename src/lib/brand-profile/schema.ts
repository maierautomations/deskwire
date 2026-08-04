import { z } from "zod";

// The brand profile's entire field set lives in ONE jsonb column
// (brand_profiles.fields, phase-1 plan Vorgabe 5). This module is its ONLY
// enforcement boundary: nothing reads that column without going through
// parseBrandProfileFields, and nothing writes it without passing this schema.
//
// Only the profile NAME is mandatory (Vorgabe 6) — and that one is a real
// column. Every group here is optional with an empty default, because the QA
// enforces exclusively what was configured: fail-closed means enforcing
// configured rules hard, not forcing users to configure everything.
//
// Field names follow the German PRD vocabulary while technical identifiers
// stay English (ids, timestamps, status columns, schema_version). Values that
// steer control flow are English even inside German content: the position of a
// mandatory element decides where insertMandatoryElements (task 28) writes it,
// exactly like article_length decides credits and max_tokens.

// The ladder for future shape changes: a new shape bumps this number and
// migrates ON READ inside parseBrandProfileFields, never via SQL. Rows written
// before this schema existed contain `{}` and ARE version 1 by definition,
// which is why the field defaults instead of being required.
export const BRAND_PROFILE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Character limits. These are a COST lever, not cosmetics: the profile snapshot
// goes into the draft, revise and model-QA prompt of every run (~3 calls), so
// every character here is paid for on every single article.
//
// Worst case a user can construct (user content only, keys and ids ignored):
//   free text        5.700   600 + 600 + 1.000 + 1.000 + 1.000 + 1.500
//   pflichtelemente  2.500   5 x 500
//   verbotene        3.000   50 x 60
//   bevorzugte       3.000   50 x 60
//   beispieltexte    9.000   3 x 3.000
//   -------------------------------------------------------------------
//   total           23.200 characters ~ 7.700 tokens (German, ~3 chars/token)
//
// ~2,3 cent per call at Sonnet list price (3 USD/MTok in), so ~5,4 cent per run
// for a maxed-out profile (draft and revise on Sonnet, model QA on Haiku). A
// realistic profile is ~3.000 characters, about 0,3 cent per call. Task 23
// computes the per-run cents caps against this ceiling, and
// brandProfileWorstCaseChars() is pinned by a guard test: raising any single
// limit forces a conscious restatement of the prompt budget.
export const BRAND_PROFILE_LIMITS = {
  // A target audience fits in three to five sentences; more is prose that
  // dilutes the draft prompt instead of steering it.
  zielgruppe: 600,
  // Symmetric to the audience: tone is a description, not a style manual.
  tonalitaet: 600,
  // Room for ~12 to 15 rules of 60 to 80 characters.
  dos: 1_000,
  donts: 1_000,
  // The model QA judges each one and has to stay sharp per finding; ~12 hard
  // bans is the limit of judgement quality, not of storage.
  harte_verbote: 1_000,
  // Machine-written in M3.8 (sentence length, address, typical constructions)
  // and the densest steering lever in the whole profile, so it gets the most
  // room of the single fields.
  stil_fingerabdruck: 1_500,
  // Covers a long disclaimer. Code inserts this text verbatim into the article
  // (Vorgabe 7), so the limit protects the article, not just the prompt.
  pflichtelement_text: 500,
  // Five mandatory blocks at start and end are already more than an article
  // carries; a plausibility brake against list creep.
  pflichtelemente_max: 5,
  // Fits phrases ("Anleger sollten jetzt"), not just single words.
  begriff: 60,
  // 50 terms are ~3.000 characters of prompt. The bound protects the token
  // budget, not the regex runtime (which would not care about 500).
  begriffe_max: 50,
  // A specialist article runs 3.000 to 6.000 characters. At 2.000 the customer
  // would have to shorten their sample during onboarding, and the ending —
  // where the mandatory elements sit — is what falls away.
  beispieltext: 3_000,
  // From PRD 7.2 ("1 bis 3 Beispieltexte").
  beispieltexte_max: 3,
  // A plausibility bound, not an editorial rule: a kicker limit above 1.000
  // characters is a typo.
  formatregel_zeichen: 1_000,
} as const;

// ---------------------------------------------------------------------------
// Building blocks

// Free text: "" is the canonical "not configured" (empty defaults, Vorgabe 6).
// Whitespace-only input collapses to "" instead of pretending to be filled in.
// Trim first, then measure, so trailing whitespace never costs a user their
// last sentence (pattern: the profile name schema from task 13). null is
// rejected on purpose: an empty form field arrives as "", and accepting null
// as a silent default would hide a broken form mapping (task 20a).
function freeText(maxLength: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(maxLength))
    .default("");
}

function shapeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ");
}

// The ONE casefold of a term. Exported for task 28, which matches forbidden
// terms against article text and MUST fold exactly the way this list
// deduplicated — a second, hand-built casefold there would drift silently and
// let a term pass the check that this schema treated as a duplicate.
export function casefoldTerm(term: string): string {
  return shapeTerm(term).toLocaleLowerCase("de-DE");
}

// The single term-length node. Exported so the editor can ASK it instead of
// re-deriving the limit (task 20b).
export const brandProfileBegriffSchema = z
  .string()
  .max(BRAND_PROFILE_LIMITS.begriff);

export type TermListEntryStatus = "kept" | "blank" | "duplicate" | "too_long";

export interface TermListEntry {
  // 1-based, counted in the RAW input order — that is the line the user sees
  // in the editor's textarea, not the index after normalization.
  line: number;
  term: string;
  status: TermListEntryStatus;
}

export interface TermListReport {
  terms: string[];
  entries: TermListEntry[];
}

// "Normalized" means canonically SHAPED and duplicate-free, NOT lowercased:
// the deterministic check casefolds at match time, so keeping the editor's
// casing costs nothing and keeps the UI honest about what was typed. Blank
// lines are dropped instead of rejected — an empty editor row is not an error
// — but an over-long term is rejected, never truncated (fail-closed).
//
// ONE implementation, two views: the schema takes `terms`, the editor takes
// `entries` to tell the user what the save removed and which line is too long
// (task 20b). A second, hand-built normalization in the form would drift from
// this one, and the user would be told something the boundary does not do.
//
// Order matters and mirrors the schema exactly: blank lines drop first,
// duplicates second, and only what survives is measured — a duplicate of an
// over-long term disappears before its length is ever an issue.
export function inspectTermList(values: string[]): TermListReport {
  const seen = new Set<string>();
  const terms: string[] = [];
  const entries: TermListEntry[] = [];

  values.forEach((value, index) => {
    const term = shapeTerm(value);
    const line = index + 1;
    if (term === "") {
      entries.push({ line, term, status: "blank" });
      return;
    }
    const key = casefoldTerm(term);
    if (seen.has(key)) {
      entries.push({ line, term, status: "duplicate" });
      return;
    }
    seen.add(key);
    terms.push(term);
    entries.push({
      line,
      term,
      status: brandProfileBegriffSchema.safeParse(term).success
        ? "kept"
        : "too_long",
    });
  });

  return { terms, entries };
}

function normalizeTermList(values: string[]): string[] {
  return inspectTermList(values).terms;
}

function termList() {
  return z
    .array(z.string())
    .transform(normalizeTermList)
    .pipe(
      z
        .array(brandProfileBegriffSchema)
        .max(BRAND_PROFILE_LIMITS.begriffe_max),
    )
    .default([]);
}

// Deterministic checks (task 28) need numbers, and null means "not configured":
// the QA checks a format rule only when one exists. 0 is rejected on purpose —
// "max 0 characters" is a mistake, not a rule.
//
// One shared node for all four rules (zod schemas are immutable, so reuse is
// safe) and exported, so the editor validates against THIS instead of
// re-deriving the bounds (task 20b).
export const brandProfileZeichenLimitSchema = z
  .int()
  .min(1)
  .max(BRAND_PROFILE_LIMITS.formatregel_zeichen)
  .nullable()
  .default(null);

// Control flow branches on this value (insertMandatoryElements, task 28), so
// the values are English like every other closed value set in this repo
// (article_status, article_length; plan decision 19). The German UI labels are
// a mapping constant in the editor (task 20b).
export const PFLICHTELEMENT_POSITIONS = ["start", "end"] as const;
export const pflichtelementPositionSchema = z.enum(PFLICHTELEMENT_POSITIONS);

// Exported for the editor's per-row echo (task 20b): the form asks THIS node
// whether a row is acceptable and only formulates the German sentence itself.
export const brandProfilePflichtelementSchema = z.strictObject({
  // Stable id so the editor can change or remove exactly one element and a QA
  // finding can name one. Generated by the editor (crypto.randomUUID), never
  // typed by a user, so requiring uuid form costs nothing and catches drift.
  id: z.uuid(),
  text: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(BRAND_PROFILE_LIMITS.pflichtelement_text)),
  position: pflichtelementPositionSchema,
});

const pflichtelementeSchema = z
  .array(brandProfilePflichtelementSchema)
  .max(BRAND_PROFILE_LIMITS.pflichtelemente_max)
  .superRefine((elements, ctx) => {
    const seen = new Set<string>();
    elements.forEach((element, index) => {
      if (seen.has(element.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message:
            "duplicate pflichtelement id: the editor identifies elements by id, duplicates make update and remove ambiguous",
        });
      }
      seen.add(element.id);
    });
  })
  .default([]);

// prefault, NOT default: zod 4's .default() short-circuits and returns the
// given value WITHOUT parsing it, so .default({}) would store a half-empty
// object while the type claims all keys are present. .prefault({}) runs the
// empty object through this schema, which applies every inner default.
const formatregelnSchema = z
  .strictObject({
    max_kicker_zeichen: brandProfileZeichenLimitSchema,
    max_titel_zeichen: brandProfileZeichenLimitSchema,
    max_seo_titel_zeichen: brandProfileZeichenLimitSchema,
    max_teaser_zeichen: brandProfileZeichenLimitSchema,
    // Off unless switched on: an unconfigured rule checks nothing (Vorgabe 6).
    keine_relativen_zeitangaben: z.boolean().default(false),
  })
  .prefault({});

// The single example-text node, exported for the editor's per-row echo.
export const brandProfileBeispieltextSchema = z
  .string()
  .max(BRAND_PROFILE_LIMITS.beispieltext);

// Example texts keep their inner formatting (they are pasted articles); only
// the outer whitespace goes and blank entries drop out, so an empty editor row
// never counts against the maximum of three.
const beispieltexteSchema = z
  .array(z.string())
  .transform((values) =>
    values.map((value) => value.trim()).filter((value) => value !== ""),
  )
  .pipe(
    z
      .array(brandProfileBeispieltextSchema)
      .max(BRAND_PROFILE_LIMITS.beispieltexte_max),
  )
  .default([]);

// ---------------------------------------------------------------------------
// The whole field set

// strictObject on purpose: an unknown key is either a hand edit or a shape from
// another deployment, and both must fail loudly. Silently stripping would
// destroy the unknown data on the next save. A legitimate new group always
// arrives with a schema_version bump and a read migration.
export const brandProfileFieldsSchema = z.strictObject({
  schema_version: z
    .literal(BRAND_PROFILE_SCHEMA_VERSION, {
      error: `unknown brand profile schema_version (expected ${BRAND_PROFILE_SCHEMA_VERSION}): a newer shape needs a read migration in parseBrandProfileFields, not SQL`,
    })
    .default(BRAND_PROFILE_SCHEMA_VERSION),

  // --- model-checked free text (editor: task 20a) ---
  zielgruppe: freeText(BRAND_PROFILE_LIMITS.zielgruppe),
  tonalitaet: freeText(BRAND_PROFILE_LIMITS.tonalitaet),
  dos: freeText(BRAND_PROFILE_LIMITS.dos),
  donts: freeText(BRAND_PROFILE_LIMITS.donts),
  // Statement TYPES that must never appear ("no buy or sell recommendation").
  // Deliberately separate from verbotene_begriffe: this one is judged by the
  // model, that one is matched by code (Vorgabe 5).
  harte_verbote: freeText(BRAND_PROFILE_LIMITS.harte_verbote),
  stil_fingerabdruck: freeText(BRAND_PROFILE_LIMITS.stil_fingerabdruck),

  // --- structured groups (editor: task 20b) ---
  // Inserted by code, never handed to the model as a task (Vorgabe 7).
  pflichtelemente: pflichtelementeSchema,
  formatregeln: formatregelnSchema,
  // Matched deterministically by code (task 28).
  verbotene_begriffe: termList(),
  // Prompt input only: preferred terminology cannot be enforced
  // deterministically, so it is model-checked despite the structured shape.
  bevorzugte_begriffe: termList(),
  beispieltexte: beispieltexteSchema,
});

export type BrandProfileFields = z.infer<typeof brandProfileFieldsSchema>;
// The shape as STORED: every key optional. brand_profiles.fields is typed with
// this, because what sits in the column is not what a reader gets — phase-0
// rows literally contain `{}`.
export type BrandProfileFieldsInput = z.input<typeof brandProfileFieldsSchema>;
export type Pflichtelement = z.infer<typeof brandProfilePflichtelementSchema>;
export type PflichtelementPosition = z.infer<
  typeof pflichtelementPositionSchema
>;
export type Formatregeln = z.infer<typeof formatregelnSchema>;

// The single read boundary. Throws on invalid input: a stored profile that
// does not parse is OUR data gone wrong, an unexpected error that belongs in
// central logging (CLAUDE.md error handling), not a typed user-facing result.
// Callers validating USER input use brandProfileFieldsSchema.safeParse and map
// to German messages themselves (tasks 20a/20b).
export function parseBrandProfileFields(value: unknown): BrandProfileFields {
  return brandProfileFieldsSchema.parse(value);
}

// A fresh, fully defaulted object — derived from the schema itself, so the
// defaults can never drift from it. A function, not a shared constant: an
// exported object literal could be mutated by a caller.
export function emptyBrandProfileFields(): BrandProfileFields {
  return brandProfileFieldsSchema.parse({});
}

// Worst-case user content in characters, derived from the limits above. Pinned
// by a guard test so raising a limit is a visible decision about prompt cost.
export function brandProfileWorstCaseChars(): number {
  const limits = BRAND_PROFILE_LIMITS;
  return (
    limits.zielgruppe +
    limits.tonalitaet +
    limits.dos +
    limits.donts +
    limits.harte_verbote +
    limits.stil_fingerabdruck +
    limits.pflichtelemente_max * limits.pflichtelement_text +
    2 * limits.begriffe_max * limits.begriff +
    limits.beispieltexte_max * limits.beispieltext
  );
}
