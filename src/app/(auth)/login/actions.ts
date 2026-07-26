"use server";

import { AuthError } from "next-auth";

import { authErrorContent } from "@/app/anmelde-fehler/messages";
import { signIn } from "@/auth";
import {
  AFTER_LOGIN_DEFAULT,
  parseLoginEmail,
  sanitizeCallbackPath,
} from "@/lib/auth/login-validation";
import {
  MAGIC_LINK_RATE_LIMIT_MESSAGE,
  MagicLinkRateLimitError,
} from "@/lib/email/send-verification-request";

export type LoginFormState =
  | { status: "idle" }
  | { status: "invalid"; message: string; email: string }
  | { status: "send_failed"; message: string; email: string }
  | { status: "rate_limited"; message: string; email: string }
  | { status: "sent"; email: string };

// Requests the magic link. With redirect:false Auth.js runs in raw mode and
// throws AuthError subclasses (MagicLinkSendError surfaces as AccessDenied)
// straight into this action instead of redirecting — verified against
// @auth/core 0.41.3, which rethrows the original instance unwrapped, so the
// instanceof check below is reliable. The rate-limit case (task 9) must be
// checked BEFORE the generic AuthError branch: both classes surface as
// AccessDenied, only the instance tells them apart. Send failures reuse the
// German mapping from task 7b so that copy lives in exactly one place.
// Non-AuthError throws are unexpected: they rethrow into central logging and
// the German error boundary. Nothing in here may wrap a redirecting call in
// try/catch (NEXT_REDIRECT).
export async function requestLoginLink(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const rawEmail = formData.get("email");
  const parsed = parseLoginEmail(rawEmail);
  if (!parsed.ok) {
    return {
      status: "invalid",
      message: parsed.message,
      email: typeof rawEmail === "string" ? rawEmail : "",
    };
  }
  const redirectTo =
    sanitizeCallbackPath(formData.get("callbackUrl")) ?? AFTER_LOGIN_DEFAULT;
  try {
    await signIn("resend", {
      email: parsed.email,
      redirect: false,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof MagicLinkRateLimitError) {
      return {
        status: "rate_limited",
        message: MAGIC_LINK_RATE_LIMIT_MESSAGE,
        email: parsed.email,
      };
    }
    if (error instanceof AuthError) {
      return {
        status: "send_failed",
        message: authErrorContent(error.type).explanation,
        email: parsed.email,
      };
    }
    throw error;
  }
  return { status: "sent", email: parsed.email };
}
