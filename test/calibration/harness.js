// Pure comparison logic for the calibration harness (plan KTD9): fixture versus
// local scores, per file and per function, with the exception ledger applied.
// No git, no network, no parser; `calibrate.test.js` supplies those through
// `scoreFile` and `listFiles`, and `harness.test.js` supplies synthetic ones.
//
// Sign conventions. The reported `delta` of a file is `local - sonar` (+1 means the
// specification counts one more than Sonar), which is also the number a `clause`
// entry must equal. A `file` entry's `expectedDelta` is `sonar - local` (KTD9), so
// a reported delta of +1 is recorded as `expectedDelta: -1`.
//
// Coverage. A `file` entry covers its own path. A `clause` entry names a construct and, for
// `logicalSequence`, optionally an `operator`; every clause entry naming at least one increment
// in a file must together explain the file's whole delta. The same entries explain a
// per-function mismatch when the root's score minus their increments equals Sonar's score, or
// stays at or below THRESHOLD where Sonar reported nothing.
//
// Result of `compareFixture`:
//   {
//     ok: boolean,                       // problems.length === 0
//     problems: string[],                // one line per failure, in report order
//     mismatches: {
//       files: [{ path, sonar, local, delta, coveredBy }],      // every file whose totals differ
//       functions: [{ path, line, name, sonar, local, coveredBy }], // per-function differences
//     },                                                        // coveredBy: LedgerEntry[] | null
//     uncovered: [...mismatches.files with coveredBy === null],
//     missingPaths: string[],            // fixture paths absent at the commit
//     droppedPaths: string[],            // eligible at the commit, absent from the fixture
//     staleEntries: LedgerEntry[],       // entries that covered nothing
//     invalidEntries: [{ entry, reason }],
//     fileEntryFailures: [{ path, expectedDelta, observedDelta }],
//     presence: { recursion: boolean, declarativeOuter: boolean },
//     summary: { files, issues, reported, ledgerApplied },
//   }
//
// Per-function findings compare what SonarCloud reports per function (S3776): the score of
// the function's own body — nested functions excluded, nesting counted from that body — not
// the inclusive root score the rule reports; `ownScores` derives it from the same increments.
import path from "node:path";

import { CONSTRUCTS } from "../../src/score.js";
import { ELIGIBLE_EXTENSIONS, isEligiblePath } from "../../scripts/refresh-fixture.mjs";

/** Sonar's S3776 default: a root function is reported when `score > THRESHOLD`. */
export const THRESHOLD = 15;

const KINDS = new Set(["file", "clause"]);
const OPERATORS = new Set(["&&", "||"]);

// --- ledger ------------------------------------------------------------------

function entryProblem(entry, index) {
  if (entry === null || typeof entry !== "object") return `ledger entry ${index + 1} is not an object`;
  const label = `ledger entry ${index + 1} (${entry.match ?? "?"})`;
  if (!KINDS.has(entry.kind)) return `${label} has kind "${entry.kind}"; expected "file" or "clause"`;
  if (typeof entry.match !== "string" || entry.match === "") return `${label} has no match`;
  if (typeof entry.reason !== "string" || entry.reason.trim() === "") return `${label} has no reason`;
  if (typeof entry.addedAt !== "string" || entry.addedAt === "") return `${label} has no addedAt`;
  return entry.kind === "file" ? fileEntryProblem(entry) : clauseEntryProblem(entry);
}

function fileEntryProblem(entry) {
  if (!Number.isInteger(entry.expectedDelta)) return `ledger file entry "${entry.match}" has no integer expectedDelta`;
  if (entry.operator !== undefined) return `ledger file entry "${entry.match}" carries an operator; only logicalSequence clause entries may`;
  return null;
}

function clauseEntryProblem(entry) {
  if (!CONSTRUCTS.includes(entry.match)) return `ledger clause entry "${entry.match}" is not a construct identifier (${CONSTRUCTS.join(", ")})`;
  if (entry.operator === undefined) return null;
  if (entry.match !== "logicalSequence") return `ledger clause entry "${entry.match}" carries an operator; only logicalSequence clause entries may`;
  if (!OPERATORS.has(entry.operator)) return `ledger clause entry "${entry.match}" has operator "${entry.operator}"; expected "&&" or "||"`;
  return null;
}

