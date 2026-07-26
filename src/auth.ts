import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";

import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { sendVerificationRequest } from "@/lib/email/send-verification-request";
import { serverEnv } from "@/lib/env";

// Lazy config (function form): the config runs per request, never at module
// scope. next build imports route modules while collecting page data, and
// builds must keep working without env (task 4 guarantee), so neither
// serverEnv() nor getDb() may run at import time.
//
// Exported so tests can inspect the real config object, in particular the
// guard in tests/auth/auth-config.test.ts that no signIn callback exists
// (the AccessDenied assumption of MagicLinkSendError).
export function authConfig(): NextAuthConfig {
  const env = serverEnv();
  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    secret: env.AUTH_SECRET,
    // Sessions live in the database so they are revocable server-side
    // (phase-0 decision log no. 12).
    session: { strategy: "database" },
    providers: [
      Resend({
        apiKey: env.AUTH_RESEND_KEY,
        from: env.EMAIL_FROM,
        sendVerificationRequest,
      }),
    ],
    // Every auth failure redirects to the German error page (task 7b)
    // instead of the generic English Auth.js page.
    pages: { error: "/anmelde-fehler" },
    // All URLs derive from the request host, so magic links point at the
    // exact deployment (production, any preview URL, localhost). Vercel
    // always sets trusted forwarded headers. Never set AUTH_URL.
    trustHost: true,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
