// One named test per specification clause (KTD3), each with a hand-derived expected score
// taken from G. Ann Campbell, "Cognitive Complexity" v1.7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { parse } from "@typescript-eslint/parser";

import { CONSTRUCTS, score } from "../../src/score.js";
import { RESOLUTION_MODES, at, byName, readFixture, scoreFixture, scoreSource, shape, starts } from "./helpers.js";

// --- AE1: switch -------------------------------------------------------------------------

test("AE1: a switch with eight cases scores 1 with a single switch increment", () => {
  const fn = byName(scoreFixture("switch.ts").result, "eightCases");
  assert.equal(fn.score, 1);
  assert.deepEqual(shape(fn), [["switch", 1, 0]]);
});

test("the switch increment sits on the switch keyword", () => {
  const { text, result } = scoreFixture("switch.ts");
  assert.deepEqual(starts(byName(result, "eightCases")), [at(text, "switch (n)")]);
});

// --- AE2: nesting ------------------------------------------------------------------------

test("AE2: if containing for containing if scores 6 with increments 1, 2, 3 at nesting 0, 1, 2", () => {
  const fn = byName(scoreFixture("nesting.ts").result, "ifForIf");
  assert.equal(fn.score, 6);
  assert.deepEqual(shape(fn), [
    ["if", 1, 0],
    ["loop", 2, 1],
    ["if", 3, 2],
  ]);
});

test("AE2 increments are located on the if, for and if keywords", () => {
  const { text, result } = scoreFixture("nesting.ts");
  assert.deepEqual(starts(byName(result, "ifForIf")), [
    at(text, "if (a)"),
    at(text, "for (const x of xs)"),
    at(text, "if (b)"),
  ]);
});

test("a nested ternary scores outer +1 and inner +2, each located on its ? token", () => {
  const { text, result } = scoreFixture("nesting.ts");
  const fn = byName(result, "nestedTernary");
  assert.equal(fn.score, 3);
  assert.deepEqual(shape(fn), [
    ["ternary", 1, 0],
    ["ternary", 2, 1],
  ]);
  assert.deepEqual(starts(fn), [at(text, "? (b"), at(text, "? 1")]);
});

test("for, for-in, for-of, while and do-while each score +1 as loops", () => {
  const fn = byName(scoreFixture("nesting.ts").result, "everyLoop");
  assert.equal(fn.score, 5);
  assert.deepEqual(shape(fn), [
    ["loop", 1, 0],
    ["loop", 1, 0],
    ["loop", 1, 0],
    ["loop", 1, 0],
    ["loop", 1, 0],
  ]);
});

test("for await is a loop scoring +1 located on the for keyword", () => {
  const { text, result } = scoreFixture("nesting.ts");
  const fn = byName(result, "forAwait");
  assert.deepEqual(shape(fn), [["loop", 1, 0]]);
  assert.deepEqual(starts(fn), [at(text, "for await")]);
});

// --- if / else if / else -----------------------------------------------------------------

test("if / else if / else scores 1 + 1 + 1 with no nesting increment on the hybrids", () => {
  const fn = byName(scoreFixture("if-else.ts").result, "chain");
  assert.equal(fn.score, 3);
  assert.deepEqual(shape(fn), [
    ["if", 1, 0],
    ["elseIf", 1, 0],
    ["else", 1, 0],
  ]);
});

test("else if is located on its if keyword and else on the else keyword", () => {
  const { text, result } = scoreFixture("if-else.ts");
  assert.deepEqual(starts(byName(result, "chain")), [at(text, "if (a)"), at(text, "if (b)"), at(text, "else {")]);
});

test("an if nested inside an else branch gets +2", () => {
  const fn = byName(scoreFixture("if-else.ts").result, "nestedInElse");
  assert.equal(fn.score, 4);
  assert.deepEqual(shape(fn), [
    ["if", 1, 0],
    ["else", 1, 0],
    ["if", 2, 1],
  ]);
});

