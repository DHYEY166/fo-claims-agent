/** Footer line under the escalation banner. Says only what the case's events show. */
export function escalationFooter(o: { held: boolean; unconfirmed: boolean; alreadySent: boolean }): string {
  if (o.alreadySent) return "The agent already emailed the test bank inbox on this case. It stopped there and handed the case back to you.";
  if (o.held) return "Fo drafted the email but nothing was sent. Handed to a human EA.";
  if (o.unconfirmed) return "Fo's reply didn't confirm a send, so the agent isn't assuming one. Handed to a human EA.";
  return "The agent stopped before contacting anyone and handed this to a human EA.";
}
