"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createBrandProfileAction,
  type CreateBrandProfileFormState,
} from "./actions";

const initialState: CreateBrandProfileFormState = { status: "idle" };

// Client side of the profile creation flow (pattern: onboarding form).
// Expected failures render inline in the functional error color and echo the
// typed values; success renders nothing here — the revalidated list shows the
// new entry.
//
// The maxLength attributes are progressive-enhancement comfort and arrive as
// props from the Zod boundary's constants: no second set of numbers in this
// markup, and no lib import either. Importing them would pull zod (from the
// schema modules) into the client bundle, and importing the create logic
// would pull the server db client — measured after the build, not assumed
// (task 20a); there is no barrel that could make such an import look
// harmless.
export function CreateBrandProfileForm({
  workspaceId,
  nameMaxLength,
  descriptionMaxLength,
}: {
  workspaceId: string;
  nameMaxLength: number;
  descriptionMaxLength: number;
}) {
  const [state, formAction, pending] = useActionState(
    createBrandProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-profile-name">Name</Label>
        <Input
          id="brand-profile-name"
          name="name"
          type="text"
          required
          maxLength={nameMaxLength}
          placeholder="Hausstil Print"
          className="h-9"
          defaultValue={state.status === "error" ? state.name : undefined}
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={
            state.status === "idle" ? undefined : "brand-profile-message"
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="brand-profile-description">
          Beschreibung <span className="text-ink-soft">(optional)</span>
        </Label>
        <Input
          id="brand-profile-description"
          name="description"
          type="text"
          maxLength={descriptionMaxLength}
          placeholder="Tonalität und Regeln für Print-Artikel"
          className="h-9"
          defaultValue={
            state.status === "error" ? state.description : undefined
          }
          aria-describedby={
            state.status === "idle" ? undefined : "brand-profile-message"
          }
        />
      </div>
      {state.status === "error" ? (
        <p
          id="brand-profile-message"
          role="alert"
          className="text-xs text-status-error"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "unauthenticated" ? (
        <p
          id="brand-profile-message"
          role="alert"
          className="text-xs text-status-error"
        >
          {state.message}{" "}
          <Link href="/login" className="underline underline-offset-2">
            Zur Anmeldung
          </Link>
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Wird angelegt …" : "Marken-Profil anlegen"}
      </Button>
    </form>
  );
}
