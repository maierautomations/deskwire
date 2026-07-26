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

  it("routes auth errors to the German error page", async () => {
    const { authConfig } = await import("@/auth");
    expect(authConfig().pages?.error).toBe("/anmelde-fehler");
  });
});
