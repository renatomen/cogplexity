// The rule and score() on Svelte roots: script functions per KTD3 (R8), the template facet per
// KTD4 (R9) with its own threshold (R10, KTD5), and the two message ids (R17, KTD6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { RuleTester } from "eslint";

import { rule, score } from "../../src/index.js";
import { CONSTRUCTS } from "../../src/score.js";
import { shape } from "../spec/helpers.js";
import { expectedError, expectedErrors, lint, readFixture, svelteLanguage } from "./helpers.js";

const svelteParser = await import("svelte-eslint-parser");
const tsParser = await import("@typescript-eslint/parser");

const language = svelteLanguage(svelteParser);
const PARSER_OPTIONS = { parser: tsParser, range: true, loc: true, sourceType: "module", ecmaVersion: 2022 };
const SVELTE_FIXTURES = readdirSync(new URL("../fixtures/rule/", import.meta.url)).filter((name) => name.endsWith(".svelte"));

const ruleTester = new RuleTester({ languageOptions: language.languageOptions });

function scoreSvelte(code) {
  const { ast, scopeManager } = svelteParser.parseForESLint(code, PARSER_OPTIONS);
  return score(ast, code, { scopeManager });
}

function templateOf(code) {
  return scoreSvelte(code).template;
}

function root(result, name) {
  const entry = result.functions.find((fn) => fn.name === name && fn.parent === null);
  assert.ok(entry, `no root function named ${name}`);
  return entry;
}

/** A RuleTester case on a `.svelte` filename so the consumer-style `files` scoping applies. */
function svelteCase(testCase) {
  return { filename: language.filename, ...testCase };
}

// --- parity: the rule and score() agree on every Svelte fixture (R12) ----------------------

{
  const valid = [];
  const invalid = [];
  for (const name of SVELTE_FIXTURES) {
    const code = readFixture(name);
    const errors = expectedErrors(scoreSvelte(code), 0, 0);
    const testCase = svelteCase({ name: `parity: ${name} reports every root function and the template with the scores score() returns`, code, options: [{ threshold: 0, templateThreshold: 0 }] });
    if (errors.length === 0) {
      valid.push(testCase);
    } else {
      invalid.push({ ...testCase, errors });
    }
  }
  ruleTester.run("cognitive-complexity", rule, { valid, invalid });
}

// --- AE5 -----------------------------------------------------------------------------------

{
  const code = readFixture("ae5.svelte");
  const result = scoreSvelte(code);
  assert.equal(root(result, "score20").score, 20);
  assert.equal(result.template.score, 3);
  ruleTester.run("cognitive-complexity", rule, {
    valid: [],
    invalid: [
      svelteCase({
        name: "AE5: a script function scoring 20 beside a template nesting {#each} in {#if} yields one functionComplexity finding and no templateComplexity finding at defaults",
        code,
        errors: [expectedError(root(result, "score20"), 15)],
      }),
    ],
  });
}

test("AE5: total is the script's 20; the template's 3 is excluded from it", () => {
  const result = scoreSvelte(readFixture("ae5.svelte"));
  assert.equal(result.total, 20);
  assert.deepEqual(shape(result.template), [["ifBlock", 1, 0], ["eachBlock", 2, 1]]);
});

// --- KTD4 rows -----------------------------------------------------------------------------

test("{#if} > {:else if} > {:else} with an {#each} in the else scores 1, 1, 1, 2 for a total of 5", () => {
  const template = templateOf(readFixture("if-chain.svelte"));
  assert.deepEqual(shape(template), [["ifBlock", 1, 0], ["elseIfBlock", 1, 0], ["elseBlock", 1, 0], ["eachBlock", 2, 1]]);
  assert.equal(template.score, 5);
});

test("the {:else if} wrapper block is transparent: a three-branch chain has exactly three increments", () => {
  const template = templateOf("{#if a}1{:else if b}2{:else if c}3{/if}\n");
  assert.deepEqual(shape(template), [["ifBlock", 1, 0], ["elseIfBlock", 1, 0], ["elseIfBlock", 1, 0]]);
});

test("the {:else} of an {#each} scores 1 as an elseBlock", () => {
  const template = templateOf("{#each xs as x}{x}{:else}none{/each}\n");
  assert.deepEqual(shape(template), [["eachBlock", 1, 0], ["elseBlock", 1, 0]]);
});

test("{#await} with {:then} and {:catch} scores 3", () => {
  const template = templateOf("{#await p}\n  wait\n{:then v}\n  {v}\n{:catch e}\n  {e}\n{/await}\n");
  assert.deepEqual(shape(template), [["awaitBlock", 1, 0], ["thenBlock", 1, 0], ["catchBlock", 1, 0]]);
  assert.equal(template.score, 3);
});