// --- try / catch / finally ---------------------------------------------------------------

test("catch scores +1 and an if inside it +2; try and finally add nothing", () => {
  const { text, result } = scoreFixture("try-catch.ts");
  const fn = byName(result, "catchWithIf");
  assert.equal(fn.score, 3);
  assert.deepEqual(shape(fn), [
    ["catch", 1, 0],
    ["if", 2, 1],
  ]);
  assert.deepEqual(starts(fn), [at(text, "catch (e)"), at(text, "if (a)")]);
});

test("try with only a finally scores 0", () => {
  const fn = byName(scoreFixture("try-catch.ts").result, "tryFinallyOnly");
  assert.equal(fn.score, 0);
  assert.deepEqual(fn.increments, []);
});

// --- labels and jumps --------------------------------------------------------------------

test("the paper's sumOfPrimes scores 7: loops 1 + 2, if 3, labelled continue 1", () => {
  const { text, result } = scoreFixture("labels.ts");
  const fn = byName(result, "sumOfPrimes");
  assert.equal(fn.score, 7);
  assert.deepEqual(shape(fn), [
    ["loop", 1, 0],
    ["loop", 2, 1],
    ["if", 3, 2],
    ["labelledJump", 1, 0],
  ]);
  assert.deepEqual(starts(fn)[3], at(text, "OUT;"));
});

test("the LabeledStatement itself adds nothing: the labelled loop is still +1", () => {
  const { text, result } = scoreFixture("labels.ts");
  assert.deepEqual(starts(byName(result, "sumOfPrimes"))[0], at(text, "for (let i"));
});

test("unlabelled break and continue, return and throw add nothing", () => {
  const fn = byName(scoreFixture("labels.ts").result, "plainJumps");
  assert.equal(fn.score, 5);
  assert.deepEqual(shape(fn), [
    ["loop", 1, 0],
    ["if", 2, 1],
    ["if", 2, 1],
  ]);
});

test("a labelled break scores +1 located on the label identifier", () => {
  const { text, result } = scoreFixture("labels.ts");
  const fn = byName(result, "labelledBreak");
  assert.equal(fn.score, 7);
  assert.deepEqual(shape(fn)[3], ["labelledJump", 1, 0]);
  assert.deepEqual(starts(fn)[3], at(text, "SEARCH;"));
});

// --- AE3: logical sequences --------------------------------------------------------------

test("AE3: a && b && c || d scores 2, one per operator run", () => {
  const { text, result } = scoreFixture("logical.ts");
  const fn = byName(result, "andAndOr");
  assert.equal(fn.score, 2);
  assert.deepEqual(shape(fn), [
    ["logicalSequence", 1, 0],
    ["logicalSequence", 1, 0],
  ]);
  assert.deepEqual(starts(fn), [at(text, "&& b && c || d"), at(text, "|| d;")]);
});

test("AE3: a || b && c || d scores 3 in source order regardless of precedence", () => {
  const { text, result } = scoreFixture("logical.ts");
  const fn = byName(result, "orAndOr");
  assert.equal(fn.score, 3);
  assert.deepEqual(starts(fn), [at(text, "|| b && c || d"), at(text, "&& c || d", 1), at(text, "|| d;", 1)]);
});

test("AE3: a && !(b && c) scores 2 because the negated group starts its own run", () => {
  const { text, result } = scoreFixture("logical.ts");
  const fn = byName(result, "andNotAnd");
  assert.equal(fn.score, 2);
  assert.deepEqual(starts(fn), [at(text, "&& !(b && c)"), at(text, "&& c);")]);
});

test("AE3: a && b || c && d scores 3", () => {
  assert.equal(byName(scoreFixture("logical.ts").result, "andOrAnd").score, 3);
});

