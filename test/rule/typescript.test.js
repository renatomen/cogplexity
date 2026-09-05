// The rule under @typescript-eslint/parser: options (KTD5), messages (KTD6), root-only
// reporting (KTD7), the scoping helper (R22) and the plugin object.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { ESLint } from "eslint";
import { parse, parseForESLint } from "@typescript-eslint/parser";

import plugin, { plugin as namedPlugin, rule, score, scoped } from "../../src/index.js";
import { normalizeOptions } from "../../src/rule.js";
import {
  RULE_ID,
  breakdownLine,
  breakdownOf,
  expectedError,
  expectedErrors,
  languageOptions,
  lint,
  readFixture,
  readSpecFixture,
  ruleTester,
} from "./helpers.js";

const PARSER_OPTIONS = { range: true, loc: true, sourceType: "module", ecmaVersion: "latest" };
const SPEC_FIXTURES = readdirSync(new URL("../fixtures/spec/", import.meta.url)).filter((name) => name.endsWith(".ts"));

function root(result, name) {
  const entry = result.functions.find((fn) => fn.name === name && fn.parent === null);
  assert.ok(entry, `no root function named ${name}`);
  return entry;
}

// --- AE9: the rule and score() agree on every spec fixture --------------------------------

{
  const valid = [];
  const invalid = [];
  for (const name of SPEC_FIXTURES) {
    const code = readSpecFixture(name);
    const { ast, scopeManager } = parseForESLint(code, PARSER_OPTIONS);
    const errors = expectedErrors(score(ast, code, { scopeManager }), 0);
    const testCase = { name: `AE9: ${name} reports every root function with the score score() returns`, code, options: [{ threshold: 0 }] };
    if (errors.length === 0) {
      valid.push(testCase);
    } else {
      invalid.push({ ...testCase, errors });
    }
  }
  ruleTester.run("cognitive-complexity", rule, { valid, invalid });
}

test("the rule terminates under ESLint on every spec fixture, whose nodes carry parent back-references", () => {
  for (const name of SPEC_FIXTURES) {
    const probe = { parents: 0 };
    const probeRule = {
      create: (context) => ({
        "Program > *"(node) {
          if (node.parent === context.sourceCode.ast) {
            probe.parents++;
          }
        },
      }),
    };
    const messages = lint(readSpecFixture(name), { threshold: 0 }, { extraRules: { probe: probeRule } });
    assert.ok(Array.isArray(messages), `${name}: lint did not complete`);
    assert.ok(probe.parents > 0, `${name}: ESLint attached no parent back-references`);
  }
});

// --- scope manager pass-through -----------------------------------------------------------

{
  const code = readSpecFixture("recursion.ts");
  const bare = score(parse(code, PARSER_OPTIONS), code);
  const recursive = bare.functions.filter((fn) => fn.increments.some((inc) => inc.construct === "recursion"));
  assert.ok(recursive.length >= 5, "recursion.ts should hold several recursion cycles");
  ruleTester.run("cognitive-complexity", rule, {
    valid: [],
    invalid: [
      {
        name: "recursion.ts yields the same recursion increments under ESLint's scope manager as score() resolves on its own",
        code,
        options: [{ threshold: 0 }],
        errors: expectedErrors(bare, 0),
      },
    ],
  });
}

// --- AE6: the breakdown is complete by default and capped by topContributors -------------

{
  const code = readFixture("thirty-increments.ts");
  const thirty = root(score(parse(code, PARSER_OPTIONS), code), "thirty");
  assert.equal(thirty.score, 50);
  assert.equal(thirty.increments.length, 30);
  const full = breakdownOf(thirty);
  assert.equal(full.split("\n").length - 1, 30, "the uncapped breakdown has one line per increment");
  ruleTester.run("cognitive-complexity", rule, {
    valid: [],
    invalid: [
      {
        name: "AE6: a function scoring 50 with 30 increments reports all 30 breakdown lines when no cap is set",
        code,
        options: [{ threshold: 0 }],
        errors: [{ messageId: "functionComplexity", data: { name: "thirty", score: 50, threshold: 0, breakdown: full }, line: 3, column: 17 }],
      },
      {
        name: "AE6: topContributors 3 keeps the three largest increments by amount and appends a '… 27 more' line",
        code,
        options: [{ threshold: 0, topContributors: 3 }],
        errors: [
          {
            messageId: "functionComplexity",
            data: {
              name: "thirty",
              score: 50,
              threshold: 0,
              breakdown: "\n+5 (incl. 4 nesting) if at 9:11\n+4 (incl. 3 nesting) if at 8:9\n+3 (incl. 2 nesting) if at 7:7\n… 27 more",
            },
            line: 3,
            column: 17,
          },
        ],
      },
    ],
  });
}

