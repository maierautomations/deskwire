# PRD: Deskwire (Arbeitstitel)

**Das KI-Interface für Redaktionen. Von Signal zu Idee zu Briefing zu Artikel zu Upload.**

|        |                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status | Draft v1.1                                                                                                                                                                                                       |
| Datum  | 25.07.2026                                                                                                                                                                                                       |
| Autor  | Dominik Maier                                                                                                                                                                                                    |
| Zweck  | Produktdefinition und Planungsgrundlage. Dieses Dokument ist die inhaltliche Wahrheit des Projekts. Technische Konventionen stehen in CLAUDE.md. Bei Widerspruch gilt: PRD definiert das Was, CLAUDE.md das Wie. |

---

## 1. Vision

Redaktionen bekommen ein einziges Interface, in dem KI-gestützte Content-Arbeit vollständig stattfindet: Themen finden, Briefings erstellen, Artikel im eigenen Markenstil generieren lassen, transparent prüfen, freigeben und in das eigene System hochladen. Nicht ein weiterer Textgenerator, sondern das Betriebssystem für den redaktionellen KI-Alltag.

Der Kern der Vision in einem Satz: **Der Redakteur bleibt Kurator und letzte Instanz, die Maschine übernimmt Recherche, Entwurf und Formalprüfung, und alles ist nachvollziehbar.**

## 2. Problem

1. **Fragmentierung:** Redaktionen springen zwischen ChatGPT-Tabs, Prompt-Sammlungen, CMS und Tabellen. Nichts hängt zusammen, nichts hat Status, nichts ist nachvollziehbar.
2. **Kein Markenstil:** Generische KI-Texte klingen generisch. Hausstil, Pflichtelemente (Kennzeichnung, Disclaimer) und Verbote (etwa keine Anlageberatung) sind nirgends verankert und werden pro Prompt neu vergessen.
3. **Kein Vertrauen:** Redakteure sehen nicht, worauf ein KI-Text basiert, was geprüft wurde und was offen ist. Ohne Transparenz keine Adoption.
4. **Kein Weg ins System:** Der letzte Meter ins CMS ist Copy-Paste. Jede Redaktion hat ein anderes CMS, fertige Integrationen decken nie alle ab.
5. **Keine Wiederholbarkeit:** Wiederkehrende Aufgaben (Morgenlage, Themenscan, Standardformate) werden jeden Tag manuell neu angestoßen.

## 3. Zielgruppe

**Primär (Launch):**

- Kleine und mittlere Fachredaktionen und Special-Interest-Portale (Finanzen, Tech, Sport, Regionales, B2B-Fachmedien), 2 bis 20 Redakteure.
- Corporate Newsrooms und Content-Teams, die redaktionell arbeiten.

**Sekundär (Self-Serve-Einstieg):**

- Solo-Publisher und Fachblogger mit hohem Output-Anspruch.

**Personas:**

- **Redakteurin Rita:** Erstellt Briefings, reviewt Artikel, will schnell von Idee zu fertigem Beitrag. Misstraut Blackboxen.
- **Redaktionsleiter Leo:** Definiert Stil und Leitplanken, will Überblick über Output, Qualität und Kosten. Verantwortet, was rausgeht.
- **Admin Alex:** Bindet Quellen und das CMS an, verwaltet Zugänge. Will klare Schnittstellen und keine Bastellösungen.

## 4. Positionierung und Differenzierung

Kein "AI Writer". Die Differenzierung liegt im Workflow und in der Kontrolle:

1. **Workflow statt Einzeltext:** Feed mit Status-Pipeline, Review, Freigabe. Das Produkt bildet den Redaktionsprozess ab, nicht nur den Schreibmoment.
2. **Brand-Profil als Fundament:** Stil, Terminologie, Pflichtelemente und harte Verbote sind einmal definiert und gelten überall, in jedem Artikel und jedem Job.
3. **Radikale Transparenz:** Jeder Artikel zeigt Quellen, Prüfergebnisse, offene Marker und eine Confidence-Einschätzung. Fail-closed: Was nicht belegt ist, wird als Platzhalter markiert statt erfunden.
4. **Bring your own CMS:** Upload-Ziele sind konfigurierbar (Webhook zuerst), nicht auf eine Plattform festgelegt.
5. **Agent-Jobs:** Wiederkehrende KI-Aufgaben laufen zeitgesteuert und liefern in den Feed, standardmäßig mit Mensch in der Schleife.
6. **Erweiterbare Quellen:** Eingebaute Quelltypen plus konfigurierbare Adapter, weil jede Redaktion eigene APIs und Agenturzugänge hat.

