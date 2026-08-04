"use client";

import { useActionState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandProfileEditorFormState } from "@/lib/brand-profile/editor";

import { saveBrandProfileAction } from "./actions";
import { SaveRow } from "./save-row";

const initialState: BrandProfileEditorFormState = { status: "idle" };

// Section 1: the identity of the profile. It owns name, description and
// aktiv, and its patch touches no field group at all — every one of the four
// sections task 20b adds can save at the same time without overwriting it.
//
// No maxLength on either field (task 20b): the attribute truncates a paste
// silently, so an over-long name would arrive shortened and valid instead of
// being rejected with a sentence. The Zod boundary decides, and this markup
// holds no numbers at all — which also keeps it free of lib imports, since
// importing the constants would drag zod into the client bundle (measured in
// task 20a: a 284 KB chunk the build has none of otherwise).
export function ProfilForm({
  workspaceId,
  profileId,
  name,
  description,
  aktiv,
}: {
  workspaceId: string;
  profileId: string;
  name: string;
  description: string;
  aktiv: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveBrandProfileAction,
    initialState,
  );
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const values = state.status === "invalid" ? state.values : {};

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-lg font-semibold">Profil</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Name und Beschreibung sehen nur du und dein Team.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="section" value="profile" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="profileId" value={profileId} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="brand-profile-name">Name</Label>
          <Input
            id="brand-profile-name"
            name="name"
            type="text"
            required
            className="h-9"
            defaultValue={values.name ?? name}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={
              fieldErrors.name ? "brand-profile-name-error" : undefined
            }
          />
          {fieldErrors.name ? (
            <p
              id="brand-profile-name-error"
              role="alert"
              className="text-xs text-status-error"
            >
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="brand-profile-description">
            Beschreibung <span className="text-ink-soft">(optional)</span>
          </Label>
          <Input
            id="brand-profile-description"
            name="description"
            type="text"
            className="h-9"
            defaultValue={values.description ?? description}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={
              fieldErrors.description
                ? "brand-profile-description-error"
                : undefined
            }
          />
          {fieldErrors.description ? (
            <p
              id="brand-profile-description-error"
              role="alert"
              className="text-xs text-status-error"
            >
              {fieldErrors.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              id="brand-profile-aktiv"
              name="aktiv"
              type="checkbox"
              // React restores an uncontrolled checkbox to defaultChecked on
              // re-render, so a rejected save would drop a freshly changed
              // tick unless the value travels back in the echo (task 20b).
              defaultChecked={"aktiv" in values ? values.aktiv === "on" : aktiv}
              className="size-4 rounded-sm border border-input accent-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-describedby="brand-profile-aktiv-hint"
            />
            <Label htmlFor="brand-profile-aktiv">Aktiv</Label>
          </div>
          <p
            id="brand-profile-aktiv-hint"
            className="max-w-prose text-xs text-ink-soft"
          >
            Nur aktive Profile stehen für neue Briefings zur Auswahl.
          </p>
        </div>

        <SaveRow state={state} pending={pending} />
      </form>
    </section>
  );
}
