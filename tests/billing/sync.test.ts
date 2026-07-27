import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/nextjs";

import { stripeEvents, workspaces } from "@/db/schema";
import { syncStripeEvent } from "@/lib/billing/sync";

import { createTestDb, messageChain, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants, type TwoTenants } from "../helpers/tenancy";
import {
  STRIPE_FIXTURE_CUSTOMER_ID,
  STRIPE_FIXTURE_PERIOD_END,
  STRIPE_FIXTURE_PRODUCT_ID,
  STRIPE_FIXTURE_SUBSCRIPTION_ID,
  subscriptionCreatedEvent,
  subscriptionDeletedEvent,
  subscriptionUpdatedEvent,
} from "../fixtures/stripe/subscription-events";

// Hoisted by vitest above all imports.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// Workspace B gets its own customer id: every sync case doubles as a
// cross-tenant assertion (the foreign workspace stays byte-identical).
const CUSTOMER_B = "cus_test_deskwire_beta";

// The fixtures cross the wire boundary the same way real deliveries do:
// serialized and re-parsed. sync receives plain JSON data as `unknown`,
// never a shared typed object, and the round-trip proves the fixtures are
// JSON-serializable.
function asWireEvent(event: unknown): unknown {
  return JSON.parse(JSON.stringify(event));
}

let handle: TestDbHandle;
let tenants: TwoTenants;

async function readWorkspace(id: string) {
  const [row] = await handle.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id));
  if (!row) {
    throw new Error("workspace not found");
  }
  return row;
}

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
  // Phase 0 links customers manually via Drizzle Studio (decision 28); the
  // test equivalent is a direct update outside the scoped helpers.
  await handle.db
    .update(workspaces)
    .set({ stripeCustomerId: STRIPE_FIXTURE_CUSTOMER_ID })
    .where(eq(workspaces.id, tenants.a.workspace.id));
  await handle.db
    .update(workspaces)
    .set({ stripeCustomerId: CUSTOMER_B })
    .where(eq(workspaces.id, tenants.b.workspace.id));
});