**Leitprinzip aus der Praxis, das das ganze Produkt prägt: Das LLM urteilt, der Code entscheidet.** Sprache und Einschätzung kommen vom Modell, alle Gates, Prüfungen, Zahlenlogik und Statusübergänge sind deterministischer Code.

## 5. Kernkonzepte (Domain-Glossar)

| Konzept                | Beschreibung                                                                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**          | Ein Mandant, eine Redaktion. Harte Datentrennung. Enthält Mitglieder, Brand-Profile, Quellen, Ziele, Jobs.                                                                                                                                                                  |
| **Brand-Profil**       | Versioniertes Stilfundament: Tonalität, Zielgruppe, Do's und Don'ts, Terminologie, Beispieltexte, Pflichtelemente (z. B. KI-Kennzeichnung, Disclaimer), harte Verbote (z. B. keine Kauf- oder Verkaufsempfehlung), Formatvorgaben (Kicker-Länge, Teaser-Länge, SEO-Regeln). |
| **Quelle (Source)**    | Konfigurierter Daten-Eingang: RSS, generische REST-API, eingehender Webhook. Später: E-Mail-Ingest, Plugins.                                                                                                                                                                |
| **Signal**             | Normalisierte Einheit aus einer Quelle (Titel, Text, URL, Entitäten, Zeitstempel, Rohdaten). Grundlage für Radar und Jobs.                                                                                                                                                  |
| **Idee**               | Gescorte Themenkarte im Radar: Hook, Signale als Belege, Score, vorgeschlagener Artikeltyp und Blickwinkel.                                                                                                                                                                 |
| **Briefing**           | Strukturierter Auftrag: Thema, Hauptentität, Artikeltyp, Blickwinkel, optionale Fakten des Redakteurs, Quellen-URLs, Ziellänge.                                                                                                                                             |
| **Run**                | Eine Agenten-Ausführung mit persistierten Schritten (Recherche, Entwurf, QA, Korrektur, Finalisierung), Token-Verbrauch und Kosten.                                                                                                                                         |
| **Artikel**            | Ergebnis eines Runs: Kicker, Titel, SEO-Titel, Teaser, Body (HTML und Markdown), Meta, Entitäten, Quellenliste.                                                                                                                                                             |
| **QA-Report**          | Deterministische und modellgestützte Prüfergebnisse: bestandene Checks, Findings, offene Marker (Platzhalter), Confidence-Text.                                                                                                                                             |
| **Ziel (Destination)** | Konfigurierter Upload-Weg: Webhook (v1), später WordPress, SFTP/XML, generische REST.                                                                                                                                                                                       |
| **Job**                | Zeitgesteuerte Agent-Aufgabe (Cron): Zeitplan plus Quellenauswahl plus Auftrag plus Brand-Profil plus Output-Typ plus Ziel.                                                                                                                                                 |
| **Feed**               | Zentrale Arbeitsliste aller Artikel und Job-Outputs mit Status-Pipeline und Filtern.                                                                                                                                                                                        |
| **Beobachtungsliste**  | Entitäten oder Keywords, auf die Jobs und Radar reagieren (generalisierte Watchlist).                                                                                                                                                                                       |

**Status-Pipeline eines Artikels:** `ENTWURF LÄUFT → REVIEW NÖTIG → BEREIT → ÜBERTRAGEN → ONLINE` plus `FEHLER`. Übergänge sind Code, niemals Modell-Entscheidung. `BEREIT` erreicht ein Artikel nur, wenn der QA-Report keine offenen Marker enthält.

## 6. Produktumfang nach Phasen

Strikter Schnitt. Jede Phase endet mit einem Demo-Kriterium. Keine Phase beginnt, bevor die vorherige ihr Kriterium erfüllt.

### Phase 0: Foundation

**Ziel:** Ein leeres, aber produktionsfähiges Fundament.

- Monorepo, CI (Lint, Typecheck, Tests), Deployment-Pipeline.
- Auth (E-Mail plus OAuth), Workspace-Erstellung, Einladungen per Link.
- Multi-Tenancy-Fundament: jede Tabelle workspace-gescoped, Isolation getestet.
- Stripe-Grundgerüst: Pläne anlegbar, Subscription-Status am Workspace, Feature-Gates als Code.
- Usage-Metering-Fundament: Runs-Tabelle mit Token- und Kostenfeldern existiert ab Tag eins.

