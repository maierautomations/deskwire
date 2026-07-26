import { describe, expect, it } from "vitest";

import { authErrorContent } from "@/app/anmelde-fehler/messages";

describe("authErrorContent", () => {
  it("explains a failed magic-link send for AccessDenied", () => {
    const content = authErrorContent("AccessDenied");
    expect(content.explanation).toContain("Anmelde-Mail");
    expect(content.explanation).toContain("keine E-Mail");
    expect(content.action).toBe("Erneut anmelden");
  });

  it("explains an expired or used link for Verification", () => {
    const content = authErrorContent("Verification");
    expect(content.explanation).toContain("abgelaufen");
    expect(content.explanation).toContain("genau einmal");
    expect(content.action).toBe("Neuen Link anfordern");
  });

  it("falls back to a generic German explanation for unknown codes", () => {
    for (const code of [undefined, "Configuration", "SomethingElse"]) {
      const content = authErrorContent(code);
      expect(content.title).toBe("Anmeldung nicht möglich");
      expect(content.explanation).toContain("auf unserer Seite");
    }
  });

  it("always names a next step and never apologizes or uses dashes", () => {
    for (const code of [undefined, "AccessDenied", "Verification"]) {
      const content = authErrorContent(code);
      expect(content.action.length).toBeGreaterThan(0);
      for (const value of Object.values(content)) {
        expect(value).not.toMatch(/entschuldig|sorry|ups|leider/i);
        expect(value).not.toContain("—");
        expect(value).not.toContain("–");
      }
    }
  });
});
