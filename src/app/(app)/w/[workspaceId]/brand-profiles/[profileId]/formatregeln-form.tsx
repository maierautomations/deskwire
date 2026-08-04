"use client";

import { useActionState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  BrandProfileEditorFormState,
  BrandProfileFormatField,
} from "@/lib/brand-profile/editor";

import { saveBrandProfileAction } from "./actions";
import { SaveRow } from "./save-row";

const initialState: BrandProfileEditorFormState = { status: "idle" };

// Section 4: the deterministic character limits plus the one flag.
//
// The number fields are type="text" with inputMode="numeric" on purpose. A
// type="number" input hands the server an EMPTY string for input the browser
// considers non-numeric, and min/max would block the submit with an English
// browser message — both would decide about the value before our Zod boundary
// ever sees it. The keyboard on touch devices is the only thing we want from
// numeric input, so that is the only thing we take.
export function FormatregelnForm({
  workspaceId,
  profileId,
  fields,
  values,
  flagKey,
  flagLabel,
  flagHint,
  flagValue,
}: {
  workspaceId: string;
  profileId: string;
  fields: readonly BrandProfileFormatField[];
  values: Record<string, string>;
  flagKey: string;
  flagLabel: string;
  flagHint: string;
  flagValue: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandProfileAction,
    initialState,
  );
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const echoed = state.status === "invalid" ? state.values : {};
  const current = (key: string) => echoed[key] ?? values[key] ?? "";
  const empty = fields.every((field) => current(field.key) === "") && !flagValue;

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">Formatregeln</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Zeichengrenzen, die die Prüfung durchsetzt. Ein leeres Feld wird nicht
          geprüft.
        </p>
        {empty ? (
          <p className="max-w-prose text-sm text-ink-soft">
            Noch keine Formatregeln hinterlegt.
          </p>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="section" value="format" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="profileId" value={profileId} />

        {fields.map((field) => {
          const error = fieldErrors[field.key];
          const inputId = `brand-profile-${field.key}`;
          const errorId = `${inputId}-error`;
          return (
            <div key={field.key} className="flex flex-col gap-2">
              <Label htmlFor={inputId}>{field.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={inputId}
                  name={field.key}
                  type="text"
                  inputMode="numeric"
                  className="h-9 w-28"
                  defaultValue={current(field.key)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                />
                <span className="text-sm text-ink-soft">Zeichen</span>
              </div>
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              id={`brand-profile-${flagKey}`}
              name={flagKey}
              type="checkbox"
              // React restores an uncontrolled checkbox to defaultChecked on
              // re-render, so a rejected save would drop a freshly set tick
              // unless the value travels back in the echo.
              defaultChecked={
                flagKey in echoed ? echoed[flagKey] === "on" : flagValue
              }
              className="size-4 rounded-sm border border-input accent-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-describedby={`brand-profile-${flagKey}-hint`}
            />
            <Label htmlFor={`brand-profile-${flagKey}`}>{flagLabel}</Label>
          </div>
          <p
            id={`brand-profile-${flagKey}-hint`}
            className="max-w-prose text-xs text-ink-soft"
          >
            {flagHint}
          </p>
        </div>

        <SaveRow state={state} pending={pending} />
      </form>
    </section>
  );
}