**Demo-Kriterium:** Zwei getrennte Workspaces, Login, ein Testeintrag pro Workspace, nachweislich keine Datenüberschneidung, ein Testabo via Stripe-Testmode.

### Phase 1: MVP "Briefing zu Artikel"

**Ziel:** Der Kernwert in schön. Ein Redakteur erstellt in unter 15 Minuten nach Signup seinen ersten markenkonformen, geprüften Artikel und bekommt ihn in sein System.

- Onboarding-Wizard: Workspace, erstes Brand-Profil (geführt, mit Beispieltext-Analyse), optional erstes Ziel.
- Brand-Profil-Editor mit Versionierung.
- Briefing-Formular (inkl. "Redakteursfakten"-Mechanik, siehe 7.3).
- Agent-Pipeline als Step-Run mit Live-Status.
- QA fail-closed mit Platzhalter-Mechanik.
- Feed mit Status-Filtern, Suche, Detailansicht (Artikel, QA-Report, Lauf-Metadaten).
- Review-Editor: Felder editieren, Platzhalter auflösen, Status setzen.
- Export: Copy-Buttons pro Feld, Markdown- und HTML-Export, **Webhook-Destination** (signierter POST mit Artikel-JSON).
- Billing live: Free-Kontingent, ein Bezahlplan, Kontingent-Verbrauch sichtbar.

**Demo-Kriterium:** Ein externer Testnutzer (nicht ich) legt ohne Hilfe einen Workspace an, definiert ein Brand-Profil, erstellt ein Briefing und erhält einen Artikel, der die Pflichtelemente seines Profils enthält, und empfängt ihn per Webhook in einem Test-Endpoint.

### Phase 2: Quellen und Radar

**Ziel:** Ideen kommen ins System, nicht nur Aufträge.

- Quellen: RSS-Adapter und konfigurierbarer REST-Adapter (URL, Auth-Header, Abrufintervall, Feld-Mapping auf das Signal-Schema per JSONPath), eingehender Webhook.
- Signal-Ingest mit Dedupe (Hash über URL plus Titel).
- Beobachtungslisten (Entitäten, Keywords).
- Themenradar: deterministisches Scoring (Frische, Signalhäufung, Beobachtungslisten-Treffer, Quellen-Gewichte), Modell formuliert nur Hook und Blickwinkel für die Top N.
- Ideen-Karten-Board mit Signal-Belegen, Aktionen: Briefing vorbefüllen, Verwerfen (Snooze), Claim.
- Dedupe gegen den Feed: Bereits geschriebene Themen werden nicht erneut vorgeschlagen.

**Demo-Kriterium:** Zwei RSS-Quellen plus eine REST-Quelle angebunden, Radar zeigt gescorte Karten mit Belegen, ein Klick erzeugt ein vorbefülltes Briefing, daraus entsteht ein Artikel.

### Phase 3: Agent-Jobs und weitere Ziele

**Ziel:** Wiederkehrende Arbeit läuft von allein, der Mensch bleibt in der Schleife.

- Job-Builder: Zeitplan (Cron-Presets plus Custom), Quellenauswahl, Auftragstyp (Ideen-Scan, Entwurfs-Erstellung, Digest), Brand-Profil, Output-Ziel (Feed, E-Mail-Digest, Destination).
- Ausführung über die Job-Queue mit Retries, Fehler-Sichtbarkeit im Feed und Job-Log.
- Guardrail: Jobs erzeugen standardmäßig Status `REVIEW NÖTIG`. Automatische Übertragung an eine Destination ist eine explizite Opt-in-Einstellung pro Job und wird im Ziel als Entwurf empfohlen.
- Weitere Destinations: WordPress (REST), SFTP-Upload (Datei, konfigurierbares XML- oder JSON-Template), generische REST-Destination.
- Kosten-Schutz: Budget pro Job und pro Workspace, Job pausiert bei Überschreitung.

**Demo-Kriterium:** Ein Job "werktags 06:00, scanne Quellen X und Y, erstelle bis zu 3 Entwürfe zu Beobachtungslisten-Treffern" läuft drei Tage stabil, Ergebnisse erscheinen im Feed als REVIEW NÖTIG, keine ungewollte Veröffentlichung.

