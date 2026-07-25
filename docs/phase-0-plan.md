# Phase-0-Plan (Foundation) — Deskwire

## a) Zielbild von Phase 0 (drei Sätze, aus dem PRD abgeleitet)

Phase 0 liefert ein leeres, aber produktionsfähiges Fundament: Repo mit CI (Lint, Typecheck, Tests), Deployment-Pipeline auf Vercel und Error-Tracking via Sentry ab Tag eins. Fachlich stehen Login per Magic Link, Workspace-Erstellung mit Einladungslink und das Multi-Tenancy-Fundament, bei dem jede fachliche Tabelle workspace-gescoped und die Isolation systematisch getestet ist. Dazu kommen das Stripe-Grundgerüst (Subscription-Status am Workspace, Feature-Gates als Code, nur Webhook-Sync) und das Usage-Metering-Fundament (runs-Tabelle mit Token- und Kostenfeldern plus credit_ledger), sodass das Demo-Kriterium erfüllbar ist: zwei getrennte Workspaces, Login, ein Testeintrag pro Workspace, nachweislich keine Datenüberschneidung, ein Testabo im Stripe-Testmode.

## b) Task-Liste in Umsetzungsreihenfolge

Größen: S ≈ 30 min, M ≈ 45 min, L ≈ 60 min (Obergrenze). Tasks mit a/b sind ein logischer Task in zwei einzeln lauffähigen Sessions.

**Leitplanken für alle Tasks:**
- Jeder Task endet mit `npm run lint && npm run typecheck && npm test` grün UND einem Eintrag unter „Stand" in CLAUDE.md (CLAUDE.md-DoD Nr. 6).
- CI braucht null Secrets: alle DB-Tests laufen offline gegen PGlite mit den echten Migrationsdateien; Ratelimiter, Mailversand und Stripe sind per Interface injizierbar bzw. offline prüfbar.
- `.env.example` wird in jedem Task gepflegt, der eine Variable einführt.
- Tasks mit externen Diensten haben einen Block „Vorbedingungen": Dashboard-Schritte und Env-Variablen, die VOR dem Merge in Vercel gesetzt sein müssen.
- Code-Kommentare und Identifier auf Englisch, alle UI-Texte deutsch (Du-Ansprache, echte Umlaute, keine Gedankenstriche).
- UI-Arbeit folgt docs/brand-book.md (Kapitel 5 bis 7 inklusive der Pflicht-Checks aus Kapitel 7), UI-Texte dem Tone of Voice aus Kapitel 4.3.

### Task 1a: Projekt-Scaffold und Toolchain (M)

