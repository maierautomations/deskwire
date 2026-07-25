import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/debug-sentry/route";

describe("GET /api/debug-sentry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 when DEBUG_SENTRY_ENABLED is unset", () => {
    vi.stubEnv("DEBUG_SENTRY_ENABLED", undefined);
    expect(GET().status).toBe(404);
  });

  it("returns 404 when DEBUG_SENTRY_ENABLED has any other value", () => {
    vi.stubEnv("DEBUG_SENTRY_ENABLED", "true");
    expect(GET().status).toBe(404);
  });

  it("throws the test error when DEBUG_SENTRY_ENABLED is 1", () => {
    vi.stubEnv("DEBUG_SENTRY_ENABLED", "1");
    expect(() => GET()).toThrowError(/debug-sentry/);
  });
});
