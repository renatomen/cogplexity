// Unit tests for the calibration comparison logic (plan KTD9, U5) on synthetic
// score results, fixtures and ledgers: no git, no network, no parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gitEnv, scoreSource } from "./corpus.js";
import {
  THRESHOLD,
  compareFixture,
  constructAmount,
  coversByClause,
  coversByFile,
  formatReport,
  isPromotedRoot,
} from "./harness.js";

// --- synthetic builders ------------------------------------------------------

const SONAR = {
  sources: ["src"],
  testInclusions: ["**/*.test.ts"],
  exclusions: ["src/generated/**"],
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"],
};
const ADDED = "2026-09-05T00:00:00.000Z";

function loc(startLine, endLine = startLine) {
  return { start: { line: startLine, column: 0 }, end: { line: endLine, column: 1 } };
}

function inc(construct, amount = 1, line = 1) {
  return { construct, amount, nesting: amount - 1, loc: loc(line) };
}

/** A function entry; `score` defaults to the sum of its increments. */
function fn({ name = "f", line = 1, endLine = line + 10, increments = [], score, parent = null }) {
  const own = increments.reduce((sum, i) => sum + i.amount, 0);
  return {
    name,
    kind: "function",
    depth: parent === null ? 0 : 1,
    parent,
    loc: loc(line, endLine),
    nameLoc: loc(line),
    score: score ?? own,
    increments,
  };
}

function result(functions = [], topIncrements = []) {
  const topLevel = { kind: "topLevel", score: topIncrements.reduce((s, i) => s + i.amount, 0), increments: topIncrements };
  const total = functions.reduce((sum, f) => (f.parent === null ? sum + f.score : sum), topLevel.score);
  return { functions, topLevel, total };
}

/** A root function scoring `score` with `score` sequential `if` increments. */
function bigRoot(name, line, score) {
  const increments = Array.from({ length: score }, (_, i) => inc("if", 1, line + 1 + i));
  return fn({ name, line, endLine: line + score + 2, increments });
}

function fixture(files, issues = []) {
  return { projectKey: "k", repository: "o/r", commitSha: "0123abcd", capturedAt: ADDED, sonar: SONAR, files, issues };
}

function clause(match, reason = "Sonar does not count it") {
  return { kind: "clause", match, reason, addedAt: ADDED };
}

function fileEntry(match, expectedDelta, reason = "recorded divergence") {
  const entry = { kind: "file", match, reason, addedAt: ADDED };
  if (expectedDelta !== undefined) entry.expectedDelta = expectedDelta;
  return entry;
}

/** Runs the comparison over synthetic inputs; `results` maps path to a ScoreResult. */
function run({ files, issues = [], ledger = [], results, listed }) {
  const scoreFile = (p) => {
    if (!Object.hasOwn(results, p)) throw new Error(`scoreFile called for unexpected path ${p}`);
    return results[p];
  };
  return compareFixture({ fixture: fixture(files, issues), ledger, scoreFile, listFiles: () => listed ?? Object.keys(files) });
}

function problemsText(comparison) {
  return comparison.problems.join("\n");
}

// AE7: Sonar 187, local 188 because of exactly one recursion increment.
const AE7_RESULT = result([fn({ name: "walk", line: 1, endLine: 40, increments: [...Array.from({ length: 187 }, (_, i) => inc("if", 1, 2 + (i % 30))), inc("recursion", 1, 5)] })]);

// --- AE7 ----------------------------------------------------------------------

test("AE7: a file at Sonar 187 and local 188 from one recursion increment passes with a clause: recursion entry", async () => {
  const comparison = await run({ files: { "src/a.ts": 187 }, issues: [{ path: "src/a.ts", line: 1, score: 188 }], ledger: [clause("recursion")], results: { "src/a.ts": AE7_RESULT } });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.equal(comparison.mismatches.files[0].coveredBy.match, "recursion");
});

test("AE7: the same file without a recursion entry fails naming the file and +1", async () => {
  const comparison = await run({ files: { "src/a.ts": 187 }, issues: [{ path: "src/a.ts", line: 1, score: 188 }], results: { "src/a.ts": AE7_RESULT } });
  assert.equal(comparison.ok, false);
  const line = comparison.problems.find((p) => p.startsWith("src/a.ts"));
  assert.match(line, /src\/a\.ts.*sonar 187.*local 188.*\+1/);
  assert.deepEqual(comparison.uncovered.map((m) => m.path), ["src/a.ts"]);
});

