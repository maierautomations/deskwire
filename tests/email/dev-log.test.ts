import { describe, expect, it } from "vitest";

import { shouldUseDevLog } from "@/lib/email/dev-log";

// Proof of the fail-closed guard: the dev-log path only activates when the
// environment is unambiguously local. Every other combination must fall
// through to the regular send path (false), never to logging.

describe("shouldUseDevLog", () => {
  it("activates only with flag set, NODE_ENV development and no Vercel marker", () => {
    expect(
      shouldUseDevLog({ AUTH_EMAIL_DEV_LOG: "1", NODE_ENV: "development" }),
    ).toBe(true);
  });

  it("refuses in production even with the flag set", () => {
    expect(
      shouldUseDevLog({ AUTH_EMAIL_DEV_LOG: "1", NODE_ENV: "production" }),
    ).toBe(false);
  });

  it("refuses when NODE_ENV is unset", () => {
    expect(shouldUseDevLog({ AUTH_EMAIL_DEV_LOG: "1" })).toBe(false);
  });

  it("refuses when NODE_ENV is test", () => {
    expect(
      shouldUseDevLog({ AUTH_EMAIL_DEV_LOG: "1", NODE_ENV: "test" }),
    ).toBe(false);
  });

  it("refuses when VERCEL is set, regardless of NODE_ENV", () => {
    expect(
      shouldUseDevLog({
        AUTH_EMAIL_DEV_LOG: "1",
        NODE_ENV: "development",
        VERCEL: "1",
      }),
    ).toBe(false);
  });

  it("refuses when VERCEL_ENV is set, regardless of NODE_ENV", () => {
    expect(
      shouldUseDevLog({
        AUTH_EMAIL_DEV_LOG: "1",
        NODE_ENV: "development",
        VERCEL_ENV: "preview",
      }),
    ).toBe(false);
  });

  it("treats an empty-string Vercel marker as set", () => {
    expect(
      shouldUseDevLog({
        AUTH_EMAIL_DEV_LOG: "1",
        NODE_ENV: "development",
        VERCEL: "",
      }),
    ).toBe(false);
  });

  it("refuses without the flag", () => {
    expect(shouldUseDevLog({ NODE_ENV: "development" })).toBe(false);
  });

  it("refuses for any flag value other than exactly '1'", () => {
    for (const value of ["0", "true", "yes", ""]) {
      expect(
        shouldUseDevLog({ AUTH_EMAIL_DEV_LOG: value, NODE_ENV: "development" }),
      ).toBe(false);
    }
  });
});
