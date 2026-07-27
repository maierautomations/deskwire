import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Relative import on purpose: drizzle-kit loads this file directly and its
// resolver is not guaranteed to honor the "@/" tsconfig alias.
import type { StripeSubscriptionStatus } from "../lib/billing/subscription-status";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // --- Stripe billing sync (task 14) ---
  // All nullable: a workspace without billing has none of these. Written
  // exclusively by the webhook sync (src/lib/billing/sync.ts) after Zod
  // validation; stripe_customer_id is set manually via Drizzle Studio in
  // phase 0 (decision 28). subscription_status is text, not a pg enum:
  // Stripe documents enum additions as non-breaking changes that appear on
  // pinned API versions too, and a pg enum would force a migration per new
  // status. The Zod boundary in sync.ts is the enforcement (decision 26).
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").$type<StripeSubscriptionStatus>(),
  stripeProductId: text("stripe_product_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Stripe webhook idempotency ledger (task 14, phase-0 decision 27):
// transport infrastructure, deliberately without workspace_id. Event ids
// are Stripe-account-global and get recorded before any workspace
// resolution happens; a row carries no tenant data, only "this delivery
// was already processed". The insert-on-conflict logic arrives with the
// webhook route (task 15a).
export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- Auth.js adapter tables (minimal set for @auth/drizzle-adapter) ---
// Infrastructure tables, deliberately without workspace_id: they establish
// identity, tenancy is modeled via memberships (task 10a). Column names follow
// the repo convention (snake_case); the TS property names must stay exactly
// what the adapter's default schema expects, or its types reject the tables.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

// Role is a plain column, nothing more: permission logic is explicitly
// phase 4 (PRD ch. 11 only mandates the column, phase-0 decision no. 21).
export const membershipRole = pgEnum("membership_role", ["owner", "member"]);

// Tenancy core (task 10a): which user belongs to which workspace. The
// composite primary key doubles as the required unique(user_id, workspace_id);
// the extra index covers workspace-side lookups the PK order cannot serve.
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.workspaceId] }),
    index("memberships_workspace_id_idx").on(table.workspaceId),
  ],
);

// Exactly one regenerable multi-use invite link per workspace (phase-0
// decision no. 22): workspace_id as primary key enforces the one-row rule
// structurally, renewal is an upsert on it. The token is stored in plaintext
// on purpose: the settings page must re-display the current link at any time
// ("Link kopieren"), which a hash could not serve; the risk stays bounded by
// 256 bits of entropy, the 7-day TTL, regenerability and the small grant
// (join as member). CLAUDE.md principle 5 targets external credentials, not
// first-party bearer links. created_by uses set null, not cascade: the link
// belongs to the workspace and must survive its creator's deletion.
export const workspaceInvites = pgTable("workspace_invites", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // The unique constraint doubles as the redemption lookup index.
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// --- Metering foundation (task 16) ---

// run_status is a pg enum although subscription_status (task 14) is text on
// purpose — the difference is where the vocabulary comes from. Stripe's
// status set is EXTERNAL: Stripe documents enum additions as non-breaking
// and ships them on pinned API versions too, so a pg enum there would force
// migrations on someone else's schedule. Run status is OUR OWN vocabulary
// and status transitions are deterministic code (CLAUDE.md principle 1):
// extending it is a deliberate decision, and the migration is the correct
// consequence of that decision, not a burden to avoid.
export const runStatus = pgEnum("run_status", [
  "running",
  "succeeded",
  "failed",
]);

// Run metering record (phase-0 decision 29): the PRD bullet is "runs table
// with token and cost fields exists from day one" — this is the accounting
// record only, no executor and no status-transition code in phase 0.
// Deliberately WITHOUT briefing_id/job_id/brand_profile_version_id: those
// tables do not exist yet and arrive as nullable FKs with their phases (no
// FKs onto tables that do not exist). run_steps arrives with the pipeline
// (phase 1).
//
// status has NO default: a default would be the first lifecycle rule
// ("new = running"), and lifecycle rules are executor territory (phase 1) —
// callers state the status explicitly. tokens/cost are nullable instead of
// defaulting to 0 so "not measured" stays distinguishable from "measured
// zero": a crashed run that never recorded usage must not look like a free
// run (fail-closed for metering). Money and credits are integers, never
// floats; cost_cents is name and unit. started_at defaulting to now() is
// record-creation semantics, not a state rule: the vocabulary has no queued
// state, so row creation IS the start.
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: runStatus("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costCents: integer("cost_cents"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("runs_workspace_id_idx").on(table.workspaceId)],
);

// Append-only credit ledger (phase-0 decision 30): the balance is SUM(delta),
// there is deliberately no credit_balance column on workspaces, so no dual
// write can drift. Rows are immutable by design, which is why there is no
// updated_at (it would suggest rows may be updated; deliberate deviation from
// the PRD ch. 11 blanket sentence).
//
// reason is text, not an enum: the booking vocabulary (monthly grant,
// purchase, consumption, correction, ...) belongs to the phase-1+ billing
// work, and no control flow will ever branch on it — the balance is
// SUM(delta) no matter why a booking exists; status drives gates, reason
// documents for humans. Once real booking sources exist, narrow it via
// $type<...> without a migration. reference is a soft pointer (a run id, an
// invoice id, ...), nullable because e.g. an initial grant references
// nothing, and deliberately NOT a FK: its targets vary and mostly do not
// exist yet.
//
// on delete cascade is correct HERE because the workspace IS the tenant:
// deleting a tenant must not leave scope-less rows behind (CLAUDE.md
// principle 3). REVISIT once billing hangs on real money — an accounting
// journal is normally not deleted along with its subject.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("credit_ledger_workspace_id_idx").on(table.workspaceId)],
);

// Deliberate phase-0 stub: establishes the workspace-scoped table pattern.
// Real brand profile fields (versions, editor) arrive in phase 1.
export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("brand_profiles_workspace_id_idx").on(table.workspaceId)],
);
