"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createWorkspaceAction,
  type CreateWorkspaceFormState,
} from "./actions";

const initialState: CreateWorkspaceFormState = { status: "idle" };

// Client side of the workspace creation flow (pattern: login form). Expected
// failures render inline in the functional error color; success never renders
// here — the action redirects into the new workspace.
export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createWorkspaceAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-xl font-semibold">
          Leg deinen Workspace an.
        </h1>
        <p className="text-sm text-ink-soft">
          Ein Workspace gehört einer Redaktion. Seine Daten bleiben strikt von
          anderen Workspaces getrennt.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Name</Label>
        <Input
          id="workspace-name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          maxLength={80}
          placeholder="Redaktion Nord"
          className="h-9"
          defaultValue={state.status === "invalid" ? state.name : undefined}
          aria-invalid={state.status === "invalid" || undefined}
          aria-describedby={
            state.status === "idle" ? undefined : "workspace-message"
          }
        />
      </div>
      {state.status === "invalid" ? (
        <p
          id="workspace-message"
          role="alert"
          className="text-xs text-status-error"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "unauthenticated" ? (
        <p
          id="workspace-message"
          role="alert"
          className="text-xs text-status-error"
        >
          {state.message}{" "}
          <Link href="/login" className="underline underline-offset-2">
            Zur Anmeldung
          </Link>
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Wird angelegt …" : "Workspace anlegen"}
      </Button>
    </form>
  );
}
