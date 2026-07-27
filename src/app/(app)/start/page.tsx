import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getWorkspacesForUser } from "@/db";
import { Button } from "@/components/ui/button";
import { MEMBERSHIP_ROLE_LABELS, postLoginSurface } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Workspaces",
};

// Permanent post-login entry point (PRD decision log no. 7): today the
// workspace list as a minimal switcher, phase 1 will likely redirect into the
// last used workspace. Zero memberships go to /onboarding — the empty state
// of this list is therefore unreachable by design (postLoginSurface holds the
// loop-freeness invariant). The page checks the session itself: layouts and
// pages render in parallel, so it never relies on the (app) layout's guard.
export default async function StartPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const workspaces = await getWorkspacesForUser(session.user.id);
  if (postLoginSurface(workspaces.length) === "onboarding") {
    redirect("/onboarding");
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-xl font-semibold">
          Deine Workspaces
        </h1>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/onboarding">Workspace anlegen</Link>
        </Button>
      </div>
      <ul className="border-t border-line">
        {workspaces.map(({ workspace, role }) => (
          <li key={workspace.id} className="border-b border-line">
            <Link
              href={`/w/${workspace.id}`}
              className="flex h-12 items-center justify-between gap-4 px-1 transition-colors hover:bg-paper-raised"
            >
              <span className="truncate text-sm font-medium">
                {workspace.name}
              </span>
              <span className="shrink-0 text-xs text-ink-soft">
                {MEMBERSHIP_ROLE_LABELS[role]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
