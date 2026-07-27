import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts caches after the first successful parse, so every test gets a
// fresh module instance via resetModules + dynamic import.
async function freshServerEnv() {
  vi.resetModules();
  const { serverEnv } = await import("@/lib/env");
  return serverEnv;
}

const ALL_VARS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_RESEND_KEY",
  "EMAIL_FROM",
] as const;

function stubAll(values: Partial<Record<(typeof ALL_VARS)[number], string>>) {
  for (const name of ALL_VARS) {
    vi.stubEnv(name, values[name]);
  }
}

const validValues = {
  DATABASE_URL: "postgresql://user:pass@host/db",
  AUTH_SECRET: "test-secret",
  AUTH_RESEND_KEY: "re_test_key",
  EMAIL_FROM: "onboarding@resend.dev",
};

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("importing the module without env set does not throw", async () => {
    stubAll({});
    await expect(import("@/lib/env")).resolves.toBeDefined();
  });

  it("accessing serverEnv without DATABASE_URL throws a clear error", async () => {
    stubAll({ ...validValues, DATABASE_URL: undefined });
    const serverEnv = await freshServerEnv();
    expect(() => serverEnv()).toThrowError(/DATABASE_URL/);
  });

  it("accessing serverEnv without AUTH_SECRET throws a clear error", async () => {
    stubAll({ ...validValues, AUTH_SECRET: undefined });
    const serverEnv = await freshServerEnv();
    expect(() => serverEnv()).toThrowError(/AUTH_SECRET/);
  });

  it("returns the validated values when env is set", async () => {
    stubAll(validValues);
    const serverEnv = await freshServerEnv();
    expect(serverEnv().DATABASE_URL).toBe(validValues.DATABASE_URL);
    expect(serverEnv().EMAIL_FROM).toBe(validValues.EMAIL_FROM);
  });

  // The Stripe fields stay optional until the task-15b merge (see the
  // comments in src/lib/env.ts): absent is the valid "not yet" state, an
  // empty string is a config error and must fail loudly.
  it("STRIPE_WEBHOOK_SECRET is optional while absent", async () => {
    stubAll(validValues);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
    const serverEnv = await freshServerEnv();
    expect(serverEnv().STRIPE_WEBHOOK_SECRET).toBeUndefined();
  });

  it("empty STRIPE_WEBHOOK_SECRET fails loudly", async () => {
    stubAll(validValues);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const serverEnv = await freshServerEnv();
    expect(() => serverEnv()).toThrowError(/STRIPE_WEBHOOK_SECRET/);
  });
});