test("the '… k more' line is omitted when topContributors covers every increment", () => {
  const code = readFixture("pinned-message.ts");
  const f = root(score(parse(code, PARSER_OPTIONS), code), "f");
  assert.equal(breakdownOf(f, 3), breakdownOf(f));
  const [message] = lint(code, { threshold: 0, topContributors: 3 });
  assert.ok(!message.message.includes("more"), message.message);
});

// --- KTD5: option normalisation -----------------------------------------------------------

test("normalizeOptions turns a bare 20 into threshold 20 with templateThreshold 15", () => {
  assert.deepEqual(normalizeOptions(20), { threshold: 20, templateThreshold: 15 });
});

test("normalizeOptions keeps templateThreshold 15 when only threshold 10 is given", () => {
  assert.deepEqual(normalizeOptions({ threshold: 10 }), { threshold: 10, templateThreshold: 15 });
});

test("normalizeOptions keeps threshold 15 when only templateThreshold false is given", () => {
  assert.deepEqual(normalizeOptions({ templateThreshold: false }), { threshold: 15, templateThreshold: false });
});

test("normalizeOptions leaves topContributors undefined when it is not given", () => {
  assert.equal(normalizeOptions(undefined).topContributors, undefined);
  assert.equal(normalizeOptions({ topContributors: 4 }).topContributors, 4);
});

{
  const code = readFixture("boundary.ts");
  const result = score(parse(code, PARSER_OPTIONS), code);
  /** The source of one fixture function on its own, so each case holds exactly one root. */
  const only = (name) => {
    const start = code.indexOf(`export function ${name}(`);
    return code.slice(start, code.indexOf("\n}\n", start) + 3);
  };
  const entry = (name) => root(score(parse(only(name), PARSER_OPTIONS), only(name)), name);
  assert.deepEqual(
    ["score15", "score16", "score20", "score21"].map((name) => root(result, name).score),
    [15, 16, 20, 21],
  );
  ruleTester.run("cognitive-complexity", rule, {
    valid: [
      { name: "a bare 20 sets the threshold: a function scoring 20 is not reported", code: only("score20"), options: [20] },
      { name: "with default options a function scoring exactly 15 is not reported", code: only("score15") },
    ],
    invalid: [
      { name: "a bare 20 sets the threshold: a function scoring 21 is reported", code: only("score21"), options: [20], errors: [expectedError(entry("score21"), 20)] },
      { name: "with default options a function scoring 16 is reported against threshold 15", code: only("score16"), errors: [expectedError(entry("score16"), 15)] },
    ],
  });
}

// --- KTD7: root functions only ------------------------------------------------------------

{
  const callbackLines = [8, 9, 10, 11, 12, 13, 14, 15].map((line) => `\n+2 (incl. 1 nesting) if at ${line}:5`).join("");
  const ownLines = [4, 5, 6].map((line) => `\n+1 (incl. 0 nesting) if at ${line}:3`).join("");
  ruleTester.run("cognitive-complexity", rule, {
    valid: [],
    invalid: [
      {
        name: "a callback carrying 16 of the outer function's 19 points produces one finding at the outer function listing the callback's increments with nesting 1",
        code: readFixture("nested-callback.ts"),
        errors: [{ messageId: "functionComplexity", data: { name: "outer", score: 19, threshold: 15, breakdown: callbackLines + ownLines }, line: 3, column: 17 }],
      },
    ],
  });
}

{
  const callbackLines = [9, 10, 11, 12, 13, 14, 15, 16].map((line) => `\n+2 (incl. 1 nesting) if at ${line}:7`).join("");
  const ownLines = [5, 6, 7].map((line) => `\n+1 (incl. 0 nesting) if at ${line}:5`).join("");
  ruleTester.run("cognitive-complexity", rule, {
    valid: [],
    invalid: [
      {
        name: "inside an Appendix A container the same shape produces one finding at the promoted inner function and none at the container",
        code: readFixture("declarative-container.ts"),
        errors: [{ messageId: "functionComplexity", data: { name: "inner", score: 19, threshold: 15, breakdown: callbackLines + ownLines }, line: 4, column: 12 }],
      },
    ],
  });
}

{
  const code = readFixture("top-level.ts");
  assert.equal(score(parse(code, PARSER_OPTIONS), code).topLevel.score, 20);
  ruleTester.run("cognitive-complexity", rule, {
    valid: [{ name: "top-level code scoring 20 is never reported, even at threshold 0", code, options: [{ threshold: 0 }] }],
    invalid: [],
  });
}

// --- KTD6: the exact message text, pinned once --------------------------------------------

