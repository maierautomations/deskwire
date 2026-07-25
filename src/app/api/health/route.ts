// Health endpoint: must never be cached, extended with a DB ping in task 4.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    ok: true,
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
