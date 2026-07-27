import { describe, expect, it } from "vitest";

import { hasActiveSubscription } from "@/lib/billing/gates";
import {
  STRIPE_SUBSCRIPTION_STATUSES,
  type StripeSubscriptionStatus,
} from "@/lib/billing/subscription-status";

// The full status matrix for the single phase-0 gate: exactly `active` and
// `trialing` count as subscribed, everything else fails closed, including
// null (workspace never had billing).
const matrix: ReadonlyArray<[StripeSubscriptionStatus | null, boolean]> = [
  ["active", true],
  ["trialing", true],
  ["canceled", false],
  ["incomplete", false],
  ["incomplete_expired", false],
  ["past_due", false],
  ["paused", false],
  ["unpaid", false],
  [null, false],
];

describe("hasActiveSubscription", () => {
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
    expect(hasActiveSubscription({ subscriptionStatus: status })).toBe(
      expected,
    );
  });
});
