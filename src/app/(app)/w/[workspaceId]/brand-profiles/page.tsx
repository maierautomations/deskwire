import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getScopedDb } from "@/db";
import { formatBrandProfileDate } from "@/lib/brand-profile";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { CreateBrandProfileForm } from "./create-brand-profile-form";

export const metadata: Metadata = {
  title: "Marken-Profile",
};

// Phase-0 stub on purpose: create and list, nothing else. No edit, no delete,
// no versions, no detail page — the real profile field schema is a phase-1
// decision with QA consequences and is not anticipated here. Layouts and
// pages render in parallel, so this page never relies on the w-layout's
// membership check having finished — it guards itself membership-first
// (task-10b pattern), then reads through the scoped client.
export default async function BrandProfilesPage({
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
  const profiles = await getScopedDb(workspaceId).brandProfiles.list();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold">Marken-Profile</h1>
        <Link
          href={`/w/${workspaceId}`}
          className="w-fit text-sm text-ink-soft underline underline-offset-4"
        >
          Zum Workspace
        </Link>
      </div>

      {profiles.length === 0 ? (
        <p className="border-t border-line pt-6 text-sm text-ink-soft">
          Noch keine Marken-Profile. Leg unten das erste an.
        </p>
      ) : (
        // Internal separators only (divide-y): the following form section
        // opens with its own top rule, a closing border-b per row would
        // double it (Chanel check, task 13).
        <ul className="divide-y divide-line border-t border-line">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-baseline justify-between gap-4 px-1 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {profile.name}
                </span>
                {profile.description ? (
                  <span className="text-xs text-ink-soft">
                    {profile.description}
                  </span>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-xs text-ink-soft">
                {formatBrandProfileDate(profile.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-4 border-t border-line pt-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-semibold">
            Marken-Profil anlegen
          </h2>
          <p className="max-w-prose text-sm text-ink-soft">
            Name und Beschreibung reichen für den Anfang. Stilregeln und
            Versionen kommen in einer späteren Phase dazu.
          </p>
        </div>
        <CreateBrandProfileForm workspaceId={workspaceId} />
      </section>
    </div>
  );
}