### Phase 4: Plugins, Teams, Skalierung

**Ziel:** Erweiterbarkeit und Teamalltag.

- Plugin-Prinzip Config-first: Der konfigurierbare REST-Adapter aus Phase 2 wird zum teilbaren "Quellen-Rezept" (exportierbare, importierbare Adapter-Konfiguration). Erst danach, bei echter Nachfrage, ein Code-SDK.
- Team-Features: Rollen (Admin, Redakteur, Betrachter), Zuweisung und Claim im Feed, Aktivitäts-Log.
- Mehrere Brand-Profile pro Workspace (z. B. pro Ressort oder Portal).
- Audit-Log und Export der eigenen Daten.
- Optional: Template-Galerie für Briefing-Presets und Job-Vorlagen.

**Demo-Kriterium:** Ein Nutzer importiert ein geteiltes Quellen-Rezept und hat die Quelle ohne technisches Wissen in unter 5 Minuten live.

## 7. Feature-Details MVP (Phase 1)

### 7.1 Onboarding und Workspace

**Story:** Als neuer Nutzer will ich in wenigen Minuten von Signup zu einem einsatzbereiten Workspace kommen.

- Signup mit E-Mail oder OAuth, Workspace-Name, Einladungslink für Kollegen.
- Geführter Start: "Erstelle dein Brand-Profil" als erster Schritt, nicht überspringbar beim ersten Artikel (ein Default-Profil wird sonst angelegt).

**Akzeptanzkriterien:**

- Signup bis erstes Briefing in unter 10 Minuten möglich.
- Einladung per Link funktioniert, eingeladene Nutzer landen im richtigen Workspace.

### 7.2 Brand-Profil

**Story:** Als Redaktionsleiter will ich Stil und Leitplanken einmal definieren, damit jeder Output markenkonform ist.

- Felder: Name, Beschreibung der Marke und Zielgruppe, Tonalität (Freitext plus Auswahl), Terminologie (bevorzugte und verbotene Begriffe), Do's und Don'ts, Pflichtelemente (frei definierbare Textbausteine mit Position, z. B. KI-Hinweis am Ende, Disclaimer), harte Verbote (Aussagen-Typen, die nie vorkommen dürfen), Formatregeln (max. Kicker-Zeichen, Teaser-Zeichen, Überschriften-Stil), 1 bis 3 Beispieltexte.
- Beispieltext-Analyse: Das System extrahiert aus Beispieltexten einen Stil-Fingerabdruck (Satzlänge, Ansprache, typische Konstruktionen) und zeigt ihn editierbar an.
- Versionierung: Jede Änderung erzeugt eine Version, Runs referenzieren die verwendete Version.

**Akzeptanzkriterien:**

- Pflichtelemente erscheinen in 100 % der generierten Artikel an der definierten Position (deterministisch eingefügt oder geprüft, nicht dem Modell überlassen).
- Harte Verbote werden von der QA geprüft, Verstoß führt nie zu BEREIT.
- Ein Artikel zeigt an, mit welcher Profilversion er erzeugt wurde.

### 7.3 Briefing

**Story:** Als Redakteurin will ich einen Auftrag strukturiert erteilen und eigene verifizierte Fakten mitgeben.

- Felder: Thema/Auslöser (Pflicht), Hauptentität (Name, optional Kennung wie ISIN/Ticker), Artikeltyp (konfigurierbare Typen mit Beschreibung, Default: Meldung, Analyse, Hintergrund), Blickwinkel, Ziellänge, Quellen-URLs, Autor-Kürzel.
- **Redakteursfakten:** Frei definierbare Schlüsselfakten (z. B. Kurs, Zitat, Zahl), die als verifiziert gelten. Prinzip: Fakten, die nur der Redakteur sicher kennt, kommen vom Redakteur. Fehlen sie, setzt das System Platzhalter und der Artikel bleibt in REVIEW NÖTIG.
- Presets: Speicherbare Briefing-Vorlagen pro Workspace.
- Doppel-Submit-Schutz und Dedupe-Warnung (gleiche Entität plus ähnliches Thema in den letzten 24 h).

**Akzeptanzkriterien:**

- Briefing ohne Redakteursfakten erzeugt einen Artikel mit kanonischen Platzhaltern und Status REVIEW NÖTIG.
- Briefing mit vollständigen Fakten kann BEREIT erreichen.

