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
  if (SENDER_OK.test(addr.trim())) return RECORDING_MODE ? FO_LABEL : addr;
  return RECIPIENT_LABEL;
}

/** Recording mode, for an unedited screen recording. Off by default; NEXT_PUBLIC_RECORDING_MODE=1 turns it on.
 *  It hides case ids, Fo conversation ids, the API pill and the audit Case and Detail columns, and it masks
 *  every email-shaped string (including our own sender) and every id-shaped token in free text. Display-only. */
export const RECORDING_MODE = ["1", "true", "on", "yes"].includes((process.env.NEXT_PUBLIC_RECORDING_MODE ?? "").toLowerCase());

// Id-shaped tokens that must never reach the screen in recording mode.
const WAJO_ID_RE = /wajo-[^\s"'<>,;)\]]+/gi;
const CASE_ID_RE = /\bcase_[0-9a-z]{4,}\b/gi;
const ID_LABEL = "[id hidden]";

/** Pure masking rule, exported for tests. `recording` adds the stricter recording-mode rules. */
export function maskText(text: string | null | undefined, recording: boolean): string {
  if (!text) return "";
  let out = text.replace(EMAIL_RE, (m) =>
    !recording && /^fo-standin@test\.example$/i.test(m) ? m
      : FO_DOMAIN.test(m) || /^fo-standin@test\.example$/i.test(m) ? FO_LABEL : RECIPIENT_LABEL);
  if (recording) out = out.replace(WAJO_ID_RE, ID_LABEL).replace(CASE_ID_RE, ID_LABEL).replace(/@/g, " at ");
  return out;
}

/** Mask every non-sender email address embedded in free text (bodies, details, action messages).
 *  In recording mode it also masks our own sender address, Fo message ids and case ids, and any stray '@'. */
export function maskEmails(text: string | null | undefined): string {
  return maskText(text, RECORDING_MODE);
}
