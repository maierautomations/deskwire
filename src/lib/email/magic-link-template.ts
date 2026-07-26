// Magic-link mail as a pure template function, testable without any mocks.
//
// Two documented exceptions to the usual token rules (docs/brand-book.md 8.1):
// email clients support neither CSS custom properties nor self-hosted fonts,
// so the brand colors from brand book 5.2 appear here as named hex constants
// and the type roles from 5.3 as system font stacks. Layout is a single
// centered table with inline styles: Gmail would render a div layout fine,
// but Outlook for Windows applies max-width only to tables, so the table is
// what holds up everywhere (border-radius degrades to square corners there,
// nothing breaks).

const color = {
  paper: "#f6f6f2",
  paperRaised: "#ffffff",
  ink: "#1c1c1a",
  inkSoft: "#55544e",
  line: "#dddcd4",
  rubric: "#a8232d",
} as const;

const font = {
  display: "Besley, Georgia, 'Times New Roman', serif",
  body: "'Public Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', Consolas, Menlo, monospace",
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type MagicLinkEmail = {
  subject: string;
  text: string;
  html: string;
};

export function magicLinkEmail({ url }: { url: string }): MagicLinkEmail {
  const subject = "Dein Anmeldelink für Deskwire";

  const text = [
    "Hallo,",
    "",
    "klick auf diesen Link, um dich bei Deskwire anzumelden:",
    "",
    url,
    "",
    "Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.",
    "",
    "Wenn du diese Anmeldung nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.",
  ].join("\n");

  const safeUrl = escapeHtml(url);

  // The button is the single rubric-red element of this view (brand book
  // 5.2). Everything else stays paper, ink and line. The fallback URL is
  // wrapped in an explicitly styled <a>: mail clients auto-link bare URLs
  // in their own link blue otherwise, which would compete with the CTA.
  // Its 13px mono is the brand-book floor ("Mono nie unter 13px").
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${color.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.paper};">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
<tr>
<td style="padding:0 4px 12px;font-family:${font.display};font-size:19px;font-weight:600;color:${color.ink};">Deskwire</td>
</tr>
<tr>
<td style="background-color:${color.paperRaised};border:1px solid ${color.line};border-radius:6px;padding:32px;">
<h1 style="margin:0 0 12px;font-family:${font.display};font-size:24px;line-height:30px;font-weight:600;color:${color.ink};">Dein Anmeldelink</h1>
<p style="margin:0 0 24px;font-family:${font.body};font-size:16px;line-height:24px;color:${color.ink};">Klick auf den Button, du wirst direkt angemeldet.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="border-radius:6px;background-color:${color.rubric};">
<a href="${safeUrl}" style="display:inline-block;padding:12px 24px;font-family:${font.body};font-size:16px;line-height:24px;font-weight:600;color:${color.paperRaised};text-decoration:none;border-radius:6px;">Jetzt anmelden</a>
</td>
</tr>
</table>
<p style="margin:24px 0 0;font-family:${font.body};font-size:15px;line-height:22px;color:${color.inkSoft};">Der Link ist 24 Stunden gültig und kann nur einmal verwendet werden.</p>
<p style="margin:16px 0 0;font-family:${font.body};font-size:13px;line-height:20px;color:${color.inkSoft};">Falls der Button nicht funktioniert, kopier diesen Link in deinen Browser:</p>
<p style="margin:8px 0 0;font-family:${font.mono};font-size:13px;line-height:20px;word-break:break-all;"><a href="${safeUrl}" style="color:${color.inkSoft};text-decoration:underline;">${safeUrl}</a></p>
</td>
</tr>
<tr>
<td style="padding:16px 4px 0;font-family:${font.body};font-size:13px;line-height:20px;color:${color.inkSoft};">Wenn du diese Anmeldung nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