test("an {#if} inside {:then} scores +2, making the await fixture 5", () => {
  const template = templateOf(readFixture("await.svelte"));
  assert.deepEqual(shape(template), [["awaitBlock", 1, 0], ["thenBlock", 1, 0], ["ifBlock", 2, 1], ["catchBlock", 1, 0]]);
  assert.equal(template.score, 5);
});

test("an {#if} in the pending block of an {#await} scores +2", () => {
  const template = templateOf("{#await p}{#if a}x{/if}{:then v}{v}{/await}\n");
  assert.deepEqual(shape(template), [["awaitBlock", 1, 0], ["ifBlock", 2, 1], ["thenBlock", 1, 0]]);
});

test("the shorthand {#await p then v} still scores the await and the then, locating the then at its keyword", () => {
  const code = "{#await p then v}{v}{:catch e}{e}{/await}\n";
  const template = templateOf(code);
  assert.deepEqual(shape(template), [["awaitBlock", 1, 0], ["thenBlock", 1, 0], ["catchBlock", 1, 0]]);
  assert.deepEqual(template.increments[1].loc.start, { line: 1, column: code.indexOf("then") });
});

test("{#key} adds nothing and does not raise nesting: an {#if} inside it scores 1", () => {
  const template = templateOf("{#key x}{#if x}k{/if}{/key}\n");
  assert.deepEqual(shape(template), [["ifBlock", 1, 0]]);
});

test("{#snippet} adds nothing and raises nesting: an {#if} inside it scores 2", () => {
  const template = templateOf("{#snippet row(a)}{#if a}s{/if}{/snippet}\n");
  assert.deepEqual(shape(template), [["ifBlock", 2, 1]]);
});

test("the key-snippet fixture scores 6: the {@const} ternary inside the snippet sits at nesting 1", () => {
  const template = templateOf(readFixture("key-snippet.svelte"));
  assert.deepEqual(shape(template), [["ifBlock", 1, 0], ["logicalSequence", 1, 0], ["ternary", 2, 1], ["ifBlock", 2, 1]]);
  assert.equal(template.score, 6);
});

for (const [where, code] of [
  ["a mustache tag", "{a && b ? x : y}\n"],
  ["a class directive", "<p class:active={a && b ? x : y}>p</p>\n"],
  ["a bind directive", "<input bind:value={a && b ? x : y} />\n"],
  ["an attribute value", "<p title={a && b ? x : y}>p</p>\n"],
  ["an {#each} expression", "{#each a && b ? x : y as item}{item}{/each}\n"],
  ["a {@const} value", "{@const v = a && b ? x : y}\n"],
  ["a {@html} argument", "{@html a && b ? x : y}\n"],
]) {
  test(`a && b ? x : y in ${where} at the template root scores 2 (run +1, ternary +1)`, () => {
    const template = templateOf(code);
    const increments = shape(template).filter(([construct]) => construct !== "eachBlock");
    assert.deepEqual(increments, [["logicalSequence", 1, 0], ["ternary", 1, 0]]);
  });
}

test("a && b ? x : y as an {#each} key scores 2 beside the each's 1", () => {
  const template = templateOf("{#each xs as item (a && b ? x : y)}{item}{/each}\n");
  assert.deepEqual(shape(template), [["eachBlock", 1, 0], ["logicalSequence", 1, 0], ["ternary", 1, 0]]);
});

test("a ternary as a {@render} argument scores 1", () => {
  const template = templateOf("{#snippet row(v)}{v}{/snippet}\n{@render row(a ? b : c)}\n");
  assert.deepEqual(shape(template), [["ternary", 1, 0]]);
});

test("a && b ? x : y inside an {#if} contributes 3 (ternary +2 at nesting 1, run +1), 4 with the if", () => {
  const template = templateOf("{#if c}{a && b ? x : y}{/if}\n");
  assert.deepEqual(shape(template), [["ifBlock", 1, 0], ["logicalSequence", 1, 0], ["ternary", 2, 1]]);
  assert.equal(template.score, 4);
});

test("the expressions fixture scores 12 across mustache, directive, each key, render argument and nested mustache", () => {
  assert.equal(templateOf(readFixture("expressions.svelte")).score, 12);
});

test("{@render}, {@html}, {@const}, {@debug} tags with plain arguments score 0", () => {
  const template = templateOf("{#snippet row()}r{/snippet}\n{@render row()}\n{@html a}\n{@const q = a}\n{@debug a}\n");
  assert.equal(template.score, 0);
  assert.deepEqual(template.increments, []);
});

// --- inline functions in markup ------------------------------------------------------------

