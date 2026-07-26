import { createHmac } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { normalizeLoginEmail } from "@/lib/auth/login-validation";
import { serverEnv } from "@/lib/env";

// Rate limiting for the magic-link send path (task 9).
//
// Deliberately fail-open: this limiter is defense in depth for an
// email-sending path, not a data gate. A missing or broken limiter must
// never kill login, which makes this the one justified deviation from the
// fail-closed principle (CLAUDE.md no. 2). Construction is lazy inside
// try/catch (phase-0 pitfall 10). Finding against @upstash/redis 1.38.0:
// Redis.fromEnv() no longer throws synchronously on missing env, it only
// console.warns and returns a client that fails at request time — which
// would turn "limiter disabled, one warning per process" into a Sentry
// event per request. So presence is checked explicitly here and Redis is
// constructed directly; the try/catch stays for any other construction
// failure. A disabled limiter costs one Sentry warning per process.
// Runtime failures of limit() are our own outage (never
// foreign-triggerable), so they are reported and the send proceeds. Limit
// HITS never create Sentry events, they are foreign-triggerable through
// the public sign-in endpoint (same classification as the task-7a
// send-error split).
//
// Keys are HMAC-SHA256 with AUTH_SECRET, for the email and the IP
// dimension alike: a plain unsalted hash of an email address is trivially
// reversible with a candidate list, which is no pseudonymization, and the
// keys live at a third party while EU data residency is part of the
// product promise.

// Structural subset of @upstash/ratelimit's Ratelimit, so tests inject
// plain fakes and never touch the network.
export type RateLimiter = {
  limit(key: string): Promise<{ success: boolean }>;
};

export type MagicLinkRateLimiters = {
  email: RateLimiter;
  ip: RateLimiter;
};

export type MagicLinkRateLimitInput = {
  email: string;
  ip: string | null;
};

// Environment-separated prefix: production, preview and local development
// share one free Upstash DB and must never share counter space.
export function rateLimitPrefix(
  vercelEnv: string | undefined,
  dimension: "email" | "ip",
): string {
  const envName = vercelEnv && vercelEnv.length > 0 ? vercelEnv : "dev";
  return `deskwire:${envName}:magic-link:${dimension}`;
}

export function hashRateLimitKey(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

// Only x-real-ip, which Vercel's proxy sets itself. Deliberately no
// x-forwarded-for fallback: proxies append to that header instead of
// replacing it, so a self-supplied value ends up first and the IP dimension
// would rate-limit attacker-chosen strings. No resolvable IP (local dev
// without a proxy) skips the IP dimension; the email dimension still holds.
export function clientIpFromRequest(request: Request): string | null {
  const value = request.headers.get("x-real-ip")?.trim();
  return value ? value : null;
}

let cachedLimiters: MagicLinkRateLimiters | null | undefined;

export function getMagicLinkRateLimiters(): MagicLinkRateLimiters | null {
  if (cachedLimiters !== undefined) {
    return cachedLimiters;
  }
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing",
      );
    }
    const redis = new Redis({ url, token });
    const vercelEnv = process.env.VERCEL_ENV;
    cachedLimiters = {
      // 3 per 15 minutes per address: stops bombarding a single inbox.
      email: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, "15 m"),
        prefix: rateLimitPrefix(vercelEnv, "email"),
        analytics: false,
      }),
      // 10 per hour per IP: stops address rotation from burning the Resend
      // quota.
      ip: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: rateLimitPrefix(vercelEnv, "ip"),
        analytics: false,
      }),
    };
  } catch (error) {
    cachedLimiters = null;
    Sentry.captureMessage(
      `Magic-link rate limiter disabled, running fail-open: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "warning",
    );
  }
  return cachedLimiters;
}

// Sequential on purpose, email first, early exit WITHOUT touching the IP
// counter: with parallel checks an impatient legitimate user burns their IP
// budget on requests the email limit already rejects and ends up locked out
// for an hour although the 15-minute window has long reopened. Address
// rotation is unaffected, there the email check passes and the IP counter
// increments normally.
export async function checkMagicLinkRateLimit(
  input: MagicLinkRateLimitInput,
  limiters: MagicLinkRateLimiters | null,
  getSecret: () => string = () => serverEnv().AUTH_SECRET,
): Promise<{ limited: boolean }> {
  if (limiters === null) {
    return { limited: false };
  }
  try {
    const secret = getSecret();
    const emailKey = hashRateLimitKey(normalizeLoginEmail(input.email), secret);
    const emailResult = await limiters.email.limit(emailKey);
    if (!emailResult.success) {
      return { limited: true };
    }
    if (input.ip !== null) {
      const ipResult = await limiters.ip.limit(
        hashRateLimitKey(input.ip, secret),
      );
      if (!ipResult.success) {
        return { limited: true };
      }
    }
    return { limited: false };
  } catch (error) {
    // Upstash outage or misconfiguration is our failure, report and let the
    // send proceed (fail-open, see header).
    Sentry.captureException(error);
    return { limited: false };
  }
}
