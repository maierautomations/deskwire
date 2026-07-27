import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getScopedDb, INVITE_TTL_DAYS } from "@/db";
import {
  formatInviteExpiry,
  invitePath,
  isInviteExpired,
} from "@/lib/invite";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { CopyLinkButton } from "./copy-link-button";
import { RegenerateInviteForm } from "./regenerate-invite-form";

export const metadata: Metadata = {
  title: "Einstellungen",
};

// Workspace settings, phase-0 content: the invite link only. Layouts and
// pages render in parallel, so this page never relies on the w-layout's
// membership check having finished — it guards itself membership-first
// (task-10b pattern), then reads through the scoped client. The shareable
// URL is built from the request host, the same principle the magic links
// follow (task 7a: URLs from the request, no configured base URL).
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const [session, { workspaceId }] = await Promise.all([auth(), params]);
  if (!session?.user) {
    redirect("/login");
  }
  const membership = await requireWorkspaceMembership(
    session.user.id,
    workspaceId,
  );
  if (!membership) {
    notFound();
  }
  const invite = await getScopedDb(workspaceId).invites.get();

  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const inviteUrl = invite
    ? `${host ? `${proto}://${host}` : ""}${invitePath(invite.token)}`
    : null;
  const expired = invite !== null && isInviteExpired(invite);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold">Einstellungen</h1>
        <Link
          href={`/w/${workspaceId}`}
          className="w-fit text-sm text-ink-soft underline underline-offset-4"
        >
          Zum Workspace
        </Link>
      </div>

      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-semibold">
            Einladungslink
          </h2>
          <p className="max-w-prose text-sm text-ink-soft">
            Wer den Link öffnet, tritt diesem Workspace als Mitglied bei. Jeder
            Link gilt {INVITE_TTL_DAYS} Tage.
          </p>
        </div>

        {invite === null ? (
          <RegenerateInviteForm
            workspaceId={workspaceId}
            label="Link erzeugen"
            pendingLabel="Wird erzeugt …"
            primary
          />
        ) : expired ? (
          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs text-ink-soft">
              Abgelaufen am {formatInviteExpiry(invite.expiresAt)}.
            </p>
            <RegenerateInviteForm
              workspaceId={workspaceId}
              label="Link erneuern"
              pendingLabel="Wird erneuert …"
              primary
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="break-all rounded-md border border-line bg-paper-raised px-3 py-2 font-mono text-xs">
              {inviteUrl}
            </p>
            <p className="font-mono text-xs text-ink-soft">
              Gültig bis {formatInviteExpiry(invite.expiresAt)}.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {inviteUrl ? <CopyLinkButton url={inviteUrl} /> : null}
              <RegenerateInviteForm
                workspaceId={workspaceId}
                label="Link erneuern"
                pendingLabel="Wird erneuert …"
              />
            </div>
          </div>
        )}

        <p className="max-w-prose text-xs text-ink-soft">
          Beim Erneuern wird der bisherige Link ungültig, auch wenn ihn jemand
          anderes erzeugt hat.
        </p>
      </section>
    </div>
  );
}
