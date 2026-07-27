// Stripe subscription sync write (task 14). Deliberately unscoped and
// encapsulated here (phase-0 decision no. 23): the lookup key is the Stripe
// customer id and the workspace is the RESULT of that lookup, so no scoped
// helper can express it. stripe_customer_id is unique, more than one match
// is structurally impossible.
//
// Typed against the generic DbClient so the same code runs on the Neon app
// client and the PGlite test client (task-5 finding). No bound entry point
// in src/db/index.ts: the only caller is src/lib/billing/sync.ts, which is
// db-injectable by design (the task-15a webhook route passes its db handle
// through).
import { eq } from "drizzle-orm";

import type { StripeSubscriptionStatus } from "../lib/billing/subscription-status";

import { workspaces } from "./schema";
import type { DbClient } from "./scoped";

export interface SubscriptionSyncPatch {
  stripeSubscriptionId: string;
  subscriptionStatus: StripeSubscriptionStatus;
  stripeProductId: string;
  currentPeriodEnd: Date;
}

// One atomic UPDATE ... RETURNING, no read-then-write window: an unknown
// customer id simply matches zero rows and returns null.
export async function updateWorkspaceSubscriptionByStripeCustomerId(
  db: DbClient,
  stripeCustomerId: string,
  patch: SubscriptionSyncPatch,
): Promise<{ workspaceId: string } | null> {
  const [row] = await db
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.stripeCustomerId, stripeCustomerId))
    .returning({ workspaceId: workspaces.id });
  return row ?? null;
}