/** Splits a ledger into usable entries and one problem line per rejected entry. */
export function validateLedger(ledger) {
  const entries = [];
  const invalidEntries = [];
  const list = Array.isArray(ledger) ? ledger : [];
  list.forEach((entry, index) => {
    const reason = entryProblem(entry, index);
    if (reason === null) entries.push(entry);
    else invalidEntries.push({ entry, reason });
  });
  if (!Array.isArray(ledger)) invalidEntries.push({ entry: ledger, reason: "ledger is not an array" });
  return { entries, invalidEntries };
}

/** Whether an increment is one a clause entry names: its construct, and its operator when the entry has one. */
function matchesClause(entry, increment) {
  return increment.construct === entry.match && (entry.operator === undefined || increment.operator === entry.operator);
}

/** Summed `amount` of the increments a clause entry names in one increment list. */
function clauseAmountIn(entry, increments) {
  let sum = 0;
  for (const increment of increments) if (matchesClause(entry, increment)) sum += increment.amount;
  return sum;
}

/** The same, summed over root functions and top level (roots are inclusive of nested entries). */
function clauseAmount(entry, result) {
  const scopes = [...result.functions.filter((fn) => fn.parent === null), result.topLevel];
  return scopes.reduce((sum, scope) => sum + clauseAmountIn(entry, scope.increments), 0);
}

/** Summed `amount` of one construct — of one operator, when given — over root functions and top level. */
export function constructAmount(result, construct, operator = undefined) {
  return clauseAmount({ match: construct, operator }, result);
}

/**
 * The clause entries explaining a file's delta: every clause entry naming at least one
 * increment in the file, provided their amounts together equal the whole delta. Null otherwise.
 */
export function clausesCovering(entries, file) {
  const present = entries.filter((entry) => entry.kind === "clause" && clauseAmount(entry, file.result) !== 0);
  const explained = present.reduce((sum, entry) => sum + clauseAmount(entry, file.result), 0);
  return present.length > 0 && file.delta === explained ? present : null;
}

/** A clause entry on its own covers a file only when the whole delta is that construct's contribution. */
export function coversByClause(entry, file) {
  return clausesCovering([entry], file) !== null;
}

/** A file entry covers its path only when Sonar minus local equals `expectedDelta` exactly. */
export function coversByFile(entry, file) {
  return entry.kind === "file" && entry.match === file.path && entry.expectedDelta === file.sonar - file.local;
}

function fileEntryFor(entries, filePath) {
  return entries.find((entry) => entry.kind === "file" && entry.match === filePath) ?? null;
}

/** The entries covering a file's delta: its `file` entry when one names the path, else its clause entries. */
function fileCoverage(entries, file) {
  const fileEntry = fileEntryFor(entries, file.path);
  if (fileEntry) return coversByFile(fileEntry, file) ? [fileEntry] : null;
  return clausesCovering(entries, file);
}

// --- per-function ----------------------------------------------------------------

/** Constructs whose amount carries a nesting increment (Appendix B §3). */
const NESTING_BEARING = new Set(["if", "ternary", "switch", "loop", "catch", "ifBlock", "eachBlock", "awaitBlock"]);

/**
 * What SonarCloud reports per function (S3776): the increments of the function's own body —
 * nested functions excluded — with nesting counted from that body rather than from the file
 * root. A root without nested functions scores exactly its `score`; the rule itself reports a
 * root's inclusive score (plan KTD7), so the two only meet through this derivation.
 */
export function ownScores(result) {
  return result.functions.map((entry, index) => {
    const children = result.functions.filter((fn) => fn.parent === index);
    const own = entry.increments.filter((inc) => !children.some((child) => encloses(child.loc, inc.loc)));
    const score = own.reduce((sum, inc) => sum + (NESTING_BEARING.has(inc.construct) ? inc.amount - entry.nesting : inc.amount), 0);
    return { entry, line: entry.nameLoc.start.line, own, score };
  });
}

function reportedCount(result) {
  return ownScores(result).filter((fn) => fn.score > THRESHOLD).length;
}

function takeMatching(list, predicate) {
  const index = list.findIndex(predicate);
  return index === -1 ? null : list.splice(index, 1)[0];
}

/**
 * The entries explaining one per-function mismatch: the path's `file` entry, or the clause
 * entries whose increments within the function's own body bring its score to Sonar's — or to
 * THRESHOLD or below where Sonar reported no issue. Null when nothing does.
 */
