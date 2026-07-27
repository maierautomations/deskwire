import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";

import { stripeEvents, workspaces } from "@/db/schema";
import { handleStripeWebhook } from "@/lib/billing/webhook";

import { createTestDb, type TestDbHandle } from "../helpers/db";
import { seedTwoTenants, type TwoTenants } from "../helpers/tenancy";
import {
  STRIPE_FIXTURE_CUSTOMER_ID,
  STRIPE_FIXTURE_PERIOD_END,
  STRIPE_FIXTURE_PRODUCT_ID,
  STRIPE_FIXTURE_SUBSCRIPTION_ID,
  subscriptionCreatedEvent,
} from "../fixtures/stripe/subscription-events";

// Hoisted by vitest above all imports (sync.ts reports skips itself; the
// route must never double-report).
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

// Offline signing: generateTestHeaderString and constructEvent are pure
// crypto on the injected instance, no network, no real key. CI stays
// secret-free; these are obviously fake values, not credentials.
const WEBHOOK_SECRET = "whsec_test_dummy_offline";
const WRONG_SECRET = "whsec_test_dummy_other";
const stripe = new Stripe("sk_test_dummy_offline_signing_key");

const CUSTOMER_B = "cus_test_deskwire_beta";
const WEBHOOK_URL = "http://localhost/api/stripe/webhook";

// Minimal mutable view of the fixture for per-test variants; produced via
// JSON round-trip (honest wire data, task-14 pattern), never by mutating
// the shared fixture object.
interface MutableEventFixture {
  id: string;
  type: string;
  data: {
    object: {
      customer: string;
      items: { data: { current_period_end: number }[] };
    };
  };
}

function cloneCreatedEvent(): MutableEventFixture {
  return JSON.parse(JSON.stringify(subscriptionCreatedEvent));
}

function signedRequest(
  body: string,
  opts: { signedPayload?: string; secret?: string; timestamp?: number } = {},
): Request {
  const header = stripe.webhooks.generateTestHeaderString({
    payload: opts.signedPayload ?? body,
    secret: opts.secret ?? WEBHOOK_SECRET,
    ...(opts.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
  });
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "stripe-signature": header,
      "content-type": "application/json",
    },
    body,
  });
}

let handle: TestDbHandle;
let tenants: TwoTenants;

function deps() {
  return { db: handle.db, stripe, webhookSecret: WEBHOOK_SECRET };
}

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

async function ledgerRows(eventId: string) {
  return handle.db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, eventId));
}

async function ledgerCount(): Promise<number> {
  const rows = await handle.db.select().from(stripeEvents);
  return rows.length;
}

beforeAll(async () => {
  handle = await createTestDb();
  tenants = await seedTwoTenants(handle.db);
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

beforeEach(async () => {
  vi.clearAllMocks();
  // Independent tests: workspace A's synced fields start empty every time
  // (the customer link stays); the event ledger persists, so every test
  // uses its own event id.
  await handle.db
    .update(workspaces)
    .set({
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      stripeProductId: null,
      currentPeriodEnd: null,
    })
    .where(eq(workspaces.id, tenants.a.workspace.id));
});

describe("valid delivery", () => {
  it("created event: 200, all four fields synced, ledger row written, tenant B untouched", async () => {
    const before = await readWorkspace(tenants.b.workspace.id);
    const body = JSON.stringify(subscriptionCreatedEvent);

    const response = await handleStripeWebhook(signedRequest(body), deps());

    expect(response.status).toBe(200);
    const workspace = await readWorkspace(tenants.a.workspace.id);
    expect(workspace.stripeSubscriptionId).toBe(
      STRIPE_FIXTURE_SUBSCRIPTION_ID,
    );
    expect(workspace.subscriptionStatus).toBe("active");
    expect(workspace.stripeProductId).toBe(STRIPE_FIXTURE_PRODUCT_ID);
    expect(workspace.currentPeriodEnd).toEqual(
      new Date(STRIPE_FIXTURE_PERIOD_END * 1000),
    );
    expect(await ledgerRows(subscriptionCreatedEvent.id)).toHaveLength(1);
    expect(await readWorkspace(tenants.b.workspace.id)).toEqual(before);
    // Anonymous by construction: the Request carries no cookie or session,
    // the signature is the only authentication (proxy matcher analysis in
    // the task report).
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("signature failures answer 400 and leave the database untouched", () => {
  async function expectRejectedDelivery(request: Request) {
    const countBefore = await ledgerCount();
    const response = await handleStripeWebhook(request, deps());
    expect(response.status).toBe(400);
    expect(await ledgerCount()).toBe(countBefore);
    const workspace = await readWorkspace(tenants.a.workspace.id);
    expect(workspace.subscriptionStatus).toBeNull();
    expect(workspace.stripeSubscriptionId).toBeNull();
    // Externally triggerable, so never a Sentry event (7a classification):
    // diagnosis runs via the Stripe dashboard delivery view.
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  }

  it("wrong secret", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_wrong_secret";
    await expectRejectedDelivery(
      signedRequest(JSON.stringify(clone), { secret: WRONG_SECRET }),
    );
  });

  it("body tampered after signing", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_tampered";
    const signedPayload = JSON.stringify(clone);
    clone.data.object.customer = CUSTOMER_B;
    await expectRejectedDelivery(
      signedRequest(JSON.stringify(clone), { signedPayload }),
    );
  });

  it("missing stripe-signature header", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_no_header";
    await expectRejectedDelivery(
      new Request(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(clone),
      }),
    );
  });

  it("stale timestamp outside the default 300s tolerance", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_stale";
    await expectRejectedDelivery(
      signedRequest(JSON.stringify(clone), {
        timestamp: Math.floor(Date.now() / 1000) - 600,
      }),
    );
  });
});

describe("idempotency (decision 27)", () => {
  it("duplicate event id: 200 without a second processing", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_duplicate";
    const body = JSON.stringify(clone);

    const first = await handleStripeWebhook(signedRequest(body), deps());
    expect(first.status).toBe(200);
    expect(
      (await readWorkspace(tenants.a.workspace.id)).subscriptionStatus,
    ).toBe("active");

    // Marker: if the duplicate delivery ran sync again, it would overwrite
    // this manual status with the fixture's "active".
    await handle.db
      .update(workspaces)
      .set({ subscriptionStatus: "unpaid" })
      .where(eq(workspaces.id, tenants.a.workspace.id));

    const second = await handleStripeWebhook(signedRequest(body), deps());
    expect(second.status).toBe(200);
    expect(
      (await readWorkspace(tenants.a.workspace.id)).subscriptionStatus,
    ).toBe("unpaid");
    expect(await ledgerRows(clone.id)).toHaveLength(1);
  });
});

