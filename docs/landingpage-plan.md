# Landingpage und Branding: Deskwire (Arbeitstitel)

| | |
|---|---|
| Status | Draft v1.1 |
| Datum | 25.07.2026 |
| Zweck | Bauplan der Landingpage (Konzept, Copy, Frontend, Backend). Ablage im Repo als docs/landingpage-plan.md. Das Branding lebt vollständig in docs/brand-book.md, dieses Dokument enthält keine eigenen Design-Werte mehr. |

---

## Teil A: Branding-Fundament

Dieser Teil ist umgezogen: Das vollständige Branding (Strategie, Richtungsentscheid, Farben, Typografie, Motive, Tonalität, Anti-Slop-Charter) lebt in **docs/brand-book.md** und ersetzt die frühere Fassung dieses Teils. Hier werden bewusst keine Design-Werte dupliziert, damit nichts driftet.

Kurzanker für dieses Dokument: Richtung "Der Korrekturabzug", Fundament Andruckweiß mit Tinte, Akzent Rubrikrot mit der Ein-Rot-Regel (ein rotes Element pro Viewport), Schriften Besley, Public Sans und IBM Plex Mono, Signatur ist der rote Marker, Motive sind Korrekturzeichen nach DIN 16511 und Passermarken. Alle Werte, Regeln und Begründungen: Brand Book Kapitel 5 bis 7.

---

## Teil B: Landingpage-Blueprint

### B1. Ziel und Erfolgsmessung

Ein primäres Ziel: **Wartelisten-Eintrag.** Ein sekundäres: **Design-Partner-Interesse** (Checkbox im selben Formular, kein zweiter Funnel). Messung: PostHog-Events `waitlist_view`, `waitlist_submit`, `waitlist_confirmed`, Conversion-Ziel Seitenaufruf zu bestätigtem Eintrag über 5 %.

### B2. Seitenstruktur mit Copy-Entwürfen

Alle Texte sind Startpunkte in Markensprache, zum Verfeinern freigegeben. Gestaltungsregel für alle Sections: Übergänge nutzen die Passermarken-Interpunktion aus Brand Book 5.4 und 5.5 statt generischer Divider, und pro Viewport bleibt genau ein rotes Element.

**1. Header**
Wortmarke mit Freigabe-Haken (Brand Book 5.1) links, rechts ein einziger Link als Anker auf das Formular: "Warteliste". Kein Menü, die Seite hat ein Ziel.

**2. Hero**
- Eyebrow (Mono, klein): `Für Redaktionen, die KI ernsthaft nutzen wollen`
- H1 (Serif), Favorit: **"Artikel, die deine Redaktion verantworten kann."**
  - Alternative 1: "Von der Idee zum geprüften Artikel. In deinem Stil."
  - Alternative 2: "KI-Tempo. Redaktions-Standards."
- Subline: "Deskwire führt Briefing, Recherche, Entwurf und Prüfung in einem Werkzeug zusammen. Die Maschine schreibt im Stil deiner Marke, markiert ehrlich, was sie nicht belegen kann, und nichts geht ohne deine Freigabe raus."
- CTA: E-Mail-Feld plus Button "Auf die Warteliste". Microcopy darunter: "Eine Mail zum Start, vorher höchstens eine. Kein Spam."
- Visual rechts oder darunter: abstrahiertes Feed-Mockup mit drei Einträgen (BEREIT, REVIEW NÖTIG, ONLINE) und einem geöffneten Artikel, in dem genau ein roter Marker steht: `[einsetzen: Kurs, Währung, Zeitpunkt]`.

**3. Problem (redaktionelle Zwischenzeile)**
Überschrift: "KI schreibt schnell. Aber wer prüft, was sie behauptet?"
Drei knappe Absätze statt Icon-Karten: (1) Prompt-Chaos ohne Workflow: Texte entstehen in Chat-Tabs, ohne Status, ohne Nachvollziehbarkeit. (2) Generischer Stil: Jede KI klingt gleich, dein Blatt nicht. (3) Blindes Vertrauen: Behauptungen ohne Quellen sind für eine Redaktion keine Zeitersparnis, sondern ein Risiko.

**4. So funktioniert es (drei Schritte)**
Überschrift: "Briefen. Prüfen. Freigeben."
1. **Briefen statt prompten.** Strukturierte Aufträge mit Presets, Artikeltyp und deinen verifizierten Fakten.
2. **Die Maschine arbeitet.** Recherchiert mit gespeicherten Quellen, schreibt im Brand-Profil, prüft sich selbst und markiert offene Punkte.
3. **Du entscheidest.** Review mit QA-Report, Freigabe per Klick, Übergabe an dein CMS.
Visuelles Element: die Status-Pipeline als Zeile in Mono: ENTWURF → REVIEW NÖTIG → BEREIT → ONLINE.

