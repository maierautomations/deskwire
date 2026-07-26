import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start",
};

// Temporary app home so the protected area has one real route. Task 10b
// deletes this page when the workspace list takes over "/" (the proxy
// matcher in src/proxy.ts changes with it).
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
