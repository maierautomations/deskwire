import { describe, expect, it } from "vitest";

import {
  AFTER_LOGIN_DEFAULT,
  LOGIN_EMAIL_INVALID_MESSAGE,
  normalizeLoginEmail,
  parseLoginEmail,
  sanitizeCallbackPath,
} from "@/lib/auth/login-validation";

describe("normalizeLoginEmail", () => {
  it("trims and lowercases, matching what parseLoginEmail returns", () => {
    const raw = "  Dominik@MaierAI.com ";
    expect(normalizeLoginEmail(raw)).toBe("dominik@maierai.com");
    // The rate-limit key hashing (task 9) relies on this equivalence: a
    // form-normalized address and a raw identifier from a direct POST must
    // land on the same counter.
    expect(parseLoginEmail(raw)).toEqual({
      ok: true,
      email: normalizeLoginEmail(raw),
    });
  });
});

describe("parseLoginEmail", () => {
  it("accepts a valid address and normalizes trim and case", () => {
    expect(parseLoginEmail("  Dominik@MaierAI.com ")).toEqual({
      ok: true,
      email: "dominik@maierai.com",
    });
  });

  it.each([
    ["empty string", ""],
    ["plain text", "keine-adresse"],
    ["missing tld", "a@b"],
    ["missing local part", "@maierai.com"],
    ["number", 42],
    ["null", null],
    ["undefined", undefined],
    ["overlong address", `${"a".repeat(250)}@maierai.com`],
  ])("rejects %s with the German message", (_label, value) => {
    expect(parseLoginEmail(value)).toEqual({
      ok: false,
      message: LOGIN_EMAIL_INVALID_MESSAGE,
    });
  });
});

describe("sanitizeCallbackPath", () => {
  it.each(["/start", "/w/abc-123", "/start?tab=1", "/onboarding#oben"])(
    "keeps the relative path %s",
    (value) => {
      expect(sanitizeCallbackPath(value)).toBe(value);
    },
  );

  it("keeps the after-login default itself", () => {
    expect(sanitizeCallbackPath(AFTER_LOGIN_DEFAULT)).toBe(AFTER_LOGIN_DEFAULT);
  });

  it("keeps an invite redemption path intact (task-11 login roundtrip)", () => {
    // 43 base64url characters, exactly what generateInviteToken produces;
    // hyphen and underscore are the two non-alphanumeric characters in play.
    const invitePath = `/invite/${"aZ9-_".repeat(8)}aZ9`;
    expect(invitePath.length).toBe("/invite/".length + 43);
    expect(sanitizeCallbackPath(invitePath)).toBe(invitePath);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["number", 42],
    ["empty string", ""],
    ["relative without slash", "start"],
    ["absolute url", "https://evil.example/phish"],
    ["protocol-relative url", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["whitespace", "/mit leerzeichen"],
    ["api root", "/api"],
    ["api subpath", "/api/auth/signout"],
    ["login itself", "/login"],
    ["login subpath", "/login/verschickt"],
    ["login with query", "/login?callbackUrl=/start"],
    ["overlong path", `/${"a".repeat(3000)}`],
  ])("rejects %s", (_label, value) => {
    expect(sanitizeCallbackPath(value)).toBeNull();
  });

  it("does not block paths that merely share the /api or /login prefix text", () => {
    expect(sanitizeCallbackPath("/apidocs")).toBe("/apidocs");
    expect(sanitizeCallbackPath("/logbuch")).toBe("/logbuch");
  });
});
