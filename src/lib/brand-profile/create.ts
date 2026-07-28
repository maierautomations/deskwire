import { getScopedDb, type NewBrandProfile } from "@/db";
import { requireWorkspaceMembership } from "@/lib/workspace";

import {
  BRAND_PROFILE_FORBIDDEN_MESSAGE,
  parseBrandProfileInput,
} from "./input";

export type CreateBrandProfileResult =
  | { status: "invalid"; message: string }
  | { status: "forbidden"; message: string }
  | { status: "created" };

export interface CreateBrandProfileDeps {
  requireMembership: typeof requireWorkspaceMembership;
  createBrandProfile: (
    workspaceId: string,
    data: NewBrandProfile,
  ) => Promise<unknown>;
}

const createDeps: CreateBrandProfileDeps = {
  requireMembership: requireWorkspaceMembership,
  createBrandProfile: (workspaceId, data) =>
    getScopedDb(workspaceId).brandProfiles.create(data),
};

// Core logic of the create-brand-profile server action (pattern:
// createWorkspaceForUser), extracted so it is testable with fake deps while
// the action stays a thin shell of auth() plus formData extraction. Order is
// deliberate: pure input validation first (invalid input never touches the
// database), then the membership gate (server actions are public POST
// endpoints — the page's own guard proves nothing here), then the scoped
// create, which stamps the workspace id itself; this function never writes
// one into the row. Unexpected database errors throw into central logging.
export async function createBrandProfileForMember(
  input: {
    userId: string;
    workspaceId: string;
    rawName: unknown;
    rawDescription: unknown;
  },
  deps: CreateBrandProfileDeps = createDeps,
): Promise<CreateBrandProfileResult> {
  const parsed = parseBrandProfileInput(input.rawName, input.rawDescription);
  if (!parsed.ok) {
    return { status: "invalid", message: parsed.message };
  }
  const membership = await deps.requireMembership(
    input.userId,
    input.workspaceId,
  );
  if (!membership) {
    return { status: "forbidden", message: BRAND_PROFILE_FORBIDDEN_MESSAGE };
  }
  await deps.createBrandProfile(input.workspaceId, {
    name: parsed.name,
    description: parsed.description,
  });
  return { status: "created" };
}
