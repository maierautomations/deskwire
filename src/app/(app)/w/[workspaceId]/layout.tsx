import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { requireWorkspaceMembership } from "@/lib/workspace";

// The authorization boundary of one workspace (phase-0 decisions 18/19): the
// URL is the only source of workspace identity — no cookie, no second truth.
// Membership is checked server-side per request; non-members, unknown and
// invalid ids all end in notFound(), so a foreign id is indistinguishable
// from a missing one (404, never 403). redirect() and notFound() throw
// control-flow errors — they must never be wrapped in try/catch. The session
// check repeats here deliberately: layouts render in parallel with the (app)
// layout, this boundary cannot rely on it having run first.
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
  return <>{children}</>;
}
