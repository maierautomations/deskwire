import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const scopedDbMessage =
  "Domain data access goes through getScopedDb()/scoped helpers from '@/db' (see src/db/scoped.ts). Raw client access is reserved for src/db/**.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Tenant isolation (CLAUDE.md principle 3), technically enforced:
  // outside src/db/** neither the raw client nor a self-built driver client
  // is allowed. tests/** is exempt by not matching files: ["src/**"].
  {
    files: ["src/**"],
    ignores: ["src/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/db", importNames: ["getDb"], message: scopedDbMessage },
            {
              name: "@/db/index",
              importNames: ["getDb"],
              message: scopedDbMessage,
            },
          ],
          patterns: [
            {
              // Relative imports of src/db (e.g. "../../db", "./db/index")
              // must not bypass the alias-based paths entries above.
              regex: "^\\.\\.?(/.*)?/db(/index)?$",
              importNamePattern: "^getDb$",
              message: scopedDbMessage,
            },
            {
              // Building your own client bypasses the scope just as well as
              // importing getDb, so the raw drivers are off-limits too.
              group: [
                "drizzle-orm/neon-serverless",
                "drizzle-orm/neon-serverless/*",
                "drizzle-orm/pglite",
                "drizzle-orm/pglite/*",
                "@neondatabase/serverless",
                "@neondatabase/serverless/*",
              ],
              message: scopedDbMessage,
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
