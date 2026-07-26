import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Guard against silent route conflicts: since 16.2.11 Turbopack no longer
// fails the build when two parallel pages resolve to the same URL (task 2
// finding, "two parallel pages resolve to /") — it silently picks one. This
// test replaces that missing build error. Root ownership is deliberately
// open until the landing page decision: (app) and (marketing) must never
// both hold a page file resolving to "/".

const APP_DIR = fileURLToPath(new URL("../../src/app", import.meta.url));

const PAGE_FILE = /^page\.(?:t|j)sx?$/;

function collectPages(
  dir: string,
  segments: string[],
  pages: Map<string, string[]>,
) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // _private folders never take part in routing; @slots render into
      // their parent's URL on purpose and are not a conflict.
      if (entry.name.startsWith("_") || entry.name.startsWith("@")) {
        continue;
      }
      const isRouteGroup = /^\(.+\)$/.test(entry.name);
      collectPages(
        path.join(dir, entry.name),
        isRouteGroup ? segments : [...segments, entry.name],
        pages,
      );
    } else if (PAGE_FILE.test(entry.name)) {
      const route = segments.length === 0 ? "/" : `/${segments.join("/")}`;
      const file = path.relative(APP_DIR, path.join(dir, entry.name));
      pages.set(route, [...(pages.get(route) ?? []), file]);
    }
  }
}

describe("app router route structure", () => {
  it("resolves every URL to at most one page file", () => {
    const pages = new Map<string, string[]>();
    collectPages(APP_DIR, [], pages);
    const conflicts = [...pages.entries()].filter(
      ([, files]) => files.length > 1,
    );
    const details = conflicts
      .map(([route, files]) => `  ${route}  <-  ${files.join("  |  ")}`)
      .join("\n");
    expect(
      conflicts,
      "Multiple page files resolve to the same URL. Turbopack (>= 16.2.11) " +
        "no longer fails the build on this, it silently picks one — so this " +
        "test is the only guard. Exactly one route group may own a path; " +
        "root ownership ((app) vs (marketing)) stays open until the landing " +
        `page decision.\n${details}`,
    ).toEqual([]);
  });
});
