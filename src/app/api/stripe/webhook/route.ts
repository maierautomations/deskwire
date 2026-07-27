import { processStripeWebhook } from "@/db";
import { getStripe } from "@/lib/billing/stripe";
import { serverEnv } from "@/lib/env";

// Stripe webhook endpoint (task 15a). Anonymous by design: the proxy
// matcher covers no /api path, and the only authentication is the signature
// check inside handleStripeWebhook. Runs on the Node runtime, the default;
// never add `export const runtime = "edge"` here, constructEvent needs Node
// crypto. Unexpected errors deliberately throw through: Next answers 500,
// onRequestError (task 3) reports to Sentry, and Stripe retries.
export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  // Mirrors the core's fail-closed 500 WITHOUT constructing the Stripe
  // client: getStripe() throws while STRIPE_SECRET_KEY is missing (the
  // pre-15b state in Production), and that throw would turn any scanner's
  // POST into a Sentry event (externally triggerable, task-7a
  // classification). The testable fail-closed truth stays in the core.
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return Response.json(
      { error: "webhook secret not configured" },
      { status: 500 },
    );
  }
  return processStripeWebhook(request, {
    stripe: getStripe(),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  });
}
