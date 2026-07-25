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

### Deployment

- Push auf `main` deployt automatisch nach Production (Vercel).
- Jede Pull Request bekommt automatisch ein Preview-Deployment mit eigener URL.
- Branch Protection auf `main`: der CI-Job (Lint, Typecheck, Tests) und der Vercel-Build sind Required Checks. Die CI baut bewusst nicht, Next-Build-Fehler fängt erst der Vercel-Check vor dem Merge ab.
- Health-Check: `GET /api/health` liefert `{ ok: true, sha: <Commit-SHA> }`, ab Task 4 zusätzlich mit DB-Ping.