### 7.4 Agent-Pipeline (Run)

**Story:** Als Nutzer will ich sehen, was die Maschine gerade tut und was sie getan hat.

- Pipeline-Schritte (persistiert, einzeln nachvollziehbar): 1. Briefing-Normalisierung (Code) 2. Recherche (Modell mit Websuche auf erlaubte Quellen, Quellenliste wird gespeichert) 3. Entwurf (Modell, Brand-Profil-Version im Kontext) 4. Deterministische QA (Code) 5. Modell-QA (ein kombinierter Prüf-Agent) 6. Genau ein Korrektur-Pass bei Findings (Modell) 7. Finale deterministische QA und Status-Entscheid (Code).
- Kein Korrektur-Loop: maximal ein Korrektur-Pass, danach entscheidet Code über REVIEW NÖTIG.
- Live-Status im Frontend (Schritt-Anzeige), Laufzeit und Kosten werden am Run gespeichert.
- Abbruch- und Timeout-Verhalten definiert: Ein hängender Schritt führt zu FEHLER mit Grund, nie zu stillem Verschwinden.

**Akzeptanzkriterien:**

- Jeder Run zeigt seine Schritte mit Dauer und Ergebnis.
- Ein fehlgeschlagener Run erscheint im Feed als FEHLER mit verständlichem Grund und "Erneut versuchen".

### 7.5 QA und Platzhalter (fail-closed)

**Story:** Als Redaktionsleiter will ich, dass das System lieber eine Lücke zeigt als eine Erfindung.

- Kanonische Platzhalter-Syntax: `[einsetzen: ...]` für fehlende verifizierte Fakten, `[zu klären: ...]` für unsichere Aussagen. Nur diese zwei Formen sind zulässig, Prüfung per Regex.
- Deterministische Checks (Code): Pflichtelemente vorhanden und positioniert, Formatregeln (Zeichenlimits), verbotene Begriffe, Platzhalter-Syntax, Link-Validität (nur erlaubte Domains, keine erfundenen URLs), keine relativen Zeitangaben wenn im Profil aktiviert.
- Modell-Check (ein Agent): harte Verbote inhaltlich (z. B. Empfehlungs-Sprache), Stil-Abweichung, unbelegte Tatsachenbehauptungen.
- QA-Report in der Detailansicht: bestandene Checks, Findings, offene Marker, Confidence-Freitext.

**Akzeptanzkriterien:**

- Ein Artikel mit offenem Marker kann technisch nicht BEREIT werden.
- Jedes Finding ist im Report menschenlesbar erklärt.
- Ein Set von 5 Golden-Briefings existiert als Test-Fixtures: feste Briefings, deren Ergebnis-Artikel automatisiert auf Pflichtelemente, Platzhalter-Syntax und verbotene Muster geprüft werden. Der Test läuft als Regression nach jeder Pipeline- oder Prompt-Änderung.

### 7.6 Feed und Review-Editor

**Story:** Als Redakteurin will ich einen Posteingang aller Artikel und darin schnell reviewen.

- Feed: Statuszähler, Filter (Status, Autor, Quelle des Auftrags), Suche, Sortierung nach Zeit.
- Detailansicht: Artikelfelder mit Copy-Buttons, gerenderte Vorschau, QA-Report, Lauf-Metadaten, Quellenliste.
- Review-Editor: Felder direkt editierbar, Platzhalter-Auflösung als geführter Modus (springt von Marker zu Marker), Statusaktionen (BEREIT setzen nur ohne offene Marker, ONLINE manuell abhaken solange keine Rückmeldung vom Zielsystem existiert).
- Jede manuelle Änderung wird versioniert (einfache Artikel-Historie).

**Akzeptanzkriterien:**

- Platzhalter-Modus findet alle Marker und entfernt sie beim Ausfüllen syntaktisch sauber.
- Statusübergänge folgen der Pipeline-Definition, keine Abkürzungen möglich.

### 7.7 Export und Webhook-Destination

**Story:** Als Admin will ich fertige Artikel automatisch in unser System bekommen.

- Export je Artikel: Copy pro Feld, Download als Markdown und HTML, JSON-Ansicht.
- Webhook-Destination: Ziel-URL, Secret, Payload ist das kanonische Artikel-JSON, Signatur per HMAC, Retry mit Backoff, Zustell-Log am Artikel.
- Trigger: manuell ("Jetzt übertragen") ab Status BEREIT. Automatik kommt erst mit Jobs (Phase 3).

