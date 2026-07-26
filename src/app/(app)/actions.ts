"use server";

import { signOut } from "@/auth";

// signOut deletes the session row (strategy "database") and then redirects
// by throwing NEXT_REDIRECT — never wrap this call in try/catch or the
// redirect dies silently.
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
