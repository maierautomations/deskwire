import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Seite nicht gefunden",
};

// Global German 404. For now this is also what "/" serves: the root is
// deliberately unassigned until the landing page decision (see CLAUDE.md
// Stand, task 8) and guarded by tests/app/route-conflicts.test.ts.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Wordmark className="text-lg" />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-xl font-semibold">
            Seite nicht gefunden
          </h1>
          <p className="text-sm text-ink-soft">
            Unter dieser Adresse liegt nichts. Geh zur Anmeldung, von dort aus
            kommst du weiter.
          </p>
        </div>
        <Button asChild className="w-fit">
          <Link href="/login">Zur Anmeldung</Link>
        </Button>
      </div>
    </main>
  );
}
