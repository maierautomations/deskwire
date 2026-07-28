// German date and time formatting for brand profiles. Pure module, no
// database import, so the editor's client-facing modules can reach it.
//
// Every format is pinned to Europe/Berlin: the server renders in UTC on
// Vercel, and an unpinned formatter would show a different day (or hour) than
// the editor who saved it. This is machine voice — used in mono context only.

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

const timeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

export function formatBrandProfileDate(date: Date): string {
  return dateFormat.format(date);
}

// The editor's machine line (task 20a). It states the CURRENT version and
// when it was written — read from the version row, never from the profile's
// updated_at: a deduplicated save writes nothing at all (task 19), so the
// version's created_at is the single truth for "last really changed".
//
// With time on purpose (brand book 6.4, protocol voice): an editor saves
// several times a day, and two versions of the same day have to be
// distinguishable.
export function formatBrandProfileVersionLine(
  version: number,
  savedAt: Date,
): string {
  return `Version ${version}, gespeichert ${dateFormat.format(savedAt)}, ${timeFormat.format(savedAt)} Uhr`;
}
