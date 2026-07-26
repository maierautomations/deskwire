import * as Sentry from "@sentry/nextjs";
import { AuthError } from "next-auth";
import type { EmailConfig } from "next-auth/providers";

import { shouldUseDevLog } from "@/lib/email/dev-log";
import { magicLinkEmail } from "@/lib/email/magic-link-template";
import {
  checkMagicLinkRateLimit,
  clientIpFromRequest,
  getMagicLinkRateLimiters,
  type MagicLinkRateLimitInput,
} from "@/lib/security/ratelimit";

// German magic-link mail (HTML + text, task 7b).
//
// Fail-closed: every failure throws, so Auth.js surfaces an error page
// instead of pretending the mail went out. Sentry only records failures we
// own (broken key, Resend outage, network). Rejections that any stranger can
// trigger through the public sign-in endpoint (sandbox recipient
// restriction, invalid address, Resend rate limit) throw WITHOUT a Sentry
// event, otherwise a handful of foreign requests drains the Sentry quota.
//
// Rate limit (task 9): the guard lives HERE and not in the login server
// action because this is the one point both the form flow and direct POSTs
// to /api/auth/signin/resend pass through. It runs after the dev-log
// short-circuit (provably local-only, sends no mail) and before anything
// that reaches Resend, so the guarded surface is exactly the mail-sending
// path. Limit hits are foreign-triggerable and never reach Sentry.

// Thrown for every failed send. `static type = "AccessDenied"` deliberately
// reuses the only client-safe Auth.js error type whose semantics fit ("the
// sign-in attempt was refused, nothing happened"): client-safe types survive
// the redirect to the error page as ?error=AccessDenied, everything else
// collapses to the indistinct "Configuration". This lets the German error
// page explain the actual cause (brand book 4.3 rule 4). The only other
// source of AccessDenied is a signIn callback, which this app does not
// define; tests/auth/auth-config.test.ts enforces that assumption.
export class MagicLinkSendError extends AuthError {
  static type = "AccessDenied";
}

// Thrown on a rate-limit hit. A limit is not a send failure, so this is a
// distinct class: the login action tells them apart via instanceof and
// shows a different next step (wait, instead of retry-later-something-broke).
// That works because @auth/core 0.41.3 rethrows the ORIGINAL error instance
// in raw mode (index.js: `if (isAuthError && isRaw && !isRedirect) throw
// error`) and next-auth's action wrapper adds no try/catch of its own. The
// static type is still "AccessDenied" — for redirect flows (direct POSTs)
// only the client-safe type survives as ?error= and AccessDenied remains
// the only fitting one (task-7b finding), so that path degrades to the generic
// send-failure copy on /anmelde-fehler. Accepted: it is practically the
// abuse path, and that copy already says "try again in a few minutes".
export class MagicLinkRateLimitError extends AuthError {
  static type = "AccessDenied";
}

export const MAGIC_LINK_RATE_LIMIT_MESSAGE =
  "Zu viele Anmeldeversuche. Bitte warte ein paar Minuten.";

export type RateLimitCheck = (
  input: MagicLinkRateLimitInput,
) => Promise<{ limited: boolean }>;

const defaultRateLimitCheck: RateLimitCheck = (input) =>
  checkMagicLinkRateLimit(input, getMagicLinkRateLimiters());

type SendVerificationRequestParams = Parameters<
  EmailConfig["sendVerificationRequest"]
>[0];

export async function sendVerificationRequest(
  params: SendVerificationRequestParams,
  checkRateLimit: RateLimitCheck = defaultRateLimitCheck,
): Promise<void> {
  const { identifier, url, provider } = params;

  if (shouldUseDevLog(process.env)) {
    // Unambiguously local (enforced in shouldUseDevLog): print the working
    // magic link instead of sending, to test second users despite the
    // Resend sandbox.
    console.log(`[auth][dev-log] Magic link for ${identifier}:\n${url}`);
    return;
  }

  const { limited } = await checkRateLimit({
    email: identifier,
    ip: clientIpFromRequest(params.request),
  });
  if (limited) {
    // No Sentry event: foreign-triggerable (task-7a classification).
    throw new MagicLinkRateLimitError("Magic-link rate limit hit");
  }

  const { apiKey, from } = provider;

  if (!apiKey || !from) {
    // Config error on our side, never triggerable from the outside.
    const error = new MagicLinkSendError(
      "Resend provider is missing apiKey or from",
    );
    Sentry.captureException(error);
    throw error;
  }

  const { subject, text, html } = magicLinkEmail({ url });

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: identifier, subject, text, html }),
    });
  } catch (error) {
    Sentry.captureException(error);
    throw new MagicLinkSendError(
      "Verification email could not be sent: network error",
    );
  }

  if (res.ok) {
    return;
  }

  // 401 means our key is broken, 5xx means Resend is down: report those.
  // Every other 4xx is an expected rejection; the error message stays free
  // of the recipient address so downstream logs contain no PII.
  const isOurFailure = res.status === 401 || res.status >= 500;
  const error = new MagicLinkSendError(
    `Verification email rejected by Resend: status ${res.status}`,
  );
  if (isOurFailure) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    Sentry.captureException(error, { extra: { status: res.status, detail } });
  }
  throw error;
}
