import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BRAND_WORDMARK } from "@/lib/brand";

import { authErrorContent } from "./messages";

// Target of `pages.error` in src/auth.ts: Auth.js redirects every auth
// failure here with ?error=<code>. The retry link points at the default
// Auth.js sign-in page until task 8 ships /login.

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
          <p className="font-display text-sm font-semibold">
            {BRAND_WORDMARK}
          </p>
          <CardTitle className="font-display text-2xl font-semibold">
            {content.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{content.explanation}</p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/api/auth/signin">{content.action}</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
