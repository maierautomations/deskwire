import { z } from "zod";

// Server-only environment variables. Parsing is lazy (first access), so
// importing this module never throws and typecheck, CI and builds run
// without any env values set.
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Auth.js core (task 7a). AUTH_URL is deliberately absent: URLs derive
  // from the request host (trustHost), which keeps magic links correct on
  // every preview deployment.
  AUTH_SECRET: z.string().min(1),
  AUTH_RESEND_KEY: z.string().min(1),
  // Plain address or "Name <address>" display form, so no z.email() here.
  EMAIL_FROM: z.string().min(1),
  // OPTIONAL by design, permanently (PRD decision log no. 11): both Stripe
  // secrets live only in the Vercel Production scope, Preview deliberately
  // has none (no preview webhooks in phase 0). serverEnv() is
  // all-or-nothing and parsed by health and auth on every request, so a
  // required field would break every preview deployment at env validation
  // (health 503, login dead). Fail-closed lives in getStripe(), which
  // throws with a clear error while the key is missing. An empty string is
  // a config error and fails loudly (min(1)), absent is the only valid
  // "not set" state.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  // Same optional-by-design pattern and reasoning as STRIPE_SECRET_KEY
  // (PRD decision log no. 11). While the secret is missing, the webhook
  // route fails closed (500 before any constructEvent call,
  // src/lib/billing/webhook.ts); unverified processing is never a
  // fallback. Empty string is a config error and fails loudly (min(1)).
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) {
    return cached;
  }
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Missing or invalid server environment variables: ${details}`);
  }
  cached = parsed.data;
  return cached;
}