test("the paper's mixed condition if (a && b && c || d || e && f) scores 4", () => {
  const fn = byName(scoreFixture("logical.ts").result, "paperMixed");
  assert.equal(fn.score, 4);
  assert.deepEqual(shape(fn), [
    ["if", 1, 0],
    ["logicalSequence", 1, 0],
    ["logicalSequence", 1, 0],
    ["logicalSequence", 1, 0],
  ]);
});

test("a ?? b scores 0", () => {
  assert.equal(byName(scoreFixture("logical.ts").result, "nullish").score, 0);
});

test("a?.b?.c scores 0", () => {
  assert.equal(byName(scoreFixture("logical.ts").result, "optionalChain").score, 0);
});

test("as, non-null and satisfies wrappers around operands change nothing: each sequence is still 1", () => {
  const { result } = scoreFixture("logical.ts");
  for (const name of ["asWrapped", "nonNullWrapped", "satisfiesWrapped", "castedSequence"]) {
    assert.deepEqual(shape(byName(result, name)), [["logicalSequence", 1, 0]], name);
  }
});

test("logical assignment operators &&=, ||= and ??= score 0", () => {
  assert.equal(byName(scoreFixture("logical.ts").result, "logicalAssignment").score, 0);
});

test("sequences in a variable initialiser and in a call argument each score 1", () => {
  assert.equal(byName(scoreFixture("logical.ts").result, "inCallAndAssignment").score, 2);
});

// --- AE4: recursion, with and without a scope manager ------------------------------------

/** The entry whose owner starts on the line of the nth occurrence of `needle` (members share names across classes). */
function entryOnLineOf(result, text, needle, nth = 0) {
  const [line] = at(text, needle, nth);
  const entry = result.functions.find((fn) => fn.loc.start.line === line);
  assert.ok(entry, `no function starting on the line of "${needle}"`);
  return entry;
}

