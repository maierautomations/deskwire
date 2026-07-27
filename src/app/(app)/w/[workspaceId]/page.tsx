import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getWorkspacesForUser } from "@/db";
import { MEMBERSHIP_ROLE_LABELS } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Workspace",
};

// Workspace home. Layouts and pages render in parallel, so this page never
// relies on the layout's membership check having finished: it derives its
// data membership-first itself — the list of OWN workspaces, then find. A
// foreign, unknown or invalid id is simply absent from that list and ends in
// the same notFound() the layout produces. Deliberate cost: this request
// resolves the session up to three times ((app) layout, w-layout, page);
// deduping via React cache() around auth() is the planned later step.
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const [session, { workspaceId }] = await Promise.all([auth(), params]);
  if (!session?.user) {
    redirect("/login");
  }
  const workspaces = await getWorkspacesForUser(session.user.id);
  const entry = workspaces.find((item) => item.workspace.id === workspaceId);
  if (!entry) {
    notFound();
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-ink-soft">
          {MEMBERSHIP_ROLE_LABELS[entry.role]}
        </p>
        <h1 className="font-display text-xl font-semibold">
          {entry.workspace.name}
        </h1>
      </div>
      <p className="max-w-prose text-sm text-ink-soft">
        Dein Workspace steht. Brand-Profile und Briefings folgen in den
        nächsten Schritten.
      </p>
      <Link
        href="/start"
        className="w-fit text-sm underline underline-offset-4"
      >
        Alle Workspaces
      </Link>
    </div>
  );
}
