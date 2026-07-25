import * as Sentry from "@sentry/nextjs";

// Error tracking only in phase 0: no tracing, no replay, no logs.
// Without a DSN (local dev, CI) the SDK stays silent and nothing breaks.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
});
