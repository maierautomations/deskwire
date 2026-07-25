import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default withSentryConfig(nextConfig, {
  org: "maier-ai",
  project: "deskwire",

  // EU data residency org: source map uploads must target the EU API host,
  // not the sentry.io default.
  sentryUrl: "https://de.sentry.io",

  // Only set in Vercel builds (Production/Preview). When missing (local dev,
  // CI) the build must still pass; the plugin then skips the source map
  // upload with a warning.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !process.env.CI,

  // Upload a wider set of client files so stack traces from browser events
  // resolve too, then drop the source maps from the deployed output.
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Proxy browser events through our own domain so ad blockers cannot drop
  // them before they reach Sentry.
  tunnelRoute: "/monitoring",
});
