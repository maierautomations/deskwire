# CLAUDE.md

Betriebsanleitung für Claude Code in diesem Repo. Kurz halten, strikt befolgen.

## Projekt

Deskwire (Arbeitstitel): SaaS-Web-App, das KI-Interface für Redaktionen. Von Signal zu Idee zu Briefing zu Artikel zu Upload, mit Brand-Profilen, fail-closed QA und konfigurierbaren Upload-Zielen.

**Die inhaltliche Wahrheit steht in `docs/PRD.md`. Vor jedem neuen Feature das betreffende PRD-Kapitel lesen. Bei Unklarheit oder Widerspruch: fragen, nicht raten. Nichts bauen, was im PRD unter Nicht-Ziele steht.**

Aktuelle Phase: **Phase 0 (Foundation)**. Es wird nichts aus späteren Phasen vorgezogen.

## Stack (entschieden, nicht diskutieren)

- Next.js (App Router) auf Vercel, TypeScript strict
- Tailwind CSS plus shadcn/ui
- Postgres (Neon) plus Drizzle ORM (Migrations via drizzle-kit)
- Auth.js für Authentifizierung
- Inngest für Hintergrund-Jobs, Agent-Runs und Cron
- Stripe für Billing
- Anthropic API als primärer Modell-Provider, immer über den eigenen Provider-Layer (`src/lib/ai/`)
- Zod für alle Eingaben an Systemgrenzen
- Resend für Transaktionsmails (Magic-Link-Login, Einladungen)
- Sentry für Error-Tracking, ab Phase 0 verdrahtet
- PostHog für Produkt-Analytics, Events ab Phase 1
- Upstash Ratelimit für Rate Limiting öffentlicher und run-auslösender Endpoints
- Vitest (Unit), Playwright (E2E), npm als Paketmanager

Neue Dependencies nur nach Rückfrage mit Einzeiler-Begründung.

## Entschiedene Grundsatzfragen

- Auth: Magic Link via Resend zuerst, OAuth später.
- Recherche im MVP: Websuche des Modell-Providers, ausschließlich über den Provider-Layer. Die Quellenliste jedes Runs wird gespeichert. Eine eigene Fetch-Schicht mit Domain-Whitelist ist eine Phase-2-Option.
- UI-Sprache: Deutsch, i18n-fähig gebaut.
- Produktname: vertagt bis zum stehenden MVP, Arbeitstitel bleibt Deskwire.

## Repo-Struktur (Soll)

```
docs/PRD.md
src/app/            Routen (App Router), Route Handlers unter app/api
src/components/     UI-Komponenten (shadcn-basiert)
src/db/             schema.ts, Migrations, gescopte Query-Helper
src/lib/ai/         Provider-Abstraktion, Prompts, Pipeline-Schritte
src/lib/qa/         deterministische Checks, Platzhalter-Logik
src/lib/billing/    Credits, Gates, Stripe-Sync
src/inngest/        Functions (Runs, Jobs, Ingest, Deliveries)
src/lib/security/   Credential-Verschlüsselung, HMAC-Signaturen
tests/              Unit- und E2E-Tests
```

## Grundprinzipien (nicht verhandelbar)

1. **Das LLM urteilt, der Code entscheidet.** Statusübergänge, Gates, Zahlen, Limits, Platzhalter-Erkennung sind deterministischer Code. Das Modell liefert Sprache und Einschätzungen, nie Kontrollfluss-Entscheidungen.
2. **Fail-closed.** Fehlende oder unsichere Daten erzeugen kanonische Platzhalter (`[einsetzen: ...]`, `[zu klären: ...]`) oder den Status FEHLER. Niemals stillschweigend Ersatz generieren. Ein Artikel mit offenem Marker kann nicht BEREIT werden.
3. **Tenant-Isolation ist heilig.** Jede fachliche Tabelle trägt `workspace_id`. Datenzugriff ausschließlich über die gescopten Query-Helper aus `src/db/`, nie roh am Scope vorbei. Jedes neue fachliche Feature bekommt einen Isolationstest.
4. **Jeder Run ist nachvollziehbar.** Pipeline-Schritte persistieren Input-Referenz, Output, Dauer, Token und Kosten in `run_steps`. Keine LLM-Aufrufe außerhalb des Provider-Layers.
5. **Credentials nie im Klartext.** Quellen- und Ziel-Zugänge werden verschlüsselt gespeichert, nie an den Client geliefert, in Logs maskiert. Secrets nur über Env-Variablen, niemals im Code oder in Fixtures.
6. **Kosten werden gemessen.** Kein LLM-Aufruf ohne Token- und Kosten-Erfassung. Budget-Gates sind Code und laufen vor dem Aufruf.

## Konventionen