// --- exact match ---------------------------------------------------------------

test("exact match on every path and every issue passes with an empty ledger", async () => {
  const results = {
    "src/a.ts": result([bigRoot("big", 3, 16), fn({ name: "small", line: 30, increments: [inc("loop", 1, 31)] })]),
    "src/b.ts": result([], [inc("if", 1, 1), inc("if", 1, 2)]),
  };
  const comparison = await run({ files: { "src/a.ts": 17, "src/b.ts": 2 }, issues: [{ path: "src/a.ts", line: 3, score: 16 }], results });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.deepEqual(comparison.problems, []);
  assert.deepEqual(comparison.summary, { files: 2, issues: 1, roots: 1, ledgerApplied: 0 });
});

// --- per-function ----------------------------------------------------------------

test("a root at 16 with no fixture issue at its line fails naming the function", async () => {
  const comparison = await run({ files: { "src/a.ts": 16 }, results: { "src/a.ts": result([bigRoot("hefty", 4, 16)]) } });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /src\/a\.ts:4 hefty: sonar none, local 16/);
});

test("a fixture issue at a line where no root exceeds the threshold fails naming the line", async () => {
  const comparison = await run({
    files: { "src/a.ts": 15 },
    issues: [{ path: "src/a.ts", line: 9, score: 17 }],
    results: { "src/a.ts": result([bigRoot("border", 9, 15)]) },
  });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /src\/a\.ts:9 border: sonar 17, local 15/);
});

test("a fixture issue at a line with no function at all fails naming the line", async () => {
  const comparison = await run({ files: { "src/a.ts": 0 }, issues: [{ path: "src/a.ts", line: 9, score: 17 }], results: { "src/a.ts": result() } });
  assert.match(problemsText(comparison), /src\/a\.ts:9: sonar 17, local none/);
});

test("a root and an issue on the same line with different scores fail naming both scores", async () => {
  const comparison = await run({ files: { "src/a.ts": 16 }, issues: [{ path: "src/a.ts", line: 4, score: 18 }], results: { "src/a.ts": result([bigRoot("off", 4, 16)]) } });
  assert.match(problemsText(comparison), /src\/a\.ts:4 off: sonar 18, local 16/);
});

test("matching line and score for every reported root passes", async () => {
  const results = { "src/a.ts": result([bigRoot("one", 2, 16), bigRoot("two", 40, 21)]) };
  const issues = [
    { path: "src/a.ts", line: 2, score: 16 },
    { path: "src/a.ts", line: 40, score: 21 },
  ];
  const comparison = await run({ files: { "src/a.ts": 37 }, issues, results });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.equal(comparison.summary.roots, 2);
});

test("a root exactly at the threshold is not reported, matching Sonar's strict comparison", async () => {
  const comparison = await run({ files: { "src/a.ts": THRESHOLD }, results: { "src/a.ts": result([bigRoot("edge", 1, THRESHOLD)]) } });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.equal(THRESHOLD, 15);
});

// --- file ledger entries ------------------------------------------------------------

const UNDER_BY_ONE = result([fn({ name: "f", line: 1, increments: [inc("if", 1, 2), inc("if", 1, 3), inc("if", 1, 4)] })]);

