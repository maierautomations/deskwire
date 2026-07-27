// Stripe webhook transport (task 15a): signature check, idempotency, HTTP
// mapping. Fully dependency-injected so the PGlite tests call it directly;
// the route src/app/api/stripe/webhook/route.ts is a thin wrapper.
//
// Response contract (Stripe only reads the status code; bodies are minimal
// operator-facing English, precedent getStripe()):
//   500  webhook secret not configured (our gap, Stripe retries after fix)
//   400  missing header / bad signature / tampered body / stale timestamp
//   200  everything else: unknown type, duplicate, synced, and both typed
//        skip outcomes from sync.ts (final for the delivery, task 14)
// Unexpected errors THROW through on purpose: Next answers 500,
// onRequestError (task 3) reports to Sentry, Stripe retries the delivery.
//
// Signature failures deliberately produce NO Sentry event: the URL is
// public, so anyone can trigger them (task-7a classification). Diagnosis,
// e.g. the classic wrong-whsec_ mixup, runs via the delivery view in the
// Stripe dashboard.
import type Stripe from "stripe";

import { stripeEvents } from "@/db/schema";
import type { DbClient } from "@/db/scoped";
import {
  HANDLED_STRIPE_EVENT_TYPES,
  syncStripeEvent,
} from "@/lib/billing/sync";

export interface StripeWebhookDeps {
  db: DbClient;
  stripe: Stripe;
  webhookSecret: string | undefined;
}

// The transport half of the deps (everything except db): the route wrapper
// assembles these, the bound entry in src/db/index.ts adds only the db.
export type StripeWebhookTransport = Omit<StripeWebhookDeps, "db">;

// Widened once: `includes` on the literal tuple would reject the broader
// Stripe.Event["type"] union at the type level.
const handledTypes: readonly string[] = HANDLED_STRIPE_EVENT_TYPES;

export async function handleStripeWebhook(
  request: Request,
  deps: StripeWebhookDeps,
): Promise<Response> {
  // Fail closed before anything else: without the secret no verification is
  // possible, and unverified processing is never a fallback. The check
  // lives here (not only in the wrapper) so the 500 path is testable
  // without module mocking.
  if (!deps.webhookSecret) {
    return Response.json(
      { error: "webhook secret not configured" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json(
      { error: "missing stripe-signature header" },
      { status: 400 },
    );
  }

  // Raw body, never request.json(): the signature covers the exact bytes.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = deps.stripe.webhooks.constructEvent(
      payload,
      signature,
      deps.webhookSecret,
    );
  } catch {
    // Wrong secret, tampered body or stale timestamp (default tolerance
    // 300s). Externally triggerable, so no Sentry event (see header).
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  // Single source event filter (task 14): only the types sync handles pass.
  // Unknown types are NOT recorded in stripe_events: the ledger means "this
  // delivery was processed" (decision 27), and if HANDLED_STRIPE_EVENT_TYPES
  // ever grows, already-delivered events of the new type must not sit there
  // pre-burned as duplicates.
  if (!handledTypes.includes(event.type)) {
    return Response.json({ received: true }, { status: 200 });
  }

  // Idempotency insert and sync share ONE transaction: if sync throws
  // unexpectedly, the rollback removes the stripe_events row with it, so
  // Stripe's retry of this delivery is NOT swallowed by the duplicate path
  // (an event must never be burned as processed by a failed attempt). The
  // typed skip outcomes commit on purpose: they are final for the delivery
  // (task 14), and sync itself already reported them to Sentry.
  await deps.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ eventId: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ eventId: stripeEvents.eventId });
    if (inserted.length === 0) {
      // Duplicate delivery: already processed, nothing to do.
      return;
    }
    await syncStripeEvent(tx, event);
  });

  // Duplicate, updated and both skips answer identically: from Stripe's
  // transport perspective the delivery is done in every one of these cases.
  return Response.json({ received: true }, { status: 200 });
}
