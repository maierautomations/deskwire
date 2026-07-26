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
    // German auth surfaces (tasks 7b + 8): failures land on the error page,
    // sign-in flows point at our login page, and non-form flows that trigger
    // a mail land on the static German confirmation instead of the English
    // Auth.js default.
    pages: {
      error: "/anmelde-fehler",
      signIn: "/login",
      verifyRequest: "/login/verschickt",
    },
    // All URLs derive from the request host, so magic links point at the
    // exact deployment (production, any preview URL, localhost). Vercel
    // always sets trusted forwarded headers. Never set AUTH_URL.
    trustHost: true,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