- TypeScript strict, kein `any`, kein `as unknown as`. Lieber Typ sauber herleiten.
- Zod-Validierung an jeder Grenze: Route Handler, Server Actions, Inngest-Event-Payloads, Webhook-Eingänge, LLM-Antworten (structured output parsen, nie blind vertrauen).
- Server-first: Datenzugriff in Server Components, Route Handlers und Inngest Functions. Client Components nur für Interaktivität.
- Fehlerbehandlung: erwartbare Fehler als typisierte Ergebnisse zurückgeben, unerwartete werfen und zentral loggen. Nutzer sehen immer eine verständliche deutsche Fehlermeldung mit Handlungsoption.
- Datenbank: Schemaänderungen nur über Drizzle-Migrations. Bestehende Migrationsdateien niemals editieren oder löschen. Vor destruktiven Migrationen stoppen und nachfragen.
- Prompts sind Code: Sie liegen als Dateien unter `src/lib/ai/prompts/`, Änderungen laufen durch Git. Jeder Run speichert die Referenz der verwendeten Prompts (Dateipfad plus Inhalts-Hash). Kein Inline-Prompt-Text in Pipeline-Code.
- UI-Arbeit liest zuerst docs/brand-book.md. Bei Konflikten gewinnt das Brand Book vor dem frontend-design-Skill, der Skill vor allgemeinen Vorlieben. Keine Farben, Schriften oder Motive außerhalb der Brand-Book-Tokens.
- Naming: Code, Identifier, Commits und Code-Kommentare auf Englisch. UI-Texte und Nutzer-Fehlermeldungen auf Deutsch.
- UI-Texte: echte deutsche Umlaute, keine Gedankenstriche (stattdessen Komma oder Punkt), Du-Ansprache, kurz und konkret.
- Kein Datei-übergreifendes Copy-Paste von Logik: Wiederverwendbares gehört nach `src/lib/`.
- Umgebung: Kein Homebrew, niemals. Tools werden ausschließlich über offizielle Installer, direkte Binary-Downloads (GitHub Releases), npm/npx oder Docker installiert. Schlage keine brew-Kommandos vor.

## Arbeitsweise

- **Plan vor Code:** Bei jedem neuen Feature zuerst einen kurzen Plan (betroffene Dateien, Schema-Änderungen, Testansatz) zeigen und Bestätigung abwarten. Bugfixes und Kleinigkeiten direkt.
- Kleine, in sich lauffähige Schritte. Nach jedem Schritt: `npm run lint && npm run typecheck && npm test` grün, sonst nicht weitermachen.
- Tests sind Pflicht für: QA-Gates und Platzhalter-Logik, Status-Übergänge, Billing und Credit-Gates, Tenant-Isolation, Webhook-Signaturen. Zusätzlich laufen die Golden-Briefings (feste Test-Briefings mit automatisierter Prüfung auf Pflichtelemente, Platzhalter-Syntax und verbotene Muster) als Regressionstest nach jeder Pipeline- oder Prompt-Änderung. UI-Feinschliff braucht keine Tests.
- Commits klein und beschreibend (Conventional Commits: feat, fix, chore, test, docs).

**Ohne Rückfrage niemals:**
- neue Dependencies einführen
- Auth-, Billing- oder Security-Code umbauen
- Migrationen löschen oder destruktive Migrationen ausführen
- Daten an neue externe Endpoints senden
- Feature-Umfang über das aktuelle PRD-Kapitel hinaus erweitern

## Definition of Done (pro Task)

1. Verhalten entspricht dem PRD-Kapitel und den Akzeptanzkriterien.
2. Lint, Typecheck und Tests grün, neue Kernlogik ist getestet.
3. Tenant-Scope geprüft (kein Query ohne workspace_id-Scope).
4. Fehlerfälle behandelt, keine stillen Ausfälle.
5. Keine Secrets, keine TODO-Platzhalter im gemergten Code.
6. Kurzer Eintrag unter "Stand" in dieser Datei aktualisiert.

## Kommandos (Soll, nach Setup anpassen)

```
npm run dev            # lokale Entwicklung
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest
npm run db:generate    # Drizzle-Migration aus Schema erzeugen
npm run db:migrate     # Migrationen anwenden
npm run db:studio      # Drizzle Studio
npm run inngest:dev    # Inngest Dev Server
```

## Stand

