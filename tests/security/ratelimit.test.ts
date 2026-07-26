import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/nextjs";

import {
  checkMagicLinkRateLimit,
  clientIpFromRequest,
  hashRateLimitKey,
  rateLimitPrefix,
  type MagicLinkRateLimiters,
  type RateLimiter,
} from "@/lib/security/ratelimit";

// Hoisted by vitest above all imports.
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const SECRET = "test-secret";
const getSecret = () => SECRET;

function fakeLimiter(success: boolean): RateLimiter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    limit(key: string) {
      calls.push(key);
      return Promise.resolve({ success });
    },
  };
}

function fakeLimiters(
  emailSuccess: boolean,
  ipSuccess: boolean,
): MagicLinkRateLimiters & {
  email: ReturnType<typeof fakeLimiter>;
  ip: ReturnType<typeof fakeLimiter>;
} {
  return { email: fakeLimiter(emailSuccess), ip: fakeLimiter(ipSuccess) };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("rateLimitPrefix", () => {
  it("separates counter space per Vercel environment", () => {
    expect(rateLimitPrefix("production", "email")).toBe(
      "deskwire:production:magic-link:email",
    );
    expect(rateLimitPrefix("preview", "ip")).toBe(
      "deskwire:preview:magic-link:ip",
    );
  });

  it("falls back to dev when VERCEL_ENV is missing or empty", () => {
    expect(rateLimitPrefix(undefined, "email")).toBe(
      "deskwire:dev:magic-link:email",
    );
    expect(rateLimitPrefix("", "ip")).toBe("deskwire:dev:magic-link:ip");
  });
});

describe("hashRateLimitKey", () => {
  it("is a keyed HMAC-SHA256, not an unsalted hash", () => {
    const expected = createHmac("sha256", SECRET)
      .update("user@example.com")
      .digest("hex");
    expect(hashRateLimitKey("user@example.com", SECRET)).toBe(expected);
    // A different secret must produce a different key, otherwise the hash
    // is reversible with a candidate list regardless of AUTH_SECRET.
    expect(hashRateLimitKey("user@example.com", "other-secret")).not.toBe(
      expected,
    );
  });
});

describe("clientIpFromRequest", () => {
  it("reads x-real-ip, which only Vercel's proxy sets", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.7" },
    });
    expect(clientIpFromRequest(request)).toBe("203.0.113.7");
  });

  it("ignores x-forwarded-for: proxies append, attackers prepend", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
    });
    expect(clientIpFromRequest(request)).toBeNull();
  });

  it("returns null without the header or with an empty value", () => {
    expect(clientIpFromRequest(new Request("https://example.com"))).toBeNull();
    const blank = new Request("https://example.com", {
      headers: { "x-real-ip": "   " },
    });
    expect(clientIpFromRequest(blank)).toBeNull();
  });
});

describe("checkMagicLinkRateLimit", () => {
  it("fails open when the limiters are disabled (null)", async () => {
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: "203.0.113.7" },
      null,
      getSecret,
    );
    expect(result).toEqual({ limited: false });
  });

  it("hashes keys and never sends plaintext email or IP to Redis", async () => {
    const limiters = fakeLimiters(true, true);
    await checkMagicLinkRateLimit(
      { email: "  User@Example.COM ", ip: "203.0.113.7" },
      limiters,
      getSecret,
    );
    // Normalization runs BEFORE hashing, via the shared normalizeLoginEmail.
    expect(limiters.email.calls).toEqual([
      hashRateLimitKey("user@example.com", SECRET),
    ]);
    expect(limiters.ip.calls).toEqual([
      hashRateLimitKey("203.0.113.7", SECRET),
    ]);
    const allKeys = [...limiters.email.calls, ...limiters.ip.calls].join(" ");
    expect(allKeys).not.toContain("@");
    expect(allKeys).not.toContain("203.0.113.7");
  });

  it("passes when both dimensions are under the limit", async () => {
    const limiters = fakeLimiters(true, true);
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: "203.0.113.7" },
      limiters,
      getSecret,
    );
    expect(result).toEqual({ limited: false });
    expect(limiters.email.calls).toHaveLength(1);
    expect(limiters.ip.calls).toHaveLength(1);
  });

  it("checks email first and never touches the IP counter on a hit", async () => {
    const limiters = fakeLimiters(false, true);
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: "203.0.113.7" },
      limiters,
      getSecret,
    );
    expect(result).toEqual({ limited: true });
    // Sequential by design: otherwise a legitimate user burns their hourly
    // IP budget on requests the 15-minute email limit already rejects.
    expect(limiters.ip.calls).toHaveLength(0);
  });

  it("limits on the IP dimension when the email dimension passes", async () => {
    const limiters = fakeLimiters(true, false);
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: "203.0.113.7" },
      limiters,
      getSecret,
    );
    expect(result).toEqual({ limited: true });
  });

  it("skips the IP dimension when no IP could be resolved", async () => {
    const limiters = fakeLimiters(true, false);
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: null },
      limiters,
      getSecret,
    );
    expect(result).toEqual({ limited: false });
    expect(limiters.ip.calls).toHaveLength(0);
  });

  it("fails open and reports to Sentry when a limiter throws", async () => {
    const limiters: MagicLinkRateLimiters = {
      email: {
        limit: () => Promise.reject(new Error("upstash down")),
      },
      ip: fakeLimiter(true),
    };
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: "203.0.113.7" },
      limiters,
      getSecret,
    );
    expect(result).toEqual({ limited: false });
    // Our own outage, never foreign-triggerable: reporting is correct here.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("fails open when the secret is unavailable", async () => {
    const limiters = fakeLimiters(true, true);
    const result = await checkMagicLinkRateLimit(
      { email: "user@example.com", ip: null },
      limiters,
      () => {
        throw new Error("missing env");
      },
    );
    expect(result).toEqual({ limited: false });
    expect(limiters.email.calls).toHaveLength(0);
  });
});

describe("getMagicLinkRateLimiters", () => {
  // vi.resetModules gives each test a fresh module cache, so the
  // per-process memoization inside the module starts empty.
  it("returns null and warns exactly once when the env is missing", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const sentry = await import("@sentry/nextjs");
    const { getMagicLinkRateLimiters } = await import(
      "@/lib/security/ratelimit"
    );

    expect(getMagicLinkRateLimiters()).toBeNull();
    expect(getMagicLinkRateLimiters()).toBeNull();
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("fail-open"),
      "warning",
    );
  });

  it("constructs both limiters when the env is present", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
    const sentry = await import("@sentry/nextjs");
    const { getMagicLinkRateLimiters } = await import(
      "@/lib/security/ratelimit"
    );

    const limiters = getMagicLinkRateLimiters();
    expect(limiters).not.toBeNull();
    expect(typeof limiters?.email.limit).toBe("function");
    expect(typeof limiters?.ip.limit).toBe("function");
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
