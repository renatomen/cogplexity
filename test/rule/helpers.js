// Shared harness for the rule tests: ESLint's RuleTester bound to node:test (KTD8), a Linter
// wrapper for value assertions, and a test-local formatter for the KTD6 breakdown grammar
// (pinned independently by the exact-message test in typescript.test.js).
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { Linter, RuleTester } from "eslint";
import * as tsParser from "@typescript-eslint/parser";

import { plugin, rule } from "../../src/index.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export const RULE_ID = "cogplexity/cognitive-complexity";

export const languageOptions = { parser: tsParser, ecmaVersion: 2022, sourceType: "module" };

export const ruleTester = new RuleTester({ languageOptions });

export function readFixture(name) {
  return readFileSync(new URL(`../fixtures/rule/${name}`, import.meta.url), "utf8");
}

export function readSpecFixture(name) {
  return readFileSync(new URL(`../fixtures/spec/${name}`, import.meta.url), "utf8");
}

/** The Linter config pieces for `.ts` files under the TypeScript parser (the default language). */
export const typescriptLanguage = { files: ["**/*.ts"], filename: "file.ts", languageOptions };

/**
 * The consumer Svelte shape: `svelte-eslint-parser` with the TypeScript parser nested, on
 * `.svelte` files. The nested parser is a plain copy of the module's exports because RuleTester
 * deep-freezes `parserOptions` and a module namespace object cannot be frozen.
 */
export function svelteLanguage(svelteParser) {
  return {
    files: ["**/*.svelte"],
    filename: "component.svelte",
    languageOptions: { parser: svelteParser, parserOptions: { parser: { ...tsParser }, ecmaVersion: 2022, sourceType: "module" } },
  };
}

/**
 * Lint `code` with the plugin and return ESLint's messages. `language` picks the parser
 * (TypeScript by default); `ruleImpl` swaps the rule implementation (the negative controls'
 * mutation check).
 */
export function lint(code, options, { ruleImpl = rule, linterOptions = {}, extraRules = {}, language = typescriptLanguage } = {}) {
  const linter = new Linter();
  const config = {
    files: language.files,
    plugins: { cogplexity: { ...plugin, rules: { "cognitive-complexity": ruleImpl, ...extraRules } } },
    languageOptions: language.languageOptions,
    linterOptions,
    rules: {
      [RULE_ID]: ["error", ...(options === undefined ? [] : [options])],
      ...Object.fromEntries(Object.keys(extraRules).map((name) => [`cogplexity/${name}`, "error"])),
    },
  };
  return linter.verify(code, config, { filename: language.filename });
}

function byAmountThenPosition(a, b) {
  return b.amount - a.amount || a.loc.start.line - b.loc.start.line || a.loc.start.column - b.loc.start.column;
}

/** One KTD6 line; ESTree columns are 0-based, the message counts from 1. */
export function breakdownLine(inc) {
  return `+${inc.amount} (incl. ${inc.nesting} nesting) ${inc.construct} at ${inc.loc.start.line}:${inc.loc.start.column + 1}`;
}

/** The `breakdown` placeholder for a function entry: a leading newline before every line. */
export function breakdownOf(entry, topContributors) {
  const ordered = [...entry.increments].sort(byAmountThenPosition);
  const shown = topContributors === undefined ? ordered : ordered.slice(0, topContributors);
  const lines = shown.map(breakdownLine);
  if (ordered.length > shown.length) {
    lines.push(`… ${ordered.length - shown.length} more`);
  }
  return lines.map((line) => `\n${line}`).join("");
}

/** A RuleTester error object for a root function entry at `threshold`. */
export function expectedError(entry, threshold, topContributors) {
  return {
    messageId: "functionComplexity",
    data: { name: entry.name, score: entry.score, threshold, breakdown: breakdownOf(entry, topContributors) },
    line: entry.nameLoc.start.line,
    column: entry.nameLoc.start.column + 1,
  };
}

/** A RuleTester error object for the template facet at `threshold`, located at its first increment (KTD6). */
export function expectedTemplateError(template, threshold, topContributors) {
  const first = template.increments[0];
  return {
    messageId: "templateComplexity",
    data: { name: "template", score: template.score, threshold, breakdown: breakdownOf(template, topContributors) },
    line: first ? first.loc.start.line : 1,
    column: first ? first.loc.start.column + 1 : 1,
  };
}

function byLocation(a, b) {
  return a.line - b.line || a.column - b.column;
}

/**
 * Errors for every root function of `result` scoring above `threshold`, plus the template facet
 * when `templateThreshold` is a number it exceeds, in source order.
 */
export function expectedErrors(result, threshold, templateThreshold) {
  const errors = result.functions.filter((fn) => fn.parent === null && fn.score > threshold).map((fn) => expectedError(fn, threshold));
  if (result.template && typeof templateThreshold === "number" && result.template.score > templateThreshold) {
    errors.push(expectedTemplateError(result.template, templateThreshold));
  }
  return errors.sort(byLocation);
}
