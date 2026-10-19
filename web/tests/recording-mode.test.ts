// Run: npm run test:recording (compiles lib/demo.ts with tsc, then runs this with node:test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskText } from "../lib/demo";

const sample = [
  "Sent. Message id wajo-msg-01HZX9 from fo-agent@mail.wajo.ai to someone@bank.example.",
  "Case case_0000aaaa11 reply from fo-standin@test.example (mailto:x@y.example).",
].join("\n");

test("off by default: keeps today's behaviour", () => {
  const out = maskText(sample, false);
  assert.match(out, /wajo-msg-01HZX9/);
  assert.match(out, /case_0000aaaa11/);
  assert.match(out, /fo-standin@test\.example/);
  assert.match(out, /Fo's address/);
  assert.match(out, /test bank inbox/);
});

test("recording mode: no '@', no wajo- ids, no case ids", () => {
  const out = maskText(sample, true);
  assert.equal(out.includes("@"), false, out);
  assert.equal(/wajo-/i.test(out.replace(/Fo's address/g, "")), false, out);
  assert.equal(/case_[0-9a-z]{4,}/i.test(out), false, out);
  assert.match(out, /\[id hidden\]/);
  assert.match(out, /test bank inbox/);
});

test("recording mode: a stray '@' that is not an email is still removed", () => {
  assert.equal(maskText("meet @ 5pm, ref wajo-abc,", true), "meet  at  5pm, ref [id hidden],");
});

test("empty input", () => {
  assert.equal(maskText(undefined, true), "");
  assert.equal(maskText("", false), "");
});
