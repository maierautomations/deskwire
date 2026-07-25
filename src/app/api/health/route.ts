import * as Sentry from "@sentry/nextjs";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";

// Health endpoint: must never be cached.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  try {
    await getDb().execute(sql`select 1`);
  } catch (error) {
    // No internal details in the response; the specifics go to Sentry.
    Sentry.captureException(error);
    return Response.json({ ok: false, sha, db: "error" }, { status: 503 });
  }
  return Response.json({ ok: true, sha, db: "ok" });
}
