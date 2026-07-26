// Copy for the auth error page, extracted for unit testing. Every entry
// follows brand book 4.3 rule 4: explain what happened and name the next
// step, never apologize, never obscure.
//
// Code mapping (verified against @auth/core 0.41.3):
// - "AccessDenied" is what MagicLinkSendError surfaces as; in this app it
//   can only mean a failed magic-link send (no signIn callback exists,
//   enforced by tests/auth/auth-config.test.ts).
// - "Verification" is thrown by Auth.js itself for an expired or already
//   used magic link.
// - Everything else (including "Configuration") is a server-side problem
//   with no action the user could take besides retrying later.

export type AuthErrorContent = {
  title: string;
  explanation: string;
  action: string;
};

export function authErrorContent(code: string | undefined): AuthErrorContent {
  switch (code) {
    case "AccessDenied":
      return {
        title: "Anmelde-Mail nicht verschickt",
        explanation:
          "Die Anmelde-Mail konnte nicht verschickt werden. Du hast keine E-Mail bekommen und es ist nichts weiter passiert. Versuch es in ein paar Minuten erneut.",
        action: "Erneut anmelden",
      };
    case "Verification":
      return {
        title: "Anmeldelink ungültig",
        explanation:
          "Der Anmeldelink ist abgelaufen oder wurde schon verwendet. Jeder Link funktioniert genau einmal und ist 24 Stunden gültig. Fordere einen neuen Link an.",
        action: "Neuen Link anfordern",
      };
    default:
      return {
        title: "Anmeldung nicht möglich",
        explanation:
          "Die Anmeldung ist gerade nicht möglich. Das Problem liegt auf unserer Seite, nicht an deinen Eingaben. Versuch es später erneut.",
        action: "Erneut versuchen",
      };
  }
}
