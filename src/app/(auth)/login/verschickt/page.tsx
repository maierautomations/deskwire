import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

import { AuthCard } from "../../auth-card";

export const metadata: Metadata = {
  title: "Link verschickt",
};

// Target of pages.verifyRequest in src/auth.ts: Auth.js redirects here after
// sending a magic link through flows outside our own form (e.g. a direct
// POST to the signin endpoint). Our form confirms inline with the address
// instead; this static fallback stays address-free by design so nothing
// personal ever travels in the URL.
export default function VerifyRequestPage() {
  return (
    <div className="flex flex-col gap-6">
      <Wordmark className="text-lg" />
      <AuthCard>
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-xl font-semibold">
            Sieh in dein Postfach.
          </h1>
          <p className="text-sm text-ink-soft">
            Wir haben dir einen Anmeldelink geschickt. Er ist 24 Stunden
            gültig und funktioniert genau einmal.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Zur Anmeldung</Link>
          </Button>
        </div>
      </AuthCard>
    </div>
  );
}
