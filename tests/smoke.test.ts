import { describe, expect, it } from "vitest";
import { BRAND_NAME } from "@/lib/brand";

// Guards against an empty test run (vitest run fails without test files)
// and proves the "@/*" tsconfig alias resolves inside tests.
describe("smoke", () => {
  it("resolves modules via the @/* alias", () => {
    expect(BRAND_NAME).toBe("Deskwire");
  });
});
