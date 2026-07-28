// Lets `node` run our TypeScript modules directly. Node 24 strips types
// natively, but it does NOT do TypeScript's module resolution: an import of
// "./schema" stays "./schema" and an import of "@/db/schema" means nothing to
// it. This hook closes exactly those two gaps for one-off operator scripts —
// no bundler, no tsx, no new dependency, just node:module.
//
// Usage: node --import ./scripts/ts-resolve.mjs scripts/<script>.ts
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
