// The resolve hook itself (see ts-resolve.mjs). Two rules, nothing more:
//   "@/x"  ->  <repo>/src/x        (the tsconfig path alias)
//   "./x"  ->  "./x.ts" or "./x/index.ts" if that file exists
// Anything else is handed straight to Node's default resolution, so bare
// package specifiers keep working exactly as before.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

function withTsExtension(url) {
  if (/\.[cm]?[jt]sx?$/.test(url.pathname)) return url.href;
  for (const candidate of [`${url.href}.ts`, `${url.href}/index.ts`]) {
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return url.href;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(withTsExtension(new URL(specifier.slice(2), SRC)), context);
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const base = context.parentURL
      ? new URL(specifier, context.parentURL)
      : null;
    if (base) return next(withTsExtension(base), context);
  }
  return next(specifier, context);
}