**Akzeptanzkriterien:**

- Ein Test-Endpoint empfängt den signierten Payload, Fehlzustellung ist am Artikel sichtbar und wiederholbar.

### 7.8 Billing und Limits

**Story:** Als Betreiber will ich Kosten im Griff und ein faires Preismodell.

- Kontingent-Modell: Pläne enthalten Artikel-Credits pro Monat (ein Run verbraucht Credits abhängig von Ziellänge). Zusatz-Credits kaufbar.
- Harte Limits: Free endet hart, Bezahlpläne warnen bei 80 %, Overage nur mit Opt-in.
- Missbrauchsschutz: Rate Limiting auf allen öffentlichen und run-auslösenden Endpoints, zusätzlich zu den Kontingent-Gates.
- Kosten-Transparenz intern: Jeder Run speichert Token und Modellkosten, ein internes Dashboard zeigt Marge pro Plan.

**Akzeptanzkriterien:**

- Kontingent-Verbrauch ist für den Nutzer jederzeit sichtbar.
- Kein Run startet ohne verfügbares Kontingent.

## 8. Feature-Skizzen Phase 2 bis 4

- **Quellen-Adapter Config-first:** Ein "Plugin" ist zunächst nur eine Konfiguration: Endpoint, Auth (Header/Query/Basic), Intervall, JSONPath-Mapping auf das Signal-Schema, Testlauf-Button mit Vorschau. Das deckt die meisten Redaktions-APIs und Agentur-Feeds ab, ohne Code. Rezepte sind exportierbar und importierbar. Ein echtes Code-SDK kommt erst, wenn Config nachweislich nicht reicht.
- **Radar-Scoring:** Deterministisch mit konfigurierbaren Gewichten pro Quelle, Häufungs-Bonus (mehrere Quellen, dieselbe Entität, kurzes Zeitfenster), Beobachtungslisten-Bonus, Abklingfaktor über Zeit. Das Modell schreibt nur Hook und Blickwinkel für die Top N und ordnet nie die Rangfolge.
- **Jobs:** Ein Job ist Daten, keine Programmierung: `{zeitplan, quellen[], beobachtungsliste?, auftragstyp, parameter, brand_profil_version, output_ziel, budget}`. Auftragstypen v1: Ideen-Scan (erzeugt Ideen-Karten), Entwurfs-Erstellung (erzeugt Artikel in REVIEW NÖTIG, max. N pro Lauf), Digest (eine Zusammenfassung als E-Mail oder Feed-Eintrag).
- **Destinations-Templates:** SFTP- und REST-Destinations bekommen ein Template-Feld (z. B. XML-Vorlage mit Feld-Platzhaltern), damit exotische CMS-Importe ohne Code bedienbar sind.

## 9. Nicht-Ziele

- Kein eigenes CMS, keine Hosting-Plattform für Inhalte.
- Kein Social-Media-Publishing in v1.
- Keine Bild-Generierung in v1 (nur Platz für ein Beitragsbild-Feld).
- Keine Echtzeit-Koedition (Google-Docs-Stil) in v1.
- Keine Mobile-Apps, responsive Web reicht.
- Kein Modell-Finetuning; Markenstil entsteht über Brand-Profil und Kontext.
- Keine Mehrsprachigkeit der UI in v1 (Deutsch zuerst, i18n-fähig gebaut).

## 10. Architektur-Leitplanken

Details und Konventionen in CLAUDE.md. Hier nur die Entscheidungen mit Produktwirkung:

