import type { AdapterUser } from "next-auth/adapters";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Guards the assumption behind MagicLinkSendError (task 7b): its client-safe
// type "AccessDenied" is what the German error page maps to "the magic-link
// mail could not be sent". Auth.js also throws AccessDenied when a signIn
// callback denies access, so the mapping is only unambiguous while no signIn
// callback exists in the auth config.
//
// The config factory reads serverEnv() and builds the Drizzle adapter, so
// fake values are stubbed; nothing connects until a query actually runs.

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/fake");
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("AUTH_RESEND_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Deskwire <onboarding@resend.dev>");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("authConfig", () => {
  it("defines no signIn callback, keeping AccessDenied unambiguous", async () => {
    const { authConfig } = await import("@/auth");
    const config = authConfig();

    expect(
      config.callbacks?.signIn,
      "src/auth.ts now defines a signIn callback. AccessDenied no longer " +
        "uniquely means a failed magic-link send: the error page " +
        "/anmelde-fehler would blame the mail for callback denials, which " +
        "violates brand book 4.3 rule 4 (explain, never obscure). Introduce " +
        "a distinct error type for send failures (see MagicLinkSendError in " +
        "src/lib/email/send-verification-request.ts) and update " +
        "src/app/anmelde-fehler/messages.ts before merging.",
    ).toBeUndefined();
  });

  it("defines the session callback that exposes the user id", async () => {
    const { authConfig } = await import("@/auth");
    const sessionCallback = authConfig().callbacks?.session;

    expect(
      sessionCallback,
      "src/auth.ts no longer defines a session callback. The @auth/core " +
        "default strips the session user down to name/email/image even with " +
        "database sessions (lib/init.js), so auth() returns no user id, the " +
        "Session module augmentation in src/auth.ts becomes a lie, and every " +
        "membership creation (task 10a) silently lands in the " +
        "unauthenticated branch. Restore the callback that copies user.id " +
        "into the session.",
    ).toBeDefined();

    // Behavior, not just presence: the callback must copy the adapter
    // user's id into the session it returns.
    const user: AdapterUser = {
      id: "33333333-3333-4333-8333-333333333333",
      email: "session-test@example.com",
      emailVerified: null,
    };
    // The callback's parameter type intersects AdapterSession (expires:
    // Date) with Session (expires: ISO string) — contradictory upstream
    // typing; at runtime the database strategy passes a Date. The single
    // targeted assertion below bridges exactly that contradiction.
    const session = {
      user,
      sessionToken: "test-token",
      userId: user.id,
      expires: new Date("2026-08-01T00:00:00Z") as Date & string,
    };
    // token: the parameter type also intersects the JWT variant; every JWT
    // field is optional, and the database-strategy callback never reads it.
    const result = await sessionCallback?.({
      session,
      user,
      token: {},
      newSession: undefined,
    });
    expect(result?.user?.id).toBe(user.id);
  });

  it("routes auth errors to the German error page", async () => {
    const { authConfig } = await import("@/auth");
    expect(authConfig().pages?.error).toBe("/anmelde-fehler");
  });
});
