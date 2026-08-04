"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  BrandProfileBeispieltexteConfig,
  BrandProfileEditorFormState,
} from "@/lib/brand-profile/editor";

import { saveBrandProfileAction } from "./actions";
import { SaveRow } from "./save-row";

const initialState: BrandProfileEditorFormState = { status: "idle" };

const numberFormat = new Intl.NumberFormat("de-DE");

// Section 6: up to three pasted articles.
//
// This is the ONE place in the editor with a live character count, and the
// reason is the paste: a whole article lands in the field at once, and you
// should see before saving whether it fits. Nothing stops the paste (no
// maxLength anywhere in this editor — it would truncate silently and the
// message about the overshoot could never appear), so the counter is the only
// warning before the Zod boundary answers.
export function BeispieltexteForm({
  workspaceId,
  profileId,
  texts,
  config,
}: {
  workspaceId: string;
  profileId: string;
  texts: readonly string[];
  config: BrandProfileBeispieltexteConfig;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandProfileAction,
    initialState,
  );

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">Beispieltexte</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Bis zu drei eurer eigenen Artikel. Sie zeigen dem System, wie ihr
          schreibt.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="section" value="examples" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="profileId" value={profileId} />

        {/* Keyed by what is stored: after a save the rows re-mount and show
            exactly what the database holds, blank rows included (they are
            dropped by the schema and disappear here). */}
        <BeispieltexteRows
          key={JSON.stringify(texts)}
          initialTexts={texts}
          config={config}
          state={state}
        />

        <SaveRow state={state} pending={pending} />
      </form>
    </section>
  );
}

interface BeispieltextRow {
  // React identity only, never stored: without a stable key an uncontrolled
  // textarea would keep the DOM value of the row that used to sit at its
  // index after a removal.
  key: string;
  text: string;
}

function BeispieltexteRows({
  initialTexts,
  config,
  state,
}: {
  initialTexts: readonly string[];
  config: BrandProfileBeispieltexteConfig;
  state: BrandProfileEditorFormState;
}) {
  const [rows, setRows] = useState<BeispieltextRow[]>(() =>
    initialTexts.map((text) => ({ key: crypto.randomUUID(), text })),
  );
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const echoed = state.status === "invalid" ? state.values : {};
  const full = rows.length >= config.maxTexts;

  const addRow = () => {
    setRows((current) => [...current, { key: crypto.randomUUID(), text: "" }]);
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  return (
    <div className="flex flex-col gap-6">
      {rows.length === 0 ? (
        <p className="max-w-prose text-sm text-ink-soft">
          Noch keine Beispieltexte. Ein echter Artikel von euch schärft den Stil
          am meisten.
        </p>
      ) : null}

      {rows.map((row, index) => (
        <BeispieltextRow
          key={row.key}
          index={index}
          fieldName={config.fieldName}
          maxLength={config.maxTextLength}
          value={echoed[`${config.fieldName}:${index}`] ?? row.text}
          error={fieldErrors[`${config.fieldName}:${index}`]}
          onRemove={() => removeRow(row.key)}
        />
      ))}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={addRow}
          disabled={full}
        >
          Beispieltext hinzufügen
        </Button>
        {full ? (
          <p className="max-w-prose text-xs text-ink-soft">
            Höchstens {config.maxTexts} Beispieltexte.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BeispieltextRow({
  index,
  fieldName,
  maxLength,
  value,
  error,
  onRemove,
}: {
  index: number;
  fieldName: string;
  maxLength: number;
  value: string;
  error: string | undefined;
  onRemove: () => void;
}) {
  // Only the LENGTH is state; the textarea itself stays uncontrolled. The
  // count is measured after trimming, exactly like the boundary that decides,
  // so the number never promises something the save then rejects.
  const [length, setLength] = useState(() => value.trim().length);
  const inputId = `brand-profile-beispieltext-${index}`;
  const countId = `${inputId}-count`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>Beispieltext {index + 1}</Label>
      <Textarea
        id={inputId}
        name={fieldName}
        rows={8}
        defaultValue={value}
        onInput={(event) => setLength(event.currentTarget.value.trim().length)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${countId} ${errorId}` : countId}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={countId} className="font-mono text-xs text-ink-soft">
          {numberFormat.format(length)} von {numberFormat.format(maxLength)}{" "}
          Zeichen
        </p>
        <Button type="button" variant="outline" onClick={onRemove}>
          Entfernen
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
