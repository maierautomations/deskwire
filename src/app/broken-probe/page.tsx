// Intentional build breaker: this page is statically prerendered, and
// prerendering executes the component, so the throw fails only the Next
// build while lint, typecheck, and tests stay green. Never to be merged.
export default function BrokenBuildProbePage() {
  throw new Error("intentional build-time failure (required-check probe)");
}
