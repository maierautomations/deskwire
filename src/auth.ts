import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";

import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { sendVerificationRequest } from "@/lib/email/send-verification-request";
import { serverEnv } from "@/lib/env";

// Without augmentation Session.user is optional and User.id is string |
// undefined (@auth/core types.d.ts). The session callback below copies the
// adapter user's id on every request, so the id is declared as the required
// field it actually is — consumers like the workspace actions (task 10a)
// must not carry a string | undefined path that only works by accident.
// This declaration lives next to the callback that makes it true.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

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
    callbacks: {
      // With database sessions the default callback still strips the user
      // down to name/email/image (verified in @auth/core 0.41.3 lib/init.js),
      // so auth() never sees the user id without this. The id is what ties a
      // session to memberships (task 10a). Do NOT add a signIn callback here:
      // tests/auth/auth-config.test.ts guards the AccessDenied assumption.
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    // All URLs derive from the request host, so magic links point at the
    // exact deployment (production, any preview URL, localhost). Vercel
    // always sets trusted forwarded headers. Never set AUTH_URL.
    trustHost: true,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
