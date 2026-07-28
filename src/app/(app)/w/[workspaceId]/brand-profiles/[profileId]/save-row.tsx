"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { BrandProfileEditorFormState } from "@/lib/brand-profile/editor";

// Submit button plus the section's own feedback line. Shared by both sections
// so the wording of "saved", "no change" and every error exists once.
//
// A deduplicated save says so out loud: nothing was written and the version
// number stays where it is, and a form that answered silently would be the
// silent state brand book 6.1 forbids.
export function SaveRow({
  state,
  pending,
}: {
  state: BrandProfileEditorFormState;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Wird gespeichert …" : "Speichern"}
      </Button>

      {state.status === "saved" ? (
        <p role="status" className="font-mono text-xs text-ink-soft">
          {state.deduped
            ? `Keine Änderung. Version ${state.version} bleibt.`
            : `Gespeichert. Version ${state.version}.`}
        </p>
      ) : null}

      {state.status === "invalid" ||
      state.status === "conflict" ||
      state.status === "forbidden" ||
      state.status === "not_found" ? (
        <p role="alert" className="text-xs text-status-error">
          {state.message}
        </p>
      ) : null}

      {state.status === "unauthenticated" ? (
        <p role="alert" className="text-xs text-status-error">
          {state.message}{" "}
          <Link href="/login" className="underline underline-offset-2">
            Zur Anmeldung
          </Link>
        </p>
      ) : null}
    </div>
  );
}