**5. Kontrolle (Kern-Sektion, bekommt den meisten Raum)**
Überschrift: "Kontrolle ist kein Feature. Sie ist das Fundament."
Stilles Motiv neben der Überschrift: ein einzelnes Korrekturzeichen in Rubrikrot (Brand Book 5.5).
Vier Punkte, jeweils zwei Sätze:
- **Ehrliche Lücken.** Was nicht belegt ist, wird zum Marker, nicht zur Behauptung. Ein Artikel mit offenem Marker kann technisch nicht freigegeben werden.
- **Prüfbericht statt Blackbox.** Jeder Artikel zeigt Quellen, bestandene Checks, Findings und eine Einschätzung der Faktenlage.
- **Dein Stil als Regelwerk.** Pflichtelemente wie KI-Kennzeichnung und Disclaimer werden erzwungen, nicht erhofft.
- **Kein stiller Autopilot.** Automatisierung liefert Entwürfe. Veröffentlicht wird, wenn ein Mensch es entscheidet.

**6. Brand-Profil**
Überschrift: "Dein Hausstil. Einmal definiert, überall angewendet."
Kurztext plus Mini-Visual: eine Karte "Brand-Profil v3" mit Beispielregeln (Tonalität, verbotene Begriffe, Pflicht-Disclaimer).

**7. Für wen**
Überschrift: "Gebaut für Redaktionen jeder Größe."
Drei Zeilen: Fachmedien und Special-Interest-Portale. Corporate Newsrooms und Content-Teams. Solo-Publisher mit hohem Anspruch.

**8. Design-Partner**
Überschrift: "Wir bauen Deskwire mit fünf Redaktionen. Eine davon kann deine sein."
Text: kostenloser Zugang in der Aufbauphase, direkter Draht, dein Feedback formt das Produkt. Umsetzung als Checkbox im Wartelisten-Formular: "Ich habe Interesse, Design-Partner zu werden."

**9. FAQ (Accordion, sechs Fragen)**
- Wo liegen meine Daten? (EU, Frankfurt. Keine Nutzung für Modell-Training.)
- Funktioniert das mit unserem CMS? (Übergabe per Webhook an jedes System, weitere Wege folgen.)
- Ersetzt Deskwire Redakteure? (Nein. Es ersetzt Copy-Paste und Prompt-Chaos. Die Verantwortung bleibt, wo sie hingehört.)
- Was kostet es? (Preise kommen zum Launch, die Warteliste erfährt sie zuerst.)
- Wann geht es los? (Aufbau läuft, Design-Partner starten zuerst.)
- Welche KI steckt dahinter? (Führende Modelle über eine kontrollierte Pipeline, jede Ausgabe wird geprüft und protokolliert.)

**10. Abschluss-CTA**
Wiederholung des Formulars mit einer Zeile: "Schreib den ersten geprüften Artikel, bevor es alle tun."

**11. Footer**
Wortmarke mit Tagline "Die Maschine schreibt. Du zeichnest frei." (Brand Book 4.2), dazu Impressum, Datenschutz und Kontakt-Mail. Impressum und Datenschutz sind Pflicht vor Livegang, siehe C4.

---

## Teil C: Technischer Bauplan

### C1. Architektur-Einordnung

- Gleiche Codebasis, eigener Bereich: Route Group `src/app/(marketing)/` mit eigener `layout.tsx` (ohne App-Chrome), Landingpage als `page.tsx` unter `/`. Die spätere App lebt in `(app)`. Ein Repo, ein Deployment, geteilte Tokens.
- Rendering: statisch (SSG), keine Client-Komponenten außer Formular und Accordion. Ziel: Lighthouse 95 plus auf Performance, SEO, Accessibility.
- SEO-Basics: Metadata API (Title, Description), ein generiertes OG-Image im Markenlook (Besley-Headline auf Andruckweiß mit genau einem roten Marker, Brand Book 5.2 und 5.3), sitemap.ts, robots.ts.
- Analytics: PostHog in der EU-Cloud, cookieless konfiguriert (memory persistence, kein Tracking-Cookie). Damit braucht die Seite kein Cookie-Banner. Events aus B1.

### C2. Waitlist-Backend

