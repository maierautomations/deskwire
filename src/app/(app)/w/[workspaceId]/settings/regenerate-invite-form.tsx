"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  regenerateInviteAction,
  type RegenerateInviteFormState,
} from "./actions";

const initialState: RegenerateInviteFormState = { status: "idle" };

// Client side of create/renew (pattern: onboarding form). The two labels come
// from the server component so the button reads "Link erzeugen" or "Link
// erneuern" depending on state; the action behind both is the same upsert.
// Error states are edge cases (direct POSTs, revoked sessions) and render
// inline in the functional error color.
export function RegenerateInviteForm({
  workspaceId,
  label,
  pendingLabel,
  primary,
}: {
  workspaceId: string;
  label: string;
  pendingLabel: string;
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    regenerateInviteAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <Button
        type="submit"
        variant={primary ? "default" : "outline"}
        size="sm"
        disabled={pending}
        className="w-fit"
      >
        {pending ? pendingLabel : label}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-xs text-status-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