for (const mode of RESOLUTION_MODES) {
  test(`AE4 [${mode}]: a function calling itself scores +1 located on the callee token`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const fn = byName(result, "countDown");
    assert.deepEqual(shape(fn), [["recursion", 1, 0]]);
    assert.deepEqual(starts(fn), [at(text, "countDown(n - 1)")]);
  });

  test(`AE4 [${mode}]: mutual recursion ping -> pong -> ping gives each function +1 at its participating call`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const ping = byName(result, "ping");
    const pong = byName(result, "pong");
    assert.deepEqual(shape(ping), [["recursion", 1, 0]]);
    assert.deepEqual(shape(pong), [["recursion", 1, 0]]);
    assert.deepEqual(starts(ping), [at(text, "pong(n);")]);
    assert.deepEqual(starts(pong), [at(text, "ping(n);")]);
  });

  test(`AE4 [${mode}]: a call to a same-named function declared in an inner scope is not recursion`, () => {
    const { result } = scoreFixture("recursion.ts", mode);
    for (const fn of result.functions.filter((entry) => entry.name === "shadowedByInner")) {
      assert.equal(fn.score, 0);
    }
  });

  test(`AE4 [${mode}]: a shadowing local and a shadowing parameter are not recursion`, () => {
    const { result } = scoreFixture("recursion.ts", mode);
    assert.equal(byName(result, "shadowLocal").score, 0);
    assert.equal(byName(result, "shadowParam").score, 0);
  });

  test(`AE4 [${mode}]: this.m() inside method m is recursion`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const m = result.functions.find((fn) => fn.name === "m" && fn.loc.start.line === at(text, "class Alpha")[0] + 1);
    assert.deepEqual(shape(m), [["recursion", 1, 0]]);
    const [line, column] = at(text, "this.m();");
    assert.deepEqual(starts(m), [[line, column + "this.".length]]);
  });

  test(`AE4 [${mode}]: same-named methods in two classes calling this.m() and this.n() do not cross`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const gammaLine = at(text, "class Gamma")[0];
    const epsilonLine = at(text, "class Epsilon")[0];
    const between = result.functions.filter((fn) => fn.loc.start.line > gammaLine && fn.loc.start.line < epsilonLine);
    assert.equal(between.length, 4);
    for (const fn of between) {
      assert.equal(fn.score, 0, fn.name);
    }
  });

  test(`AE4 [${mode}]: this.m() inside a nested non-arrow function expression is not recursion`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const epsilonLine = at(text, "class Epsilon")[0];
    const m = result.functions.find((fn) => fn.name === "m" && fn.loc.start.line === epsilonLine + 1);
    assert.equal(m.score, 0);
    assert.equal(byName(result, "rebound").score, 0);
  });

  test(`AE4 [${mode}]: aliasing, .call and passing the function as an argument are not calls`, () => {
    const { result } = scoreFixture("recursion.ts", mode);
    assert.equal(byName(result, "aliased").score, 0);
    assert.equal(byName(result, "viaCall").score, 0);
    assert.equal(byName(result, "asArgument").score, 0);
  });

  test(`AE4 [${mode}]: an arrow function assigned to a const that calls itself scores +1`, () => {
    const { result } = scoreFixture("recursion.ts", mode);
    assert.deepEqual(shape(byName(result, "viaVariable")), [["recursion", 1, 0]]);
  });

  test(`AE4 [${mode}]: object-literal methods calling each other through this are a cycle`, () => {
    const { result } = scoreFixture("recursion.ts", mode);
    assert.deepEqual(shape(byName(result, "up")), [["recursion", 1, 0]]);
    assert.deepEqual(shape(byName(result, "down")), [["recursion", 1, 0]]);
  });

  test(`AE4 [${mode}]: a named function expression calling itself by its own name scores +1`, () => {
    const result = scoreSource("const f = function g(n: number): void { g(n); };", mode);
    assert.deepEqual(shape(byName(result, "f")), [["recursion", 1, 0]]);
  });

  test(`AE4 [${mode}]: a var hoisted out of a nested block resolves as the callee`, () => {
    const result = scoreSource("function h(): void { { var inner = function (): void { h(); }; } inner(); }", mode);
    assert.deepEqual(shape(byName(result, "h")), [["recursion", 1, 0]]);
    assert.deepEqual(shape(byName(result, "inner")), [["recursion", 1, 0]]);
  });

  test(`AE4 [${mode}]: a callback inside a non-declarative function that calls the function back puts the function in a cycle`, () => {
    const result = scoreSource("function outer(xs: number[]): void { if (xs.length === 0) { return; } xs.forEach(() => outer(xs)); }", mode);
    assert.deepEqual(shape(byName(result, "outer")), [
      ["if", 1, 0],
      ["recursion", 1, 0],
    ]);
    assert.equal(byName(result, "<anonymous>").score, 0);
  });

  test(`AE4 [${mode}]: inside a declarative outer function the callback is promoted, so its call back is its own and no cycle forms`, () => {
    const result = scoreSource("function outer(xs: number[]): void { xs.forEach(() => outer(xs)); }", mode);
    assert.equal(byName(result, "outer").score, 0);
    assert.equal(byName(result, "<anonymous>").score, 0);
    assert.equal(byName(result, "<anonymous>").parent, null);
  });

  test(`AE4 [${mode}]: a call from a promoted function does not make its declarative container recursive`, () => {
    const result = scoreSource("function container(): void { function promoted(): void { container(); } }", mode);
    assert.equal(byName(result, "container").score, 0);
    assert.equal(byName(result, "promoted").score, 0);
  });

  test(`AE4 [${mode}]: a root in a cycle through its nested helper locates its own increment on its direct call and the helper's on the nested call`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const walk = byName(result, "walk");
    const helper = byName(result, "visitChildren");
    assert.equal(helper.parent, result.functions.indexOf(walk));
    assert.deepEqual(shape(walk), [
      ["if", 1, 0],
      ["loop", 2, 1],
      ["recursion", 1, 0],
      ["recursion", 1, 0],
    ]);
    assert.deepEqual(starts(walk), [at(text, "if (!node)"), at(text, "for (const child"), at(text, "walk(child)"), at(text, "visitChildren(node)")]);
    assert.deepEqual(shape(helper), [
      ["loop", 2, 1],
      ["recursion", 1, 0],
    ]);
    assert.deepEqual(starts(helper), [at(text, "for (const child"), at(text, "walk(child)")]);
  });

  test(`AE4 [${mode}]: this.run() resolves to the method run, never to a same-named getter or setter, and this.constructor() closes no cycle`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    const method = entryOnLineOf(result, text, "  run(): void {");
    assert.deepEqual(shape(method), [
      ["if", 1, 0],
      ["recursion", 1, 0],
    ]);
    const [line, column] = at(text, "this.run();");
    assert.deepEqual(starts(method)[1], [line, column + "this.".length]);
    for (const needle of ["get run(", "set run(", "constructor()", "  rebuild()"]) {
      assert.equal(entryOnLineOf(result, text, needle).score, 0, needle);
    }
  });

  test(`AE4 [${mode}]: static methods calling each other through this are a cycle; same-named instance members of another class are not`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    for (const needle of ["static first(", "static second("]) {
      assert.deepEqual(shape(entryOnLineOf(result, text, needle)), [["recursion", 1, 0]], needle);
    }
    for (const needle of ["  first(n", "  second(n"]) {
      assert.equal(entryOnLineOf(result, text, needle).score, 0, needle);
    }
  });

  test(`AE4 [${mode}]: this.<name>() from an instance member does not reach a static member of that name, nor the reverse`, () => {
    const { text, result } = scoreFixture("recursion.ts", mode);
    assert.equal(entryOnLineOf(result, text, "static go(").score, 0);
    assert.equal(entryOnLineOf(result, text, "  step()").score, 0);
  });
}

