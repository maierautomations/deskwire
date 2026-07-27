import { describe, expect, it } from "vitest";

import { hasActiveSubscription } from "@/lib/billing/gates";
import {
  SUBSCRIPTION_BADGE_LABELS,
  subscriptionBadgeLabel,
} from "@/lib/billing/subscription-badge";
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeSubscriptionStatus,
} from "@/lib/billing/subscription-status";

// The full badge matrix (task 15b): exactly `active` and `trialing` carry a
// subscription label, everything else including null reads "Abo: keins".
const matrix: ReadonlyArray<[StripeSubscriptionStatus | null, string]> = [
  ["active", "Abo: aktiv"],
  ["trialing", "Abo: Testphase"],
  ["canceled", "Abo: keins"],
  ["incomplete", "Abo: keins"],
  ["incomplete_expired", "Abo: keins"],
  ["past_due", "Abo: keins"],
  ["paused", "Abo: keins"],
  ["unpaid", "Abo: keins"],
  [null, "Abo: keins"],
];

describe("subscriptionBadgeLabel", () => {
  it("the matrix covers every known status plus null (no untested status)", () => {
    // When the status list grows (SDK bump trips the compile-time guard in
    // subscription-status.ts), a forgotten matrix row must turn red here,
    // not silently stay untested.
    const covered = matrix
      .map(([status]) => status)
      .filter((status): status is StripeSubscriptionStatus => status !== null)
      .sort();
    expect(covered).toEqual([...STRIPE_SUBSCRIPTION_STATUSES].sort());
    expect(matrix.some(([status]) => status === null)).toBe(true);
  });

  it.each(matrix)("status %j → %j", (status, expected) => {
    expect(subscriptionBadgeLabel({ subscriptionStatus: status })).toBe(
      expected,
    );
  });

  it("never disagrees with hasActiveSubscription (the badge is the gate rendered as language)", () => {
    // The badge must not invent a second notion of "has a subscription":
    // a subscription label may appear exactly when the gate grants access.
    // Whoever maps a gate-false status (say, past_due) to an active-sounding
    // text sees this guard turn red — change the gate first or drop the idea.
    for (const status of [...STRIPE_SUBSCRIPTION_STATUSES, null]) {
      const workspace = { subscriptionStatus: status };
      expect(
        subscriptionBadgeLabel(workspace) !== SUBSCRIPTION_BADGE_LABELS.none,
        `status ${JSON.stringify(status)}: badge and gate must agree`,
      ).toBe(hasActiveSubscription(workspace));
    }
  });
});
