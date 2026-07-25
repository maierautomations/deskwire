import * as Sentry from "@sentry/nextjs";

// Error tracking only in phase 0: no tracing, no replay, no logs.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