afterAll(async () => {
  await handle.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// The lifecycle cases build on each other in file order (vitest runs them
// sequentially), mirroring the real event order created → updated →
// deleted for one customer.
describe("subscription lifecycle sync", () => {
  it("created: writes all four synced fields to the right workspace", async () => {
    const result = await syncStripeEvent(
      handle.db,
      asWireEvent(subscriptionCreatedEvent),
    );
    expect(result).toEqual({
      outcome: "updated",
      workspaceId: tenants.a.workspace.id,
    });

    const row = await readWorkspace(tenants.a.workspace.id);
    expect(row.subscriptionStatus).toBe("active");
    expect(row.stripeSubscriptionId).toBe(STRIPE_FIXTURE_SUBSCRIPTION_ID);
    expect(row.stripeProductId).toBe(STRIPE_FIXTURE_PRODUCT_ID);
    // Unix seconds from the subscription ITEM (Basil), converted exactly.
    expect(row.currentPeriodEnd).toEqual(
      new Date(STRIPE_FIXTURE_PERIOD_END * 1000),
    );

    // Workspace B is linked to a different customer and stays untouched.
    const foreign = await readWorkspace(tenants.b.workspace.id);
    expect(foreign.subscriptionStatus).toBeNull();
    expect(foreign.stripeSubscriptionId).toBeNull();
    expect(foreign.stripeProductId).toBeNull();
    expect(foreign.currentPeriodEnd).toBeNull();

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("updated: moves the status, keeps the other fields consistent", async () => {
    const result = await syncStripeEvent(
      handle.db,
      asWireEvent(subscriptionUpdatedEvent),
    );
    expect(result).toEqual({
      outcome: "updated",
      workspaceId: tenants.a.workspace.id,
    });

    const row = await readWorkspace(tenants.a.workspace.id);
    expect(row.subscriptionStatus).toBe("past_due");
    expect(row.stripeSubscriptionId).toBe(STRIPE_FIXTURE_SUBSCRIPTION_ID);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("deleted: ends as canceled", async () => {
    const result = await syncStripeEvent(
      handle.db,
      asWireEvent(subscriptionDeletedEvent),
    );
    expect(result).toEqual({
      outcome: "updated",
      workspaceId: tenants.a.workspace.id,
    });
    const row = await readWorkspace(tenants.a.workspace.id);
    expect(row.subscriptionStatus).toBe("canceled");
  });

  it("deleted → canceled comes from code, not from the payload status", async () => {
    // Reset to active first, then deliver a deleted event whose payload
    // (unrealistically) still claims `active`: the deterministic mapping
    // in sync.ts must win (CLAUDE.md principle 1).
    await syncStripeEvent(handle.db, asWireEvent(subscriptionCreatedEvent));
    const lyingDeleted = {
      ...subscriptionDeletedEvent,
      data: {
        object: { ...subscriptionDeletedEvent.data.object, status: "active" },
      },
    };
    const result = await syncStripeEvent(handle.db, asWireEvent(lyingDeleted));
    expect(result).toEqual({
      outcome: "updated",
      workspaceId: tenants.a.workspace.id,
    });
    const row = await readWorkspace(tenants.a.workspace.id);
    expect(row.subscriptionStatus).toBe("canceled");
  });

  it("a sync for customer B leaves workspace A byte-identical", async () => {
    const before = await readWorkspace(tenants.a.workspace.id);
    const eventForB = {
      ...subscriptionCreatedEvent,
      id: "evt_test_deskwire_created_beta",
      data: {
        object: {
          ...subscriptionCreatedEvent.data.object,
          id: "sub_test_deskwire_0002",
          customer: CUSTOMER_B,
          status: "trialing",
        },
      },
    };
    const result = await syncStripeEvent(handle.db, asWireEvent(eventForB));
    expect(result).toEqual({
      outcome: "updated",
      workspaceId: tenants.b.workspace.id,
    });
    expect(
      (await readWorkspace(tenants.b.workspace.id)).subscriptionStatus,
    ).toBe("trialing");
    expect(await readWorkspace(tenants.a.workspace.id)).toEqual(before);
  });
});

describe("skip paths", () => {
  it("unknown customer: warning to Sentry, no throw, no update", async () => {
    const beforeA = await readWorkspace(tenants.a.workspace.id);
    const beforeB = await readWorkspace(tenants.b.workspace.id);

    const unknownCustomer = {
      ...subscriptionCreatedEvent,
      data: {
        object: {
          ...subscriptionCreatedEvent.data.object,
          customer: "cus_test_unknown",
        },
      },
    };
    const result = await syncStripeEvent(
      handle.db,
      asWireEvent(unknownCustomer),
    );
    expect(result).toEqual({ outcome: "skipped", reason: "unknown_customer" });

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("cus_test_unknown"),
      "warning",
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(await readWorkspace(tenants.a.workspace.id)).toEqual(beforeA);
    expect(await readWorkspace(tenants.b.workspace.id)).toEqual(beforeB);
  });

  // Each broken shape is a typed spread of a valid fixture with exactly one
  // contract violation, so a red case names the violated field, not a
  // hand-built payload.
  const base = subscriptionCreatedEvent;
  const invalidPayloads: ReadonlyArray<[string, unknown]> = [
    ["event is not an object", "not an event"],
    ["event type outside the handled list", { ...base, type: "invoice.paid" }],
    ["data.object missing", { ...base, data: {} }],
    [
      "customer arrives expanded as an object",
      {
        ...base,
        data: {
          object: {
            ...base.data.object,
            customer: { id: STRIPE_FIXTURE_CUSTOMER_ID },
          },
        },
      },
    ],
    [
      "unknown subscription status",
      {
        ...base,
        data: {
          object: { ...base.data.object, status: "parallel_universe" },
        },
      },
    ],
    [
      "empty items.data",
      {
        ...base,
        data: {
          object: {
            ...base.data.object,
            items: { ...base.data.object.items, data: [] },
          },
        },
      },
    ],
    [
      "item without current_period_end (pre-Basil shape)",
      {
        ...base,
        data: {
          object: {
            ...base.data.object,
            items: {
              ...base.data.object.items,
              data: [
                { price: { product: STRIPE_FIXTURE_PRODUCT_ID } },
              ],
            },
          },
        },
      },
    ],
  ];

  it.each(invalidPayloads)(
    "invalid payload (%s): Sentry event, no throw, no update",
    async (_label, payload) => {
      const beforeA = await readWorkspace(tenants.a.workspace.id);
      const result = await syncStripeEvent(handle.db, asWireEvent(payload));
      expect(result).toEqual({ outcome: "skipped", reason: "invalid_payload" });
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(await readWorkspace(tenants.a.workspace.id)).toEqual(beforeA);
    },
  );
});

// Structural proof for the helper's claim in src/db/billing.ts:
// "stripe_customer_id is unique, more than one match is structurally
// impossible". A second workspace claiming an already-linked customer id
// must die on the constraint, so the one-UPDATE sync can never fan out to
// two tenants.
describe("workspaces.stripe_customer_id unique (migration 0004)", () => {
  it("rejects a second workspace with the same stripe customer id", async () => {
    const fresh = await seedTwoTenants(handle.db);
    let error: unknown;
    try {
      await handle.db
        .update(workspaces)
        .set({ stripeCustomerId: STRIPE_FIXTURE_CUSTOMER_ID })
        .where(eq(workspaces.id, fresh.a.workspace.id));
    } catch (caught) {
      error = caught;
    }
    expect(messageChain(error)).toMatch(/workspaces_stripe_customer_id_unique/);
  });
});

// Migration proof for the idempotency ledger: the table exists with the
// event_id primary key enforcing one row per delivery. The actual
// insert-on-conflict handling is the task-15a webhook route.
describe("stripe_events (migration 0004)", () => {
  it("stores one row per event id, duplicates violate the primary key", async () => {
    const [row] = await handle.db
      .insert(stripeEvents)
      .values({ eventId: "evt_test_dup", type: "customer.subscription.created" })
      .returning();
    expect(row?.processedAt).toBeInstanceOf(Date);

    let error: unknown;
    try {
      await handle.db
        .insert(stripeEvents)
        .values({ eventId: "evt_test_dup", type: "customer.subscription.updated" });
    } catch (caught) {
      error = caught;
    }
    expect(messageChain(error)).toMatch(/duplicate key/);
  });
});
