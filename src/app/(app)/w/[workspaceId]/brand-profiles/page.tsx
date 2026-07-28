import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getScopedDb } from "@/db";
import { formatBrandProfileDate } from "@/lib/brand-profile/format";
import {
  BRAND_PROFILE_DESCRIPTION_MAX_LENGTH,
  BRAND_PROFILE_NAME_MAX_LENGTH,
} from "@/lib/brand-profile/input";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { CreateBrandProfileForm } from "./create-brand-profile-form";

export const metadata: Metadata = {
  title: "Marken-Profile",
};

// Create and list; every row links into the editor (task 20a), which is where
// name, description, aktiv and the field groups are changed. No delete: a
// profile is pinned by runs from task 31 on, so removing one is a decision of
// its own phase. Layouts and pages render in parallel, so this page never
// relies on the w-layout's membership check having finished — it guards
// itself membership-first (task-10b pattern), then reads through the scoped
// client.
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
            <li key={profile.id}>
              <Link
                href={`/w/${workspaceId}/brand-profiles/${profile.id}`}
                className="flex items-baseline justify-between gap-4 px-1 py-3 transition-colors hover:bg-paper-raised"
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
              </Link>
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
            Name und Beschreibung reichen für den Anfang. Stil und Regeln legst
            du danach im Profil fest.
          </p>
        </div>
        <CreateBrandProfileForm
          workspaceId={workspaceId}
          nameMaxLength={BRAND_PROFILE_NAME_MAX_LENGTH}
          descriptionMaxLength={BRAND_PROFILE_DESCRIPTION_MAX_LENGTH}
        />
      </section>
    </div>
  );
}
