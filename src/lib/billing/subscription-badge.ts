import type { Workspace } from "@/db";
import type { StripeSubscriptionStatus } from "@/lib/billing/subscription-status";

// The workspace subscription badge (task 15b): the phase-0 gate rendered as
// language. hasActiveSubscription in gates.ts is the single truth for "has a
// subscription" — every status the gate denies reads as "keins", the badge
// never claims more than the gate grants. The active/trialing distinction is
// display refinement inside the gate-true branch, not a second status
// vocabulary; a test guard in tests/billing/subscription-badge.test.ts
// enforces the agreement.
export const SUBSCRIPTION_BADGE_LABELS = {
  active: "Abo: aktiv",
  trialing: "Abo: Testphase",
  none: "Abo: keins",
} as const;

export type SubscriptionBadgeLabel =
  (typeof SUBSCRIPTION_BADGE_LABELS)[keyof typeof SUBSCRIPTION_BADGE_LABELS];

// Exhaustive by construction: when the status list in subscription-status.ts
// grows (SDK bump trips the compile-time guard there), the missing key turns
// this `satisfies` red — extend the map AND the matrix test, and decide the
// label against hasActiveSubscription, never independently of it.
const BADGE_BY_STATUS = {
  active: SUBSCRIPTION_BADGE_LABELS.active,
  trialing: SUBSCRIPTION_BADGE_LABELS.trialing,
  canceled: SUBSCRIPTION_BADGE_LABELS.none,
  incomplete: SUBSCRIPTION_BADGE_LABELS.none,
  incomplete_expired: SUBSCRIPTION_BADGE_LABELS.none,
  past_due: SUBSCRIPTION_BADGE_LABELS.none,
  paused: SUBSCRIPTION_BADGE_LABELS.none,
  unpaid: SUBSCRIPTION_BADGE_LABELS.none,
} as const satisfies Record<StripeSubscriptionStatus, SubscriptionBadgeLabel>;

export function subscriptionBadgeLabel(
  workspace: Pick<Workspace, "subscriptionStatus">,
): SubscriptionBadgeLabel {
  const status = workspace.subscriptionStatus;
  return status === null
    ? SUBSCRIPTION_BADGE_LABELS.none
    : BADGE_BY_STATUS[status];
}
