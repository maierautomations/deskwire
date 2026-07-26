import { z } from "zod";

// Where a fresh login lands when no explicit target survived validation.
// /start is the permanent post-login entry point (PRD decision log no. 7);
// task 10b fills it with the workspace list.
export const AFTER_LOGIN_DEFAULT = "/start";

export const LOGIN_EMAIL_INVALID_MESSAGE =
  "Bitte gib eine gültige E-Mail-Adresse ein.";

// The single email normalization, shared between the login form schema and
// the rate-limit key hashing (task 9). Direct POSTs to the auth endpoint
// bypass parseLoginEmail, so the hash input must run through the exact same
// normalization here instead of a second implementation.
export function normalizeLoginEmail(value: string): string {
  return value.trim().toLowerCase();
}

const loginEmailSchema = z
  .string()
  .transform(normalizeLoginEmail)
  .pipe(z.string().max(254))
  .pipe(z.email());

export type LoginEmailResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

// Boundary validation for the login form (CLAUDE.md: Zod at every boundary).
// Expected failures come back as a typed result with the German message.
export function parseLoginEmail(value: unknown): LoginEmailResult {
  const parsed = loginEmailSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: LOGIN_EMAIL_INVALID_MESSAGE };
  }
  return { ok: true, email: parsed.data };
}

// Open-redirect guard for callbackUrl values arriving via query param or
// form field. Only same-origin relative paths survive; absolute URLs,
// protocol-relative //host, backslash or whitespace tricks and the /api and
// /login trees are rejected so callers fall back to AFTER_LOGIN_DEFAULT.
const BLOCKED_PREFIXES = ["/api", "/login"];

export function sanitizeCallbackPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (/[\s\\]/.test(value)) {
    return null;
  }
  const queryStart = value.search(/[?#]/);
  const pathname = queryStart === -1 ? value : value.slice(0, queryStart);
  for (const prefix of BLOCKED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return null;
    }
  }
  return value;
}