// --- nested functions --------------------------------------------------------------------

test("an if inside an arrow callback adds +2 (nesting 1) to the enclosing function", () => {
  const { result } = scoreFixture("nested-functions.ts");
  const fn = byName(result, "withCallback");
  assert.equal(fn.score, 3);
  assert.deepEqual(shape(fn), [
    ["if", 1, 0],
    ["if", 2, 1],
  ]);
});

test("a function entry records the nesting level its body starts at", () => {
  const { result } = scoreFixture("nested-functions.ts");
  assert.equal(byName(result, "withCallback").nesting, 0);
  const outerIndex = result.functions.findIndex((fn) => fn.name === "withCallback");
  assert.equal(result.functions[outerIndex + 1].nesting, 1);
  const inLoop = scoreSource("function f(xs: number[][]): void { if (xs) { for (const row of xs) { row.forEach((x) => { void x; }); } } }");
  assert.equal(byName(inLoop, "<anonymous>").nesting, 3);
});

test("the callback is its own entry with depth 1, parent pointing at the enclosing function, score 2", () => {
  const { result } = scoreFixture("nested-functions.ts");
  const outerIndex = result.functions.findIndex((fn) => fn.name === "withCallback");
  const callback = result.functions[outerIndex + 1];
  assert.equal(callback.name, "<anonymous>");
  assert.equal(callback.depth, 1);
  assert.equal(callback.parent, outerIndex);
  assert.equal(callback.score, 2);
  assert.equal(byName(result, "withCallback").depth, 0);
  assert.equal(byName(result, "withCallback").parent, null);
});

test("total counts a nested function's increments once, through its root", () => {
  const result = scoreSource(readFixture("nested-functions.ts").split("export function classMembers")[0]);
  assert.equal(result.total, 3);
});

test("a class field arrow value and a static block raise nesting and add nothing themselves", () => {
  const { result } = scoreFixture("nested-functions.ts");
  const fn = byName(result, "classMembers");
  assert.equal(fn.score, 5);
  assert.deepEqual(shape(fn), [
    ["if", 1, 0],
    ["if", 2, 1],
    ["if", 2, 1],
  ]);
  const field = byName(result, "field");
  assert.equal(field.depth, 1);
  assert.equal(field.score, 2);
});

