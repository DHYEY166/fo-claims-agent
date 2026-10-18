// Run: npm run test:unit (compiles lib/escalationCopy.ts to /tmp, then node --test)
import test from "node:test";
import assert from "node:assert/strict";
const { escalationFooter } = await import(process.env.ESC_COPY_JS);

test("case that already sent says handed back to you, never 'before contacting anyone' or EA", () => {
  const s = escalationFooter({ held: false, unconfirmed: false, alreadySent: true });
  assert.match(s, /handed the case back to you/);
  assert.doesNotMatch(s, /before contacting anyone|human EA/);
});
test("sent wins even if a later step was held or unconfirmed", () => {
  for (const held of [true, false]) for (const unconfirmed of [true, false])
    assert.match(escalationFooter({ held, unconfirmed, alreadySent: true }), /back to you/);
});
test("nothing sent keeps the old lines", () => {
  assert.match(escalationFooter({ held: true, unconfirmed: false, alreadySent: false }), /nothing was sent/);
  assert.match(escalationFooter({ held: false, unconfirmed: true, alreadySent: false }), /didn't confirm a send/);
  assert.match(escalationFooter({ held: false, unconfirmed: false, alreadySent: false }), /before contacting anyone/);
});
