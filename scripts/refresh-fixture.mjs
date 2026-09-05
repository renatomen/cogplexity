#!/usr/bin/env node
// Refreshes `calibration/fixtures/<corpus>.json` from the SonarCloud API (plan KTD9/KTD10).
//
//   node scripts/refresh-fixture.mjs <corpus> [--project-key KEY] [--repository OWNER/REPO]
//        [--sources a,b] [--test-inclusions glob,glob] [--exclusions glob,glob]
//
// Corpus metadata comes from the existing fixture when there is one; a flag
// overrides the corresponding field, and all of `--project-key`, `--repository`
// and `--sources` are required when no fixture exists yet.
//
// Credential: the SONAR_TOKEN environment variable, else a `SONAR_TOKEN=` line
// in an untracked repo-root `.env`. The script refuses to run when `.env` is
// tracked by git, and it never prints request headers. Without a credential it
// still tries unauthenticated, which works for a public SonarCloud project.
//
// Glob subset for test inclusions and exclusions: `**` matches any number of
// path segments (`**/` also matches zero segments), `*` matches within one
// segment, `?` matches one character; a pattern without wildcards matches that
// exact path or anything beneath it as a directory.
//
// Exit codes: 0 success; 2 configuration, credential or API error. Never 1,
// which the calibration test reserves for a mismatch.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const API_BASE = "https://sonarcloud.io/api";
export const ELIGIBLE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
export const S3776_RULES = "typescript:S3776,javascript:S3776";
export const METRIC = "cognitive_complexity";

const PAGE_SIZE = 500;
const BACKOFF_MS = [500, 1000, 2000];
const RESOLVED_STATUSES = new Set(["RESOLVED", "CLOSED"]);
const CORPUS_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// "Refactor this function to reduce its Cognitive Complexity from 50 to the 15 allowed."
const SCORE_PATTERN = /\bfrom (\d+)\b/;
const KNOWN_FLAGS = new Set(["project-key", "repository", "sources", "test-inclusions", "exclusions"]);
const USAGE =
  "usage: node scripts/refresh-fixture.mjs <corpus> [--project-key KEY] [--repository OWNER/REPO] " +
  "[--sources a,b] [--test-inclusions glob,glob] [--exclusions glob,glob]";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_FIXTURE_DIR = path.join(ROOT_DIR, "calibration", "fixtures");

export class RefreshError extends Error {
  constructor(message) {
    super(message);
    this.name = "RefreshError";
    this.exitCode = 2;
  }
}

// --- credential --------------------------------------------------------------

function defaultIsEnvTracked() {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", ".env"], { cwd: ROOT_DIR, stdio: "ignore" });
  return result.status === 0;
}

