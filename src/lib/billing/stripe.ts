import Stripe from "stripe";

import { serverEnv } from "@/lib/env";

// Lazy client singleton (pattern getDb): no env access at import time, so
// typecheck, CI and builds run without STRIPE_SECRET_KEY. v22 breaking
// change: Stripe is a real ES6 class, construction is `new Stripe(...)` and
// makes no network call.
//
// Deliberately NO apiVersion override (phase-0 decision no. 25): the SDK
// pin (2026-06-24.dahlia, node_modules/stripe/cjs/apiVersion.js) is the
// single version source, and the dashboard webhook endpoint must be set to
// that same version (task 15b). tests/billing/stripe-client.test.ts guards
// this against a later override.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = serverEnv().STRIPE_SECRET_KEY;
    if (!key) {
      // Fail closed with a clear operator message: the env field stays
      // optional until the task-15b merge (see src/lib/env.ts), so a
      // missing key must surface here, at the first actual Stripe call.
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Every Stripe call requires it; " +
          "set the test-mode key locally (and in Vercel before the " +
          "task-15b deploy).",
      );
    }
    client = new Stripe(key);
  }
  return client;
}
