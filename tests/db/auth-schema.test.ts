import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { createTestDb, messageChain, type TestDb } from "../helpers/db";

// Captures the rejection instead of asserting on the top-level message:
// drizzle wraps driver errors, the constraint detail sits in the cause chain.
async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  return run().then(
    () => null,
    (e: unknown) => e,
  );
}

// Proves migration 0001: the Auth.js adapter tables exist with working
// keys and constraints, using the real migration files (task-5 harness).
describe("auth adapter tables (migration 0001)", () => {
  let db: TestDb;
  let closeDb: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const handle = await createTestDb();
    db = handle.db;
    closeDb = handle.close;
  });

  afterAll(async () => {
    await closeDb?.();
  });

  it("users: insert/select roundtrip with generated uuid", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "a@example.com", name: "User A" })
      .returning();

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.emailVerified).toBeNull();

    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, "a@example.com"));
    expect(found).toHaveLength(1);
  });

  it("users: email is unique", async () => {
    const err = await captureError(() =>
      db.insert(users).values({ email: "a@example.com" }),
    );
    expect(err, "duplicate email must be rejected").not.toBeNull();
    expect(messageChain(err)).toMatch(/unique|duplicate/i);
  });

  it("sessions: roundtrip and cascade delete with the user", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "b@example.com" })
      .returning();
    await db.insert(sessions).values({
      sessionToken: "session-token-b",
      userId: user.id,
      expires: new Date(Date.now() + 86_400_000),
    });

    const before = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(before).toHaveLength(1);

    await db.delete(users).where(eq(users.id, user.id));
    const after = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(after).toHaveLength(0);
  });

  it("sessions: userId must reference an existing user", async () => {
    const err = await captureError(() =>
      db.insert(sessions).values({
        sessionToken: "orphan-token",
        userId: "00000000-0000-0000-0000-000000000000",
        expires: new Date(),
      }),
    );
    expect(err, "orphan session must be rejected").not.toBeNull();
    expect(messageChain(err)).toMatch(/foreign key/i);
  });

  it("verification_tokens: compound primary key (identifier, token)", async () => {
    const expires = new Date(Date.now() + 86_400_000);
    await db
      .insert(verificationTokens)
      .values({ identifier: "c@example.com", token: "token-1", expires });

    // Same identifier with a different token is fine ...
    await db
      .insert(verificationTokens)
      .values({ identifier: "c@example.com", token: "token-2", expires });

    // ... the same (identifier, token) pair is not.
    const err = await captureError(() =>
      db
        .insert(verificationTokens)
        .values({ identifier: "c@example.com", token: "token-1", expires }),
    );
    expect(err, "duplicate (identifier, token) must be rejected").not.toBeNull();
    expect(messageChain(err)).toMatch(/unique|duplicate/i);
  });

  it("accounts: roundtrip with compound primary key", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "d@example.com" })
      .returning();
    await db.insert(accounts).values({
      userId: user.id,
      type: "email",
      provider: "resend",
      providerAccountId: "d@example.com",
    });

    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("resend");

    const err = await captureError(() =>
      db.insert(accounts).values({
        userId: user.id,
        type: "email",
        provider: "resend",
        providerAccountId: "d@example.com",
      }),
    );
    expect(err, "duplicate (provider, providerAccountId) must be rejected").not.toBeNull();
    expect(messageChain(err)).toMatch(/unique|duplicate/i);
  });
});
