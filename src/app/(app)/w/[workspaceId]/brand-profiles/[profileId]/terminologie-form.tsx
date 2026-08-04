"use client";

import { useActionState } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  BrandProfileEditorFormState,
  BrandProfileTermField,
} from "@/lib/brand-profile/editor";

import { saveBrandProfileAction } from "./actions";
import { SaveRow } from "./save-row";

const initialState: BrandProfileEditorFormState = { status: "idle" };

// Section 5: the two term lists, one term per line.
//
// The textarea is keyed by what is STORED, so a save that removed duplicates
// or blank lines re-mounts the field and shows the stored result. Together
// with the note next to the version line that is the whole anti-silence
// contract: the user is told what was removed and sees it (brand book 6.1).
// While a save is rejected the stored value does not change, the field does
// not re-mount, and every typed line survives.
export function TerminologieForm({
  workspaceId,
  profileId,
  fields,
  values,
}: {
  workspaceId: string;
  profileId: string;
  fields: readonly BrandProfileTermField[];
  values: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandProfileAction,
    initialState,
  );
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const echoed = state.status === "invalid" ? state.values : {};
  const stored = (key: string) => values[key] ?? "";
  const empty = fields.every((field) => stored(field.key) === "");

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">Terminologie</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Ein Begriff pro Zeile. Doppelte Zeilen und Leerzeilen entfernt das
          System beim Speichern. Was danach im Feld steht, ist gespeichert.
        </p>
        {empty ? (
          <p className="max-w-prose text-sm text-ink-soft">
            Noch keine Begriffe hinterlegt.
          </p>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="section" value="terms" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="profileId" value={profileId} />

        {fields.map((field) => {
          const error = fieldErrors[field.key];
          const inputId = `brand-profile-${field.key}`;
          const hintId = `${inputId}-hint`;
          const errorId = `${inputId}-error`;
          return (
            <div key={field.key} className="flex flex-col gap-2">
              <Label htmlFor={inputId}>{field.label}</Label>
              <p id={hintId} className="max-w-prose text-xs text-ink-soft">
                {field.hint}
              </p>
              <Textarea
                key={stored(field.key)}
                id={inputId}
                name={field.key}
                rows={field.rows}
                defaultValue={echoed[field.key] ?? stored(field.key)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              />
              {error ? (
                <p
                  id={errorId}
                  role="alert"
                  className="text-xs text-status-error"
                >
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}

        <SaveRow state={state} pending={pending} />
      </form>
    </section>
  );
}
