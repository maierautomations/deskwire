import * as Sentry from "@sentry/nextjs";
import type { EmailConfig } from "next-auth/providers";

// Minimal German text-only magic-link mail (task 7a). Task 7b turns this
// into a proper HTML+text template with unit tests and a dev-log mode.
//
// Fail-closed: every failure throws, so Auth.js surfaces an error page
// instead of pretending the mail went out. Sentry only records failures we
// own (broken key, Resend outage, network). Rejections that any stranger can
// trigger through the public sign-in endpoint (sandbox recipient
// restriction, invalid address, Resend rate limit) throw WITHOUT a Sentry
// event, otherwise a handful of foreign requests drains the Sentry quota.
// Real rate limiting for this path lands in task 9.

type SendVerificationRequestParams = Parameters<
  EmailConfig["sendVerificationRequest"]
>[0];

export async function sendVerificationRequest(
  params: SendVerificationRequestParams,
): Promise<void> {
  const { identifier, url, provider } = params;
  const { apiKey, from } = provider;

  if (!apiKey || !from) {
    // Config error on our side, never triggerable from the outside.
    const error = new Error("Resend provider is missing apiKey or from");
    Sentry.captureException(error);
    throw error;
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: identifier,
        subject: "Dein Anmeldelink für Deskwire",
        text: [
          "Hallo,",
          "",
          "klicke auf diesen Link, um dich bei Deskwire anzumelden:",
          "",
          url,
          "",
          "Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.",
          "",
          "Wenn du diese Anmeldung nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.",
        ].join("\n"),
      }),
    });
  } catch (error) {
    Sentry.captureException(error);
    throw new Error("Verification email could not be sent: network error");
  }

  if (res.ok) {
    return;
  }

  // 401 means our key is broken, 5xx means Resend is down: report those.
  // Every other 4xx is an expected rejection; the error message stays free
  // of the recipient address so downstream logs contain no PII.
  const isOurFailure = res.status === 401 || res.status >= 500;
  const error = new Error(
    `Verification email rejected by Resend: status ${res.status}`,
  );
  if (isOurFailure) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    Sentry.captureException(error, { extra: { status: res.status, detail } });
  }
  throw error;
}