test("an empty function has score 0 and an empty increment list", () => {
  const fn = byName(scoreFixture("nested-functions.ts").result, "empty");
  assert.equal(fn.score, 0);
  assert.deepEqual(fn.increments, []);
});

test("function names come from the declaration, the variable, the property key or the assignment target", () => {
  const { result } = scoreFixture("nested-functions.ts");
  const names = result.functions.map((fn) => fn.name);
  for (const expected of ["fromVariable", "arrow", "method", "prop", "obj.assigned"]) {
    assert.ok(names.includes(expected), `missing ${expected} in ${names.join(", ")}`);
  }
});

test("every entry has kind function, a loc and a nameLoc made of line/column positions", () => {
  const { result } = scoreFixture("nested-functions.ts");
  for (const fn of result.functions) {
    assert.equal(fn.kind, "function");
    for (const loc of [fn.loc, fn.nameLoc]) {
      assert.equal(typeof loc.start.line, "number");
      assert.equal(typeof loc.start.column, "number");
      assert.equal(typeof loc.end.line, "number");
      assert.equal(typeof loc.end.column, "number");
    }
  }
});

// --- Appendix A: declarative outer function ----------------------------------------------

test("Appendix A: the paper's declarative example totals 1 and the inner function is a root", () => {
  const { result } = scoreFixture("declarative.ts");
  const outer = byName(result, "declarative");
  const inner = byName(result, "bar.myFun");
  assert.equal(outer.score, 0);
  assert.deepEqual(shape(inner), [["if", 1, 0]]);
  assert.equal(inner.depth, 0);
  assert.equal(inner.parent, null);
});

test("Appendix A: the paper's non-declarative example totals 3 with the inner if at +2", () => {
  const { result } = scoreFixture("declarative.ts");
  const outer = byName(result, "nonDeclarative");
  assert.equal(outer.score, 3);
  assert.deepEqual(shape(outer), [
    ["if", 1, 0],
    ["if", 2, 1],
  ]);
  const inner = result.functions[result.functions.indexOf(outer) + 1];
  assert.equal(inner.depth, 1);
  assert.equal(inner.parent, result.functions.indexOf(outer));
  assert.equal(inner.score, 2);
});

test("Appendix A: a declarative container holding a 4-point function reports 0 and the promoted root 4, total 4", () => {
  const source = readFixture("declarative.ts");
  const start = source.indexOf("export function container");
  const end = source.indexOf("export function mapsTernary");
  const { functions, total } = scoreSource(source.slice(start, end));
  assert.equal(byName({ functions }, "container").score, 0);
  assert.deepEqual(shape(byName({ functions }, "promoted")), [
    ["if", 1, 0],
    ["if", 2, 1],
    ["logicalSequence", 1, 0],
  ]);
  assert.equal(byName({ functions }, "promoted").depth, 0);
  assert.equal(total, 4);
});

/** The root promoted out of the named declarative container (Appendix A). */
function promotedFrom(result, containerName) {
  const container = byName(result, containerName);
  const inside = (fn) => fn.loc.start.line > container.loc.start.line && fn.loc.end.line <= container.loc.end.line;
  const promoted = result.functions.find((fn) => fn !== container && fn.parent === null && inside(fn));
  assert.ok(promoted, `no promoted root inside ${containerName}`);
  return promoted;
}

test("Appendix A: return xs.map(x => x ? a : b) is declarative — the arrow is promoted and the ternary scores 1", () => {
  const { result } = scoreFixture("declarative.ts");
  assert.equal(byName(result, "mapsTernary").score, 0);
  const arrow = promotedFrom(result, "mapsTernary");
  assert.equal(arrow.depth, 0);
  assert.deepEqual(shape(arrow), [["ternary", 1, 0]]);
});