test("the message for if > for > if at threshold 0 is the header plus three breakdown lines ordered by amount", () => {
  const messages = lint(readFixture("pinned-message.ts"), { threshold: 0 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].messageId, "functionComplexity");
  assert.equal(
    messages[0].message,
    "f: cognitive complexity 6 exceeds 0\n+3 (incl. 2 nesting) if at 5:7\n+2 (incl. 1 nesting) loop at 4:5\n+1 (incl. 0 nesting) if at 3:3",
  );
  assert.deepEqual([messages[0].line, messages[0].column, messages[0].endLine, messages[0].endColumn], [2, 17, 2, 18]);
});

test("increments of equal amount are ordered by position", () => {
  const code = readFixture("boundary.ts");
  const score16 = root(score(parse(code, PARSER_OPTIONS), code), "score16");
  const lines = breakdownOf(score16).split("\n").slice(1);
  assert.deepEqual(lines, score16.increments.map(breakdownLine));
});

// --- R18: suppression through ESLint's own directives -------------------------------------

async function lintWithDirectives(code, linterOptions = {}) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ files: ["**/*.ts"], plugins: { cogplexity: plugin }, languageOptions, linterOptions, rules: { [RULE_ID]: ["error", { threshold: 0 }] } }],
  });
  const [result] = await eslint.lintText(code, { filePath: "file.ts" });
  return result.messages;
}

test("an eslint-disable-next-line directive for the rule suppresses the finding", async () => {
  const code = readFixture("pinned-message.ts").replace("export function f", `// eslint-disable-next-line ${RULE_ID}\nexport function f`);
  assert.deepEqual(await lintWithDirectives(code), []);
});

test("an unused directive on an under-threshold function is reported when reportUnusedDisableDirectives is error", async () => {
  const code = `// eslint-disable-next-line ${RULE_ID}\nexport function plain(): number {\n  return 1;\n}\n`;
  const messages = await lintWithDirectives(code, { reportUnusedDisableDirectives: "error" });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, null);
  assert.match(messages[0].message, /Unused eslint-disable directive/);
  assert.equal(messages[0].severity, 2);
});

// --- KTD5: schema validation --------------------------------------------------------------

for (const [label, options] of [
  ["threshold -1", { threshold: -1 }],
  ["topContributors 0", { topContributors: 0 }],
  ["an unknown key", { limit: 3 }],
  ["templateThreshold true", { templateThreshold: true }],
]) {
  test(`${label} is rejected by schema validation`, () => {
    assert.throws(() => lint("export const x = 1;\n", options), /cogplexity\/cognitive-complexity/);
  });
}

test("templateThreshold false and a bare integer are accepted by the schema", () => {
  assert.deepEqual(lint("export const x = 1;\n", { templateThreshold: false }), []);
  assert.deepEqual(lint("export const x = 1;\n", 0), []);
});

// --- R22: scoped() ------------------------------------------------------------------------

test("scoped(['**/*.svelte']) returns exactly that files list with the rule as error at 15", () => {
  const files = ["**/*.svelte"];
  const entry = scoped(files);
  assert.equal(entry.files, files);
  assert.deepEqual(entry.rules, { [RULE_ID]: ["error", 15] });
  assert.equal(entry.plugins.cogplexity, plugin);
  assert.deepEqual(Object.keys(entry).sort(), ["files", "plugins", "rules"]);
});

test("scoped(['**/*.ts'], { threshold: 20 }) passes the options object through", () => {
  const options = { threshold: 20 };
  assert.equal(scoped(["**/*.ts"], options).rules[RULE_ID][1], options);
});

test("scoped([]) throws a TypeError", () => {
  assert.throws(() => scoped([]), TypeError);
});

test("scoped('x') throws a TypeError", () => {
  assert.throws(() => scoped("x"), TypeError);
});

test("scoped's entry lints a matching file with the rule and nothing else", async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ files: ["**/*.ts"], languageOptions }, scoped(["**/*.ts"], { threshold: 0 })],
  });
  const [result] = await eslint.lintText(readFixture("pinned-message.ts"), { filePath: "file.ts" });
  assert.deepEqual(result.messages.map((message) => message.ruleId), [RULE_ID]);
});

// --- the plugin object --------------------------------------------------------------------

test("the plugin registers exactly one rule, cognitive-complexity", () => {
  assert.deepEqual(Object.keys(plugin.rules), ["cognitive-complexity"]);
  assert.equal(plugin.rules["cognitive-complexity"], rule);
  assert.equal(namedPlugin, plugin);
});

test("the rule's meta declares the two message ids, the schema, and the KTD5 defaults", () => {
  assert.equal(rule.meta.type, "suggestion");
  assert.equal(rule.meta.docs.url, "https://github.com/renatomen/cogplexity#options");
  assert.deepEqual(Object.keys(rule.meta.messages).sort(), ["functionComplexity", "templateComplexity"]);
  assert.deepEqual(rule.meta.defaultOptions, [{ threshold: 15, templateThreshold: 15 }]);
  assert.equal(rule.meta.schema.length, 1);
});
