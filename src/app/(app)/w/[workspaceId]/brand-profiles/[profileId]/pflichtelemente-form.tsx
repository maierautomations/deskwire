"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type {
  BrandProfileEditorFormState,
  BrandProfilePflichtelementeConfig,
} from "@/lib/brand-profile/editor";
import type { PflichtelementPosition } from "@/lib/brand-profile/schema";

import { saveBrandProfileAction } from "./actions";
import { SaveRow } from "./save-row";

const initialState: BrandProfileEditorFormState = { status: "idle" };

// UI mapping only, and the one place the German words for the positions exist.
// Typed against the schema's union via a type-only import (erased at compile
// time, no runtime edge, no zod in the bundle): a new position value in the
// schema is a compile error here instead of a row that renders "undefined".
const POSITION_LABELS: Record<PflichtelementPosition, string> = {
  start: "Am Anfang",
  end: "Am Ende",
};

export interface PflichtelementRow {
  id: string;
  text: string;
  position: PflichtelementPosition;
}

// Section 3: the mandatory text blocks. Rows are client state, their contents
// stay UNCONTROLLED (defaultValue plus a stable key per row), so typing costs
// no re-render and adding or removing a row never disturbs what stands in the
// other rows.
export function PflichtelementeForm({
  workspaceId,
  profileId,
  rows,
  config,
}: {
  workspaceId: string;
  profileId: string;
  rows: readonly PflichtelementRow[];
  config: BrandProfilePflichtelementeConfig;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandProfileAction,
    initialState,
  );

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">Pflichtelemente</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Textbausteine, die in jeden Artikel gehören. Das System setzt sie ein,
          das Modell schreibt sie nicht.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="section" value="mandatory" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="profileId" value={profileId} />

        {/* Keyed by what is stored: after a save the rows re-mount and show
            exactly what the database holds. The action state lives one level
            up and survives that. */}
        <PflichtelementeRows
          key={rowsSignature(rows)}
          initialRows={rows}
          config={config}
          state={state}
        />

        <SaveRow state={state} pending={pending} />
      </form>
    </section>
  );
}

function rowsSignature(rows: readonly PflichtelementRow[]): string {
  return JSON.stringify(rows);
}

function PflichtelementeRows({
  initialRows,
  config,
  state,
}: {
  initialRows: readonly PflichtelementRow[];
  config: BrandProfilePflichtelementeConfig;
  state: BrandProfileEditorFormState;
}) {
  const [rows, setRows] = useState<PflichtelementRow[]>(() => [...initialRows]);
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const echoed = state.status === "invalid" ? state.values : {};
  const full = rows.length >= config.maxElements;

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text: "",
        position: config.defaultPosition,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      {rows.length === 0 ? (
        <p className="max-w-prose text-sm text-ink-soft">
          Noch keine Pflichtelemente. Leg unten das erste an.
        </p>
      ) : null}

      {rows.map((row, index) => {
        const errorKey = `${config.fieldNames.text}:${row.id}`;
        const error = fieldErrors[errorKey];
        const textId = `pflichtelement-text-${row.id}`;
        const positionId = `pflichtelement-position-${row.id}`;
        const errorId = `pflichtelement-error-${row.id}`;
        return (
          <div key={row.id} className="flex flex-col gap-2">
            <input
              type="hidden"
              name={config.fieldNames.id}
              value={row.id}
              readOnly
            />

            <Label htmlFor={textId}>Text {index + 1}</Label>
            <Textarea
              id={textId}
              name={config.fieldNames.text}
              rows={3}
              defaultValue={echoed[errorKey] ?? row.text}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error ? (
              <p id={errorId} role="alert" className="text-xs text-status-error">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={positionId}>Position</Label>
                <NativeSelect
                  id={positionId}
                  name={config.fieldNames.position}
                  defaultValue={row.position}
                  className="w-48"
                >
                  {config.positions.map((position) => (
                    <option key={position} value={position}>
                      {POSITION_LABELS[position]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => removeRow(row.id)}
              >
                Entfernen
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          onClick={addRow}
          disabled={full}
        >
          Pflichtelement hinzufügen
        </Button>
        {full ? (
          <p className="max-w-prose text-xs text-ink-soft">
            Höchstens {config.maxElements} Pflichtelemente. Entferne eins, wenn
            du ein anderes brauchst.
          </p>
        ) : null}
      </div>
    </div>
  );
}
