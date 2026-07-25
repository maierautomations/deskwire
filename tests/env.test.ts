import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts caches after the first successful parse, so every test gets a
// fresh module instance via resetModules + dynamic import.
async function freshServerEnv() {
  vi.resetModules();
  const { serverEnv } = await import("@/lib/env");
  return serverEnv;
}

describe("serverEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("importing the module without env set does not throw", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    await expect(import("@/lib/env")).resolves.toBeDefined();
  });

  it("accessing serverEnv without DATABASE_URL throws a clear error", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const serverEnv = await freshServerEnv();
    expect(() => serverEnv()).toThrowError(/DATABASE_URL/);
  });

  it("returns the validated values when env is set", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@host/db");
    const serverEnv = await freshServerEnv();
    expect(serverEnv().DATABASE_URL).toBe("postgresql://user:pass@host/db");
  });
});
