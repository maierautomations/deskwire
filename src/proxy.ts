import { NextResponse, type NextRequest } from "next/server";

// Optimistic comfort layer only (phase-0 decision no. 20): checks that a
// session cookie EXISTS, never whether it is valid. No database access. The
// real authorization boundary is auth() in src/app/(app)/layout.tsx, which
// also catches stale or revoked cookies that pass here.
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token", // https deployments
  "authjs.session-token", // local http dev
];

export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name),
  );
  if (hasSessionCookie) {
    return NextResponse.next();
  }
  const loginUrl = new URL("/login", request.nextUrl);
  loginUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Protected app routes. Route groups never appear in URLs, so this lists
  // real paths. A missing entry only loses this comfort redirect, never
  // security: the (app) layout and the /w/[workspaceId] layout still guard.
  // /invite is session-first by design (task 11): the callbackUrl this proxy
  // sets is exactly how a fresh user returns to the invite after login.
  matcher: ["/start", "/onboarding", "/w/:path*", "/invite/:path*"],
};
