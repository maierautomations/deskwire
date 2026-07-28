"use client";

import { useActionState } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  BrandProfileEditorFormState,
  BrandProfileFreetextField,
} from "@/lib/brand-profile/editor";

import { saveBrandProfileAction } from "./actions";
import { SaveRow } from "./save-row";

const initialState: BrandProfileEditorFormState = { status: "idle" };

// Section 2: the six model-checked free text groups. The descriptors arrive
// as props from the server page — that keeps this component's imports down to
// react, the ui primitives and the action, so nothing with a database edge can
// reach the client bundle (the bundle trap from task 13).
//
// Deliberately without live character counters: six counters would be
// decoration on every keystroke. maxLength stops the typing, and the inline
// message names limit and actual length when a paste overshoots (Chanel rule).
export function FreitextForm({
  workspaceId,
  profileId,
  fields,
  values,
}: {
  workspaceId: string;
  profileId: string;
  fields: readonly BrandProfileFreetextField[];
  values: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandProfileAction,
    initialState,
  );
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const echoed = state.status === "invalid" ? state.values : {};
  const current = (key: string) => echoed[key] ?? values[key] ?? "";
  const empty = fields.every((field) => current(field.key) === "");

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">Stil und Regeln</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Was du hier festlegst, geht in jeden Artikel dieses Profils ein und
          wird geprüft.
        </p>
        {empty ? (
          <p className="max-w-prose text-sm text-ink-soft">
            Noch nichts hinterlegt. Jedes Feld ist freiwillig, geprüft wird nur,
            was du festlegst.
          </p>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="section" value="freetext" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="profileId" value={profileId} />

        {fields.map((field) => {
          const error = fieldErrors[field.key];
          const hintId = `brand-profile-${field.key}-hint`;
          const errorId = `brand-profile-${field.key}-error`;
          return (
            <div key={field.key} className="flex flex-col gap-2">
              <Label htmlFor={`brand-profile-${field.key}`}>
                {field.label}
              </Label>
              <p id={hintId} className="max-w-prose text-xs text-ink-soft">
                {field.hint}
              </p>
              <Textarea
                id={`brand-profile-${field.key}`}
                name={field.key}
                rows={field.rows}
                maxLength={field.maxLength}
                defaultValue={current(field.key)}
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
