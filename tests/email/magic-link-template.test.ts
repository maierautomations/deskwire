import { describe, expect, it } from "vitest";

import { magicLinkEmail } from "@/lib/email/magic-link-template";

const url = "https://deskwire.vercel.app/api/auth/callback/resend?callbackUrl=%2F&token=abc123&email=user%40example.com";

describe("magicLinkEmail", () => {
  it("uses the German subject", () => {
    expect(magicLinkEmail({ url }).subject).toBe(
      "Dein Anmeldelink für Deskwire",
    );
  });

  it("contains the raw link in the text version", () => {
    expect(magicLinkEmail({ url }).text).toContain(url);
  });

  it("contains the HTML-escaped link in href and as visible fallback text", () => {
    const { html } = magicLinkEmail({ url });
    const escaped = url.replaceAll("&", "&amp;");
    expect(html).toContain(`href="${escaped}"`);
    // Escaped in the button href plus the fallback link (href and visible
    // text).
    expect(html.split(escaped).length - 1).toBe(3);
    // The raw ampersand form must not leak into the markup.
    expect(html).not.toContain("&token=");
  });

  it("escapes HTML metacharacters in the url", () => {
    const { html } = magicLinkEmail({
      url: 'https://example.com/?q="<script>"',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("speaks German with Du address and real umlauts", () => {
    const { text, html } = magicLinkEmail({ url });
    for (const body of [text, html]) {
      expect(body).toMatch(/\b(du|dich|dein)\b/i);
      expect(body).toContain("gültig");
    }
  });

  it("contains no dashes in the copy (CLAUDE.md wording rule)", () => {
    const { subject, text, html } = magicLinkEmail({ url });
    for (const body of [subject, text, html]) {
      expect(body).not.toContain("—");
      expect(body).not.toContain("–");
    }
  });

  it("mentions validity and single use in both versions", () => {
    const { text, html } = magicLinkEmail({ url });
    for (const body of [text, html]) {
      expect(body).toContain("24 Stunden");
      expect(body).toContain("einmal");
    }
  });
});
