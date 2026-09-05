// R28 / AE8: a fixture with known complexity must produce a finding at threshold 1, and a
// rule that reports nothing must make that assertion fail. The second half proves the
// package's own self-lint (KTD13) is wired through eslint.config.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

import { rule } from "../../src/index.js";
import { RULE_ID, lint, readFixture } from "./helpers.js";

const NEGATIVE_CONTROL = readFixture("negative-control.ts");

/** The assertion the negative control makes; shared so the mutation check runs the same one. */
function assertExactlyOneFinding(messages) {
  assert.equal(messages.length, 1, `expected exactly one finding, got ${messages.length}`);
  assert.equal(messages[0].messageId, "functionComplexity");
  assert.equal(messages[0].ruleId, RULE_ID);
}

test("AE8: the negative-control fixture scoring 2 yields exactly one functionComplexity finding at threshold 1", () => {
  assertExactlyOneFinding(lint(NEGATIVE_CONTROL, { threshold: 1 }));
});

test("AE8: a stubbed rule that reports nothing makes the negative-control assertion fail", () => {
  const stub = { meta: rule.meta, create: () => ({}) };
  const messages = lint(NEGATIVE_CONTROL, { threshold: 1 }, { ruleImpl: stub });
  assert.equal(messages.length, 0, "the stub must report nothing for the check to be meaningful");
  assert.throws(() => assertExactlyOneFinding(messages), assert.AssertionError);
});

test("the negative control's finding sits on the function name", () => {
  const [message] = lint(NEGATIVE_CONTROL, { threshold: 1 });
  assert.deepEqual([message.line, message.column], [2, 17]);
});

test("the repository's eslint.config.js runs the rule on src/ (a planted file scoring above 15 is reported)", async () => {
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const eslint = new ESLint({ cwd: repoRoot });
  const planted = `export function planted(a) {\n  let n = 0;\n${"  if (a) n++;\n".repeat(16)}  return n;\n}\n`;
  const [result] = await eslint.lintText(planted, { filePath: "src/planted-negative-control.js" });
  const findings = result.messages.filter((message) => message.ruleId === RULE_ID);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 2);
  assert.match(findings[0].message, /^planted: cognitive complexity 16 exceeds 15\n/);
});
