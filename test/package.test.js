import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import plugin, { CONSTRUCTS, score } from "../src/index.js";
import { CONSTRUCTS as CONSTRUCTS_FROM_SCORE } from "../src/score.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("the plugin object names the package and its version", () => {
  assert.equal(plugin.meta.name, pkg.name);
  assert.equal(plugin.meta.version, pkg.version);
});

test("the package declares zero runtime dependencies", () => {
  assert.equal(pkg.dependencies, undefined);
});

test("the package has no build or install lifecycle scripts", () => {
  for (const name of ["build", "prepare", "prepack", "install", "postinstall", "preinstall"]) {
    assert.equal(pkg.scripts[name], undefined, `unexpected script: ${name}`);
  }
});

test("score is exported from the root entry", () => {
  assert.equal(typeof score, "function");
});

test("CONSTRUCTS is exported from the root entry and is score.js's frozen array", () => {
  assert.equal(CONSTRUCTS, CONSTRUCTS_FROM_SCORE);
});
