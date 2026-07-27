import type { Metadata } from "next";

import { ProofSheet } from "@/components/brand/proof-sheet";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Workspace anlegen",
};

// Deliberately NO membership bounce (operator decision, deviating from the
// original 10b wording): this page also serves members creating a second
// workspace via the link on /start — the acceptance demo needs two workspaces
// in one switcher. Session guarding is the (app) layout's job; the server
// action re-checks before writing. See postLoginSurface in @/lib/workspace
// for why the redirect topology stays loop-free.
export default function OnboardingPage() {
  return (
    <div className="mx-auto w-full max-w-sm pt-4 md:pt-14">
      <ProofSheet>
        <OnboardingForm />
      </ProofSheet>
    </div>
  );
}
