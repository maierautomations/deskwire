import { AuthError } from "next-auth";
import type { EmailConfig } from "next-auth/providers";
import Resend from "next-auth/providers/resend";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import * as Sentry from "@sentry/nextjs";

import {
  MagicLinkSendError,
  sendVerificationRequest,
} from "@/lib/email/send-verification-request";

// Hoisted by vitest above all imports.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const identifier = "user@example.com";
const url =
  "https://deskwire.vercel.app/api/auth/callback/resend?callbackUrl=%2F&token=abc123&email=user%40example.com";

function makeParams(
  overrides: Partial<EmailConfig> = {},
): Parameters<typeof sendVerificationRequest>[0] {
  // The Resend factory stores user options under `options`; Auth.js merges
  // them onto the provider at runtime. Replicate that merge here so the
  // provider looks exactly like what sendVerificationRequest receives.
  const provider: EmailConfig = {
    ...Resend({}),
    apiKey: "re_test_key",
    from: "Deskwire <onboarding@resend.dev>",
    ...overrides,
  };
  return {
    identifier,
    url,
    expires: new Date(Date.now() + 86_400_000),
    provider,
    token: "abc123",
    theme: {},
    request: new Request("https://deskwire.vercel.app/api/auth/signin/resend"),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("sendVerificationRequest", () => {
  it("sends the German HTML+text mail through Resend", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await sendVerificationRequest(makeParams());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
    });
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.from).toBe("Deskwire <onboarding@resend.dev>");
    expect(body.to).toBe(identifier);
    expect(body.subject).toBe("Dein Anmeldelink für Deskwire");
    expect(body.text).toContain(url);
    expect(body.html).toContain(url.replaceAll("&", "&amp;"));
  });

  it("throws a MagicLinkSendError surfacing as AccessDenied on rejection", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));

    const error: unknown = await sendVerificationRequest(makeParams()).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(MagicLinkSendError);
    expect(error).toBeInstanceOf(AuthError);
    // The client-safe type that survives the redirect to /anmelde-fehler.
    expect((error as MagicLinkSendError).type).toBe("AccessDenied");
  });

  it("does not report foreign-triggerable rejections (403) to Sentry", async () => {
    fetchMock.mockResolvedValue(new Response("sandbox", { status: 403 }));

    await expect(sendVerificationRequest(makeParams())).rejects.toThrow();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports our own failures (401) to Sentry and still throws", async () => {
    fetchMock.mockResolvedValue(new Response("bad key", { status: 401 }));

    await expect(
      sendVerificationRequest(makeParams()),
    ).rejects.toBeInstanceOf(MagicLinkSendError);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("wraps network errors into MagicLinkSendError and reports them", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      sendVerificationRequest(makeParams()),
    ).rejects.toBeInstanceOf(MagicLinkSendError);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("fails closed without apiKey: throws before any fetch", async () => {
    await expect(
      sendVerificationRequest(makeParams({ apiKey: undefined })),
    ).rejects.toBeInstanceOf(MagicLinkSendError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("logs the magic link instead of sending when unambiguously local", async () => {
    vi.stubEnv("AUTH_EMAIL_DEV_LOG", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("VERCEL_ENV", undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendVerificationRequest(makeParams());

    expect(fetchMock).not.toHaveBeenCalled();
    const logged = logSpy.mock.calls.flat().join("\n");
    expect(logged).toContain(url);
    expect(logged).toContain(identifier);
  });

  it("sends normally when the flag is set but a Vercel marker is present", async () => {
    vi.stubEnv("AUTH_EMAIL_DEV_LOG", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "1");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendVerificationRequest(makeParams());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("sends normally in production even with the flag set", async () => {
    vi.stubEnv("AUTH_EMAIL_DEV_LOG", "1");
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendVerificationRequest(makeParams());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