describe("event type filter", () => {
  it("unknown type: 200, no ledger row, no workspace effect", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_unknown_type";
    // Signed and authentic, but not in HANDLED_STRIPE_EVENT_TYPES. Unknown
    // types are deliberately NOT recorded: if the handled list ever grows,
    // already-delivered events of the new type must not sit in the ledger
    // pre-burned as duplicates.
    clone.type = "invoice.paid";

    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(clone)),
      deps(),
    );

    expect(response.status).toBe(200);
    expect(await ledgerRows(clone.id)).toHaveLength(0);
    const workspace = await readWorkspace(tenants.a.workspace.id);
    expect(workspace.subscriptionStatus).toBeNull();
  });
});

describe("sync skip outcomes stay 200 (final for the delivery)", () => {
  it("unknown customer: 200, ledger row committed, warning from sync (not the route)", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_unknown_customer";
    clone.data.object.customer = "cus_test_wh_nobody";

    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(clone)),
      deps(),
    );

    expect(response.status).toBe(200);
    expect(await ledgerRows(clone.id)).toHaveLength(1);
    const workspace = await readWorkspace(tenants.a.workspace.id);
    expect(workspace.subscriptionStatus).toBeNull();
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("invalid payload: 200, ledger row committed, exception report from sync (not the route)", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_invalid_payload";
    clone.data.object.items.data = [];

    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(clone)),
      deps(),
    );

    expect(response.status).toBe(200);
    expect(await ledgerRows(clone.id)).toHaveLength(1);
    const workspace = await readWorkspace(tenants.a.workspace.id);
    expect(workspace.subscriptionStatus).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("missing webhook secret", () => {
  it("500 without ever calling constructEvent, database untouched", async () => {
    const spy = vi.spyOn(stripe.webhooks, "constructEvent");
    try {
      const countBefore = await ledgerCount();
      const body = JSON.stringify(subscriptionCreatedEvent);

      const response = await handleStripeWebhook(signedRequest(body), {
        db: handle.db,
        stripe,
        webhookSecret: undefined,
      });

      expect(response.status).toBe(500);
      expect(spy).not.toHaveBeenCalled();
      expect(await ledgerCount()).toBe(countBefore);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("retry invariant", () => {
  it("an unexpected sync failure rolls the ledger row back, so Stripe's retry is processed", async () => {
    const clone = cloneCreatedEvent();
    clone.id = "evt_test_wh_invariant";
    // Fault injection through the data, no mocks: 1e14 seconds pass the Zod
    // boundary (positive int) but exceed the JS Date range (1e17 ms >
    // 8.64e15), so drizzle's timestamp writer throws RangeError mid-update,
    // AFTER the idempotency insert. Exactly the unexpected-failure shape
    // the invariant guards: the transaction must take the ledger row down
    // with it, or the duplicate path would swallow the retry forever.
    clone.data.object.items.data[0].current_period_end = 1e14;

    await expect(
      handleStripeWebhook(signedRequest(JSON.stringify(clone)), deps()),
    ).rejects.toThrow();
    expect(await ledgerRows(clone.id)).toHaveLength(0);
    const workspace = await readWorkspace(tenants.a.workspace.id);
    expect(workspace.subscriptionStatus).toBeNull();

    // The retry: same event id, healthy payload, must NOT hit the
    // duplicate path.
    const retry = cloneCreatedEvent();
    retry.id = "evt_test_wh_invariant";
    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(retry)),
      deps(),
    );

    expect(response.status).toBe(200);
    expect(await ledgerRows(retry.id)).toHaveLength(1);
    const retried = await readWorkspace(tenants.a.workspace.id);
    expect(retried.subscriptionStatus).toBe("active");
    expect(retried.currentPeriodEnd).toEqual(
      new Date(STRIPE_FIXTURE_PERIOD_END * 1000),
    );
  });
});