test("a file entry with expectedDelta -1 covers exactly a Sonar-minus-local delta of -1 on that path", async () => {
  const comparison = await run({ files: { "src/a.ts": 2 }, ledger: [fileEntry("src/a.ts", -1)], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.equal(comparison.summary.ledgerApplied, 1);
});

test("a file entry covers no other path with the same delta", async () => {
  const comparison = await run({
    files: { "src/a.ts": 2, "src/b.ts": 2 },
    ledger: [fileEntry("src/a.ts", -1)],
    results: { "src/a.ts": UNDER_BY_ONE, "src/b.ts": UNDER_BY_ONE },
  });
  assert.equal(comparison.ok, false);
  assert.deepEqual(comparison.uncovered.map((m) => m.path), ["src/b.ts"]);
  assert.match(problemsText(comparison), /^src\/b\.ts: sonar 2, local 3, delta \+1/m);
});

test("a later delta of -2 on a file entry expecting -1 fails naming the path and both deltas", async () => {
  const comparison = await run({ files: { "src/a.ts": 1 }, ledger: [fileEntry("src/a.ts", -1)], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /src\/a\.ts: ledger file entry expects delta -1 \(Sonar minus local\) but observed -2/);
});

test("a file entry without expectedDelta is rejected", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, ledger: [fileEntry("src/a.ts", undefined)], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /ledger file entry "src\/a\.ts" has no integer expectedDelta/);
});

test("a file entry also accepts that path's per-function mismatches, and only that path's", async () => {
  const results = { "src/a.ts": result([bigRoot("a", 1, 16)]), "src/b.ts": result([bigRoot("b", 1, 16)]) };
  const comparison = await run({ files: { "src/a.ts": 16, "src/b.ts": 16 }, ledger: [fileEntry("src/a.ts", 0)], results });
  assert.equal(comparison.ok, false);
  assert.deepEqual(comparison.mismatches.functions.map((m) => [m.path, m.coveredBy !== null]), [
    ["src/a.ts", true],
    ["src/b.ts", false],
  ]);
  assert.doesNotMatch(problemsText(comparison), /src\/a\.ts:1 a:/);
  assert.match(problemsText(comparison), /src\/b\.ts:1 b: sonar none, local 16/);
});

test("a file entry naming a path outside the fixture is reported stale", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, ledger: [fileEntry("src/gone.ts", -1)], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /ledger file entry "src\/gone.ts" names no fixture path \(stale\)/);
});

// --- clause ledger entries ------------------------------------------------------------

test("a clause: recursion entry does not cover a +1 delta on a file with two recursion increments", async () => {
  const two = result([fn({ name: "a", line: 1, increments: [inc("recursion", 1, 2)] }), fn({ name: "b", line: 20, increments: [inc("recursion", 1, 21)] })]);
  const comparison = await run({ files: { "src/a.ts": 1 }, ledger: [clause("recursion")], results: { "src/a.ts": two } });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /^src\/a\.ts: sonar 1, local 2, delta \+1/m);
});

test("a clause: recursion entry does not cover a +1 delta on a file with no recursion increment", async () => {
  const comparison = await run({ files: { "src/a.ts": 2 }, ledger: [clause("recursion")], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.equal(comparison.ok, false);
  assert.match(problemsText(comparison), /^src\/a\.ts: sonar 2, local 3, delta \+1/m);
});

test("a clause entry sums the construct across root functions and top level without double-counting nested entries", () => {
  const nested = fn({ name: "inner", line: 3, endLine: 5, increments: [inc("recursion", 1, 4)], parent: 0 });
  const outer = fn({ name: "outer", line: 1, endLine: 10, increments: [inc("if", 1, 2), inc("recursion", 1, 4)] });
  const r = result([outer, nested], [inc("recursion", 1, 12)]);
  assert.equal(constructAmount(r, "recursion"), 2);
  assert.equal(constructAmount(r, "if"), 1);
  assert.equal(coversByClause(clause("recursion"), { path: "p", sonar: 1, local: 3, delta: 2, result: r }), true);
  assert.equal(coversByClause(clause("recursion"), { path: "p", sonar: 2, local: 3, delta: 1, result: r }), false);
});

test("a clause entry covering zero files is reported stale and fails the run", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, ledger: [clause("labelledJump")], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.equal(comparison.ok, false);
  assert.deepEqual(comparison.staleEntries.map((e) => e.match), ["labelledJump"]);
  assert.match(problemsText(comparison), /ledger clause entry "labelledJump" covers no file \(stale\)/);
});

test("a clause entry whose match is not a construct identifier is rejected", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, ledger: [clause("gotoStatement")], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.match(problemsText(comparison), /ledger clause entry "gotoStatement" is not a construct identifier/);
});

test("a ledger entry without a reason is rejected", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, ledger: [{ ...clause("recursion"), reason: "" }], results: { "src/a.ts": UNDER_BY_ONE } });
  assert.match(problemsText(comparison), /ledger entry 1 \(recursion\) has no reason/);
});

