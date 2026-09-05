import { readFileSync } from "node:fs";
import { parse, parseForESLint } from "@typescript-eslint/parser";

import { score } from "../../src/score.js";

const PARSER_OPTIONS = { range: true, loc: true, sourceType: "module", ecmaVersion: "latest" };

/** The two callee-resolution paths: the walker's own scope map, or a supplied scope manager. */
export const RESOLUTION_MODES = ["own scope map", "scope manager"];

export function readFixture(name) {
  return readFileSync(new URL(`../fixtures/spec/${name}`, import.meta.url), "utf8");
}

/** Parse and score a fixture; `mode` picks how recursive calls are resolved. */
export function scoreFixture(name, mode = RESOLUTION_MODES[0]) {
  const text = readFixture(name);
  if (mode === "scope manager") {
    const { ast, scopeManager } = parseForESLint(text, PARSER_OPTIONS);
    return { text, result: score(ast, text, { scopeManager }) };
  }
  return { text, result: score(parse(text, PARSER_OPTIONS), text) };
}

export function scoreSource(text, mode = RESOLUTION_MODES[0]) {
  if (mode === "scope manager") {
    const { ast, scopeManager } = parseForESLint(text, PARSER_OPTIONS);
    return score(ast, text, { scopeManager });
  }
  return score(parse(text, PARSER_OPTIONS), text);
}

export function byName(result, name) {
  const entry = result.functions.find((fn) => fn.name === name);
  if (!entry) {
    throw new Error(`no function named ${name}; have ${result.functions.map((fn) => fn.name).join(", ")}`);
  }
  return entry;
}

/** `[construct, amount, nesting]` per increment, the shape most assertions compare. */
export function shape(entry) {
  return entry.increments.map((inc) => [inc.construct, inc.amount, inc.nesting]);
}

export function starts(entry) {
  return entry.increments.map((inc) => [inc.loc.start.line, inc.loc.start.column]);
}

/** Line/column (1-based line, 0-based column) of the nth occurrence of `needle` in `text`. */
export function at(text, needle, nth = 0) {
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = text.indexOf(needle, index + 1);
    if (index === -1) {
      throw new Error(`"${needle}" occurrence ${nth} not found`);
    }
  }
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const column = index - (before.lastIndexOf("\n") + 1);
  return [line, column];
}
