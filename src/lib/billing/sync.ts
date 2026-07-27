// Stripe subscription sync (task 14): pure, db-injectable event handling,
// fully testable offline. The transport (signature check, idempotency,
// HTTP mapping) is the task-15a webhook route; this module only turns an
// already-authenticated event into at most one workspace update.
//
// Boundary rule (phase-0 decision no. 26): stripe.webhooks.constructEvent
// proves WHO sent the payload, not WHAT is in it, so the event enters as
// `unknown` and every read field goes through the Zod schema below. Both
// skip outcomes are final for the delivery: the caller answers 200, because
// a structurally broken event never becomes valid through Stripe's retries,
// and an unknown customer is a linking gap, not a transport failure. Sentry
// is the alarm in both cases, retrying is not.
//
// Known, accepted phase-0 limitation: deliveries are deduplicated (15a) but
// not reordered. A late `updated` arriving after `deleted` would win. The
// badge (15b) is informational; real consumption gates arrive with phase 1.
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { updateWorkspaceSubscriptionByStripeCustomerId } from "@/db/billing";
import type { DbClient } from "@/db/scoped";
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeSubscriptionStatus,
} from "@/lib/billing/subscription-status";

// Single source for "which events reach sync": the task-15a route must
// filter against this same list, so the two can never drift apart.
export const HANDLED_STRIPE_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type HandledStripeEventType =
  (typeof HANDLED_STRIPE_EVENT_TYPES)[number];

// Exactly the fields sync reads, nothing more; unknown fields pass through
// unvalidated because they are never touched. `customer` must be the plain
// id string: webhook payloads are never expanded, an object here means the
// contract changed and is a parse error on purpose. `current_period_end`
// lives on the subscription ITEM since Basil (verified at the v22 types,
// stripe/cjs/resources/SubscriptionItems.d.ts); with the phase-0 one-price
// subscription model there is exactly one item, so item 0 is the documented
// read. min(1) makes an itemless subscription a parse error, not a crash.
const subscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.string().min(1),
  status: z.enum(STRIPE_SUBSCRIPTION_STATUSES),
  items: z.object({
    data: z
      .array(
        z.object({
          current_period_end: z.number().int().positive(),
          price: z.object({ product: z.string().min(1) }),
        }),
      )
      .min(1),
  }),
});

const handledEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(HANDLED_STRIPE_EVENT_TYPES),
  data: z.object({ object: subscriptionSchema }),
});

export type SyncStripeEventResult =
  | { outcome: "updated"; workspaceId: string }
  | { outcome: "skipped"; reason: "invalid_payload" | "unknown_customer" };

// Best-effort event identification for Sentry context on parse failures.
// Never the payload itself: events carry customer data, Sentry gets ids.
const eventContextSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
});

function eventContext(event: unknown): {
  stripeEventId?: string;
  stripeEventType?: string;
} {
  const parsed = eventContextSchema.safeParse(event);
  if (!parsed.success) {
    return {};
  }
  return { stripeEventId: parsed.data.id, stripeEventType: parsed.data.type };
}

export async function syncStripeEvent(
  db: DbClient,
  event: unknown,
): Promise<SyncStripeEventResult> {
  const parsed = handledEventSchema.safeParse(event);
  if (!parsed.success) {
    Sentry.captureException(parsed.error, { extra: eventContext(event) });
    return { outcome: "skipped", reason: "invalid_payload" };
  }

  const { type, data } = parsed.data;
  const subscription = data.object;
  const [item] = subscription.items.data;
  if (!item) {
    // Unreachable: the schema enforces min(1). Kept as a typed guard, an
    // unexpected hole here should throw into central logging, not update.
    throw new Error("stripe sync: subscription items empty after parse");
  }

  // `deleted` maps to canceled in CODE, never from the payload: the status
  // transition is a deterministic decision (CLAUDE.md principle 1), the
  // payload merely happens to agree.
  const status: StripeSubscriptionStatus =
    type === "customer.subscription.deleted" ? "canceled" : subscription.status;

  const updated = await updateWorkspaceSubscriptionByStripeCustomerId(
    db,
    subscription.customer,
    {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      stripeProductId: item.price.product,
      currentPeriodEnd: new Date(item.current_period_end * 1000),
    },
  );

  if (!updated) {
    // Legitimately reachable in phase 0: the customer exists in Stripe but
    // stripe_customer_id was not yet linked via Drizzle Studio (decision
    // no. 28). A warning, not an error, and never a throw: the delivery is
    // done, the linking gap is the actionable signal.
    Sentry.captureMessage(
      `Stripe sync: no workspace for customer ${subscription.customer}, event skipped`,
      "warning",
    );
    return { outcome: "skipped", reason: "unknown_customer" };
  }

  return { outcome: "updated", workspaceId: updated.workspaceId };
}
