import { z } from "zod";

// Server-only environment variables. Parsing is lazy (first access), so
// importing this module never throws and typecheck, CI and builds run
// without any env values set.
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
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
