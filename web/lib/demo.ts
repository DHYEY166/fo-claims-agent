// Demo-safety display rules. Display-only: the data from the API is never changed.
import type { CaseEvent } from "./types";

/** Hide call-kind events and call transcripts from the timeline (the demo is email-only).
 *  On by default; set NEXT_PUBLIC_DEMO_HIDE_CALLS=false to show them. */
export const DEMO_HIDE_CALLS = !["false", "0", "off"].includes((process.env.NEXT_PUBLIC_DEMO_HIDE_CALLS ?? "").toLowerCase());

export function isCallEvent(e: CaseEvent) {
  return e.kind === "call_placed" || /^call/.test(String(e.kind));
}

/** What every outbound recipient address is shown as. The raw address is never rendered. */
export const RECIPIENT_LABEL = "test bank inbox";

// Our own sending identity may be shown; any other address is treated as a recipient and masked.
const SENDER_OK = /^(fo-standin@test\.example|fo@wajo.*)$/i;
// Fo's own (real) sending address is not shown in free text either; it reads as "Fo's address".
const FO_DOMAIN = /@(?:[\w-]+\.)*wajo(?:\.[\w-]+)*$/i;
const FO_LABEL = "Fo's address";
const EMAIL_RE = /(?:mailto:|mock:)?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Mask a single address field (to / cc / reply-from). */
export function maskAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  return SENDER_OK.test(addr.trim()) ? addr : RECIPIENT_LABEL;
}

/** Mask every non-sender email address embedded in free text (bodies, details, action messages). */
export function maskEmails(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(EMAIL_RE, (m) => (/^fo-standin@test\.example$/i.test(m) ? m : FO_DOMAIN.test(m) ? FO_LABEL : RECIPIENT_LABEL));
}
