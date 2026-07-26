"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// German fallback for unexpected errors below the root layout, including
// errors thrown from server actions. Expected failures never land here:
// they are typed results (form states) or the /anmelde-fehler page. The
// capture call keeps this from being a silent failure (CLAUDE.md).
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-display text-xl font-semibold">
          Unerwarteter Fehler
        </h1>
        <p className="text-sm text-ink-soft">
          Das hat nicht geklappt. Der Fehler liegt bei uns und wurde gemeldet.
          Versuch es erneut.
        </p>
        <Button onClick={reset} className="w-fit">
          Erneut versuchen
        </Button>
      </div>
    </main>
  );
}
