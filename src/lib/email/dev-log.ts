// Dev-log login: prints a working magic link to the local server log instead
// of sending mail, so second-user tests work despite the Resend sandbox
// (phase-0 decision log no. 14).
//
// A logged magic link is a full account takeover for whoever reads the log,
// so this path is guarded by code, not convention: it only activates when the
// environment is unambiguously local. NODE_ENV must be exactly "development"
// AND no Vercel marker may be present. Any other combination, including a
// mistakenly set flag in a Vercel environment, falls through to the regular
// send path. There is no abort branch: unclear environment means send,
// never log.

export function shouldUseDevLog(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.AUTH_EMAIL_DEV_LOG === "1" &&
    env.NODE_ENV === "development" &&
    env.VERCEL === undefined &&
    env.VERCEL_ENV === undefined
  );
}