test("Appendix A: a top-level call is not a structural increment, so the function stays declarative", () => {
  const { result } = scoreFixture("declarative.ts");
  assert.equal(byName(result, "callsThenIterates").score, 0);
  assert.deepEqual(shape(promotedFrom(result, "callsThenIterates")), [["if", 1, 0]]);
});

test("Appendix A: a top-level logical sequence is fundamental, not structural, so the function stays declarative", () => {
  const { result } = scoreFixture("declarative.ts");
  assert.deepEqual(shape(byName(result, "logicalThenIterates")), [["logicalSequence", 1, 0]]);
  assert.deepEqual(shape(promotedFrom(result, "logicalThenIterates")), [["if", 1, 0]]);
});

test("Appendix A: a top-level ternary is structural, so the callback nests and its if scores +2", () => {
  const fn = byName(scoreFixture("declarative.ts").result, "ternaryThenIterates");
  assert.equal(fn.score, 3);
  assert.deepEqual(shape(fn), [
    ["ternary", 1, 0],
    ["if", 2, 1],
  ]);
});

test("Appendix A: only the outer function is a container — a promoted method nests its lambda, scoring the paper's 2", () => {
  const { result } = scoreFixture("declarative.ts");
  assert.equal(byName(result, "faux").score, 0);
  const method = byName(result, "method");
  assert.equal(method.parent, null);
  assert.deepEqual(shape(method), [["if", 2, 1]]);
  const lambda = byName(result, "r");
  assert.equal(lambda.parent, result.functions.indexOf(method));
  assert.equal(lambda.depth, 1);
});

test("Appendix A: a ternary in a class field initialiser is structural — the sibling arrow field nests and its if scores +2", () => {
  const { result } = scoreFixture("declarative.ts");
  const outer = byName(result, "fieldTernary");
  assert.equal(outer.score, 3);
  assert.deepEqual(shape(outer), [
    ["ternary", 1, 0],
    ["if", 2, 1],
  ]);
  const callback = byName(result, "callback");
  assert.equal(callback.parent, result.functions.indexOf(outer));
  assert.equal(callback.depth, 1);
  assert.deepEqual(shape(callback), [["if", 2, 1]]);
});

test("Appendix A: a ternary in a parameter default is structural — the map callback nests and its if scores +2", () => {
  const { result } = scoreFixture("declarative.ts");
  const outer = byName(result, "defaultTernary");
  assert.equal(outer.score, 3);
  assert.deepEqual(shape(outer), [
    ["ternary", 1, 0],
    ["if", 2, 1],
  ]);
  const callback = result.functions[result.functions.indexOf(outer) + 1];
  assert.equal(callback.parent, result.functions.indexOf(outer));
  assert.deepEqual(shape(callback), [["if", 2, 1]]);
});

test("Appendix A: a static block with an if of its own is not declarative — its arrow nests and its if scores +2", () => {
  const { text, result } = scoreFixture("declarative.ts");
  const block = entryOnLineOf(result, text, "static {");
  assert.equal(block.parent, null);
  assert.deepEqual(shape(block), [
    ["if", 1, 0],
    ["if", 2, 1],
  ]);
  const checked = byName(result, "checked");
  assert.equal(checked.parent, result.functions.indexOf(block));
  assert.deepEqual(shape(checked), [["if", 2, 1]]);
});

test("Appendix A: a static block with only a nested arrow stays declarative — the arrow is promoted and its if scores 1", () => {
  const { text, result } = scoreFixture("declarative.ts");
  const block = entryOnLineOf(result, text, "static {", 1);
  assert.equal(block.score, 0);
  const unchecked = byName(result, "unchecked");
  assert.equal(unchecked.parent, null);
  assert.equal(unchecked.depth, 0);
  assert.deepEqual(shape(unchecked), [["if", 1, 0]]);
});

test("Appendix A: the file total counts each promoted root once", () => {
  assert.equal(scoreFixture("declarative.ts").result.total, 1 + 3 + 4 + 1 + 1 + 2 + 2 + 3 + 3 + 3 + 3 + 1);
});

// --- increment fields ------------------------------------------------------------------------

