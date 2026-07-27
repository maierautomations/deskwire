import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { SCOPE_EXEMPT_TABLES, schemaTables } from "../helpers/tenancy";

// Schema meta test (phase-0 decision 24): every domain table must carry a
// NOT NULL workspace_id column. The tables are enumerated programmatically
// from the Drizzle schema metadata, so a future table is checked without
// anyone having to remember it — forgotten scoping becomes a red test, not a
// silent tenancy hole. The exempt list lives in tests/helpers/tenancy.ts,
// shared with the isolation suite so the two cannot drift apart.
describe("schema meta: workspace scoping", () => {
  it("every non-exempt table carries a NOT NULL workspace_id column", () => {
    const violations: string[] = [];
    for (const table of schemaTables()) {
      const name = getTableName(table);
      if (SCOPE_EXEMPT_TABLES.includes(name)) continue;
      const scopeColumn = Object.values(getTableColumns(table)).find(
        (column) => column.name === "workspace_id",
      );
      if (!scopeColumn) {
        violations.push(
          `Table "${name}" has no workspace_id column. Every domain table ` +
            `must be workspace-scoped (CLAUDE.md principle 3): add a NOT ` +
            `NULL workspace_id referencing workspaces.id, a scoped helper ` +
            `in src/db/scoped.ts and an entity entry in ` +
            `tests/tenancy/isolation.test.ts — or, ONLY for genuine ` +
            `infrastructure, add the table to SCOPE_EXEMPT_TABLES in ` +
            `tests/helpers/tenancy.ts with a documented reason.`,
        );
      } else if (!scopeColumn.notNull) {
        violations.push(
          `Table "${name}": workspace_id must be NOT NULL. A nullable ` +
            `scope column lets rows exist outside every tenant.`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("the exempt list only names tables that exist in the schema", () => {
    // Guards the guard: a misspelled or stale exempt entry would silently
    // exempt nothing (or keep exempting a long-gone table) instead of
    // failing loudly.
    const names = schemaTables().map((table) => getTableName(table));
    const stale = SCOPE_EXEMPT_TABLES.filter((entry) => !names.includes(entry));
    expect(stale).toEqual([]);
  });
});
