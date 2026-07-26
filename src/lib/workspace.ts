import { z } from "zod";

import {
  createWorkspaceAsOwner,
  getMembership,
  type Membership,
} from "@/db";

export const WORKSPACE_NAME_MAX_LENGTH = 80;

export const WORKSPACE_NAME_INVALID_MESSAGE =
  "Bitte gib einen Namen mit 1 bis 80 Zeichen ein.";

const workspaceNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(WORKSPACE_NAME_MAX_LENGTH));

export type WorkspaceNameResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

// Boundary validation for the workspace name (CLAUDE.md: Zod at every
// boundary). Expected failures come back as a typed result with the German
// message, never as a throw.
export function parseWorkspaceName(value: unknown): WorkspaceNameResult {
  const parsed = workspaceNameSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: WORKSPACE_NAME_INVALID_MESSAGE };
  }
  return { ok: true, name: parsed.data };
}

const uuidSchema = z.uuid();

export interface RequireWorkspaceMembershipDeps {
  getMembership: typeof getMembership;
}

const membershipDeps: RequireWorkspaceMembershipDeps = { getMembership };

// Membership gate for workspace-bound requests. Non-members get null, never
// false and never a throw: the 404 mapping on null is task 10b's job. Invalid
// ids also yield null WITHOUT a database roundtrip — the workspaceId arrives
// raw from the URL in 10b, and an arbitrary string would otherwise surface as
// a Postgres uuid cast error (22P02) instead of a clean "not yours" signal.
// deps is injectable for PGlite tests; production uses the bound @/db entry.
export async function requireWorkspaceMembership(
  userId: string,
  workspaceId: string,
  deps: RequireWorkspaceMembershipDeps = membershipDeps,
): Promise<Membership | null> {
  if (!uuidSchema.safeParse(workspaceId).success) {
    return null;
  }
  return deps.getMembership(userId, workspaceId);
}

export type CreateWorkspaceResult =
  | { status: "invalid"; message: string }
  | { status: "created"; workspaceId: string };

export interface CreateWorkspaceDeps {
  createWorkspaceAsOwner: typeof createWorkspaceAsOwner;
}

const createDeps: CreateWorkspaceDeps = { createWorkspaceAsOwner };

// Core logic of the create-workspace server action, extracted so it is
// testable with a fake dep while the action itself stays a thin shell of
// auth() plus formData extraction (the form arrives with 10b). The caller
// provides an authenticated userId; unexpected database errors throw into
// central logging.
export async function createWorkspaceForUser(
  input: { userId: string; rawName: unknown },
  deps: CreateWorkspaceDeps = createDeps,
): Promise<CreateWorkspaceResult> {
  const parsed = parseWorkspaceName(input.rawName);
  if (!parsed.ok) {
    return { status: "invalid", message: parsed.message };
  }
  const { workspace } = await deps.createWorkspaceAsOwner({
    name: parsed.name,
    userId: input.userId,
  });
  return { status: "created", workspaceId: workspace.id };
}
