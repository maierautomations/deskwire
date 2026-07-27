import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getStripe and serverEnv both cache in module scope, so every case works
// on a fresh module graph via resetModules + dynamic import.

// serverEnv() is all-or-nothing: the required fields must be present for
// the optional STRIPE_SECRET_KEY handling to be observable at all.
const REQUIRED_SERVER_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/deskwire-test",
  AUTH_SECRET: "test-secret",
  AUTH_RESEND_KEY: "re_test_fake",
  EMAIL_FROM: "Deskwire <dev@example.com>",
} as const;

async function importGetStripe() {
  const stripeModule = await import("@/lib/billing/stripe");
  return stripeModule.getStripe;
}

beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries(REQUIRED_SERVER_ENV)) {
    vi.stubEnv(key, value);
  }
  // Absent, not empty: absence is the only valid "not yet" state of the
  // optional field (an empty string fails serverEnv loudly on purpose).
  vi.stubEnv("STRIPE_SECRET_KEY", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStripe", () => {
  it("fails closed with a clear error while STRIPE_SECRET_KEY is missing", async () => {
    const getStripe = await importGetStripe();
    expect(() => getStripe()).toThrowError(/STRIPE_SECRET_KEY/);
  });

  it("constructs a singleton client from the env key (no network)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_deskwire");
    const getStripe = await importGetStripe();
    const client = getStripe();
    expect(client).toBeDefined();
    expect(getStripe()).toBe(client);
  });

  it("runs on the SDK's pinned API version, no apiVersion override", async () => {
    // Guards phase-0 decision no. 25 in both directions: a later
    // `apiVersion` override in getStripe() breaks this test, and an SDK
    // bump that moves the pin breaks it too — the deliberate signal to
    // re-check the dashboard webhook endpoint version (task 15b) before
    // trusting payload shapes again.
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_deskwire");
    const getStripe = await importGetStripe();
    const version: unknown = getStripe().getApiField("version");
    expect(version).toBe("2026-06-24.dahlia");
  });
});