test("logical sequence increments carry their operator; no other construct does", () => {
  const fn = byName(scoreSource("function f(a: boolean, b: boolean, c: boolean): boolean { if (a) { return a && b || c; } return false; }"), "f");
  assert.deepEqual(
    fn.increments.map((inc) => [inc.construct, inc.operator]),
    [
      ["if", undefined],
      ["logicalSequence", "&&"],
      ["logicalSequence", "||"],
    ],
  );
  assert.equal(Object.hasOwn(fn.increments[0], "operator"), false);
});

// --- top level ---------------------------------------------------------------------------

test("a file with only a top-level if returns topLevel 1, no functions and total 1", () => {
  const { result } = scoreFixture("top-level.ts");
  assert.deepEqual(result.functions, []);
  assert.equal(result.topLevel.kind, "topLevel");
  assert.equal(result.topLevel.score, 1);
  assert.deepEqual(shape(result.topLevel), [["if", 1, 0]]);
  assert.equal(result.total, 1);
  assert.equal(result.template, undefined);
});

// --- result shape ------------------------------------------------------------------------

test("every construct value in every fixture is a member of the declared identifier set", () => {
  assert.ok(Object.isFrozen(CONSTRUCTS));
  const allowed = new Set(CONSTRUCTS);
  for (const name of readdirSync(new URL("../fixtures/spec/", import.meta.url))) {
    const { result } = scoreFixture(name);
    for (const entry of [...result.functions, result.topLevel]) {
      for (const inc of entry.increments) {
        assert.ok(allowed.has(inc.construct), `${name}: ${inc.construct}`);
      }
    }
  }
});

test("increments are in source order in every fixture", () => {
  for (const name of readdirSync(new URL("../fixtures/spec/", import.meta.url))) {
    const { result } = scoreFixture(name);
    for (const entry of [...result.functions, result.topLevel]) {
      const positions = entry.increments.map((inc) => inc.loc.start.line * 100000 + inc.loc.start.column);
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${name}: ${entry.name ?? entry.kind}`);
    }
  }
});

test("increment locations carry a start and an end position", () => {
  const { result } = scoreFixture("labels.ts");
  for (const inc of byName(result, "sumOfPrimes").increments) {
    assert.equal(inc.loc.end.line, inc.loc.start.line);
    assert.ok(inc.loc.end.column > inc.loc.start.column);
  }
});

/** Node-shaped values among a node's own properties, `parent` excluded. */
function* childNodesOf(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") {
      continue;
    }
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child && typeof child === "object" && typeof child.type === "string") {
        yield child;
      }
    }
  }
}

/** Attach a `parent` back-reference to every node, as ESLint does before a rule runs. */
function attachParents(ast) {
  const stack = [ast];
  while (stack.length > 0) {
    const node = stack.pop();
    for (const child of childNodesOf(node)) {
      child.parent = node;
      stack.push(child);
    }
  }
}

test("scoring terminates and is unchanged when every node carries a parent back-reference", () => {
  const text = readFixture("appendix-c-yui-save.ts");
  const options = { range: true, loc: true, sourceType: "module", ecmaVersion: "latest" };
  const plain = score(parse(text, options), text);
  const ast = parse(text, options);
  attachParents(ast);
  assert.deepEqual(score(ast, text), plain);
});

test("a Svelte-shaped root with an empty script and no markup returns an empty template facet and total 0", () => {
  const svelteRoot = { type: "Program", body: [{ type: "SvelteScriptElement", body: [] }], sourceType: "module" };
  assert.deepEqual(score(svelteRoot, ""), {
    functions: [],
    topLevel: { kind: "topLevel", score: 0, increments: [] },
    template: { kind: "template", score: 0, increments: [] },
    total: 0,
  });
});

test("a scope manager without a scopes array is rejected", () => {
  assert.throws(() => score(parse("", { range: true, loc: true }), "", { scopeManager: {} }), TypeError);
});
