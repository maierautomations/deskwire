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
