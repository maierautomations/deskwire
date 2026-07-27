# Deskwire

SaaS-Web-App, das KI-Interface für Redaktionen. Produktanforderungen: [docs/PRD.md](docs/PRD.md), Phasenplan: [docs/phase-0-plan.md](docs/phase-0-plan.md).

## Entwicklung

Voraussetzungen: Node 24 (siehe `.nvmrc`), npm.

```bash
npm ci             # Dependencies installieren
npm run dev        # lokale Entwicklung auf http://localhost:3000
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

### Umgebungsvariablen

Die Wahrheit liegt im Vercel-Dashboard, gepflegt pro Environment (Production, Preview, Development). Lokal werden die Werte gezogen, nie von Hand gepflegt:

```bash
npx vercel link      # einmalig: Repo mit dem Vercel-Projekt verknüpfen
npx vercel env pull  # schreibt .env.local (gitignored)
```

Niemals echte Werte committen. Jede neue Variable wird in dem Task, der sie einführt, in `.env.example` dokumentiert (Name plus Kommentar, ohne Wert).

### Datenzugriff

Fachliche Daten werden ausschließlich über die gescopten Query-Helper gelesen und geschrieben: `getScopedDb(workspaceId)` aus `@/db`, Muster in `src/db/scoped.ts`. Der rohe Client (`getDb`) und die DB-Treiber sind außerhalb von `src/db/**` per ESLint-Regel verboten (`tests/**` ist ausgenommen). Bewusst unscoped Zugriffe, etwa das Anlegen von Workspaces, leben nur als gekapselte Helper in `src/db/**`.

### Deployment

- Push auf `main` deployt automatisch nach Production (Vercel).
- Jede Pull Request bekommt automatisch ein Preview-Deployment mit eigener URL.
- Branch Protection auf `main`: der CI-Job (Lint, Typecheck, Tests) und der Vercel-Build sind Required Checks. Die CI baut bewusst nicht, Next-Build-Fehler fängt erst der Vercel-Check vor dem Merge ab.
- Health-Check: `GET /api/health` liefert `{ ok: true, sha: <Commit-SHA> }`, ab Task 4 zusätzlich mit DB-Ping.

### Stripe-Testmode-Setup

Der komplette Billing-Flow läuft in Phase 0 im Stripe-Testmode. Der Ende-zu-Ende-Beweis (Test-Abo anlegen → Webhook feuert → Badge am Workspace wechselt) ist ein manueller Durchlauf, kein automatisierter Test.

**Vorbedingungen**

- Stripe CLI ohne Homebrew: macOS-arm64-Binary von den offiziellen GitHub-Releases (stripe/stripe-cli) laden, entpacken, nach `~/bin` verschieben, PATH prüfen. Alternative: Docker-Image `stripe/stripe-cli`, für `stripe listen` dann `--forward-to host.docker.internal:3000`.
- `stripe login` mit dem Testmode-Account.
- Produkt und Preis existieren im Testmode-Dashboard (Ein-Preis-Modell, Phase 0).

**Lokaler Webhook-Flow**

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Das dabei ausgegebene `whsec_…` gehört als `STRIPE_WEBHOOK_SECRET` nach `.env.local`, dazu ein Testmode-`STRIPE_SECRET_KEY` (`sk_test_…`). Test-Events lassen sich mit `stripe trigger customer.subscription.created` auslösen.

**Die Zwei-Secrets-Falle**

Es gibt zwei verschiedene `whsec_`-Secrets, und sie sind nicht austauschbar:

- Das Secret aus `stripe listen` gilt nur für die lokale CLI-Weiterleitung → `.env.local`.
- Das Secret des Dashboard-Webhook-Endpoints gilt nur für Zustellungen an die Prod-URL → Vercel (Production).

Verwechselt liefert die Route stumm 400 „Signatur ungültig". Signaturfehler erzeugen bewusst kein Sentry-Event (fremd-auslösbar, öffentliche URL); die Diagnose läuft über die Zustellungsansicht des Endpoints im Stripe-Dashboard.

**Dashboard-Webhook-Endpoint (Production)**

- URL: `https://<prod-domain>/api/stripe/webhook`, Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` (die Route filtert ohnehin gegen `HANDLED_STRIPE_EVENT_TYPES`).
- API-Version des Endpoints: `2026-06-24.dahlia`, identisch mit dem SDK-Pin. Bei jedem stripe-SDK-Bump wird der Kein-Override-Test aus Task 14 absichtlich rot, das Signal, die Endpoint-Version neu abzugleichen.
- Nutzlast-Stil: „Momentaufnahme" (Snapshot), nicht „Thin". Thin-Payloads enthalten nur IDs statt des vollständigen Subscription-Objekts, jeder Sync liefe damit in den `invalid_payload`-Skip, der nach außen 200 antwortet und nur in Sentry sichtbar ist.

**Customer-Verknüpfung (Entscheidung 28)**

Es gibt bewusst keine Checkout-UI: Die `stripe_customer_id` (`cus_…`) wird von Hand per Drizzle Studio (`npm run db:studio`) am Workspace eingetragen. Events zu unverknüpften Customern werden als `unknown_customer` übersprungen (200 an Stripe, Warnung in Sentry), nach dem Eintragen greift die nächste Zustellung.