test("an inline handler's if scores +2 into the template and nothing into any script function; no function entry exists for it", () => {
  const result = scoreSvelte(readFixture("inline-handler.svelte"));
  assert.deepEqual(shape(result.template), [["if", 2, 1]]);
  assert.equal(result.template.score, 2);
  assert.deepEqual(result.functions.map((fn) => [fn.name, fn.score]), [["plain", 0]]);
  assert.equal(result.topLevel.score, 0);
});

test("a function in a {@const} raises nesting for its body without opening an entry", () => {
  const result = scoreSvelte("{@const pick = (v) => (v ? 1 : 2)}\n");
  assert.deepEqual(shape(result.template), [["ternary", 2, 1]]);
  assert.deepEqual(result.functions, []);
});

// --- script facets (R8) --------------------------------------------------------------------

test("a <script module> function and a $effect callback are root functions scoring 1 each; the template scores 0", () => {
  const result = scoreSvelte(readFixture("runes.svelte"));
  assert.deepEqual(result.functions.map((fn) => [fn.name, fn.parent, fn.score]), [["helper", null, 1], ["<anonymous>", null, 1]]);
  assert.deepEqual(shape(root(result, "helper")), [["if", 1, 0]]);
  assert.deepEqual(shape(root(result, "<anonymous>")), [["if", 1, 0]]);
  assert.equal(result.topLevel.score, 0);
  assert.equal(result.template.score, 0);
  assert.equal(result.total, 2);
});

test("script statements outside any function belong to topLevel, not to the template", () => {
  const result = scoreSvelte("<script>\n  if (a) { b = 1; }\n</script>\n{#if a}x{/if}\n");
  assert.deepEqual(shape(result.topLevel), [["if", 1, 0]]);
  assert.deepEqual(shape(result.template), [["ifBlock", 1, 0]]);
  assert.equal(result.total, 1);
});

// --- KTD5: the template threshold ---------------------------------------------------------

{
  const code = readFixture("template-threshold.svelte");
  const result = scoreSvelte(code);
  assert.equal(result.template.score, 4);
  assert.equal(root(result, "branch").score, 2);
  ruleTester.run("cognitive-complexity", rule, {
    valid: [
      svelteCase({ name: "templateThreshold 4 does not report a template scoring 4", code, options: [{ templateThreshold: 4 }] }),
      svelteCase({ name: "a bare 10 leaves templateThreshold at 15: a template scoring 12 is not reported", code: readFixture("expressions.svelte"), options: [10] }),
    ],
    invalid: [
      svelteCase({
        name: "templateThreshold 3 reports a template scoring 4 with templateComplexity at its first increment",
        code,
        options: [{ templateThreshold: 3 }],
        errors: expectedErrors(result, 15, 3),
      }),
      svelteCase({
        name: "templateThreshold false reports nothing for the template while the script finding at threshold 1 still fires",
        code,
        options: [{ threshold: 1, templateThreshold: false }],
        errors: [expectedError(root(result, "branch"), 1)],
      }),
    ],
  });
}

test("templateThreshold 3 on a template scoring 4 yields one templateComplexity message named template", () => {
  const messages = lint(readFixture("template-threshold.svelte"), { templateThreshold: 3 }, { language });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].messageId, "templateComplexity");
  assert.match(messages[0].message, /^template: cognitive complexity 4 exceeds 3\n/);
});

test("both facets over threshold in one file produce two findings with distinct messageIds and distinct locations", () => {
  const messages = lint(readFixture("both-facets.svelte"), undefined, { language });
  assert.deepEqual(messages.map((message) => message.messageId).sort(), ["functionComplexity", "templateComplexity"]);
  assert.notDeepEqual([messages[0].line, messages[0].column], [messages[1].line, messages[1].column]);
});

// --- the template entry's shape ------------------------------------------------------------

test("every fixture's template increments are in source order and every construct is from CONSTRUCTS", () => {
  for (const name of SVELTE_FIXTURES) {
    const { template } = scoreSvelte(readFixture(name));
    assert.equal(template.kind, "template");
    assert.equal(template.score, template.increments.reduce((sum, inc) => sum + inc.amount, 0), name);
    for (let i = 1; i < template.increments.length; i++) {
      const [before, after] = [template.increments[i - 1].loc.start, template.increments[i].loc.start];
      assert.ok(before.line < after.line || (before.line === after.line && before.column <= after.column), `${name}: increment ${i} is out of order`);
    }
    for (const inc of template.increments) {
      assert.ok(CONSTRUCTS.includes(inc.construct), `${name}: unknown construct ${inc.construct}`);
      assert.equal(inc.amount, 1 + inc.nesting);
    }
  }
});

test("a TypeScript root carries no template facet", () => {
  const code = "export const x = 1;\n";
  const result = score(tsParser.parse(code, { range: true, loc: true, sourceType: "module", ecmaVersion: "latest" }), code);
  assert.ok(!("template" in result));
});