function functionCoverage(entries, filePath, fn, sonar) {
  const fileEntry = fileEntryFor(entries, filePath);
  if (fileEntry) return [fileEntry];
  if (fn === null) return null;
  const clauses = entries.filter((entry) => entry.kind === "clause" && clauseAmountIn(entry, fn.own) !== 0);
  const adjusted = fn.score - clauses.reduce((sum, entry) => sum + clauseAmountIn(entry, fn.own), 0);
  const explained = sonar === null ? adjusted <= THRESHOLD : adjusted === sonar;
  return clauses.length > 0 && explained ? clauses : null;
}

function functionMismatch(entries, filePath, line, fn, sonar) {
  return { path: filePath, line, name: fn ? fn.entry.name : null, sonar, local: fn ? fn.score : null, coveredBy: functionCoverage(entries, filePath, fn, sonar) };
}

/**
 * Pairs each function whose own-body score exceeds THRESHOLD with a fixture issue on its
 * name line carrying the same score; whatever is left on either side is a mismatch, covered
 * or not by `entries`.
 */
export function compareFindings(filePath, result, issues, entries = []) {
  const pending = issues.filter((issue) => issue.path === filePath);
  const functions = ownScores(result);
  const mismatches = [];
  for (const fn of functions.filter((candidate) => candidate.score > THRESHOLD)) {
    if (takeMatching(pending, (issue) => issue.line === fn.line && issue.score === fn.score)) continue;
    const issue = takeMatching(pending, (candidate) => candidate.line === fn.line);
    mismatches.push(functionMismatch(entries, filePath, fn.line, fn, issue ? issue.score : null));
  }
  for (const issue of pending) {
    mismatches.push(functionMismatch(entries, filePath, issue.line, functions.find((fn) => fn.line === issue.line) ?? null, issue.score));
  }
  return mismatches;
}

// --- construct presence --------------------------------------------------------------