- 24.07.2026: Projektstart. PRD v1 liegt in docs/PRD.md. Nächster Schritt: Phase 0 Scaffold (Repo, CI, Auth, Workspaces, Tenancy-Tests, Stripe-Testmode).
- 25.07.2026: Task 1a fertig: Next.js-16-Scaffold (App Router, TS strict, Tailwind v4, ESLint 9 Flat Config), shadcn/ui (Preset radix-nova, Base Color neutral; button, input, card, label), Brand-Token-Fundament aus docs/brand-book.md Kap. 5 (Farb-Tokens, Typoskala, Radii in globals.css; Fonts Besley, Public Sans, IBM Plex Mono self-hosted via next/font; src/lib/brand.ts als Namens-Token). Node-Basis dokumentiert (.nvmrc 24, packageManager npm@11.16.0). Nächster Task: 1b (Vitest plus GitHub-Actions-CI).
- 25.07.2026: Task 1b fertig: Vitest 4 (environment node, tsconfig-Paths nativ via `resolve.tsconfigPaths`, keine Plugin-Dependency), tests/smoke.test.ts, Script `test` = `vitest run`, GitHub-Actions-CI (.github/workflows/ci.yml: Node aus .nvmrc, npm ci, lint/typecheck/test, null Secrets). npm-audit-Notiz: alle Findings liegen in der Toolchain (postcss/sharp gebundelt in Next 16, minimatch-Kette in eslint-config-next), zur Laufzeit nicht erreichbar; kein `audit fix --force` (würde Next auf 9.x downgraden). Vorgehen: bei jedem Task-Start auf Patch-Releases von next/eslint-config-next prüfen. Nächster Task: 2 (Vercel-Deployment).
- 25.07.2026: Task 2 fertig: Vercel-Projekt via GitHub-Import (Node 24.x, Turbopack), main deployt nach Production (deskwire.vercel.app), jede PR bekommt ein Preview-Deployment (durch Vercel-Login geschützt, gewollt). Health-Route `/api/health` (ok plus Commit-SHA, force-dynamic; DB-Ping folgt in Task 4), `.env.example`-Kopf mit Env-Konvention (Wahrheit pro Environment im Vercel-Dashboard, lokal `npx vercel env pull` nach `.env.local`), README-Abschnitt „Entwicklung". Branch Protection auf main: Required Checks `Vercel` plus `ci` (classic, ohne Admin-Enforcement, Direkt-Push auf main bleibt möglich). Beweis erbracht (Test-PR #1, unmerged geschlossen): Build-only-Fehler → CI grün, Vercel rot, `mergeable_state: blocked`. Befund: Turbopack 16.2.11 bricht bei „two parallel pages resolve to /" den Build NICHT mehr, der Konflikt wird still aufgelöst — Task-10b-Annahme anpassen (Root-Page-Löschung bleibt nötig, es warnt nur kein Build-Fehler mehr); zuverlässiger Build-Brecher für Check-Tests: Throw beim statischen Prerender. Nächster Task: 3 (Sentry).
- 25.07.2026: Task 3 fertig: Sentry manuell ohne Wizard (@sentry/nextjs 10.68): src/instrumentation.ts (register je NEXT_RUNTIME plus onRequestError), src/instrumentation-client.ts, sentry.server/edge.config.ts (nur Error-Tracking, kein Tracing/Replay/Logs, environment aus VERCEL_ENV), next.config.ts via withSentryConfig (org maier-ai, project deskwire, sentryUrl de.sentry.io, tunnelRoute /monitoring, widenClientFileUpload, Source Maps nach Upload gelöscht). Debug-Route /api/debug-sentry hinter DEBUG_SENTRY_ENABLED=1 (sonst 404, Gate unit-getestet). Build ohne SENTRY_AUTH_TOKEN grün, Upload wird nur übersprungen (CI-Fall). Beweis: Event DESKWIRE-1 von der Preview-URL, Stacktrace per Source Maps aufgelöst (src/app/api/debug-sentry/route.ts:11 mit Code-Kontext), Turbopack-Build. Befund: sentry-cli bevorzugt die im Auth-Token eingebettete API-URL vor sentryUrl (Build-WARN, harmlos, Upload läuft). DEBUG_SENTRY_ENABLED nach jedem Test wieder aus Vercel entfernen. Nächster Task: 4 (Neon + Drizzle).
- 25.07.2026: Task 4 fertig: Neon + Drizzle (drizzle-orm 0.45.2, drizzle-kit 0.31.10, @neondatabase/serverless 1.1.0, ws, zod, dotenv — exakt gepinnt): ein Treiber neon-serverless (Pool + ws) als lazy Singleton `getDb()` in src/db/index.ts; src/lib/env.ts (Zod, lazy geparst, unit-getestet — typecheck/CI/Build laufen nachweislich ohne Env); drizzle.config.ts lädt via dotenv `.env.local` vor `.env` und migriert ausschließlich über DATABASE_URL_UNPOOLED; Migration 0000 (workspaces + brand_profiles: workspace_id-FK on delete cascade + Index) auf Production angewendet; Health-Route mit select-1-Ping (DB-Fehler → 503 + Sentry-Event, keine Details im Response); Scripts db:generate/db:migrate/db:studio. Env-Verifikation via Vercel: Integration setzt exakt DATABASE_URL + DATABASE_URL_UNPOOLED (nur Production statisch; Preview branch-spezifisch beim Deployment injiziert), keine Zusatzvariablen (kein POSTGRES_URL/PGHOST). Beweis eigener Preview-DB-Branch (PR #3): Preview-Endpoint ep-soft-shape-agxlct2a ≠ Production ep-holy-hat-ag6daxih, Tabellen auf dem Preview-Branch via Fork vorhanden (dort nie migriert), Preview-/api/health db ok. Befunde: `vercel link` hängt ein redundantes `.env*` an .gitignore an (hebelt als letzte Regel `!.env.example` aus) — verworfen, bei CLI-Läufen drauf achten; NEON_BRANCH aus dem Neon-Onboarding ist in .env.example als unbenutzt dokumentiert. Nächster Task: 5 (PGlite-Test-Harness).
