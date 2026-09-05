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
// Result of `compareFixture`:
//   {
//     ok: boolean,                       // problems.length === 0
//     problems: string[],                // one line per failure, in report order
//     mismatches: {
//       files: [{ path, sonar, local, delta, coveredBy }],      // every file whose totals differ
//       functions: [{ path, line, name, sonar, local, coveredBy }], // per-function differences
//     },
//     uncovered: [...mismatches.files with coveredBy === null],
//     missingPaths: string[],            // fixture paths absent at the commit
//     droppedPaths: string[],            // eligible at the commit, absent from the fixture
//     staleEntries: LedgerEntry[],       // entries that covered nothing
//     invalidEntries: [{ entry, reason }],
//     fileEntryFailures: [{ path, expectedDelta, observedDelta }],
//     presence: { recursion: boolean, declarativeOuter: boolean },
//     summary: { files, issues, roots, ledgerApplied },
//   }
import path from "node:path";

import { CONSTRUCTS } from "../../src/score.js";
import { ELIGIBLE_EXTENSIONS, isEligiblePath } from "../../scripts/refresh-fixture.mjs";

/** Sonar's S3776 default: a root function is reported when `score > THRESHOLD`. */
export const THRESHOLD = 15;

const KINDS = new Set(["file", "clause"]);

// --- ledger ------------------------------------------------------------------

function entryProblem(entry, index) {
  const label = `ledger entry ${index + 1} (${entry?.match ?? "?"})`;
  if (entry === null || typeof entry !== "object") return `ledger entry ${index + 1} is not an object`;
  if (!KINDS.has(entry.kind)) return `${label} has kind "${entry.kind}"; expected "file" or "clause"`;
  if (typeof entry.match !== "string" || entry.match === "") return `${label} has no match`;
  if (typeof entry.reason !== "string" || entry.reason.trim() === "") return `${label} has no reason`;
  if (typeof entry.addedAt !== "string" || entry.addedAt === "") return `${label} has no addedAt`;
  if (entry.kind === "file" && !Number.isInteger(entry.expectedDelta)) {
    return `ledger file entry "${entry.match}" has no integer expectedDelta`;
  }
  if (entry.kind === "clause" && !CONSTRUCTS.includes(entry.match)) {
    return `ledger clause entry "${entry.match}" is not a construct identifier (${CONSTRUCTS.join(", ")})`;
  }
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

/** Summed `amount` of one construct over root functions and top level (roots are inclusive of nested entries). */
export function constructAmount(result, construct) {
  const scopes = [...result.functions.filter((fn) => fn.parent === null), result.topLevel];
  let sum = 0;
  for (const scope of scopes) {
    for (const increment of scope.increments) if (increment.construct === construct) sum += increment.amount;
  }
  return sum;
}

/** A clause entry covers a file only when the whole delta is that construct's contribution. */
export function coversByClause(entry, file) {
  return entry.kind === "clause" && file.delta !== 0 && file.delta === constructAmount(file.result, entry.match);
}

/** A file entry covers its path only when Sonar minus local equals `expectedDelta` exactly. */
export function coversByFile(entry, file) {
  return entry.kind === "file" && entry.match === file.path && entry.expectedDelta === file.sonar - file.local;
}

function covers(entry, file) {
  return entry.kind === "file" ? coversByFile(entry, file) : coversByClause(entry, file);
}

// --- per-function ----------------------------------------------------------------

function reportedRoots(result) {
  return result.functions.filter((fn) => fn.parent === null && fn.score > THRESHOLD);
}

function takeMatching(list, predicate) {
  const index = list.findIndex(predicate);
  return index === -1 ? null : list.splice(index, 1)[0];
}

function rootMismatch(filePath, root, issue) {
  return { path: filePath, line: root.nameLoc.start.line, name: root.name, sonar: issue ? issue.score : null, local: root.score, coveredBy: null };
}

function issueMismatch(filePath, issue, result) {
  const atLine = result.functions.find((fn) => fn.parent === null && fn.nameLoc.start.line === issue.line);
  return { path: filePath, line: issue.line, name: atLine ? atLine.name : null, sonar: issue.score, local: atLine ? atLine.score : null, coveredBy: null };
}

/**
 * Pairs each reported root with a fixture issue on its name line carrying the same
 * score; whatever is left on either side is a mismatch.
 */
export function compareFindings(filePath, result, issues) {
  const pending = issues.filter((issue) => issue.path === filePath);
  const mismatches = [];
  for (const root of reportedRoots(result)) {
    const line = root.nameLoc.start.line;
    const exact = takeMatching(pending, (issue) => issue.line === line && issue.score === root.score);
    if (exact) continue;
    mismatches.push(rootMismatch(filePath, root, takeMatching(pending, (issue) => issue.line === line)));
  }
  for (const issue of pending) mismatches.push(issueMismatch(filePath, issue, result));
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
  const why = m.sonar === null ? " (no fixture issue at this line)" : m.local === null ? ` (no root function over ${THRESHOLD} at this line)` : "";
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
    `compared ${summary.files} file total(s) and ${summary.issues} fixture issue(s); ${summary.roots} root function(s) over ${THRESHOLD}; ${summary.ledgerApplied} ledger entr(y/ies) applied`,
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
  const mismatches = files.filter((file) => file.delta !== 0).map((file) => ({ ...file, coveredBy: null }));
  for (const mismatch of mismatches) {
    mismatch.coveredBy = entries.find((entry) => covers(entry, mismatch)) ?? null;
    if (mismatch.coveredBy) used.add(mismatch.coveredBy);
  }
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
  const fileEntryFor = (filePath) => entries.find((e) => e.kind === "file" && e.match === filePath) ?? null;
  return files.flatMap((file) =>
    compareFindings(file.path, file.result, fixture.issues).map((m) => ({ ...m, coveredBy: fileEntryFor(file.path) })),
  );
}

function presenceOf(files) {
  return {
    recursion: files.some((file) => hasRecursion(file.result)),
    declarativeOuter: files.some((file) => hasPromotedRoot(file.result)),
  };
}

function summarize(files, fixture, used, fileEntryFailures, functions) {
  const appliedFileEntries = new Set(functions.map((m) => m.coveredBy).filter(Boolean));
  for (const entry of used) appliedFileEntries.add(entry);
  return {
    files: files.length,
    issues: fixture.issues.length,
    roots: files.reduce((sum, file) => sum + reportedRoots(file.result).length, 0),
    ledgerApplied: appliedFileEntries.size,
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
    summary: summarize(files, fixture, used, fileEntryFailures, functions),
  };
  comparison.problems = collectProblems(comparison);
  comparison.ok = comparison.problems.length === 0;
  return comparison;
}