- **Ziel:** Lauffähiges Next.js-16-Projekt (App Router, TypeScript strict, Tailwind v4, shadcn/ui, ESLint 9 Flat Config) im bestehenden Repo.
- **Vorgehen:** `npx create-next-app@latest` in ein Temp-Verzeichnis scaffolden und die generierten Dateien ins Repo mergen (CLAUDE.md, README.md, docs/, .env, .mcp.json, .neon bleiben unangetastet), da create-next-app das nicht-leere Verzeichnis ablehnt. Optionen: TypeScript, ESLint, Tailwind, `src/`-Verzeichnis, App Router, Alias `@/*`. Danach `npx shadcn@latest init` (gewähltes Preset in der Commit-Message dokumentieren) plus `add button input card label`.
- **Brand-Tokens statt Tailwind-Default-Theme:** Direkt in diesem Task werden die Fonts (Besley, Public Sans, IBM Plex Mono via next/font, self-hosted) und die CSS-Variablen aus docs/brand-book.md Kapitel 5.2 als Token-Fundament in `globals.css` plus Tailwind-Mapping angelegt; die shadcn-Basisfarben werden auf diese Tokens gemappt.
- **Dateien:** `package.json` (Scripts: `dev`, `build`, `lint` = `eslint .` [Next 16 hat kein `next lint` mehr], `typecheck` = `tsc --noEmit`; `packageManager`-Pin npm@11.x), `tsconfig.json` (strict verifizieren), `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `components.json`, `src/components/ui/*`, `.env.example` (leer angelegt).
- **Env:** keine.
- **Testansatz:** manuell: `npm run dev` rendert Startseite mit shadcn-Button; `npm run lint && npm run typecheck` grün.
- **DoD:** Startseite rendert mit shadcn-Komponente; lint und typecheck lokal grün; `.env` weiterhin nicht im Git.

### Task 1b: Vitest und GitHub-Actions-CI (M)

- **Ziel:** Testinfrastruktur plus grüne CI (lint, typecheck, test) auf dem bestehenden Remote maierautomations/deskwire.
- **Dateien:** Dev-Deps `vitest` 4.x + `vite-tsconfig-paths` (environment `node`, kein jsdom); `vitest.config.mts`; `tests/smoke.test.ts` (Pflicht: `vitest run` schlägt ohne Testdateien fehl); `package.json` (+`test` = `vitest run`); `.github/workflows/ci.yml` (checkout@v5, setup-node mit Node 24 + `cache: npm`, `npm ci`, dann lint/typecheck/test).
- **Env:** keine — CI läuft komplett ohne Secrets.
- **Testansatz:** Smoke-Test lokal; Push auf main → CI-Run grün.
- **DoD:** CI auf main nachweislich grün; keine Secrets in CI.

### Task 2: Vercel-Deployment, Produktion + Preview, Env-Konventionen (M)

- **Ziel:** main deployt nach Produktion, jede PR bekommt automatisch ein Preview; Env-Workflow steht fest, bevor die erste echte Variable existiert.
- **Dateien:** `src/app/api/health/route.ts` (liefert `{ ok: true, sha: VERCEL_GIT_COMMIT_SHA }`, wird in Task 4 um DB-Ping erweitert), `.env.example` (Kommentar-Kopf: Werte pro Environment im Vercel-Dashboard, lokal via `vercel env pull` → `.env.local`), README-Abschnitt „Entwicklung".
- **Setup:** Projekt via GitHub-Import (Next.js autodetektiert, npm via package-lock.json), Node 24 verifizieren; Branch Protection auf main mit CI **und dem Vercel-Preview-Deployment als Required Checks** — CI baut bewusst nicht, erst der Vercel-Check fängt Next-Build-Fehler vor dem Merge ab.
- **Env:** noch keine Secrets, nur der Mechanismus.
- **Testansatz:** manuell: Production-URL erreichbar, Test-PR erzeugt Preview-URL, `/api/health` auf beiden prüfen; absichtlich kaputter Build in einem Test-PR wird vom Required Check geblockt.
- **DoD:** Production- und Preview-Deployment nachweislich funktionierend, roter Vercel-Build blockt den Merge, Env-Workflow dokumentiert.

### Task 3: Sentry-Verdrahtung (M)

- **Ziel:** Fehler aus Server, Client und Edge landen ab jetzt in Sentry, mit Source Maps auf Vercel — bewusst vor DB/Auth platziert, damit jeder Folgetask ab dem ersten Deploy Fehler-Sichtbarkeit hat (CLAUDE.md: Sentry ab Phase 0).
- **Vorbedingungen:** Sentry-Org und -Projekt anlegen, DSN erzeugen, Auth-Token mit Release-Scope erstellen; `NEXT_PUBLIC_SENTRY_DSN` (alle Environments) und `SENTRY_AUTH_TOKEN` (nur Vercel-Build) VOR dem Merge in Vercel setzen.
- **Dateien:** `@sentry/nextjs` v10 (mind. 10.13) manuell ohne Wizard: `instrumentation.ts` (`register()` je `NEXT_RUNTIME` + `export const onRequestError = Sentry.captureRequestError`), `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `next.config.ts` (`withSentryConfig` mit org/project statisch, `tunnelRoute`); Testfehler-Route `/api/debug-sentry` hinter Env-Flag `DEBUG_SENTRY_ENABLED` (per Env aktivierbar, auch temporär auf Preview/Production).
- **Env:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (nicht lokal, nicht in CI — CI baut nicht), `DEBUG_SENTRY_ENABLED` (nur wo gebraucht).
- **Testansatz:** manuell: Testfehler auf Preview auslösen → Event in Sentry; CI bleibt grün (Build ohne AUTH_TOKEN darf nicht brechen).
- **DoD:** Ein Sentry-Event mit per Source Maps aufgelöstem Stacktrace ist von der Preview-URL aus sichtbar (Build-Weg Turbopack oder Webpack ist Implementierungsdetail des Commits); Vercel-Build grün.

### Task 4: DB-Fundament: Neon + Drizzle + Migration 0000 (M)

- **Ziel:** Drizzle an das bestehende Neon-Projekt angebunden, erste Migration (workspaces + brand_profiles) angewendet, Preview-Deployments haben eine eigene DB.
- **Vorbedingungen:** Neon-Vercel-Integration (Native Integration) mit Preview-Branching installieren — setzt `DATABASE_URL`/`DATABASE_URL_UNPOOLED` automatisch pro Environment und forkt Preview-Branches von Production (Migrationen sind dort schon angewendet). Production-Werte verifizieren.
- **Dateien:** Deps `drizzle-orm` 0.45.x, `drizzle-kit` 0.31.x, `@neondatabase/serverless` 1.x, `ws`, Dev-Dep `dotenv` (drizzle-kit lädt selbst KEINE Env-Dateien; `vercel env pull` schreibt nach `.env.local`) — alle exakt pinnen, keine v1-RCs. `drizzle.config.ts` (`dotenv.config({ path: ['.env.local', '.env'] })`; `dialect: "postgresql"`, `schema: "./src/db/schema.ts"`, `out: "./src/db/migrations"` [CLAUDE.md-Soll-Struktur: Migrations unter src/db/], `dbCredentials.url = DATABASE_URL_UNPOOLED`); `src/db/schema.ts` (`workspaces`: id uuid pk default `gen_random_uuid()`, name, created_at, updated_at; `brand_profiles`: id, workspace_id FK not null + Index, name, description, timestamps — bewusst nur diese Felder, Stub-Entität); `src/db/index.ts` (EIN Treiber: `drizzle-orm/neon-serverless` mit Pool + ws als lazy Singleton — liefert `db.transaction` mit PGlite-Paritäts-API); `src/lib/env.ts` (Zod-validierte Server-Env, lazy geparst beim ersten Zugriff, damit typecheck/CI/Build ohne Werte laufen); Scripts `db:generate`, `db:migrate`, `db:studio`; `src/db/migrations/0000_*.sql`; Health-Route um `select 1` erweitern.
- **Env:** `DATABASE_URL` (pooled, App), `DATABASE_URL_UNPOOLED` (nur Migrationen) — lokal vorhanden, in Vercel via Neon-Integration.
- **Testansatz:** `npm run db:generate` + `npm run db:migrate` gegen Neon; Tabellen in Neon-Console/Drizzle Studio sichtbar; `/api/health` meldet DB ok auf Production UND einem Preview; typecheck läuft ohne gesetzte Env.
- **DoD:** Migration committed und in Neon angewendet, Preview-Health grün, keine rohen SQL-Strings im App-Code.

### Task 5: PGlite-Test-Harness (M)

- **Ziel:** Alle DB-Tests laufen in-memory gegen die echten Migrationsdateien aus `./src/db/migrations` — offline, deterministisch, ohne Secrets, auch in CI.
- **Dateien:** Dev-Dep `@electric-sql/pglite` (genehmigt); `tests/helpers/db.ts` (`createTestDb()`: `new PGlite()` + `drizzle-orm/pglite` + `migrate({ migrationsFolder: "./src/db/migrations" })` aus `drizzle-orm/pglite/migrator` — kein `pushSchema`, damit die Migrationen selbst mitgetestet werden); `tests/db/schema.test.ts` (Insert/Select-Roundtrip auf workspaces + brand_profiles als Harness-Beweis).
- **Muster:** Pro Testdatei eigene PGlite-Instanz (Single-Connection-Limitierung), Handle-Typ kompatibel zum App-DB-Typ für Dependency Injection in Task 6.
- **Env:** keine — das ist der Punkt.
- **Testansatz:** der Harness-Test selbst; CI-Run ohne `DATABASE_URL` grün.
- **DoD:** `npm test` lokal und in CI grün, nachweislich ohne Netzwerk; `gen_random_uuid()` funktioniert in PGlite.

### Task 6: Gescopte Query-Helper als verbindliches Muster (M)

- **Ziel:** Das Zugriffs-Muster für alle künftigen fachlichen Tabellen (CLAUDE.md Grundprinzip 3), demonstriert an brand_profiles — technisch erzwungen, nicht nur dokumentiert.
- **Dateien:** `src/db/scoped.ts`: Factory `scopedDb(db, workspaceId)` mit Methoden je Entität (`brandProfiles.list/create/getById`), jede Query hart mit `eq(workspace_id)`, `getById` mit `and(eq(id), eq(workspaceId))`; typisiert gegen generisches `PgDatabase<..., typeof schema>`, damit Neon- und PGlite-Instanz dieselben Helper nutzen (kein `any`). Zusätzlich exportiert `src/db` eine gebundene Variante `getScopedDb(workspaceId)` (bindet intern den App-Client) — sonst müssten Aufrufer den rohen Client importieren, den die Lint-Regel verbietet. Architektur-Festlegung von Anfang an: tenancy-etablierende, bewusst unscoped Zugriffe leben ausschließlich als gekapselte Helper in `src/db/**` (`src/db/workspaces.ts`, später `memberships.ts`, `invites.ts` in Task 10/11) — nie roh im App-Code. ESLint `no-restricted-imports`: der rohe Client aus `@/db` ist außerhalb von `src/db/**` und dem Auth-Adapter (Task 7a) verboten; `tests/**` ist ausgenommen. Englischer Kommentar-Header in `scoped.ts` („All domain data access MUST go through these scoped helpers").
- **Env:** keine.
- **Testansatz (PGlite):** `tests/db/brand-profiles.test.ts`: zwei Workspaces, je ein Profil — `list(A)` enthält nur A; `getById(Profil A, scopedDb B)` → null; `create` ohne Scope per API-Design unmöglich; Negativprobe der Lint-Regel manuell.
- **DoD:** Tests grün, Lint schlägt bei Roh-Import außerhalb `src/db/**` an, README/CLAUDE.md-Abschnitt verweist auf `scoped.ts` als verbindliches Muster.

### Task 7a: Auth.js-Kern: Adapter, Schema, Magic Link (M)

- **Ziel:** Magic-Link-Login funktioniert Ende-zu-Ende gegen Neon (Entscheidungs-Log Nr. 2: Magic Link zuerst, kein OAuth), Sessions in der DB, Mail von Anfang an deutsch (minimal, Text-only).
- **Vorbedingungen:** Resend-Account + API-Key; `AUTH_SECRET` pro Environment generieren und in Vercel Production UND Preview setzen, BEVOR gemergt wird (sonst antworten die Auth-Routen mit 500); `AUTH_RESEND_KEY`, `EMAIL_FROM` setzen.
- **Dateien:** Deps `next-auth@5.0.0-beta.32` (exakt pinnen) + `@auth/drizzle-adapter`; `src/db/schema.ts` (+`users`, `accounts`, `sessions`, `verification_tokens` nach Adapter-Minimalsatz) → Migration 0001; `src/auth.ts` (DrizzleAdapter mit explizit übergebenen Tabellen, Resend-Provider, Session-Strategie `database` — serverseitig widerrufbar); `src/app/api/auth/[...nextauth]/route.ts`; minimale eigene `sendVerificationRequest` mit deutschem Text-Template via `POST api.resend.com/emails`, wirft bei `!res.ok` (fail-closed, sichtbarer Fehler + Sentry-Event).
- **Env:** `AUTH_SECRET`, `AUTH_RESEND_KEY`, `EMAIL_FROM` (Sandbox: `onboarding@resend.dev`, bis eine Domain verifiziert ist).
- **Testansatz:** PGlite: Auth-Migration läuft, Adapter-Tabellen vorhanden. Manuell: Mail an die Resend-Signup-Adresse, Session-Row in `sessions`.
- **DoD:** Login-Zyklus gegen Neon funktioniert (manuell via Auth-Endpoint), Mailversand-Fehler ist kein stiller Ausfall.

### Task 7b: Mail-Template, Fehlerpfade, Dev-Log-Login (M)

- **Ziel:** Produktionsreifer Mailversand (deutsches HTML+Text-Template) plus Testbarkeit für Zweit-User trotz Resend-Sandbox.
- **Dateien:** `src/lib/email/send-verification-request.ts` (HTML+Text, deutscher Betreff, Du-Ansprache); **Dev-Modus:** bei `AUTH_EMAIL_DEV_LOG=1` und `NODE_ENV=development` wird der Magic-Link nur ins Server-Log geschrieben — umgeht die Resend-Sandbox für Zweit-User-Tests; Unit-Tests.
- **Env:** optional `AUTH_EMAIL_DEV_LOG` (nie in Vercel).
- **Testansatz:** Unit: `sendVerificationRequest` mit gemocktem `fetch` (From, To, deutscher Betreff, Link enthalten; Fehlerpfad wirft; Dev-Log-Modus sendet nicht).
- **DoD:** Tests grün; Zweit-User-Login lokal via Dev-Log nachweislich möglich; Signout löscht die Session-Row.

### Task 8: Login-UI und Routen-Schutz (M)

- **Ziel:** Deutsche Login-Seite, geschützter App-Bereich, korrektes Redirect-Verhalten.
- **Dateien:** `src/app/(auth)/login/page.tsx` (E-Mail-Formular, Server Action mit Zod + `signIn("resend")`, Erfolgs-/Fehlerzustand deutsch); `src/app/(app)/layout.tsx` (serverseitig `auth()` → redirect `/login` mit callbackUrl); Logout-Button; `src/proxy.ts` (Next 16: proxy.ts, nicht middleware.ts — nur optimistischer Cookie-Check als Komfort, echte Autorisierung liegt serverseitig in Layouts/Actions).
- **Env:** keine neuen.
- **Testansatz:** manuell: geschützte Route ohne Session → `/login`, nach Login Redirect zurück aufs Ziel; Unit nur für extrahierte Validierungs-Helper. Achtung Next 16: `params`/`searchParams` sind async.
- **DoD:** Voller Login/Logout-Zyklus auf Preview und Production; alle UI-Texte deutsch.

### Task 9: Upstash Ratelimit auf dem Magic-Link-Versand (S)

- **Ziel:** Der einzige öffentliche, mail-auslösende Endpoint ist gegen Missbrauch geschützt — auf dem Pfad, durch den JEDER Weg zur Mail führt.
- **Vorbedingungen:** Upstash-Redis-DB anlegen (eine Free-DB reicht), `UPSTASH_REDIS_REST_URL`/`_TOKEN` in Vercel (Production + Preview) und lokal setzen, bevor gemergt wird.
- **Dateien:** `src/lib/security/ratelimit.ts`: zwei Limits — pro normalisierter E-Mail `slidingWindow(3, "15 m")` UND pro IP `slidingWindow(10, "1 h")` (sonst rotiert ein Angreifer Adressen und verbrennt die Resend-Quota); Prefix environment-getrennt `deskwire:${VERCEL_ENV ?? "dev"}:magic-link` (sonst teilen sich Production, Preview und lokal denselben Zählerraum); Limiter **lazy in try/catch konstruiert** — `Redis.fromEnv()` wirft synchron bei fehlender Env, das darf den Login nie töten: fehlende/kaputte Env = Limiter deaktiviert + Sentry-Warnung (fail-open, Defense-in-depth, kein Daten-Gate); hinter kleinem Limiter-Interface für Tests. Guard sitzt in `sendVerificationRequest` (deckt Formular UND direkte POSTs ab); bei Limit typisierter Fehler → deutsche Meldung („Zu viele Anmeldeversuche. Bitte warte ein paar Minuten.").
- **Env:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- **Testansatz:** Unit mit injiziertem Fake-Limiter (Limit erreicht → Fehler, kein fetch; Limiter-Exception → Versand läuft trotzdem; fehlende Env → Versand läuft trotzdem); manuell: 4. Anforderung in 15 Minuten → deutsche Meldung, keine Mail.
- **DoD:** Limit greift nachweislich, Ausfall oder Fehlen des Limiters blockiert den Login nicht, Tests grün.

### Task 10a: Workspaces und Memberships: Schema, Actions, Zugriffsprüfung (M)

- **Ziel:** Mandanten-Kern (PRD Kap. 5: Workspace = Mandant, harte Datentrennung) als getestete Logik.
- **Dateien:** `src/db/schema.ts` (+`memberships`: user_id, workspace_id, `role` enum `'owner' | 'member'`, unique(user_id, workspace_id)) → Migration 0002; `src/db/workspaces.ts` (gekapselter unscoped Helper `createWorkspaceWithOwner`: Workspace + Owner-Membership in einer `db.transaction`); `src/db/memberships.ts` (`listWorkspacesForUser`, `findMembership` — tenancy-etablierend, bewusst unscoped, nur hier erlaubt); `src/lib/workspace.ts` (`requireWorkspaceMembership(userId, workspaceId)` auf Basis der db-Helper — Nicht-Mitglied → null); Server Action mit Zod.
- **Env:** keine neuen.
- **Testansatz (PGlite):** `createWorkspaceWithOwner` legt beide Rows atomar an; `requireWorkspaceMembership`: Mitglied ok, Nicht-Mitglied null; Nutzer mit zwei Memberships bekommt beide gelistet.
- **DoD:** Logik vollständig getestet, Lint-Regel aus Task 6 bleibt grün (keine Roh-Imports außerhalb `src/db/**`).

### Task 10b: Onboarding, Workspace-Liste, Workspace-Routing (M)

- **Ziel:** Alle App-Routen unter `/w/[workspaceId]`, Zugriff nur mit Membership; neuer Nutzer kommt vom Login bis in seinen eigenen Workspace.
- **Dateien:** Scaffold-Root-Page `src/app/page.tsx` **löschen** und durch Redirect ersetzen (sonst Routen-Konflikt mit `(app)/page.tsx`: „two parallel pages resolve to /" — bricht erst den Vercel-Build, CI baut nicht); `src/app/(app)/page.tsx` (Liste der eigenen Workspaces als minimaler Umschalter; bei leerer Membership-Liste Redirect nach `/onboarding`); `src/app/(app)/onboarding/page.tsx` (nur Name; bei vorhandener Membership Redirect zurück zur Liste); `src/app/(app)/w/[workspaceId]/layout.tsx` mit `requireWorkspaceMembership` — Nicht-Mitglied → `notFound()` (404 statt 403, keine Existenz-Leaks). Kein Cookie als Workspace-Quelle: die URL plus serverseitige Membership-Prüfung ist die einzige Wahrheit.
- **Env:** keine neuen.
- **Testansatz:** manuell auf Preview: Login → Onboarding → Workspace → Liste; fremde workspaceId in der URL → 404; Unit für extrahierte Redirect-Logik, sofern sinnvoll.
- **DoD:** Ein neuer Nutzer kommt vom Login bis in seinen eigenen Workspace; fremde workspaceId → 404 (durch Task-10a-Test abgesichert); kein Routen-Konflikt im Vercel-Build.

### Task 11: Einladungslink (M)

- **Ziel:** Einladungen per Link (PRD Phase-0-Bullet und 7.1: Eingeladene landen im richtigen Workspace) — ohne Mailversand an Fremdadressen (Resend-Sandbox).
- **Dateien:** `src/db/schema.ts` (+`workspace_invites`: workspace_id, token unique, expires_at, created_by) → Migration 0003; genau ein regenerierbarer Mehrfach-Link pro Workspace, 7 Tage gültig, nicht an eine E-Mail gebunden; erzeugen/erneuern in `src/app/(app)/w/[workspaceId]/settings/page.tsx` (deutsch, „Link kopieren") über `scopedDb`; Einlösung in `src/app/invite/[token]/page.tsx`: ohne Session → Login mit callbackUrl zurück zum Invite; mit Session → validieren → Membership `'member'` anlegen (idempotent) → redirect nach `/w/[workspaceId]`; ungültig/abgelaufen → deutsche Fehlerseite mit Handlungsoption. **Wichtig:** Die Einlösung kann prinzipiell NICHT über `scopedDb` laufen (Nutzer ist noch kein Mitglied, workspace_id bis zum Token-Lookup unbekannt) — dafür gekapselte unscoped Helper `src/db/invites.ts` (`findValidByToken`) und `memberships.createFromInvite(...)`, nie roh im Page-Code.
- **Env:** keine neuen.
- **Testansatz (PGlite):** gültiger Token erzeugt Membership im richtigen Workspace; abgelaufen/unbekannt → typisierter Fehler; bereits Mitglied → idempotent; Token von Workspace A gibt nie Zugriff auf B. Manuell: Zweit-User via Dev-Log-Login (Task 7b).
- **DoD:** Zweiter Account landet über den Link nachweislich als member im richtigen Workspace.

### Task 12: Tenancy-Isolationstest-Suite + Schema-Meta-Test (M)

- **Ziel:** Der systematische Isolationsnachweis (PRD: „Isolation getestet"; CLAUDE.md: „Jedes neue fachliche Feature bekommt einen Isolationstest") als wiederverwendbares Muster.
- **Dateien:** `tests/helpers/tenancy.ts` (`seedTwoTenants(db)`: zwei User, zwei Workspaces, je Basisdaten); `tests/tenancy/isolation.test.ts`: iteriert über eine **deklarative Entitätsliste** — pro gescopter Entität (brand_profiles, workspace_invites; memberships-Sicht) das gleiche Muster: eigene Daten sichtbar, Fremd-Liste leer, Fremd-ID not-found, Schreiben in fremden Workspace unmöglich. Dazu ein **Schema-Meta-Test**: deklarierte Liste fachlicher Tabellen wird gegen die Drizzle-Schema-Metadaten geprüft — jede muss `workspace_id` tragen (Allowlist für Infrastruktur: users, accounts, sessions, verification_tokens, workspaces, stripe_events). Wer künftig eine fachliche Tabelle ohne Scope anlegt oder vergisst zu listen, bekommt einen roten Test.
- **Env:** keine.
- **Testansatz:** ist der Task.
- **DoD:** Suite grün in CI; `isolation.test.ts` iteriert über die deklarative Entitätsliste — eine neue Entität ist ein Listeneintrag plus eine Factory-Funktion (Task 16 nutzt das sofort).

### Task 13: brand_profiles-Stub-UI: Anlegen + Liste (S)

- **Ziel:** Der sichtbare „Testeintrag" des Demo-Kriteriums: pro Workspace Brand-Profile anlegen und listen.
- **Dateien:** `src/app/(app)/w/[workspaceId]/brand-profiles/page.tsx` (Server Component, Liste über `getScopedDb`: Name, Beschreibung, Datum) + Formular (Name Pflicht, Beschreibung optional) als Server Action mit Zod in `actions.ts`; shadcn Card/Input/Button; deutsche Texte und Fehlermeldungen.
- **Env:** keine.
- **Testansatz (PGlite):** Action-Kernlogik als Funktion extrahiert: Anlegen landet im richtigen Workspace; leerer Name → typisiertes Ergebnis mit deutscher Meldung. Isolation ist durch Task 12 abgedeckt.
- **DoD:** Zwei Workspaces zeigen nachweislich disjunkte Listen; Negativliste eingehalten: kein Edit, kein Delete, keine Versionierung, keine Detailseite (alles Phase 1).

### Task 14: Stripe: Schema, Sync-Logik, Feature-Gates als Code (M)

- **Ziel:** Subscription-Status am Workspace, Gates als Code (PRD-Bullet) — reine Logik, vollständig offline testbar, noch ohne Transportweg. Scope strikt: NUR Webhook-Sync, keine Checkout-UI.
- **Dateien:** Dep `stripe` v22.x (pinnt API-Version **Dahlia** — die relevante Änderung stammt aus Basil und gilt weiter; kein `apiVersion`-Override; v22-Breaking-Change: `Stripe` ist echte ES6-Klasse, `new Stripe(...)` im lazy Singleton); `src/db/schema.ts` (+workspaces: `stripe_customer_id` unique, `stripe_subscription_id`, `subscription_status`, `stripe_product_id`, `current_period_end`; +`stripe_events`: event_id text pk, type, processed_at für Idempotenz) → Migration 0004; `src/lib/billing/stripe.ts` (lazy Client-Singleton); `src/lib/billing/sync.ts` (reine, db-injizierbare Funktion Event → Workspace-Update für `customer.subscription.created|updated|deleted`; Lookup über `stripe_customer_id`; **Basil-Falle: `current_period_end` liegt auf `subscription.items.data[0]`**, nicht auf der Subscription; **Zod-Schema für die tatsächlich gelesenen Subscription-Felder** — CLAUDE.md: Zod an jeder Grenze, `constructEvent` prüft nur die Signatur, nicht die Struktur; Parse-Fehler → Sentry-Event + 200 mit Skip [dokumentiert], eigener Testfall; unbekannter Customer → Sentry-Warnung, kein Throw); `src/lib/billing/gates.ts` (`hasActiveSubscription(workspace)` = status `active` oder `trialing` als einziges Phase-0-Gate).
- **Env:** `STRIPE_SECRET_KEY` (Testmode) — lokal; in Vercel Production VOR dem Task-15b-Deploy.
- **Testansatz (PGlite, ohne Netz):** Subscription-Event-Fixtures als JSON durch `sync.ts` → Workspace-Felder korrekt; deleted → canceled; unbekannter Customer → kein Update, kein Throw; Zod-Verletzung → Skip + Report; Gates als Status-Matrix-Unit-Test.
- **DoD:** Sync- und Gate-Logik vollständig offline getestet, Migration angewendet.

### Task 15a: Stripe-Webhook-Route: Signatur und Idempotenz (M)

- **Ziel:** Der Transportweg als vollständig offline getestete Route.
- **Dateien:** Exportierte Kernfunktion `handleStripeWebhook(request, { db, stripe, webhookSecret })` — die Route `src/app/api/stripe/webhook/route.ts` ist nur ein dünner Wrapper (sonst ist der PGlite-Test ohne Modul-Mocking unmöglich, weil die Route den Neon-Client statisch bindet). Ablauf: Raw Body via `await req.text()` (nie `req.json()`), `stripe.webhooks.constructEvent`, Signaturfehler → 400; `event.id` in `stripe_events` per insert-on-conflict-do-nothing — Duplikat → 200 ohne erneute Verarbeitung; unbekannte Event-Typen → 200; relevante Events an `sync.ts`, schnell antworten.
- **Env:** `STRIPE_WEBHOOK_SECRET` — **lokal das `whsec_` aus `stripe listen`, in Vercel das des Dashboard-Endpoints, zwei verschiedene Secrets** (Klassiker für „Signatur ungültig").
- **Testansatz (Vitest ohne Netz):** `stripe.webhooks.generateTestHeaderString({ payload, secret })` + direkter Aufruf der Kernfunktion mit `new Request(...)` und PGlite-db: gültig → 200 + Workspace-Update; falsches Secret, manipulierter Body, fehlender Header, alter Timestamp → 400; doppelte event.id → 200 und nur eine Verarbeitung.
- **DoD:** Alle Signatur- und Idempotenztests grün, CI ohne Secrets.

### Task 15b: Stripe-Testmode-Durchlauf und Status-Anzeige (M)

- **Ziel:** Ende-zu-Ende-Beweis im Testmode plus sichtbarer Subscription-Status (PRD-Bullet „Subscription-Status am Workspace" — bewusst nur ein Badge, keine Billing-UI).
- **Vorbedingungen (dokumentieren):** Stripe CLI installieren (`brew install stripe/stripe-cli/stripe`, `stripe login` mit Testmode-Account); Produkt + Preis im Testmode-Dashboard; Test-Customer anlegen und `stripe_customer_id` am Workspace eintragen (Drizzle Studio — dokumentierter Ops-Schritt, da keine Checkout-UI existiert); Dashboard-Webhook-Endpoint auf die Prod-URL mit den drei Subscription-Events, **API-Version des Endpoints auf die vom SDK gepinnte Dahlia-Version**; `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in Vercel Production.
- **Dateien:** Deutsches Status-Badge auf der Workspace-Seite („Abo: aktiv / Testphase / kein Abo") aus `subscription_status`; README-Abschnitt „Stripe-Testmode-Setup"; lokaler Flow `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Keine Preview-Webhooks in Phase 0.
- **Env:** keine neuen (siehe Vorbedingungen).
- **Testansatz:** manuell: Test-Abo im Dashboard anlegen → Webhook feuert → Badge wechselt; Abo kündigen → Badge wechselt zurück; zweiter Workspace bleibt unberührt.
- **DoD:** Echtes Testmode-Abo spiegelt sich am Workspace in beide Richtungen (anlegen UND kündigen), Workspace B unberührt.

### Task 16: Metering-Fundament: runs + credit_ledger (M)

- **Ziel:** PRD-Bullet „Runs-Tabelle mit Token- und Kostenfeldern existiert ab Tag eins" plus credit_ledger (explizite Nutzer-Vorgabe im Auftrag) — ohne jede Pipeline-Logik.
- **Dateien:** `src/db/schema.ts` (+`runs`: id, workspace_id, `status` als Enum `'running' | 'succeeded' | 'failed'` [Statusübergänge sind Code, kein Freitext], started_at, finished_at, tokens_in, tokens_out, cost_cents, error, timestamps — OHNE briefing_id/job_id/brand_profile_version_id, deren Tabellen existieren noch nicht und kommen als nullable FKs mit ihren Phasen; +`credit_ledger`: id, workspace_id, delta int, reason, reference, created_at) → Migration 0005; `src/lib/billing/credits.ts` (`bookCredits`, `getCreditBalance` = `SUM(delta)`); scoped Helper für beide Entitäten in `src/db/scoped.ts`; Isolationssuite (Task 12) um beide Entitäten erweitern (je ein Listeneintrag + Factory).
- **Env:** keine neuen.
- **Testansatz (PGlite):** Run mit Token-/Kostenfeldern anlegen und lesen; Ledger-Summe korrekt über mehrere Buchungen inkl. negativer Deltas; Salden zweier Workspaces strikt getrennt; Isolationstests über das Task-12-Utility.
- **DoD:** Beide Tabellen in Prod migriert, Helper getestet, Isolationssuite erweitert und grün.

### Task 17: Phase-0-Abnahme und Doku (S)

- **Ziel:** Demo-Kriterium formal durchspielen (Checkliste unter e), Doku-Restschulden schließen.
- **Dateien:** README (lokales Setup: `npm install`, `vercel env pull`, `npm run db:migrate`, `npm run dev`, Stripe-CLI-Ablauf); `.env.example` auf Vollständigkeit; CLAUDE.md: „Stand" final aktualisieren und Kommandos-Sektion an die realen Scripts angleichen (`test:e2e` und `inngest:dev` als „ab Phase 1/3" markieren); PRD-Entscheidungs-Log ergänzen: (1) Single-Package statt Monorepo — eine App, npm-Workspaces bei Bedarf nachrüstbar; (2) next-auth v5 beta exakt gepinnt, Auth.js im Maintenance-Modus, Wechseloption Better Auth beobachten; (3) credit_ledger bereits in Phase 0 (Nutzer-Vorgabe über den PRD-Bullet hinaus); Git-Tag `v0.1.0-phase0`.
- **Env:** keine.
- **Testansatz/DoD:** Alle Checklistenpunkte bestanden, CI auf main grün, Produktion aktuell, Tag gesetzt.

## c) Entscheidungen mit Einzeiler-Begründung

1. **Task-Schneidung in 22 Sessions (a/b-Splits bei Scaffold, Auth, Workspaces, Stripe):** nur so hält jeder Task realistisch die 30-bis-60-Minuten-Vorgabe und endet in sich grün.
2. **Sentry als Task 3, vor der DB:** CLAUDE.md verlangt Sentry ab Phase 0, und so ist jede Zeile Server-Logik ab dem ersten Deploy beobachtbar; die vorgegebene Relativreihenfolge (Scaffold → Vercel → DB → Auth → …) bleibt unangetastet.
3. **Single-Package statt Monorepo-Tooling:** eine App braucht keine Workspaces; wird im PRD-Entscheidungs-Log dokumentiert statt stillschweigend abgewichen (PRD nennt „Monorepo").
4. **Drizzle 0.45.x / drizzle-kit 0.31.x statt v1-RC:** Phase 0 ist kein Ort für Release Candidates.
5. **Ein einziger DB-Treiber, `neon-serverless` (WebSocket-Pool), kein Dual-Setup mit neon-http:** liefert `db.transaction` mit derselben Drizzle-API wie der PGlite-Treiber (Prod-Test-Parität); neon-http ist eine spätere Latenz-Optimierung.
6. **Migrationen unter `src/db/migrations` statt `./drizzle`:** CLAUDE.md-Soll-Struktur („src/db/: schema.ts, Migrations, …") geht vor Drizzle-Default.
7. **`dotenv` als Dev-Dependency:** drizzle-kit lädt selbst keine Env-Dateien, und `vercel env pull` schreibt nach `.env.local` — ohne explizites Laden bricht jedes db:*-Script.
8. **Neon-Vercel-Native-Integration mit Preview-Branching:** Previews bekommen automatisch eigene DB-Branches (von Prod geforkt, Migrationen schon drauf) und berühren nie Produktionsdaten.
9. **workspaces + brand_profiles zusammen in Migration 0000:** das Scoped-Helper-Muster braucht eine real existierende gescopte Tabelle zum Testen, und der Stub ist als Phase-0-Entität genehmigt.
10. **PGlite migriert die echten Migrationsdateien (`pglite/migrator`, nicht `pushSchema`):** so werden die Migrationen selbst mitgetestet, exakt was in Produktion läuft.
11. **CI komplett secret-frei:** alles DB-artige läuft auf PGlite, Ratelimiter/Mail/Stripe sind injizierbar bzw. offline prüfbar; dafür ist der Vercel-Preview-Check als Required Check der Build-Gatekeeper (CI baut nicht).
12. **next-auth@5.0.0-beta.32 exakt gepinnt, Session-Strategie `database`:** Stack ist fix entschieden, database-Sessions sind serverseitig widerrufbar; Beta-/Maintenance-Risiko wird im Entscheidungs-Log dokumentiert statt ignoriert.
13. **Deutsches Mail-Template ab dem ersten Auth-Task:** CLAUDE.md verlangt deutsche Nutzertexte, ein Wegwerf-Zustand wäre Doppelarbeit.
14. **Dev-Log-Login (`AUTH_EMAIL_DEV_LOG`, nur development):** umgeht die Resend-Sandbox (Versand nur an die eigene Signup-Adresse) für echte Zweit-User- und Invite-Tests.
15. **Ratelimit-Guard in `sendVerificationRequest`, Doppel-Limit E-Mail + IP:** der einzige Punkt, durch den JEDER Weg zur Mail führt; das IP-Limit schützt die Resend-Quota gegen Adress-Rotation.
16. **Ratelimit fail-open (lazy konstruiert, try/catch) mit Sentry-Warnung:** Fail-closed gilt Inhalten und Gates, nicht der Verfügbarkeit des Logins; `Redis.fromEnv()` wirft bei fehlender Env und darf den Login nie töten.
17. **Environment-getrennte Ratelimit-Prefixe (`VERCEL_ENV`):** sonst verbrennt ein lokaler Test das Production-Limit in der gemeinsamen Free-DB.
18. **URL-basiertes Workspace-Routing `/w/[workspaceId]` statt Cookie:** die Membership-Prüfung pro Request im Layout ist einfacher und sicherer als ein zu validierendes Cookie.
19. **Fremder Workspace → 404 statt 403:** keine Existenz-Leaks über erratene IDs.
20. **Kein `proxy.ts` als Sicherheitsgrenze:** echte Autorisierung liegt serverseitig in Layouts/Actions/Helpers; der Proxy ist nur optimistischer Komfort.
21. **memberships.role nur als Spalte `'owner' | 'member'`, keine Rechte-Logik:** PRD 11 verlangt die Spalte, das Rollen-Feature ist explizit Phase 4.
22. **Ein regenerierbarer Mehrfach-Einladungslink pro Workspace, 7 Tage, nicht e-mail-gebunden:** kleinste Lösung, die den PRD-Wortlaut erfüllt und keinen Mailversand an Fremdadressen braucht.
23. **Scoped-Helper-Zwang per ESLint `no-restricted-imports` + gebundenes `getScopedDb`:** Grundprinzip 3 wird technisch erzwungen; tenancy-etablierende unscoped Zugriffe leben ausschließlich gekapselt in `src/db/**` (workspaces/memberships/invites), `tests/**` ist ausgenommen.
24. **Schema-Meta-Test (jede fachliche Tabelle muss `workspace_id` tragen):** macht vergessenes Scoping bei künftigen Tabellen automatisch zum roten Test.
25. **Stripe v22 ohne `apiVersion`-Override (Dahlia-Pin), Dashboard-Endpoint auf dieselbe Version:** TS-Typen und Payloads bleiben deckungsgleich; die `current_period_end`-Verschiebung auf Items (seit Basil) gilt weiter.
26. **Zod-Validierung der gelesenen Stripe-Felder in `sync.ts`:** CLAUDE.md verlangt Zod an jeder Grenze — `constructEvent` prüft nur die Signatur, nicht die Struktur.
27. **`stripe_events`-Tabelle für Idempotenz:** Stripe retried, die Verarbeitung muss doppelzustellungssicher sein.
28. **Manuelle Verknüpfung `stripe_customer_id` via Drizzle Studio:** bei Dashboard-only-Flow ist ein manueller Schritt unvermeidlich und weniger Code als eine Metadata-Automatik.
29. **`runs.status` als Enum, ohne FKs auf nicht existierende Tabellen, kein `run_steps`:** Statusübergänge sind Code; der Phase-0-Bullet verlangt nur Token- und Kostenfelder, `run_steps` kommt mit der Pipeline (Phase 1).
30. **`credit_ledger` bereits in Phase 0:** explizite Nutzer-Vorgabe im Auftrag (über den reinen PRD-Bullet hinaus); Saldo = `SUM(delta)` ohne `credit_balance`-Feld, um Dual-Write-Drift zu vermeiden, solange nichts Credits verbraucht.
31. **Kein Playwright, kein jsdom, keine i18n-Library:** CI-Umfang ist per Vorgabe lint+typecheck+test, das Demo-Kriterium wird manuell abgenommen, und deutsche Texte als Konstanten je Modul sind i18n-fähig genug (PRD: keine Mehrsprachigkeit in v1).

**Explizit NICHT in Phase 0** (geprüft, bewusst draußen): Inngest, PostHog, AI-Provider-Layer, QA/Platzhalter-Logik, Briefings, Feed, Checkout- und Billing-UI (nur das Status-Badge), Brand-Profil-Editor + Versionierung, OAuth, Rollen-Logik, run_steps, Credential-Verschlüsselung (erst nötig, wenn Quellen/Ziele existieren, Phase 2), Playwright.

## d) Risiken und Stolpersteine von Phase 0

1. **create-next-app verweigert das nicht-leere Repo** (.env, .mcp.json, .neon, skills-lock.json sind nicht auf der Konflikt-Allowlist) → Primärpfad: in Temp-Verzeichnis scaffolden und Dateien mergen (Task 1a eingeplant).
2. **`npm ci` verlangt eine committete, exakt zum package.json passende package-lock.json** → Lockfile immer mitcommitten, Dependency-Änderungen nur über npm-Kommandos, sonst bricht die CI mit Lockfile-Drift.
3. **Next-16-Umbrüche in alten Anleitungen:** `proxy.ts` statt `middleware.ts`, async `params`/`searchParams`, kein `next lint` — blind kopierte Next-14/15-Snippets brechen den Build.
4. **CI baut nicht:** Next-Build-Fehler (z. B. Routen-Konflikte, Server/Client-Boundary) tauchen erst im Vercel-Build auf → Vercel-Preview-Check als Required Check in der Branch Protection (Task 2).
5. **Auth.js im Maintenance-Modus (Better-Auth-Übernahme), v5 bleibt Beta:** exakt pinnen, Risiko im PRD-Entscheidungs-Log dokumentieren (Task 17).
6. **Resend-Sandbox:** Versand nur von `onboarding@resend.dev` an die eigene Signup-Adresse; Produktname/Domain sind laut PRD vertagt → Phase 0 kommt mit Sandbox + Dev-Log-Login aus, für den externen Tester (M3) rechtzeitig eine Übergangsdomain verifizieren.
7. **Neon pooled vs. unpooled + Env-Loading:** Migrationen über die Pooler-URL können scheitern (`drizzle.config.ts` MUSS `DATABASE_URL_UNPOOLED` nutzen), und drizzle-kit lädt keine Env-Dateien (`dotenv` mit `.env.local`-Pfad, Task 4).
8. **Preview ohne DB ist ein Henne-Ei:** ohne Neon-Vercel-Integration ist `/api/health` auf jedem Preview rot und die Task-8-DoD unerfüllbar → Integration ist Vorbedingung von Task 4.
9. **Die häufigsten Stripe-Fallen:** zwei verschiedene `whsec_`-Secrets (CLI vs. Dashboard); `current_period_end` liegt seit Basil auf `subscription.items.data[0]`; Dashboard-Webhook-API-Version muss auf den SDK-Pin (Dahlia); v22: `new Stripe(...)` als echte ES6-Klasse.
10. **`Redis.fromEnv()` wirft synchron bei fehlender Env** → Limiter lazy in try/catch, sonst stirbt der Magic-Link-Versand genau an dem Schutz, der ihn absichern soll (Task 9).
11. **PGlite ist Single-Connection:** eine Instanz pro Testdatei/Worker; kein echtes Locking-/Timing-Verhalten, nicht für spätere Concurrency-Tests missbrauchen.
12. **Treiber-/Test-Parität:** kein `db.batch` (nur neon-http) verwenden; konsequent `db.transaction` und Helper gegen generischen `PgDatabase`-Typ (kein `any`, CLAUDE.md).
13. **`env.ts` darf Build/CI nicht killen:** Zod-Validierung lazy beim ersten Server-Zugriff, nicht beim Import.
14. **Sentry + Turbopack-Prod-Build:** Source-Map-Upload braucht @sentry/nextjs 10.13+ und Next 15.4.1+; beim ersten Deploy explizit validieren, Fallback Webpack-Prod-Build.
15. **Vitest schlägt ohne Testdateien fehl** → Smoke-Test gehört in Task 1b, sonst ist die erste CI rot.
16. **Vercel-Env-Trägheit:** geänderte Env-Variablen greifen erst mit dem nächsten Deployment; nach jedem Secret-Update redeployen.
17. **Migrationsdisziplin:** Es entstehen 0000 bis 0005 sequentiell; niemals editieren oder löschen, nur anfügen (CLAUDE.md).

## e) Abnahme-Checkliste für das Demo-Kriterium

Basis: Production-URL. **Ausnahme Schritte 5 und 7:** User B kann auf Production nicht einloggen (Resend-Sandbox sendet nur an die Signup-Adresse, Dev-Log-Login ist nie in Vercel aktiv) — diese zwei Schritte laufen lokal (`npm run dev` mit `.env.local`, deren `DATABASE_URL` auf die Produktions-DB zeigt, Login via Dev-Log). Die Datenisolation wird damit trotzdem gegen dieselbe Produktions-DB bewiesen. User A = Resend-Signup-Adresse (dominik.maier049@gmail.com).

1. [ ] `/api/health` liefert ok inklusive DB-Ping.
2. [ ] `/login` öffnen, Magic Link anfordern → Mail kommt auf Deutsch an, Login klappt, Session-Row in `sessions`; Abmelden und geschützte Route ohne Session aufrufen → Redirect auf `/login`.
3. [ ] Workspace „Redaktion Alpha" anlegen; unter Marken-Profile den Eintrag „Profil Alpha" anlegen → erscheint in der Liste.
4. [ ] Zweiten Workspace „Redaktion Beta" anlegen (Umschalter zeigt beide); dort „Profil Beta" anlegen.
5. [ ] Einladungslink in „Redaktion Beta" erzeugen; lokal User B via Dev-Log-Login über den Link aufnehmen → landet als member in Redaktion Beta; abgelaufenen/kaputten Token testen → deutsche Fehlerseite.
6. [ ] Isolation im UI: In Redaktion Alpha ist nur „Profil Alpha" sichtbar, in Beta nur „Profil Beta" — keine Überschneidung.
7. [ ] URL-Manipulation (lokal als User B): `/w/<id-von-Alpha>/brand-profiles` aufrufen → 404.
8. [ ] Isolation an der DB: `select name, workspace_id from brand_profiles` (Drizzle Studio/Neon-Console) → jede Zeile exakt einem Workspace zugeordnet; Tenancy-Suite lokal und in CI grün, CI nachweislich ohne `DATABASE_URL`.
9. [ ] Stripe-Testmode: Produkt + Preis + Test-Customer im Dashboard, `stripe_customer_id` an „Redaktion Alpha" hinterlegt, Test-Abo anlegen → Webhook feuert, Abo-Badge in Alpha zeigt „aktiv/Testphase"; „Redaktion Beta" zeigt „kein Abo".
10. [ ] Test-Abo im Dashboard kündigen → Status von Alpha wechselt (Sync-Beweis in beide Richtungen).
11. [ ] Ratelimit: viermal hintereinander Magic Link anfordern → deutsche Hinweis-Meldung statt Mail.
12. [ ] Sentry: auf einem Preview (oder Production mit temporär gesetztem `DEBUG_SENTRY_ENABLED`, danach entfernen) Testfehler auslösen → Event mit Source-Map-Stacktrace im Projekt.
13. [ ] `runs` und `credit_ledger` existieren in der Produktions-DB (Migrationen 0000 bis 0005 angewendet), zugehörige Tests und Isolationssuite grün.
14. [ ] CI auf main grün, CLAUDE.md-„Stand" und Kommandos aktualisiert, PRD-Entscheidungs-Log ergänzt, Tag `v0.1.0-phase0` gesetzt.
