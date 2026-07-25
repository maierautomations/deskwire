// Intentional route conflict with src/app/page.tsx ("two parallel pages
// resolve to /"). Fails only the Next build, so it proves the Vercel
// required check blocks merges that lint, typecheck, and tests miss.
export default function BrokenBuildProbePage() {
  return null;
}