test("coversByFile requires the exact path and the exact Sonar-minus-local delta", () => {
  const file = { path: "src/a.ts", sonar: 2, local: 3, delta: 1, result: UNDER_BY_ONE };
  assert.equal(coversByFile(fileEntry("src/a.ts", -1), file), true);
  assert.equal(coversByFile(fileEntry("src/a.ts", 1), file), false);
  assert.equal(coversByFile(fileEntry("src/b.ts", -1), file), false);
});

// --- construct presence -----------------------------------------------------------------

test("construct presence reports recursion=no and declarativeOuter=no on a corpus without either", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, results: { "src/a.ts": UNDER_BY_ONE } });
  assert.deepEqual(comparison.presence, { recursion: false, declarativeOuter: false });
  assert.match(formatReport(comparison), /construct presence: recursion=no declarativeOuter=no/);
});

test("construct presence reports recursion=yes when any file carries a recursion increment", async () => {
  const comparison = await run({ files: { "src/a.ts": 3, "src/b.ts": 188 }, ledger: [clause("recursion")], results: { "src/a.ts": UNDER_BY_ONE, "src/b.ts": AE7_RESULT } });
  assert.equal(comparison.presence.recursion, true);
  assert.match(formatReport(comparison), /construct presence: recursion=yes declarativeOuter=no/);
});

test("construct presence reports declarativeOuter=yes when a root function lies inside another function", async () => {
  const container = fn({ name: "container", line: 1, endLine: 10, increments: [] });
  const promoted = fn({ name: "promoted", line: 2, endLine: 6, increments: [inc("if", 1, 3)] });
  const comparison = await run({ files: { "src/a.ts": 1 }, results: { "src/a.ts": result([container, promoted]) } });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.equal(comparison.presence.declarativeOuter, true);
});

test("isPromotedRoot is true only for a root whose location lies inside another function entry", () => {
  const container = fn({ name: "container", line: 1, endLine: 10 });
  const promoted = fn({ name: "promoted", line: 2, endLine: 6 });
  const nested = fn({ name: "nested", line: 3, endLine: 4, parent: 0 });
  const sibling = fn({ name: "sibling", line: 20, endLine: 25 });
  const functions = [container, promoted, nested, sibling];
  assert.equal(isPromotedRoot(promoted, functions), true);
  assert.equal(isPromotedRoot(container, functions), false);
  assert.equal(isPromotedRoot(nested, functions), false);
  assert.equal(isPromotedRoot(sibling, functions), false);
});

// --- eligible set --------------------------------------------------------------------------

test("a fixture path missing from the commit's file list fails naming the path and is not scored", async () => {
  const comparison = await run({ files: { "src/a.ts": 3, "src/missing.ts": 1 }, results: { "src/a.ts": UNDER_BY_ONE }, listed: ["src/a.ts"] });
  assert.equal(comparison.ok, false);
  assert.deepEqual(comparison.missingPaths, ["src/missing.ts"]);
  assert.match(problemsText(comparison), /src\/missing\.ts: fixture path not found at the corpus commit/);
});

test("an eligible file at the commit that is absent from the fixture fails naming the path", async () => {
  const comparison = await run({ files: { "src/a.ts": 3 }, results: { "src/a.ts": UNDER_BY_ONE }, listed: ["src/a.ts", "src/new.ts"] });
  assert.equal(comparison.ok, false);
  assert.deepEqual(comparison.droppedPaths, ["src/new.ts"]);
  assert.match(problemsText(comparison), /src\/new\.ts: eligible at the corpus commit but absent from the fixture/);
});

test("a non-eligible file absent from the fixture is ignored", async () => {
  const listed = ["src/a.ts", "src/styles.css", "src/a.test.ts", "src/generated/x.ts", "docs/readme.ts", "src/component.vue"];
  const comparison = await run({ files: { "src/a.ts": 3 }, results: { "src/a.ts": UNDER_BY_ONE }, listed });
  assert.equal(comparison.ok, true, problemsText(comparison));
  assert.deepEqual(comparison.droppedPaths, []);
});

test("the fixture's recorded extension list narrows eligibility when it is shorter than the script's default", async () => {
  const narrow = { ...fixture({ "src/a.ts": 3 }), sonar: { ...SONAR, extensions: [".ts"] } };
  const comparison = await compareFixture({ fixture: narrow, ledger: [], scoreFile: () => UNDER_BY_ONE, listFiles: () => ["src/a.ts", "src/legacy.js"] });
  assert.deepEqual(comparison.droppedPaths, []);
});

