// Stripe subscription event fixtures for the sync tests (task 14).
//
// The `satisfies` checks make the v22 SDK event types guard the fixture
// shape, so the fixtures cannot degrade into confirming only our own Zod
// schema (self-confirmation). They live as TypeScript literals, not .json
// files, for exactly that reason: JSON imports widen literal types (e.g.
// "active" becomes string) and could never satisfy the SDK unions.
//
// Every value is JSON-serializable; the sync tests feed the fixtures
// through JSON.parse(JSON.stringify(...)) so sync.ts receives honest wire
// data, not a shared object reference.
//
// Two deliberate deviations from raw wire JSON, both on fields sync.ts
// never reads: decimal fields (unit_amount_decimal, amount_decimal) are
// null because stripe@22 types them as revived Decimal class instances,
// which no JSON literal can satisfy; and nullable unread sub-objects stay
// null where a live payload might carry data. The real-payload proof is
// the task-15b test-mode run.
//
// All ids are obviously fake (no secrets in fixtures, CLAUDE.md no. 5);
// fixed timestamps keep tests deterministic.
import type Stripe from "stripe";

export const STRIPE_FIXTURE_CUSTOMER_ID = "cus_test_deskwire_alpha";
export const STRIPE_FIXTURE_SUBSCRIPTION_ID = "sub_test_deskwire_0001";
export const STRIPE_FIXTURE_PRODUCT_ID = "prod_test_deskwire_solo";
export const STRIPE_FIXTURE_PRICE_ID = "price_test_deskwire_solo_monthly";

// 2026-07-25T00:00:00Z and 2026-08-25T00:00:00Z (unix seconds): period
// start/end of the fixture subscription.
export const STRIPE_FIXTURE_PERIOD_START = 1784937600;
export const STRIPE_FIXTURE_PERIOD_END = 1787616000;

const fixturePrice = {
  id: STRIPE_FIXTURE_PRICE_ID,
  object: "price",
  active: true,
  billing_scheme: "per_unit",
  created: STRIPE_FIXTURE_PERIOD_START,
  currency: "eur",
  custom_unit_amount: null,
  livemode: false,
  lookup_key: null,
  metadata: {},
  nickname: null,
  product: STRIPE_FIXTURE_PRODUCT_ID,
  recurring: {
    interval: "month",
    interval_count: 1,
    meter: null,
    trial_period_days: null,
    usage_type: "licensed",
  },
  tax_behavior: "unspecified",
  tiers_mode: null,
  transform_quantity: null,
  type: "recurring",
  unit_amount: 2900,
  unit_amount_decimal: null,
} satisfies Stripe.Price;

// The legacy plan mirror of the price, still a required field on
// subscription items in v22.
const fixturePlan = {
  id: STRIPE_FIXTURE_PRICE_ID,
  object: "plan",
  active: true,
  amount: 2900,
  amount_decimal: null,
  billing_scheme: "per_unit",
  created: STRIPE_FIXTURE_PERIOD_START,
  currency: "eur",
  interval: "month",
  interval_count: 1,
  livemode: false,
  metadata: {},
  meter: null,
  nickname: null,
  product: STRIPE_FIXTURE_PRODUCT_ID,
  tiers_mode: null,
  transform_usage: null,
  trial_period_days: null,
  usage_type: "licensed",
} satisfies Stripe.Plan;

const fixtureSubscriptionItem = {
  id: "si_test_deskwire_0001",
  object: "subscription_item",
  billing_thresholds: null,
  created: STRIPE_FIXTURE_PERIOD_START,
  // The Basil move: the billing period lives on the item, not on the
  // subscription (verified at the v22 types, task-14 plan).
  current_period_end: STRIPE_FIXTURE_PERIOD_END,
  current_period_start: STRIPE_FIXTURE_PERIOD_START,
  discounts: [],
  metadata: {},
  plan: fixturePlan,
  price: fixturePrice,
  quantity: 1,
  subscription: STRIPE_FIXTURE_SUBSCRIPTION_ID,
  tax_rates: [],
} satisfies Stripe.SubscriptionItem;

const baseSubscription = {
  id: STRIPE_FIXTURE_SUBSCRIPTION_ID,
  object: "subscription",
  application: null,
  application_fee_percent: null,
  automatic_tax: { disabled_reason: null, enabled: false, liability: null },
  billing_cycle_anchor: STRIPE_FIXTURE_PERIOD_START,
  billing_cycle_anchor_config: null,
  billing_mode: { flexible: null, type: "classic" },
  billing_schedules: [],
  billing_thresholds: null,
  cancel_at: null,
  cancel_at_period_end: false,
  canceled_at: null,
  cancellation_details: { comment: null, feedback: null, reason: null },
  collection_method: "charge_automatically",
  created: STRIPE_FIXTURE_PERIOD_START,
  currency: "eur",
  customer: STRIPE_FIXTURE_CUSTOMER_ID,
  customer_account: null,
  days_until_due: null,
  default_payment_method: null,
  default_source: null,
  description: null,
  discounts: [],
  ended_at: null,
  invoice_settings: {
    account_tax_ids: null,
    custom_fields: null,
    description: null,
    footer: null,
    issuer: { type: "self" },
  },
  items: {
    object: "list",
    data: [fixtureSubscriptionItem],
    has_more: false,
    url: `/v1/subscription_items?subscription=${STRIPE_FIXTURE_SUBSCRIPTION_ID}`,
  },
  latest_invoice: null,
  livemode: false,
  managed_payments: null,
  metadata: {},
  next_pending_invoice_item_invoice: null,
  on_behalf_of: null,
  pause_collection: null,
  payment_settings: null,
  pending_invoice_item_interval: null,
  pending_setup_intent: null,
  pending_update: null,
  schedule: null,
  start_date: STRIPE_FIXTURE_PERIOD_START,
  status: "active",
  test_clock: null,
  transfer_data: null,
  trial_end: null,
  trial_settings: null,
  trial_start: null,
} satisfies Stripe.Subscription;

export const subscriptionCreatedEvent = {
  id: "evt_test_deskwire_created_0001",
  object: "event",
  api_version: "2026-06-24.dahlia",
  created: STRIPE_FIXTURE_PERIOD_START + 1,
  data: { object: baseSubscription },
  livemode: false,
  pending_webhooks: 1,
  request: { id: "req_test_deskwire_0001", idempotency_key: null },
  type: "customer.subscription.created",
} satisfies Stripe.CustomerSubscriptionCreatedEvent;

export const subscriptionUpdatedEvent = {
  id: "evt_test_deskwire_updated_0001",
  object: "event",
  api_version: "2026-06-24.dahlia",
  created: STRIPE_FIXTURE_PERIOD_START + 86400,
  data: {
    object: { ...baseSubscription, status: "past_due" },
    previous_attributes: { status: "active" },
  },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type: "customer.subscription.updated",
} satisfies Stripe.CustomerSubscriptionUpdatedEvent;

export const subscriptionDeletedEvent = {
  id: "evt_test_deskwire_deleted_0001",
  object: "event",
  api_version: "2026-06-24.dahlia",
  created: STRIPE_FIXTURE_PERIOD_START + 172800,
  data: {
    object: {
      ...baseSubscription,
      status: "canceled",
      canceled_at: STRIPE_FIXTURE_PERIOD_START + 172800,
      ended_at: STRIPE_FIXTURE_PERIOD_START + 172800,
      cancellation_details: {
        comment: null,
        feedback: null,
        reason: "cancellation_requested",
      },
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type: "customer.subscription.deleted",
} satisfies Stripe.CustomerSubscriptionDeletedEvent;
