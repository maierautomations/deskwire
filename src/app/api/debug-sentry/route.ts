// Throws a test error on demand so the Sentry wiring (event ingestion plus
// source map resolution) can be verified per environment. Without the env
// flag the route pretends not to exist.
export const dynamic = "force-dynamic";

export function GET(): Response {
  if (process.env.DEBUG_SENTRY_ENABLED !== "1") {
    return new Response(null, { status: 404 });
  }

  throw new Error("Sentry debug test error from /api/debug-sentry");
}