function before(a, b) {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

function encloses(outer, inner) {
  return before(outer.start, inner.start) && before(inner.end, outer.end);
}

/**
 * Approximates an Appendix A promotion: a root function whose location lies inside
 * another function entry's location. `score()` does not flag promotion itself.
 */
export function isPromotedRoot(entry, functions) {
  return entry.parent === null && functions.some((other) => other !== entry && encloses(other.loc, entry.loc));
}

function hasRecursion(result) {
  return constructAmount(result, "recursion") > 0;
}

function hasPromotedRoot(result) {
  return result.functions.some((fn) => isPromotedRoot(fn, result.functions));
}

// --- eligible set ------------------------------------------------------------------------

function eligibleAtCommit(filePath, sonar) {
  const extensions = Array.isArray(sonar.extensions) ? sonar.extensions : ELIGIBLE_EXTENSIONS;
  return extensions.includes(path.posix.extname(filePath)) && isEligiblePath(filePath, sonar);
}

/** Fixture paths absent at the commit, and eligible files at the commit the fixture lacks. */
export function partitionPaths(fixture, listed) {
  const present = new Set(listed);
  const missing = Object.keys(fixture.files).filter((p) => !present.has(p));
  const dropped = listed.filter((p) => !Object.hasOwn(fixture.files, p) && eligibleAtCommit(p, fixture.sonar)).sort();
  return { missing, dropped };
}

// --- formatting ---------------------------------------------------------------------------

function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

function orNone(n) {
  return n === null ? "none" : String(n);
}

function fileLine(m) {
  return `${m.path}: sonar ${m.sonar}, local ${m.local}, delta ${signed(m.delta)} (not covered by the ledger)`;
}

function functionLine(m) {
  const where = m.name === null ? `${m.path}:${m.line}` : `${m.path}:${m.line} ${m.name}`;
  const why = m.sonar === null ? " (no fixture issue at this line)" : m.local === null ? " (no function at this line)" : "";
  return `${where}: sonar ${orNone(m.sonar)}, local ${orNone(m.local)}${why}`;
}

function staleLine(entry) {
  return entry.kind === "clause"
    ? `ledger clause entry "${entry.match}" covers no file (stale)`
    : `ledger file entry "${entry.match}" names no fixture path (stale)`;
}

function fileEntryLine(f) {
  return `${f.path}: ledger file entry expects delta ${f.expectedDelta} (Sonar minus local) but observed ${f.observedDelta}`;
}

function collectProblems(c) {
  return [
    ...c.invalidEntries.map((i) => i.reason),
    ...c.missingPaths.map((p) => `${p}: fixture path not found at the corpus commit`),
    ...c.droppedPaths.map((p) => `${p}: eligible at the corpus commit but absent from the fixture (the refresh dropped it)`),
    ...c.uncovered.map(fileLine),
    ...c.fileEntryFailures.map(fileEntryLine),
    ...c.mismatches.functions.filter((m) => m.coveredBy === null).map(functionLine),
    ...c.staleEntries.map(staleLine),
  ];
}

/** The multi-line report the calibration test prints: totals compared, presence, then every problem. */
export function formatReport(comparison) {
  const { summary, presence } = comparison;
  const yesNo = (flag) => (flag ? "yes" : "no");
  return [
    `compared ${summary.files} file total(s) and ${summary.issues} fixture issue(s); ${summary.reported} function(s) over ${THRESHOLD} by own body; ${summary.ledgerApplied} ledger entr(y/ies) applied`,
    `construct presence: recursion=${yesNo(presence.recursion)} declarativeOuter=${yesNo(presence.declarativeOuter)}`,
    ...comparison.problems,
  ].join("\n");
}

// --- comparison ------------------------------------------------------------------------------

async function scoreFixtureFiles(fixture, scoreFile, missing) {
  const skip = new Set(missing);
  const files = [];
  for (const [filePath, sonar] of Object.entries(fixture.files)) {
    if (skip.has(filePath)) continue;
    const result = await scoreFile(filePath);
    files.push({ path: filePath, sonar, local: result.total, delta: result.total - sonar, result });
  }
  return files;
}

function applyLedger(entries, files) {
  const used = new Set();
  const mismatches = files.filter((file) => file.delta !== 0).map((file) => ({ ...file, coveredBy: fileCoverage(entries, file) }));
  for (const mismatch of mismatches) for (const entry of mismatch.coveredBy ?? []) used.add(entry);
  return { mismatches, used };
}

function fileEntryFailure(entry, files) {
  const file = files.find((f) => f.path === entry.match);
  if (!file) return null;
  const observedDelta = file.sonar - file.local;
  return observedDelta === entry.expectedDelta ? null : { path: entry.match, expectedDelta: entry.expectedDelta, observedDelta };
}

function checkEntries(entries, files, used) {
  const staleEntries = [];
  const fileEntryFailures = [];
  for (const entry of entries) {
    if (entry.kind === "clause") {
      if (!used.has(entry)) staleEntries.push(entry);
      continue;
    }
    const failure = fileEntryFailure(entry, files);
    if (failure) fileEntryFailures.push(failure);
    else if (!files.some((f) => f.path === entry.match)) staleEntries.push(entry);
  }
  return { staleEntries, fileEntryFailures };
}

function functionMismatches(files, fixture, entries) {
  return files.flatMap((file) => compareFindings(file.path, file.result, fixture.issues, entries));
}

function presenceOf(files) {
  return {
    recursion: files.some((file) => hasRecursion(file.result)),
    declarativeOuter: files.some((file) => hasPromotedRoot(file.result)),
  };
}

function summarize(files, fixture, used, functions) {
  const applied = new Set(used);
  for (const mismatch of functions) for (const entry of mismatch.coveredBy ?? []) applied.add(entry);
  return {
    files: files.length,
    issues: fixture.issues.length,
    reported: files.reduce((sum, file) => sum + reportedCount(file.result), 0),
    ledgerApplied: applied.size,
  };
}

/**
 * Compares a fixture with local scores under a ledger.
 *
 * @param {object} options
 * @param {object} options.fixture The fixture as the refresh script writes it.
 * @param {object[]} options.ledger The parsed `calibration/ledger.json`.
 * @param {(path: string) => object | Promise<object>} options.scoreFile Scores one fixture path.
 * @param {() => string[] | Promise<string[]>} options.listFiles Every path at the corpus commit.
 */
export async function compareFixture({ fixture, ledger, scoreFile, listFiles }) {
  const { entries, invalidEntries } = validateLedger(ledger);
  const { missing, dropped } = partitionPaths(fixture, await listFiles());
  const files = await scoreFixtureFiles(fixture, scoreFile, missing);
  const { mismatches, used } = applyLedger(entries, files);
  const { staleEntries, fileEntryFailures } = checkEntries(entries, files, used);
  const functions = functionMismatches(files, fixture, entries);
  const comparison = {
    mismatches: { files: mismatches, functions },
    uncovered: mismatches.filter((m) => m.coveredBy === null),
    missingPaths: missing,
    droppedPaths: dropped,
    staleEntries,
    invalidEntries,
    fileEntryFailures,
    presence: presenceOf(files),
    summary: summarize(files, fixture, used, functions),
  };
  comparison.problems = collectProblems(comparison);
  comparison.ok = comparison.problems.length === 0;
  return comparison;
}
