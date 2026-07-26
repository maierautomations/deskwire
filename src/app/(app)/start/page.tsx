import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start",
};

// Permanent post-login entry point (PRD decision log no. 7): the route
// stays, the content grows. Task 10b replaces this placeholder with the
// workspace list; "/" stays unassigned until the landing page decision.
export default function StartPage() {
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <h1 className="font-display text-xl font-semibold">Angemeldet.</h1>
      <p className="text-sm text-ink-soft">
        Mehr gibt es hier noch nicht. Workspaces und Marken-Profile folgen in
        den nächsten Schritten.
      </p>
    </div>
  );
}
