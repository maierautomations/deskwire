"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestLoginLink, type LoginFormState } from "./actions";

const initialState: LoginFormState = { status: "idle" };

// Client side of the login flow. The confirmation replaces the form inside
// the same sheet; the machine voice (mono) appears only once the machine
// actually did something (brand book 6, principle 5).
export function LoginForm({ callbackUrl }: { callbackUrl: string | null }) {
  const [state, formAction, pending] = useActionState(
    requestLoginLink,
    initialState,
  );
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in"
      >
        <h1 className="font-display text-xl font-semibold">
          Sieh in dein Postfach.
        </h1>
        <p className="font-mono text-xs break-all">
          Link verschickt an {state.email}
        </p>
        <p className="text-sm text-ink-soft">
          Der Link ist 24 Stunden gültig und funktioniert genau einmal. Keine
          Mail bekommen? Sieh im Spam-Ordner nach.
        </p>
        <Button asChild variant="outline" className="w-full">
          <a href={loginHref}>Neuen Link anfordern</a>
        </Button>
      </div>
    );
  }

  const errorState =
    state.status === "invalid" ||
    state.status === "send_failed" ||
    state.status === "rate_limited"
      ? state
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-xl font-semibold">Anmelden</h1>
        <p className="text-sm text-ink-soft">
          Wir schicken dir einen Anmeldelink per E-Mail. Kein Passwort nötig.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="name@redaktion.de"
          className="h-9"
          defaultValue={errorState?.email}
          aria-invalid={state.status === "invalid" || undefined}
          aria-describedby={errorState ? "login-message" : undefined}
        />
      </div>
      {errorState ? (
        <p id="login-message" role="alert" className="text-xs text-status-error">
          {errorState.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Wird angefordert …" : "Anmeldelink anfordern"}
      </Button>
    </form>
  );
}
