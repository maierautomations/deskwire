// Credit booking and balance (task 16, phase-0 decision 30): the canonical
// app-facing entry over the scoped ledger helpers, and the place where the
// phase-1 budget gates will land (gates are code and run BEFORE the model
// call, CLAUDE.md principle 6).
//
// bookCredits is a pure append, deliberately WITHOUT a balance check: nothing
// consumes credits in phase 0, and what happens on insufficient balance (does
// a running run get blocked mid-flight? may corrections go negative? does a
// downgrade clamp?) is a consumption-path business decision that belongs to
// the phase-1 gates. Technically a check would also turn the append into a
// read-then-write with a real race (two parallel bookings both pass; there is
// no row to lock), which must be designed at the consumption path, not
// smuggled into the foundation. The ledger enforces integrity (non-zero
// integers, a reason — see scoped book()), not business rules.
//
// No membership check here: these are system-level metering primitives
// (callers are the pipeline, jobs and billing sync); the permission gate
// belongs to the calling action.
import {
  getScopedDb,
  type CreditLedgerEntry,
  type NewCreditLedgerEntry,
} from "@/db";

export interface CreditsDeps {
  getScopedDb: typeof getScopedDb;
}

const defaultDeps: CreditsDeps = { getScopedDb };

export interface BookCreditsParams extends NewCreditLedgerEntry {
  workspaceId: string;
}

export function bookCredits(
  { workspaceId, ...entry }: BookCreditsParams,
  deps: CreditsDeps = defaultDeps,
): Promise<CreditLedgerEntry> {
  return deps.getScopedDb(workspaceId).creditLedger.book(entry);
}

export function getCreditBalance(
  workspaceId: string,
  deps: CreditsDeps = defaultDeps,
): Promise<number> {
  return deps.getScopedDb(workspaceId).creditLedger.balance();
}
