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
  // OPTIONAL on purpose until the task-15b merge: serverEnv() is
  // all-or-nothing and parsed by health and auth on every request, but
  // Vercel Production receives the Stripe key only right before the 15b
  // deploy. A required field would break Production at the task-14 merge.
  // getStripe() fails closed with a clear error while the key is missing.
  // 15b flips this to required, together with STRIPE_WEBHOOK_SECRET. An
  // empty string is a config error and fails loudly (min(1)), absent is
  // the only valid "not yet" state.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  // Same optional-until-15b pattern and reasoning as STRIPE_SECRET_KEY:
  // the secret arrives in Vercel only right before the 15b deploy. While it
  // is missing, the webhook route fails closed (500 before any
  // constructEvent call, src/lib/billing/webhook.ts); unverified processing
  // is never a fallback. The 15b merge flips both Stripe fields to
  // required. Empty string is a config error and fails loudly (min(1)).
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
