import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { authErrorContent } from "./messages";

// Target of `pages.error` in src/auth.ts: Auth.js redirects every auth
// failure here with ?error=<code>. Send failures from our own form never
// arrive here (task 8 shows them inline on /login); this page covers the
// Auth.js-driven redirect cases such as expired links.

export const metadata: Metadata = {
  title: "Anmeldung fehlgeschlagen",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const code = typeof params.error === "string" ? params.error : undefined;
  const content = authErrorContent(code);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Wordmark className="text-sm" />
          <CardTitle className="font-display text-2xl font-semibold">
            {content.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{content.explanation}</p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/login">{content.action}</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