- **Tabelle `waitlist_signups`:** id, email (unique, citext oder lowercased), wants_design_partner (boolean), source (text, z. B. utm), confirm_token (unique), confirmed_at (nullable), created_at. Bewusst ohne workspace_id: Marketing-Tabellen sind die dokumentierte Ausnahme von der Tenant-Regel, wird als Kommentar im Schema und in CLAUDE.md unter Stand vermerkt.
- **Eingang:** Server Action mit Zod-Validierung (E-Mail-Format, Checkbox boolean, Honeypot-Feld muss leer sein).
- **Schutz:** Upstash Ratelimit auf die Action (z. B. 5 Requests pro Minute pro IP) plus Honeypot. Duplikate: bei bereits vorhandener E-Mail keine Fehlermeldung, sondern dieselbe Erfolgsantwort (kein E-Mail-Enumeration-Leck).
- **Double-Opt-in:** Nach Eintrag Resend-Mail im Markenton mit Bestätigungslink `/warteliste/bestaetigen?token=...`, Route Handler setzt confirmed_at. Nur bestätigte Einträge zählen und werden je angeschrieben. Das ist die DSGVO-saubere Variante und Pflicht, bevor die Liste je eine Marketing-Mail bekommt.
- **Events:** PostHog capture serverseitig bei submit und confirmed.

### C3. Umsetzungs-Tasks (in Reihenfolge, je eine Session)

1. **Tokens und Fundament:** Fonts via next/font, CSS-Variablen und Typoskala aus Brand Book 5.2 und 5.3, Tailwind-Theme, `src/lib/brand.ts` als Namens-Token (Brand Book 8.2), Marketing-Route-Group mit Basis-Layout und Wortmarke samt Freigabe-Haken.
2. **Statische Sections:** alle Sections aus B2 mit finaler Copy, Feed-Mockup und Marker-Motiv als HTML/CSS, responsive, Accordion für FAQ.
3. **Waitlist-Backend:** Migration, Server Action, Rate Limit, Honeypot, Double-Opt-in mit Resend, Bestätigungsseite, Tests für Validierung und Duplikat-Verhalten.
4. **Messung und SEO:** PostHog-Events, Metadata, OG-Image, sitemap, robots, Lighthouse-Pass.
5. **Rechtliches und Livegang:** Impressums- und Datenschutzseite einhängen (Inhalte siehe C4), Deploy auf Vercel, Domain.

### C4. Rechtliches vor Livegang (nicht verhandelbar)

- **Impressumspflicht** gilt in DE auch für eine Warteliste-Seite. Impressum und Datenschutzerklärung über einen etablierten Generator oder Anwalt erstellen, nicht von der KI formulieren lassen.
- **Double-Opt-in** wie in C2, plus Hinweis am Formular, wofür die E-Mail genutzt wird, mit Link auf die Datenschutzerklärung.
- **Livegang-Gate:** Die Seite geht erst online, wenn (a) der finale Name samt Domain steht und (b) Impressum und Datenschutz stehen. Bis dahin existiert sie als gebaute Route hinter Vercel Deployment Protection.

### C5. Kickoff-Prompt für Claude Code (Plan-Modus, eigene Session)

```text
Lies CLAUDE.md, docs/brand-book.md und docs/landingpage-plan.md vollständig. Nutze für alle UI-Arbeit den frontend-design-Skill. Rangfolge bei Konflikten: brand-book.md, dann frontend-design-Skill, dann dieser Plan. Wende vor jedem Task-Abschluss die Pflicht-Checks aus Brand Book Kapitel 7 an.

Kontext: Wir bauen die Marketing-Landingpage als abgegrenzten Einschub. Der Phase-0-Stand darf nicht angefasst werden, außer dort, wo der Plan es nennt (Schema-Migration für waitlist_signups, neue Route Group). Diese Session läuft im Plan-Modus.

Dein Auftrag:
1. Maximal 5 planverändernde Fragen, dann warte auf Antworten.
2. Arbeite einen Umsetzungsplan entlang der Tasks in Teil C3 aus (pro Task: Dateien, Env-Variablen, Testansatz, Definition of Done) und präsentiere ihn.
3. Nach meiner Freigabe ist dein einziger Schreibschritt, den Plan als docs/landingpage-tasks.md abzulegen.
```

---

## Teil D: Offene Entscheidungen

1. **Design-Richtung:** entschieden über docs/brand-book.md (Richtung "Der Korrekturabzug": Andruckweiß, Rubrikrot, Besley plus Public Sans plus IBM Plex Mono). Offen ist nur noch das Abnicken des Brand Books selbst.
2. **H1-Favorit bestätigen** oder Alternative wählen. Tagline laut Brand Book 4.2: "Die Maschine schreibt. Du zeichnest frei."
3. **Timing:** Bau als Einschub direkt nach Phase-0-Abnahme (Tasks 1 bis 4), Livegang erst nach Namensentscheidung plus Impressum. (Empfehlung: so.)
4. **Namensfrage:** Prozess und Kandidaten stehen in Brand Book 4.1 (Deskwire als Kandidat eins, Andruck als Kandidat zwei, vier Checks vor der Entscheidung). Spätestens nach M2 entscheiden, wenn früh gesammelt werden soll.
