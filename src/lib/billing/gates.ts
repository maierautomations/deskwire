import type { Workspace } from "@/db";

// The single phase-0 feature gate (PRD phase-0 bullet "Feature-Gates als
// Code"). Deterministic code over the synced column, no Stripe call at
// decision time. `trialing` counts as subscribed on purpose: a trial is a
// granted plan, not a missing one. Everything else fails closed, including
// null (workspace never had billing) and every future status this code
// does not know yet.
export function hasActiveSubscription(
  workspace: Pick<Workspace, "subscriptionStatus">,
): boolean {
  return (
    workspace.subscriptionStatus === "active" ||
    workspace.subscriptionStatus === "trialing"
  );
}