function defaultReadEnvFile() {
  const file = path.join(ROOT_DIR, ".env");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function stripQuotes(value) {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

function credentialFromEnvFile(text) {
  if (!text) return undefined;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?SONAR_TOKEN\s*=\s*(.*?)\s*$/.exec(line);
    if (match) return stripQuotes(match[1]) || undefined;
  }
  return undefined;
}

/**
 * Resolves the SonarCloud credential: environment first, then an untracked `.env`.
 * Throws when `.env` is tracked by git. Returns undefined when nothing is configured.
 */
export function resolveCredential({
  env = process.env,
  isEnvTracked = defaultIsEnvTracked,
  readEnvFile = defaultReadEnvFile,
} = {}) {
  if (isEnvTracked()) {
    throw new RefreshError(
      ".env is tracked by git; refusing to run. Remove it from the index (git rm --cached .env) and keep it ignored.",
    );
  }
  return env.SONAR_TOKEN || credentialFromEnvFile(readEnvFile());
}

// --- HTTP --------------------------------------------------------------------

function describeRequest(url) {
  return `${url.pathname}?${url.searchParams}`;
}

function checkStatus(response, url) {
  if (response.ok) return response;
  const where = describeRequest(url);
  if (response.status === 401 || response.status === 403) {
    throw new RefreshError(
      `SonarCloud returned HTTP ${response.status} for ${where}: a valid credential is required ` +
        "(set SONAR_TOKEN or add it to an untracked .env).",
    );
  }
  throw new RefreshError(`SonarCloud returned HTTP ${response.status} for ${where}; aborting without writing the fixture.`);
}

function createClient({ fetch: fetchImpl, credential, delay, apiBase }) {
  const headers = credential ? { Authorization: `Bearer ${credential}` } : {};
  const state = { retries: 0 };

  async function fetchWithRetry(url) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(url.toString(), { headers });
      if (response.status !== 429 || attempt >= BACKOFF_MS.length) return checkStatus(response, url);
      state.retries++;
      await delay(BACKOFF_MS[attempt]);
    }
  }

  async function request(endpoint, params) {
    const url = new URL(`${apiBase}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchWithRetry(url);
    return response.json();
  }

  return { request, state };
}

function pageOf(body, endpoint, listKey) {
  const total = body?.paging?.total;
  const items = body?.[listKey];
  if (!Number.isInteger(total) || !Array.isArray(items)) {
    throw new RefreshError(`Unexpected response shape from ${endpoint}: expected paging.total and a "${listKey}" array.`);
  }
  return { total, items };
}

async function fetchAllPages(client, endpoint, params, listKey) {
  const first = pageOf(await client.request(endpoint, { ...params, ps: PAGE_SIZE, p: 1 }), endpoint, listKey);
  const items = [...first.items];
  const pageCount = Math.ceil(first.total / PAGE_SIZE);
  for (let p = 2; p <= pageCount; p++) {
    const page = pageOf(await client.request(endpoint, { ...params, ps: PAGE_SIZE, p }), endpoint, listKey);
    items.push(...page.items);
  }
  if (items.length !== first.total) {
    throw new RefreshError(
      `${endpoint} returned ${items.length} entries but paging.total was ${first.total}; aborting without writing the fixture.`,
    );
  }
  return items;
}

async function latestAnalysis(client, projectKey) {
  const body = await client.request("project_analyses/search", { project: projectKey, ps: 1 });
  const analysis = body?.analyses?.[0];
  if (typeof analysis?.revision !== "string" || analysis.revision === "") {
    throw new RefreshError(`No analysis with a revision was found for project ${projectKey}.`);
  }
  return { revision: analysis.revision, date: analysis.date };
}

// --- eligibility -------------------------------------------------------------

function globToken(pattern, index) {
  if (pattern.startsWith("**/", index)) return { source: "(?:.*/)?", length: 3 };
  if (pattern.startsWith("**", index)) return { source: ".*", length: 2 };
  if (pattern[index] === "*") return { source: "[^/]*", length: 1 };
  if (pattern[index] === "?") return { source: "[^/]", length: 1 };
  return { source: pattern[index].replace(/[.+^${}()|[\]\\]/g, "\\$&"), length: 1 };
}

const compiledGlobs = new Map();

/** Compiled once per distinct pattern; the same few patterns are tested against every path. */
export function globToRegExp(pattern) {
  let regExp = compiledGlobs.get(pattern);
  if (regExp === undefined) {
    let source = "";
    let index = 0;
    while (index < pattern.length) {
      const token = globToken(pattern, index);
      source += token.source;
      index += token.length;
    }
    regExp = new RegExp(`^${source}$`);
    compiledGlobs.set(pattern, regExp);
  }
  return regExp;
}

/** See the glob subset documented at the top of this file. */
export function matchesPattern(pattern, filePath) {
  if (!/[*?]/.test(pattern)) return filePath === pattern || filePath.startsWith(`${pattern}/`);
  return globToRegExp(pattern).test(filePath);
}

function normalizeDir(source) {
  return source.replace(/^\.\//, "").replace(/\/+$/, "");
}

function underSources(filePath, sources) {
  return sources.map(normalizeDir).some((dir) => dir === "" || dir === "." || matchesPattern(dir, filePath));
}

export function isEligiblePath(filePath, sonar) {
  return (
    ELIGIBLE_EXTENSIONS.includes(path.posix.extname(filePath)) &&
    underSources(filePath, sonar.sources) &&
    !sonar.testInclusions.some((pattern) => matchesPattern(pattern, filePath)) &&
    !sonar.exclusions.some((pattern) => matchesPattern(pattern, filePath))
  );
}

// --- files and issues --------------------------------------------------------

function measureValue(component) {
  const measure = (component.measures ?? []).find((entry) => entry.metric === METRIC);
  if (!measure || measure.value === undefined || measure.value === "") return undefined;
  const value = Number(measure.value);
  if (!Number.isInteger(value)) {
    throw new RefreshError(`Non-integer ${METRIC} value "${measure.value}" for ${component.path}.`);
  }
  return value;
}

function collectFiles(components, sonar) {
  const files = {};
  for (const component of components) {
    if (typeof component.path !== "string" || !isEligiblePath(component.path, sonar)) continue;
    const value = measureValue(component);
    if (value !== undefined) files[component.path] = value;
  }
  return Object.fromEntries(Object.keys(files).sort().map((key) => [key, files[key]]));
}

export function parseScore(message) {
  const match = SCORE_PATTERN.exec(message ?? "");
  if (!match) {
    throw new RefreshError(`Cannot parse a Cognitive Complexity score from issue message: "${message}"`);
  }
  return Number(match[1]);
}

function issuePath(issue, projectKey) {
  const prefix = `${projectKey}:`;
  if (typeof issue.component !== "string" || !issue.component.startsWith(prefix)) {
    throw new RefreshError(`Issue component "${issue.component}" does not belong to project ${projectKey}.`);
  }
  return issue.component.slice(prefix.length);
}

function compareStrings(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function compareIssues(a, b) {
  return compareStrings(a.path, b.path) || a.line - b.line || a.score - b.score;
}

function toFixtureIssue(issue, filePath) {
  if (!Number.isInteger(issue.line)) {
    throw new RefreshError(`Issue on ${filePath} carries no line number: "${issue.message}"`);
  }
  return { path: filePath, line: issue.line, score: parseScore(issue.message) };
}

function collectIssues(issues, projectKey, files) {
  const kept = [];
  for (const issue of issues) {
    if (RESOLVED_STATUSES.has(issue.status)) continue;
    const filePath = issuePath(issue, projectKey);
    if (Object.hasOwn(files, filePath)) kept.push(toFixtureIssue(issue, filePath));
  }
  return kept.sort(compareIssues);
}

// --- fixture -----------------------------------------------------------------

function normalizeSonar(sonar = {}) {
  return {
    sources: [...(sonar.sources ?? [])],
    testInclusions: [...(sonar.testInclusions ?? [])],
    exclusions: [...(sonar.exclusions ?? [])],
  };
}

function assertCorpusName(corpus) {
  if (typeof corpus !== "string" || !CORPUS_NAME.test(corpus)) {
    throw new RefreshError(`A corpus name is required (letters, digits, ".", "_" and "-" only). ${USAGE}`);
  }
}

function assertMetadata(metadata) {
  const missing = [];
  if (typeof metadata.projectKey !== "string" || metadata.projectKey === "") missing.push("--project-key");
  if (typeof metadata.repository !== "string" || metadata.repository === "") missing.push("--repository");
  if (!Array.isArray(metadata.sonar?.sources) || metadata.sonar.sources.length === 0) missing.push("--sources");
  if (missing.length > 0) {
    throw new RefreshError(`No fixture exists for this corpus yet, so ${missing.join(", ")} must be given. ${USAGE}`);
  }
}

function buildFixture({ metadata, sonar, commitSha, capturedAt, files, issues }) {
  return {
    projectKey: metadata.projectKey,
    repository: metadata.repository,
    commitSha,
    capturedAt,
    sonar: { ...sonar, extensions: [...ELIGIBLE_EXTENSIONS] },
    files,
    issues,
  };
}

function readExistingFixture(fixturePath) {
  if (!existsSync(fixturePath)) return undefined;
  try {
    return JSON.parse(readFileSync(fixturePath, "utf8"));
  } catch (error) {
    throw new RefreshError(`Existing fixture ${fixturePath} is not valid JSON: ${error.message}`);
  }
}

function writeFixtureAtomically(fixturePath, fixture) {
  mkdirSync(path.dirname(fixturePath), { recursive: true });
  const tempPath = `${fixturePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(fixture, null, 2)}\n`);
  try {
    renameSync(tempPath, fixturePath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

// --- diff --------------------------------------------------------------------

function issueKey(issue) {
  return `${issue.path}:${issue.line}:${issue.score}`;
}

export function diffFixtures(previous, next) {
  const before = previous?.files ?? {};
  const after = next.files;
  const beforeIssues = previous?.issues ?? [];
  const beforeKeys = new Set(beforeIssues.map(issueKey));
  const afterKeys = new Set(next.issues.map(issueKey));
  return {
    addedFiles: Object.keys(after).filter((p) => !Object.hasOwn(before, p)),
    removedFiles: Object.keys(before)
      .filter((p) => !Object.hasOwn(after, p))
      .sort(),
    changedFiles: Object.keys(after)
      .filter((p) => Object.hasOwn(before, p) && before[p] !== after[p])
      .map((p) => ({ path: p, from: before[p], to: after[p] })),
    addedIssues: next.issues.filter((issue) => !beforeKeys.has(issueKey(issue))),
    removedIssues: beforeIssues.filter((issue) => !afterKeys.has(issueKey(issue))),
  };
}

function section(title, entries) {
  return [`${title} (${entries.length})`, ...entries.map((entry) => `  ${entry}`)];
}

function formatIssue(issue) {
  return `${issue.path}:${issue.line} (${issue.score})`;
}

export function formatDiff(diff) {
  return [
    ...section("added paths", diff.addedFiles),
    ...section("removed paths", diff.removedFiles),
    ...section("changed paths", diff.changedFiles.map((c) => `${c.path} (${c.from} -> ${c.to})`)),
    ...section("added issues", diff.addedIssues.map(formatIssue)),
    ...section("removed issues", diff.removedIssues.map(formatIssue)),
  ];
}

// --- refresh -----------------------------------------------------------------

const TREE_PARAMS = { metricKeys: METRIC, qualifiers: "FIL", strategy: "leaves" };

/**
 * Captures the corpus fixture from SonarCloud and replaces the fixture file atomically.
 * Everything with a side effect is injectable so tests replay canned responses.
 *
 * @returns {Promise<{ fixture: object, fixturePath: string, diff: object, retries: number }>}
 */
export async function refreshFixture({
  corpus,
  metadata,
  fixtureDir = DEFAULT_FIXTURE_DIR,
  credential,
  fetch: fetchImpl = fetch,
  now = () => new Date(),
  delay = sleep,
  log = console.log,
  apiBase = API_BASE,
}) {
  assertCorpusName(corpus);
  assertMetadata(metadata);
  const sonar = normalizeSonar(metadata.sonar);
  const fixturePath = path.join(fixtureDir, `${corpus}.json`);
  const previous = readExistingFixture(fixturePath);
  const client = createClient({ fetch: fetchImpl, credential, delay, apiBase });
  const { projectKey } = metadata;

  const first = await latestAnalysis(client, projectKey);
  const components = await fetchAllPages(client, "measures/component_tree", { component: projectKey, ...TREE_PARAMS }, "components");
  const rawIssues = await fetchAllPages(client, "issues/search", { componentKeys: projectKey, rules: S3776_RULES }, "issues");
  const last = await latestAnalysis(client, projectKey);
  if (last.revision !== first.revision) {
    throw new RefreshError(
      `The latest analysis moved from ${first.revision} to ${last.revision} while paging; aborting without writing the fixture.`,
    );
  }

  const files = collectFiles(components, sonar);
  const issues = collectIssues(rawIssues, projectKey, files);
  const fixture = buildFixture({ metadata, sonar, commitSha: first.revision, capturedAt: now().toISOString(), files, issues });
  const diff = diffFixtures(previous, fixture);
  writeFixtureAtomically(fixturePath, fixture);

  const retries = client.state.retries;
  log(
    `wrote ${fixturePath} at ${first.revision} (analysed ${first.date ?? "unknown date"}): ` +
      `${Object.keys(files).length} files, ${issues.length} issues, ${retries} retried request(s)` +
      (previous ? "" : "; no previous fixture, every entry is new"),
  );
  for (const line of formatDiff(diff)) log(line);
  return { fixture, fixturePath, diff, retries };
}

// --- CLI ---------------------------------------------------------------------

function splitList(value) {
  return value === undefined ? undefined : value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function parseArgs(argv) {
  const [corpus, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const [name, inlineValue] = rest[i].replace(/^--/, "").split(/=(.*)/s);
    if (!rest[i].startsWith("--") || !KNOWN_FLAGS.has(name)) throw new RefreshError(`Unknown argument: ${rest[i]}. ${USAGE}`);
    const value = inlineValue ?? rest[++i];
    if (value === undefined) throw new RefreshError(`--${name} needs a value. ${USAGE}`);
    flags[name] = value;
  }
  return { corpus, flags };
}

function mergeMetadata(existing, flags) {
  const base = existing ?? {};
  return {
    projectKey: flags["project-key"] ?? base.projectKey,
    repository: flags.repository ?? base.repository,
    sonar: {
      sources: splitList(flags.sources) ?? base.sonar?.sources,
      testInclusions: splitList(flags["test-inclusions"]) ?? base.sonar?.testInclusions ?? [],
      exclusions: splitList(flags.exclusions) ?? base.sonar?.exclusions ?? [],
    },
  };
}

function describeError(error) {
  return error instanceof RefreshError ? error.message : `${error?.name ?? "Error"}: ${error?.message ?? error}`;
}

/** Runs the CLI and returns its exit code (0 or 2) instead of exiting, so tests can call it. */
export async function main(argv, deps = {}) {
  const { env, isEnvTracked, readEnvFile, fixtureDir = DEFAULT_FIXTURE_DIR, logError = console.error, ...rest } = deps;
  try {
    const { corpus, flags } = parseArgs(argv);
    assertCorpusName(corpus);
    const metadata = mergeMetadata(readExistingFixture(path.join(fixtureDir, `${corpus}.json`)), flags);
    assertMetadata(metadata);
    const credential = resolveCredential({ env, isEnvTracked, readEnvFile });
    await refreshFixture({ corpus, metadata, fixtureDir, credential, ...rest });
    return 0;
  } catch (error) {
    logError(describeError(error));
    return 2;
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exit(await main(process.argv.slice(2)));
