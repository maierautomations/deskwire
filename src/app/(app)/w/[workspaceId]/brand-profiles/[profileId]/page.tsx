import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { getScopedDb } from "@/db";
import { BRAND_PROFILE_FREETEXT_FIELDS } from "@/lib/brand-profile/editor";
import { formatBrandProfileVersionLine } from "@/lib/brand-profile/format";
import {
  BRAND_PROFILE_DESCRIPTION_MAX_LENGTH,
  BRAND_PROFILE_NAME_MAX_LENGTH,
} from "@/lib/brand-profile/input";
import { parseBrandProfileFields } from "@/lib/brand-profile/schema";
import { requireWorkspaceMembership } from "@/lib/workspace";

import { FreitextForm } from "./freitext-form";
import { ProfilForm } from "./profil-form";

export const metadata: Metadata = {
  title: "Marken-Profil",
};

const profileIdSchema = z.uuid();

// The brand profile editor (task 20a): name, description, aktiv and the six
// free text groups. The structured groups (pflichtelemente, formatregeln,
// terms, example texts) arrive in task 20b as further sections.
//
// Layouts and pages render in parallel, so this page never relies on the
// w-layout's membership check having finished — it guards itself
// membership-first (task-10b pattern), then reads through the scoped client.
// A foreign or unknown profile is a 404, identical to a malformed id: no
// existence oracle (phase-0 decisions 18/19).
export default async function BrandProfilePage({
  params,
}: {
  params: Promise<{ workspaceId: string; profileId: string }>;
}) {
  const [session, { workspaceId, profileId }] = await Promise.all([
    auth(),
    params,
  ]);
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
  // A malformed id would reach Postgres as a raw string and throw 22P02.
  if (!profileIdSchema.safeParse(profileId).success) {
    notFound();
  }

  const scope = getScopedDb(workspaceId);
  const profile = await scope.brandProfiles.getById(profileId);
  if (!profile) {
    notFound();
  }
  // The version row, not profile.updatedAt: a deduplicated save writes
  // nothing, so this is the one truth for "last really changed" (task 19).
  const latest = await scope.brandProfileVersions.getLatest(profileId);
  const fields = parseBrandProfileFields(profile.fields);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold">{profile.name}</h1>
        {latest ? (
          <p className="font-mono text-xs text-ink-soft">
            {formatBrandProfileVersionLine(latest.version, latest.createdAt)}
          </p>
        ) : null}
        <Link
          href={`/w/${workspaceId}/brand-profiles`}
          className="w-fit text-sm text-ink-soft underline underline-offset-4"
        >
          Zu den Marken-Profilen
        </Link>
      </div>

      {/* Limits travel as props, never as a client-side import: the constants
          live next to the Zod schemas, and importing them would pull zod into
          the client bundle. */}
      <ProfilForm
        workspaceId={workspaceId}
        profileId={profile.id}
        name={profile.name}
        description={profile.description ?? ""}
        aktiv={profile.aktiv}
        nameMaxLength={BRAND_PROFILE_NAME_MAX_LENGTH}
        descriptionMaxLength={BRAND_PROFILE_DESCRIPTION_MAX_LENGTH}
      />

      <FreitextForm
        workspaceId={workspaceId}
        profileId={profile.id}
        fields={BRAND_PROFILE_FREETEXT_FIELDS}
        values={Object.fromEntries(
          BRAND_PROFILE_FREETEXT_FIELDS.map((field) => [
            field.key,
            fields[field.key],
          ]),
        )}
      />
    </div>
  );
}
