import { z } from "zod";

import {
  getValidInvite,
  INVITE_TOKEN_LENGTH,
  joinWorkspaceAsMember,
  type WorkspaceInvite,
} from "@/db";

// Path of the redemption route; the settings page builds the shareable URL
// from it so the string exists exactly once.
export function invitePath(token: string): string {
  return `/invite/${token}`;
}

// Boundary validation for the token URL segment (CLAUDE.md: Zod at every
// boundary): exactly the shape generateInviteToken produces. Anything else is
// invalid WITHOUT a database roundtrip — same pattern as the workspaceId
// validation in requireWorkspaceMembership (task 10b).
const inviteTokenSchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`));

export function parseInviteToken(value: unknown): string | null {
  const parsed = inviteTokenSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type RedeemInviteResult =
  | { status: "joined"; workspaceId: string }
  | { status: "invalid" };

export interface RedeemInviteDeps {
  getValidInvite: typeof getValidInvite;
  joinWorkspaceAsMember: typeof joinWorkspaceAsMember;
}

const redeemDeps: RedeemInviteDeps = { getValidInvite, joinWorkspaceAsMember };

// Core logic of the redemption page, extracted so it is testable with fake
// deps (pattern: createWorkspaceForUser). The workspaceId the user joins
// comes EXCLUSIVELY from the invite row the token resolved to — never from
// caller input — which is what confines a workspace-A token to workspace A.
// "joined" also covers users who already were members (including owners:
// createMembershipFromInvite never touches an existing row), because both end
// in the same redirect. Malformed, unknown and expired tokens collapse into
// one "invalid" — the page shows one German error state, no validity oracle.
// Unexpected database errors throw into central logging.
export async function redeemInvite(
  input: { userId: string; token: string },
  deps: RedeemInviteDeps = redeemDeps,
): Promise<RedeemInviteResult> {
  const token = parseInviteToken(input.token);
  if (!token) {
    return { status: "invalid" };
  }
  const invite = await deps.getValidInvite(token, new Date());
  if (!invite) {
    return { status: "invalid" };
  }
  await deps.joinWorkspaceAsMember({
    userId: input.userId,
    workspaceId: invite.workspaceId,
  });
  return { status: "joined", workspaceId: invite.workspaceId };
}

// Whether the stored invite is past its expiry at call time. Domain logic,
// deliberately not inline in the settings page: it mirrors the validity cut
// findValidInviteByToken applies in SQL (expires_at > now), and render scopes
// must stay pure (react-hooks/purity).
export function isInviteExpired(
  invite: Pick<WorkspaceInvite, "expiresAt">,
): boolean {
  return invite.expiresAt.getTime() <= Date.now();
}

// German date-time for invite expiry lines, pinned to Europe/Berlin so server
// rendering (Vercel runs UTC) cannot shift the shown day. Machine voice, used
// in mono context only.
const expiryDateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

const expiryTimeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export function formatInviteExpiry(date: Date): string {
  return `${expiryDateFormat.format(date)}, ${expiryTimeFormat.format(date)} Uhr`;
}