// --- report ------------------------------------------------------------------------------------

test("the report lists every problem on its own line after the totals compared", async () => {
  const comparison = await run({ files: { "src/a.ts": 2 }, issues: [{ path: "src/a.ts", line: 9, score: 17 }], results: { "src/a.ts": UNDER_BY_ONE } });
  const report = formatReport(comparison);
  assert.match(report, /compared 1 file total\(s\) and 1 fixture issue\(s\)/);
  assert.match(report, /\nsrc\/a\.ts: sonar 2, local 3, delta \+1 \(not covered by the ledger\)\n/);
  assert.match(report, /\nsrc\/a\.ts:9: sonar 17, local none/);
});

// --- calibrate.test.js in a child process ---------------------------------------------------------
// Integration proof without network: `node --test` over the real calibration test,
// with the fixture directory, ledger and corpus pointed at temporary synthetic data.

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CALIBRATE = path.join("test", "calibration", "calibrate.test.js");
const UNKNOWN_SHA = "0000000000000000000000000000000000000001";
const GIT_IDENTITY = ["-c", "user.name=calibration", "-c", "user.email=calibration@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false"];

const HEFTY = `export function hefty(n: number): number {
  let r = 0;
${Array.from({ length: 16 }, (_, i) => `  if (n > ${i}) r++;`).join("\n")}
  return r;
}

export function tiny(flag: boolean): number {
  return flag ? 1 : 0;
}
`;
const COUNT = `export function count(n: number): number {
  if (n <= 0) return 0;
  return 1 + count(n - 1);
}
`;
const CORPUS_FILES = {
  "src/a.ts": HEFTY,
  "src/b.ts": COUNT,
  "src/styles.css": ".x { color: red; }\n",
  "src/a.test.ts": "export const skipped = () => { if (a) { if (b) {} } };\n",
};
const SYNTHETIC_SONAR = { sources: ["src"], testInclusions: ["**/*.test.ts"], exclusions: [], extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"] };

function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), `cogplexity-${prefix}-`));
}

function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}

// Scrubbed env: under the pre-commit hook, an inherited GIT_DIR would point these
// commands at the package repository instead of the throwaway one.
function git(dir, ...args) {
  return execFileSync("git", [...GIT_IDENTITY, ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: gitEnv() });
}

/** A throwaway git repository holding `files` in one commit; returns its path and commit sha. */
function corpusRepo(files) {
  const dir = tempDir("corpus");
  git(dir, "init", "-q");
  for (const [filePath, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, filePath)), { recursive: true });
    writeFileSync(path.join(dir, filePath), text);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "synthetic corpus");
  return { dir, sha: git(dir, "rev-parse", "HEAD").trim() };
}

/** The fixture SonarCloud would have produced if it agreed with `score()` on every file. */
function syntheticFixture(sha, sources) {
  const files = {};
  const issues = [];
  for (const [filePath, text] of Object.entries(sources)) {
    const result = scoreSource(text, filePath);
    files[filePath] = result.total;
    for (const fn of result.functions) {
      if (fn.parent === null && fn.score > THRESHOLD) issues.push({ path: filePath, line: fn.nameLoc.start.line, score: fn.score });
    }
  }
  return { projectKey: "synthetic", repository: "example/synthetic", commitSha: sha, capturedAt: ADDED, sonar: SYNTHETIC_SONAR, files, issues };
}

/** Writes a fixture dir and ledger for the child process; returns the env overrides. */
function calibrationInputs(fixture, ledger = []) {
  const dir = tempDir("fixtures");
  if (fixture) writeFileSync(path.join(dir, "tasknotes-gantt.json"), JSON.stringify(fixture, null, 2));
  const ledgerPath = path.join(dir, "ledger.json");
  writeFileSync(ledgerPath, JSON.stringify(ledger));
  return { dir, env: { COGPLEXITY_FIXTURE_DIR: dir, COGPLEXITY_LEDGER: ledgerPath } };
}