- **Stack:** Next.js (App Router) auf Vercel, TypeScript strict, Tailwind plus shadcn/ui, Postgres (Neon), Drizzle ORM, Auth.js, Inngest für Hintergrund-Jobs und Cron, Stripe für Billing, Anthropic API als primärer Modell-Provider hinter einer eigenen Provider-Abstraktion. Dazu Resend (Transaktionsmails), Sentry (Error-Tracking ab Phase 0), PostHog (Produkt-Analytics ab Phase 1) und Upstash (Rate Limiting).
- **Recherche im MVP:** Websuche des Modell-Providers, ausschließlich über den Provider-Layer. Die Quellenliste jedes Runs wird gespeichert und in der Detailansicht gezeigt. Eine eigene Fetch-Schicht mit Domain-Whitelist pro Workspace ist als Phase-2-Option vorgesehen.
- **Prompts sind Code:** Prompts liegen versioniert als Dateien im Repo, jeder Run speichert die verwendete Prompt-Referenz. Stiländerungen sind damit nachvollziehbar und rückrollbar wie Code-Änderungen.
- **Warum Inngest:** Agent-Runs und Jobs sind Step-Funktionen mit Retries, Timeouts und Persistenz pro Schritt. Genau das braucht die Pipeline aus 7.4, ohne eigene Queue-Infrastruktur zu betreiben.
- **Runs als Step-Pipeline:** Jeder Schritt persistiert Input-Referenz, Output, Dauer, Token, Kosten. Das ist die technische Grundlage der Transparenz-Differenzierung.
- **Multi-Tenancy:** workspace_id auf jeder fachlichen Tabelle, Zugriff ausschließlich über gescopte Query-Helper. Tenant-Isolation ist testpflichtig.
- **Credentials von Quellen und Zielen:** verschlüsselt at rest (Envelope Encryption), werden nie an den Client ausgeliefert, in Logs maskiert.
- **Kosten:** Token- und Kosten-Metering ab dem ersten Run. Budgets auf Run-, Job- und Workspace-Ebene sind Code-Gates.
- **Fail-closed überall:** Fehlende Daten erzeugen Platzhalter oder FEHLER, niemals stillschweigend generierten Ersatz.

## 11. Datenmodell (v1 Entwurf)

Fachliche Kerntabellen, alle mit `id`, `workspace_id`, `created_at`, `updated_at`:

- `workspaces` (name, plan, subscription_status, credit_balance)
- `users`, `memberships` (user_id, workspace_id, rolle)
- `brand_profiles` (name, felder als strukturierte JSON-Spalten, aktiv)
- `brand_profile_versions` (brand_profile_id, version, snapshot)
- `briefings` (felder aus 7.3, preset_id?, idea_id?, autor_kuerzel)
- `runs` (briefing_id?, job_id?, status, brand_profile_version_id, started_at, finished_at, tokens_in, tokens_out, cost_cents, error)
- `run_steps` (run_id, name, status, dauer_ms, output_ref, tokens, cost_cents)
- `articles` (run_id, status, kicker, titel, seo_titel, teaser, body_html, body_md, entitaeten JSON, quellen JSON, autor_kuerzel, claimed_by?)
- `article_versions` (article_id, snapshot, editor_user_id)
- `qa_reports` (article_id, checks JSON, findings JSON, offene_marker JSON, confidence_text)
- `sources` (typ, name, config JSON, credentials_ref, aktiv, intervall)
- `signals` (source_id, hash, titel, text, url, entitaeten JSON, raw JSON, ingested_at)
- `ideas` (score, pitch, artikeltyp, blickwinkel, signal_ids JSON, status, claimed_by?, snoozed_until?)
- `watchlists`, `watchlist_items` (typ: entitaet|keyword, wert, prio, aktiv, zuletzt_getroffen_at)
- `destinations` (typ, name, config JSON, credentials_ref, aktiv)
- `deliveries` (article_id, destination_id, status, versuche, letzter_fehler, payload_hash)
- `jobs` (name, cron, config JSON, brand_profile_id, budget_cents, aktiv, letzter_lauf_at)
- `job_runs` (job_id, status, ergebnis_zusammenfassung, cost_cents)
- `credit_ledger` (workspace_id, delta, grund, referenz)
- `audit_log` (actor, aktion, objekt, meta JSON)

## 12. Geschäftsmodell (Entwurf, zu validieren)

- **Free:** 1 Nutzer, 1 Brand-Profil, 5 Artikel-Credits pro Monat, nur Copy-Export. Zweck: Aha-Moment.
- **Solo (~29 EUR/Monat):** 1 Nutzer, 3 Brand-Profile, ~50 Credits, Webhook-Destination, Radar mit bis zu 3 Quellen.
- **Team (~99 EUR/Monat + Sitzpreis):** ab 3 Nutzer, unbegrenzte Profile, ~200 Credits, alle Destinations, Jobs, Rollen.
- Zusatz-Credits als Pakete. Preise sind Platzhalter; die Leitplanke ist, dass Modellkosten pro Credit inklusive Puffer unter 35 % des Credit-Preises bleiben.

