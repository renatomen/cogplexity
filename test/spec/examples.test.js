// Appendix C of the specification: four worked examples whose totals are the acceptance bar.
import { test } from "node:test";
import assert from "node:assert/strict";

import { byName, scoreFixture, shape } from "./helpers.js";

test("Appendix C: overriddenSymbolFrom scores 19", () => {
  const fn = byName(scoreFixture("appendix-c-overridden-symbol-from.ts").result, "overriddenSymbolFrom");
  assert.equal(fn.score, 19);
  assert.deepEqual(
    shape(fn).map(([, amount]) => amount),
    [1, 1, 2, 1, 3, 4, 5, 1, 1],
  );
});

test("Appendix C: addVersion scores 35", () => {
  const fn = byName(scoreFixture("appendix-c-add-version.ts").result, "addVersion");
  assert.equal(fn.score, 35);
  assert.deepEqual(
    shape(fn).map(([, amount]) => amount),
    [1, 2, 3, 3, 4, 5, 5, 1, 2, 3, 1, 3, 2],
  );
});

test("Appendix C: toRegexp scores 20", () => {
  const fn = byName(scoreFixture("appendix-c-to-regexp.ts").result, "toRegexp");
  assert.equal(fn.score, 20);
  assert.deepEqual(
    shape(fn).map(([, amount]) => amount),
    [1, 1, 1, 2, 1, 3, 1, 4, 1, 1, 1, 1, 1, 1],
  );
});

test("Appendix C: YUI save scores 20 through its nested callbacks", () => {
  const { result } = scoreFixture("appendix-c-yui-save.ts");
  const fn = byName(result, "save");
  assert.equal(fn.score, 20);
  assert.deepEqual(
    shape(fn).map(([, amount]) => amount),
    [1, 1, 2, 1, 2, 3, 1, 4, 4, 1],
  );
  assert.equal(fn.depth, 0);
  assert.equal(result.total, 20);
});

test("Appendix C: the YUI callbacks are entries at depth 1 and 2 whose scores nest inside save", () => {
  const { result } = scoreFixture("appendix-c-yui-save.ts");
  const save = result.functions.indexOf(byName(result, "save"));
  const outerCallback = result.functions[save + 1];
  const innerCallback = result.functions[save + 2];
  assert.equal(outerCallback.depth, 1);
  assert.equal(outerCallback.parent, save);
  assert.equal(outerCallback.score, 18);
  assert.equal(innerCallback.depth, 2);
  assert.equal(innerCallback.parent, save + 1);
  assert.equal(innerCallback.score, 13);
});