function runCalibrate(overrides) {
  const env = { ...gitEnv(), ...overrides };
  // NODE_TEST_CONTEXT is what the parent runner sets; a child `node --test` refuses to run under it.
  for (const name of ["COGPLEXITY_CORPUS", "COGPLEXITY_FIXTURE_DIR", "COGPLEXITY_LEDGER", "NODE_TEST_CONTEXT"]) {
    if (!(name in overrides)) delete env[name];
  }
  const child = spawnSync(process.execPath, ["--test", "--test-reporter=tap", CALIBRATE], { cwd: ROOT_DIR, encoding: "utf8", env });
  return { status: child.status, output: `${child.stdout}\n${child.stderr}` };
}

test("with COGPLEXITY_CORPUS unset the calibration test is skipped with a visible reason", () => {
  const { status, output } = runCalibrate({});
  assert.equal(status, 0);
  assert.match(output, /# skipped 1/);
  assert.match(output, /# SKIP COGPLEXITY_CORPUS is unset/);
});

test("with a corpus but no fixture the calibration test is skipped naming the refresh command", (t) => {
  const repo = corpusRepo(CORPUS_FILES);
  const inputs = calibrationInputs(null);
  t.after(() => removeDir(repo.dir));
  t.after(() => removeDir(inputs.dir));
  const { status, output } = runCalibrate({ COGPLEXITY_CORPUS: repo.dir, ...inputs.env });
  assert.equal(status, 0);
  assert.match(output, /# skipped 1/);
  assert.match(output, /# SKIP no fixture captured yet; run `node scripts\/refresh-fixture\.mjs tasknotes-gantt/);
});

test("a clone lacking the fixture commit fails as corpus unavailable before scoring", (t) => {
  const repo = corpusRepo(CORPUS_FILES);
  const inputs = calibrationInputs(syntheticFixture(UNKNOWN_SHA, { "src/a.ts": HEFTY, "src/b.ts": COUNT }));
  t.after(() => removeDir(repo.dir));
  t.after(() => removeDir(inputs.dir));
  const { status, output } = runCalibrate({ COGPLEXITY_CORPUS: repo.dir, ...inputs.env });
  assert.equal(status, 1);
  assert.match(output, /# fail 1/);
  assert.ok(output.includes(`corpus unavailable: ${UNKNOWN_SHA} not found in`), output);
  assert.doesNotMatch(output, /diverges from SonarCloud/);
});

test("integration: a synthetic corpus whose fixture equals score() passes, even with a dirty tree on another branch", (t) => {
  const repo = corpusRepo(CORPUS_FILES);
  const fixture = syntheticFixture(repo.sha, { "src/a.ts": HEFTY, "src/b.ts": COUNT });
  const inputs = calibrationInputs(fixture);
  t.after(() => removeDir(repo.dir));
  t.after(() => removeDir(inputs.dir));
  assert.equal(fixture.issues.length, 1, "the synthetic corpus should carry one over-threshold function");

  git(repo.dir, "checkout", "-q", "-b", "elsewhere");
  writeFileSync(path.join(repo.dir, "src", "a.ts"), "export const dirty = () => { if (a) { if (b) { if (c) {} } } };\n");
  const { status, output } = runCalibrate({ COGPLEXITY_CORPUS: repo.dir, ...inputs.env });
  assert.equal(status, 0, output);
  assert.match(output, /# pass 1/);
  assert.match(output, /compared 2 file total\(s\) and 1 fixture issue\(s\)/);
  assert.match(output, /construct presence: recursion=yes declarativeOuter=no/);
});

test("integration: corrupting one fixture total fails the calibration test naming the path", (t) => {
  const repo = corpusRepo(CORPUS_FILES);
  const fixture = syntheticFixture(repo.sha, { "src/a.ts": HEFTY, "src/b.ts": COUNT });
  fixture.files["src/b.ts"] += 1;
  const inputs = calibrationInputs(fixture);
  t.after(() => removeDir(repo.dir));
  t.after(() => removeDir(inputs.dir));
  const { status, output } = runCalibrate({ COGPLEXITY_CORPUS: repo.dir, ...inputs.env });
  assert.equal(status, 1);
  assert.match(output, /# fail 1/);
  assert.match(output, /src\/b\.ts: sonar 3, local 2, delta -1 \(not covered by the ledger\)/);
  assert.doesNotMatch(output, /src\/a\.ts: sonar/);
});