## 13. Metriken

- **Activation:** Anteil neuer Workspaces mit erstem fertigen Artikel innerhalb von 15 Minuten nach Signup (Ziel > 40 %).
- **Kernnutzung:** Artikel pro aktiver Woche pro Workspace; Anteil BEREIT ohne manuelle Textänderung (Stil-Trefferquote).
- **Vertrauen:** Anteil Artikel, die aus REVIEW NÖTIG heraus fertiggestellt statt verworfen werden.
- **Wirtschaftlichkeit:** Modellkosten pro Artikel, Marge pro Plan, Credit-Verbrauchsquote.
- **Retention:** Workspaces mit Aktivität in Woche 4; Churn pro Plan.
- **Messwerkzeug:** Produkt-Events laufen ab Phase 1 in PostHog, damit Activation und Kernnutzung ohne Zusatzaufwand messbar sind. Kosten- und Margendaten kommen aus dem eigenen Metering.

## 14. Risiken und Gegenmaßnahmen

| Risiko                                   | Gegenmaßnahme                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Halluzinationen beschädigen Kundenmarken | Fail-closed-Platzhalter, Quellenpflicht, harte Verbote in QA, kein BEREIT mit offenen Markern, Redakteursfakten-Mechanik |
| Modellkosten fressen die Marge           | Metering ab Tag eins, Credits, Budgets als Code-Gates, Ziellängen-Steuerung, Modellwahl pro Schritt                      |
| CMS-Vielfalt macht Integrationen endlos  | Webhook-first, Templates statt Individual-Code, Zapier/Make-kompatibler Payload                                          |
| Ein-Personen-Projekt verzettelt sich     | Strikte Phasen mit Demo-Kriterien, Nicht-Ziele-Liste, Config vor Code                                                    |
| Generische Konkurrenz (AI-Writer)        | Positionierung auf Workflow, Transparenz und Guardrails; Zielgruppe Redaktionen statt Marketer                           |
| Vendor-Lock beim Modell-Provider         | Provider-Abstraktion im Code, Prompts modellneutral halten                                                               |
| Datenschutz-Bedenken bei Redaktionen     | EU-Datenhaltung, klare AVV-Story, keine Nutzung von Kundendaten für Training, Audit-Log                                  |

## 15. Entscheidungs-Log und offene Fragen

**Entschieden (25.07.2026):**

1. Recherche im MVP über die Websuche des Modell-Providers; eigene Fetch-Schicht mit Domain-Whitelist als Phase-2-Option.
2. Auth-Strategie: Magic Link via Resend zuerst, OAuth später.
3. Generisch bauen, vertikal vermarkten: Das Produkt bleibt branchenneutral, Landingpage und erste Design-Partner adressieren Fach- und Finanzmedien.
4. Produktname und Domain bewusst vertagt bis zum stehenden MVP (M3/M4), Arbeitstitel bleibt Deskwire.
5. Paketmanager: npm statt pnpm. Begründung: Vertrautheit und Standard-Tooling des Betreibers. Entschieden vor Task 1a (Phase 0).

**Offen:**

1. Rechtlicher Rahmen: Impressum, AGB, AVV, Gründungsform, und Abgrenzung zur Arbeitgeber-Tätigkeit sauber klären, bevor zahlende Kunden onboarden.
2. Preisvalidierung mit 5 bis 10 Zielkunden-Interviews vor Phase 2.

## 16. Grober Meilensteinplan

Als Nebenprojekt in Wochenblöcken gedacht, Reihenfolge fix, Dauer flexibel:

1. **M1:** Phase 0 komplett (Fundament, Auth, Tenancy, Stripe-Testmode).
2. **M2:** Brand-Profil plus Briefing plus Pipeline bis zum ersten intern generierten Artikel.
3. **M3:** QA, Feed, Review-Editor, Webhook-Destination. MVP-Demo-Kriterium mit externem Tester.
4. **M4:** Billing live, Landingpage, 3 bis 5 Design-Partner aus dem Netzwerk.
5. **M5:** Phase 2 (Quellen, Radar) auf Basis von Design-Partner-Feedback.
6. **M6:** Phase 3 (Jobs, Destinations), erste zahlende Kunden.

---

_Arbeitsregel für dieses Dokument: Änderungen am Umfang passieren hier zuerst, dann im Code. Jede Phase, die live ist, wird oben als erledigt markiert._
