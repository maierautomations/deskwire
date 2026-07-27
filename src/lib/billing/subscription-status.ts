// The canonical list of Stripe subscription statuses, verified against
// stripe@22.3.2 (API version 2026-06-24.dahlia). One value source for the
// Zod boundary in sync.ts (z.enum), the workspaces.subscription_status
// column type and the gate status matrix test.
//
// Stripe documents ADDING enum values as a non-breaking change that can
// appear on pinned API versions too (that is how `paused` arrived). If a
// payload ever carries a status missing here, sync.ts skips the event and
// reports to Sentry; extending this list is the deliberate fix, never a
// loosening of the schema.
import type Stripe from "stripe";

export const STRIPE_SUBSCRIPTION_STATUSES = [
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "paused",
  "trialing",
  "unpaid",
  // satisfies: every listed value must exist in the SDK union, so typos and
  // statuses REMOVED by an SDK bump fail typecheck right here.
] as const satisfies readonly Stripe.Subscription.Status[];

export type StripeSubscriptionStatus =
  (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

type ExpectNever<T extends never> = T;

// Compile-time tripwire for the other direction: when an SDK bump ADDS a
// status to Stripe.Subscription.Status, this alias stops compiling. Then
// extend the list above, add a row to the gate matrix in
// tests/billing/gates.test.ts and decide whether the new status counts as
// active (it almost never does).
export type SdkStatusesMissingFromList = ExpectNever<
  Exclude<Stripe.Subscription.Status, StripeSubscriptionStatus>
>;
