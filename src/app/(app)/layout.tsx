import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

import { signOutAction } from "./actions";

// The real authorization boundary of the app area: auth() resolves the
// session against the database (strategy "database"), so expired or revoked
// sessions fail here no matter what the optimistic proxy let through. The
// redirect deliberately carries no callbackUrl — that comfort belongs to the
// proxy's no-cookie path; a second, client-influenced source is not worth
// the stale-session edge case (task 8 decision).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
          <Link href="/start" className="shrink-0">
            <Wordmark />
          </Link>
          <div className="flex min-w-0 items-center gap-4">
            <span className="truncate text-xs text-ink-soft">
              {session.user.email}
            </span>
            <form action={signOutAction} className="shrink-0">
              <Button type="submit" variant="outline" size="sm">
                Abmelden
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {children}
      </main>
    </>
  );
}
