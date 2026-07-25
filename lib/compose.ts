/**
 * Gmail compose deep-link helpers.
 *
 * One-click compose renders an outreach template (already deal- and cycle-aware
 * via renderTemplate in lib/data) and hands the result to Gmail's web compose
 * URL so a prefilled draft opens in one click. Everything is URL-encoded, and a
 * plain mailto: string is offered as a copy-to-clipboard fallback for clients
 * that do not use Gmail on the web.
 *
 * This module is intentionally free of "server-only" and of any DB access so it
 * can be imported from both server actions and (for the pure builders) shared
 * type contracts. The rendering itself stays in the server-only data layer.
 */

/** The pieces of a composed message, before they are turned into a link. */
export interface ComposedMessage {
  /** recipient email address, or null when the contact has none on file */
  to: string | null;
  subject: string;
  body: string;
}

/**
 * Build a Gmail web compose deep link:
 *   https://mail.google.com/mail/?view=cm&fs=1&to=...&su=...&body=...
 * Every field is encodeURIComponent'd. A null/empty `to` simply omits the
 * recipient so the draft still opens with the subject and body prefilled.
 */
export function gmailComposeUrl(message: ComposedMessage): string {
  const params: string[] = ["view=cm", "fs=1"];
  if (message.to) params.push(`to=${encodeURIComponent(message.to)}`);
  params.push(`su=${encodeURIComponent(message.subject)}`);
  params.push(`body=${encodeURIComponent(message.body)}`);
  return `https://mail.google.com/mail/?${params.join("&")}`;
}

/**
 * Plain mailto: fallback for the copy-to-clipboard path, so a non-Gmail client
 * still gets a prefilled draft. Same encoding rules as the Gmail link.
 */
export function mailtoUrl(message: ComposedMessage): string {
  const query: string[] = [];
  query.push(`subject=${encodeURIComponent(message.subject)}`);
  query.push(`body=${encodeURIComponent(message.body)}`);
  const to = message.to ? encodeURIComponent(message.to) : "";
  return `mailto:${to}?${query.join("&")}`;
}
