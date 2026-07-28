import type { BrandProfileFields } from "@/lib/brand-profile/schema";

// A fully populated profile with EVERY group filled, written in canonical form
// (trimmed, deduplicated, every value within its limit). Canonical on purpose:
// parsing it must return it unchanged, which makes it usable as both the
// "all groups at once" case of the schema matrix and the expected value of the
// jsonb roundtrip — one fixture, no second source of truth.
//
// Ids are fixed literals, not randomUUID(): a fixture that changes per run
// cannot be asserted byte-for-byte after a database roundtrip.
export const FULL_BRAND_PROFILE_FIELDS: BrandProfileFields = {
  schema_version: 1,
  zielgruppe:
    "Anlegerinnen und Anleger mit Grundwissen, die Wirtschaftsnachrichten täglich verfolgen.",
  tonalitaet: "Nüchtern und präzise, ohne Superlative.",
  dos: "Zahlen immer mit Quelle nennen. Fachbegriffe beim ersten Vorkommen erklären.",
  donts: "Keine Ausrufezeichen. Keine rhetorischen Fragen in der Überschrift.",
  harte_verbote:
    "Keine Kauf- oder Verkaufsempfehlung. Keine Kursprognose als Tatsache.",
  stil_fingerabdruck:
    "Sätze unter 20 Wörtern, Aktiv statt Passiv, ein Gedanke pro Absatz.",
  pflichtelemente: [
    {
      id: "3f1b6a90-1c2d-4e3f-8a5b-6c7d8e9f0a1b",
      text: "Transparenzhinweis: Die Redaktion hält keine eigenen Positionen.",
      position: "start",
    },
    {
      id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d",
      text: "Dieser Text wurde mit KI-Unterstützung erstellt und redaktionell geprüft.",
      position: "end",
    },
  ],
  formatregeln: {
    max_kicker_zeichen: 30,
    max_titel_zeichen: 70,
    max_seo_titel_zeichen: 60,
    max_teaser_zeichen: 200,
    keine_relativen_zeitangaben: true,
  },
  verbotene_begriffe: ["Kursrakete", "Blitzcrash", "Anleger sollten jetzt"],
  bevorzugte_begriffe: ["Anleihe", "Emittentin"],
  // Newlines and umlauts on purpose: the jsonb roundtrip has to preserve both.
  beispieltexte: [
    "Erster Beispieltext, Absatz eins.\n\nAbsatz zwei mit Umlauten: ä ö ü ß.",
    "Zweiter Beispieltext, eine einzelne Zeile.",
  ],
};
