import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProofSheet } from "@/components/brand/proof-sheet";
import { Wordmark } from "@/components/brand/wordmark";
import { INVITE_TTL_DAYS } from "@/db";
import { invitePath, redeemInvite } from "@/lib/invite";

// Invite URLs carry a bearer token: never indexed.
export const metadata: Metadata = {
  title: "Einladung",
  robots: { index: false, follow: false },
};

// Redemption route (task 11). Deliberately OUTSIDE the (app) group: its
// layout redirects to /login without a callbackUrl (task-8 decision), while
// this flow depends on returning here after login. Order is login first,
// validate second (spec'd in the phase plan) — which also means anonymous
// visitors cannot probe token validity. The workspaceId in the success
// redirect comes from the invite row inside redeemInvite, never from the URL
// or any user input. redirect() throws NEXT_REDIRECT and stays outside any
// try/catch. Already-members and owners take the same redirect: the
// membership write is idempotent and never touches an existing row.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [session, { token }] = await Promise.all([auth(), params]);
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(invitePath(token))}`);
  }
  const result = await redeemInvite({ userId: session.user.id, token });
  if (result.status === "joined") {
    redirect(`/w/${result.workspaceId}`);
  }
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12 md:pb-28">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Wordmark className="text-lg" />
        <ProofSheet>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="font-display text-xl font-semibold">
                Dieser Einladungslink funktioniert nicht.
              </h1>
              <p className="text-sm text-ink-soft">
                Der Link ist abgelaufen oder wurde erneuert. Einladungslinks
                gelten {INVITE_TTL_DAYS} Tage. Bitte lass dir aus dem Workspace
                einen neuen Link schicken.
              </p>
            </div>
            <Link
              href="/start"
              className="w-fit text-sm underline underline-offset-4"
            >
              Zu deinen Workspaces
            </Link>
          </div>
        </ProofSheet>
      </div>
    </main>
  );
}
