import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProofSheet } from "@/components/brand/proof-sheet";
import { Wordmark } from "@/components/brand/wordmark";
import {
  AFTER_LOGIN_DEFAULT,
  sanitizeCallbackPath,
} from "@/lib/auth/login-validation";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Anmelden",
};

// Server side of the login flow. An existing session bounces straight to
// the target: this checks the real database session via auth(), never just
// the cookie, so it cannot loop with the optimistic redirect in src/proxy.ts.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const callbackUrl = sanitizeCallbackPath(
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined,
  );
  if (session?.user) {
    redirect(callbackUrl ?? AFTER_LOGIN_DEFAULT);
  }
  return (
    <div className="flex flex-col gap-6">
      <Wordmark className="text-lg" />
      <ProofSheet>
        <LoginForm callbackUrl={callbackUrl} />
      </ProofSheet>
    </div>
  );
}
