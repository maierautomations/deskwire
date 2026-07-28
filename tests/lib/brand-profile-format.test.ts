import { describe, expect, it } from "vitest";

import {
  formatBrandProfileDate,
  formatBrandProfileVersionLine,
} from "@/lib/brand-profile/format";

describe("formatBrandProfileDate", () => {
  it("formats in German with the day pinned to Europe/Berlin", () => {
    // 23:30 UTC on New Year's Eve is already January 1st in Berlin — a UTC
    // server (Vercel) must not shift the shown day.
    expect(formatBrandProfileDate(new Date("2026-12-31T23:30:00Z"))).toBe(
      "1. Januar 2027",
    );
  });
});

describe("formatBrandProfileVersionLine", () => {
  it("states version, day and time in machine voice", () => {
    // 12:32 UTC is 14:32 in Berlin summer time.
    expect(
      formatBrandProfileVersionLine(3, new Date("2026-07-27T12:32:00Z")),
    ).toBe("Version 3, gespeichert 27. Juli 2026, 14:32 Uhr");
  });

  it("pins date AND time to Europe/Berlin", () => {
    // Same instant as above in the date test: the line must not show the
    // server's UTC day or hour.
    expect(
      formatBrandProfileVersionLine(1, new Date("2026-12-31T23:30:00Z")),
    ).toBe("Version 1, gespeichert 1. Januar 2027, 00:30 Uhr");
  });
});
