import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load env files on its own. `.env.local` (from
// `vercel env pull`) wins over `.env` because dotenv never overrides
// values that are already set.
config({ path: [".env.local", ".env"], quiet: true });

// Migrations must use the direct (unpooled) connection, never the pooler.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. Run `npx vercel env pull` or add it to .env",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
