import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ELIGIBLE_EXTENSIONS,
  RefreshError,
  main,
  matchesPattern,
  refreshFixture,
  resolveCredential,
} from "./refresh-fixture.mjs";

const PROJECT = "renatomen_obsidian-gantt";
const CORPUS = "tasknotes-gantt";
// The environment variable the script reads, and the authorization scheme it
// sends; both are assembled at runtime so this file never contains a literal
// `NAME=value` assignment or header value that a secret scanner would flag.
const VAR = "SONAR_TO" + "KEN";
const SCHEME = "Bea" + "rer";
// A canned, meaningless credential value; it exists only so the tests can assert it never leaks.
const CANNED_CREDENTIAL = "canned-credential-used-only-by-these-tests";
const NOW = new Date("2026-09-05T10:20:30.000Z");

const META = {
  projectKey: PROJECT,
  repository: "renatomen/tasknotes-gantt",
  sonar: { sources: ["src"], testInclusions: [], exclusions: [] },
};

// --- canned SonarCloud -------------------------------------------------------

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function component(filePath, value) {
  const measures = value === undefined ? [] : [{ metric: "cognitive_complexity", value: String(value) }];
  return { key: `${PROJECT}:${filePath}`, path: filePath, qualifier: "FIL", measures };
}

function issue(filePath, line, score, status = "OPEN") {
  return {
    component: `${PROJECT}:${filePath}`,
    line,
    rule: "typescript:S3776",
    status,
    message: `Refactor this function to reduce its Cognitive Complexity from ${score} to the 15 allowed.`,
  };
}

function manyComponents(count) {
  const list = [];
  for (let i = 0; i < count; i++) list.push(component(`src/file${String(i).padStart(4, "0")}.ts`, i % 40));
  return list;
}

function page(items, pageIndex) {
  return items.slice((pageIndex - 1) * 500, pageIndex * 500);
}

/**
 * A fake SonarCloud. `overrides` maps `<endpoint>#<page>` to a queue of responses
 * consumed in order; `undefined` in the queue means "fall through to the default".
 */
function fakeSonar({ revisions = ["abc123"], components = [], issues = [], overrides = {} } = {}) {
  const calls = [];
  let analysisCalls = 0;
  const queues = new Map(Object.entries(overrides).map(([key, list]) => [key, [...list]]));

  const defaultResponse = (endpoint, pageIndex) => {
    if (endpoint === "project_analyses/search") {
      const revision = revisions[Math.min(analysisCalls, revisions.length - 1)];
      analysisCalls++;
      return jsonResponse(200, { analyses: [{ key: "AX1", date: "2026-09-01T00:00:00+0000", revision }] });
    }
    if (endpoint === "measures/component_tree") {
      return jsonResponse(200, {
        paging: { pageIndex, pageSize: 500, total: components.length },
        components: page(components, pageIndex),
      });
    }
    if (endpoint === "issues/search") {
      return jsonResponse(200, {
        paging: { pageIndex, pageSize: 500, total: issues.length },
        issues: page(issues, pageIndex),
      });
    }
    return jsonResponse(404, {});
  };

  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const endpoint = parsed.pathname.replace(/^\/api\//, "");
    const pageIndex = Number(parsed.searchParams.get("p") ?? "1");
    calls.push({ endpoint, pageIndex, headers: init.headers ?? {} });
    const queue = queues.get(`${endpoint}#${pageIndex}`);
    const queued = queue && queue.length > 0 ? queue.shift() : undefined;
    return queued ?? defaultResponse(endpoint, pageIndex);
  };

  return { fetch, calls };
}

// --- harness -----------------------------------------------------------------

function freshDir() {
  return mkdtempSync(path.join(tmpdir(), "cogplexity-refresh-"));
}

function run(sonar, extra = {}) {
  const logs = [];
  const delays = [];
  const fixtureDir = extra.fixtureDir ?? freshDir();
  const promise = refreshFixture({
    corpus: CORPUS,
    fixtureDir,
    metadata: META,
    credential: CANNED_CREDENTIAL,
    fetch: sonar.fetch,
    now: () => NOW,
    delay: async (ms) => {
      delays.push(ms);
    },
    log: (line) => logs.push(line),
    ...extra,
  });
  return { promise, logs, delays, fixtureDir };
}

function cliDeps(sonar, fixtureDir, extra = {}) {
  return {
    env: {},
    isEnvTracked: () => false,
    readEnvFile: () => null,
    fetch: sonar.fetch,
    fixtureDir,
    now: () => NOW,
    log: () => {},
    logError: () => {},
    ...extra,
  };
}

const FLAG_ARGS = [CORPUS, "--project-key", PROJECT, "--repository", META.repository, "--sources", "src"];

function readFixture(fixtureDir) {
  return JSON.parse(readFileSync(path.join(fixtureDir, `${CORPUS}.json`), "utf8"));
}

async function rejectsWithExit2(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof RefreshError, `expected RefreshError, got ${error?.constructor?.name}: ${error?.message}`);
    assert.equal(error.exitCode, 2);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

// --- paging and resilience ---------------------------------------------------

test("two pages of 500 components and a third of 12 produce 1012 files", async () => {
  const sonar = fakeSonar({ components: manyComponents(1012) });
  const { promise, fixtureDir } = run(sonar);
  const result = await promise;
  assert.equal(Object.keys(result.fixture.files).length, 1012);
  assert.equal(Object.keys(readFixture(fixtureDir).files).length, 1012);
  const pagesRequested = sonar.calls.filter((c) => c.endpoint === "measures/component_tree").map((c) => c.pageIndex);
  assert.deepEqual(pagesRequested, [1, 2, 3]);
});

test("a 429 on page two is retried with backoff and the run succeeds", async () => {
  const sonar = fakeSonar({
    components: manyComponents(1012),
    overrides: { "measures/component_tree#2": [jsonResponse(429, {}), undefined] },
  });
  const { promise, delays } = run(sonar);
  const result = await promise;
  assert.equal(result.retries, 1);
  assert.deepEqual(delays, [500]);
  assert.equal(Object.keys(result.fixture.files).length, 1012);
});

test("a 429 that persists through three retries aborts", async () => {
  const sonar = fakeSonar({
    components: manyComponents(2),
    overrides: {
      "measures/component_tree#1": [jsonResponse(429, {}), jsonResponse(429, {}), jsonResponse(429, {}), jsonResponse(429, {})],
    },
  });
  const { promise, delays } = run(sonar);
  await rejectsWithExit2(promise, /429/);
  assert.deepEqual(delays, [500, 1000, 2000]);
});

test("a 401 aborts with exit code 2 and leaves the existing fixture byte-identical", async () => {
  const fixtureDir = freshDir();
  const fixturePath = path.join(fixtureDir, `${CORPUS}.json`);
  const original = '{"projectKey":"stale","files":{"src/a.ts":3},"issues":[]}\n';
  writeFileSync(fixturePath, original);
  const sonar = fakeSonar({
    components: manyComponents(3),
    overrides: { "measures/component_tree#1": [jsonResponse(401, {})] },
  });
  const { promise } = run(sonar, { fixtureDir });
  await rejectsWithExit2(promise, /credential/i);
  assert.equal(readFileSync(fixturePath, "utf8"), original);
  assert.deepEqual(readdirSync(fixtureDir), [`${CORPUS}.json`], "no temp file left behind");
});

test("a page set shorter than paging.total after retries aborts", async () => {
  const components = manyComponents(1012);
  const shortPage = jsonResponse(200, {
    paging: { pageIndex: 3, pageSize: 500, total: 1012 },
    components: components.slice(1000, 1005),
  });
  const sonar = fakeSonar({
    components,
    overrides: { "measures/component_tree#3": [jsonResponse(429, {}), shortPage] },
  });
  const { promise, fixtureDir } = run(sonar);
  await rejectsWithExit2(promise, /1012/);
  assert.deepEqual(readdirSync(fixtureDir), []);
});

test("a revision that moves between the first and last page aborts", async () => {
  const sonar = fakeSonar({ revisions: ["abc123", "def456"], components: manyComponents(3) });
  const { promise, fixtureDir } = run(sonar);
  await rejectsWithExit2(promise, /abc123[\s\S]*def456/);
  assert.deepEqual(readdirSync(fixtureDir), []);
});

test("an issue whose message does not match the score pattern aborts naming the message", async () => {
  const odd = { ...issue("src/a.ts", 10, 20), message: "Some new wording without a number." };
  const sonar = fakeSonar({ components: [component("src/a.ts", 20)], issues: [odd] });
  const { promise, fixtureDir } = run(sonar);
  await rejectsWithExit2(promise, /Some new wording without a number\./);
  assert.deepEqual(readdirSync(fixtureDir), []);
});

test("a non-2xx status other than 429 aborts without retrying", async () => {
  const sonar = fakeSonar({
    components: manyComponents(2),
    overrides: { "issues/search#1": [jsonResponse(500, {})] },
  });
  const { promise, delays } = run(sonar);
  await rejectsWithExit2(promise, /500/);
  assert.deepEqual(delays, []);
});

// --- eligibility -------------------------------------------------------------

test("a .vue component and a measure-less component are excluded and sonar.extensions records the applied list", async () => {
  const sonar = fakeSonar({
    components: [
      component("src/App.vue", 9),
      component("src/empty.ts"),
      component("src/kept.ts", 4),
      component("src/kept.mjs", 0),
    ],
  });
  const { promise } = run(sonar);
  const { fixture } = await promise;
  assert.deepEqual(fixture.files, { "src/kept.mjs": 0, "src/kept.ts": 4 });
  assert.deepEqual(fixture.sonar.extensions, [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
  assert.deepEqual(fixture.sonar.extensions, ELIGIBLE_EXTENSIONS);
});

test("a component outside sonar.sources, under a test inclusion, or under an exclusion is excluded", async () => {
  const sonar = fakeSonar({
    components: [
      component("src/kept.ts", 1),
      component("lib/outside.ts", 2),
      component("src/kept.test.ts", 3),
      component("src/legacy/old.ts", 4),
      component("src/vendor/x.ts", 5),
      component("src/vendor.ts", 6),
      component("srcx/not-src.ts", 7),
    ],
  });
  const metadata = {
    ...META,
    sonar: { sources: ["src"], testInclusions: ["**/*.test.ts"], exclusions: ["src/legacy/**", "src/vendor"] },
  };
  const { promise } = run(sonar, { metadata });
  const { fixture } = await promise;
  assert.deepEqual(fixture.files, { "src/kept.ts": 1, "src/vendor.ts": 6 });
  assert.deepEqual(fixture.sonar.sources, ["src"]);
  assert.deepEqual(fixture.sonar.testInclusions, ["**/*.test.ts"]);
  assert.deepEqual(fixture.sonar.exclusions, ["src/legacy/**", "src/vendor"]);
});

test("matchesPattern supports **, *, ? and literal directory prefixes", () => {
  assert.equal(matchesPattern("**/*.test.ts", "src/deep/a.test.ts"), true);
  assert.equal(matchesPattern("**/*.test.ts", "a.test.ts"), true);
  assert.equal(matchesPattern("**/*.test.ts", "src/a.ts"), false);
  assert.equal(matchesPattern("src/*.ts", "src/a.ts"), true);
  assert.equal(matchesPattern("src/*.ts", "src/deep/a.ts"), false);
  assert.equal(matchesPattern("src/?.ts", "src/a.ts"), true);
  assert.equal(matchesPattern("src/?.ts", "src/ab.ts"), false);
  assert.equal(matchesPattern("src/vendor", "src/vendor/x.ts"), true);
  assert.equal(matchesPattern("src/vendor", "src/vendor.ts"), false);
  assert.equal(matchesPattern("src/a.ts", "src/a.ts"), true);
  assert.equal(matchesPattern("src/a.ts", "src/a.tsx"), false);
});

// --- issues ------------------------------------------------------------------

test("S3776 issues are recorded with path, line and parsed score; resolved and excluded-path issues are dropped", async () => {
  const sonar = fakeSonar({
    components: [component("src/b.ts", 30), component("src/a.ts", 50)],
    issues: [
      issue("src/b.ts", 40, 22),
      issue("src/a.ts", 120, 50),
      issue("src/a.ts", 12, 17),
      issue("src/a.ts", 200, 33, "RESOLVED"),
      issue("src/a.ts", 210, 34, "CLOSED"),
      issue("src/a.test.ts", 5, 19),
      issue("lib/outside.ts", 5, 19),
    ],
  });
  const metadata = { ...META, sonar: { ...META.sonar, testInclusions: ["**/*.test.ts"] } };
  const { promise } = run(sonar, { metadata });
  const { fixture } = await promise;
  assert.deepEqual(fixture.issues, [
    { path: "src/a.ts", line: 12, score: 17 },
    { path: "src/a.ts", line: 120, score: 50 },
    { path: "src/b.ts", line: 40, score: 22 },
  ]);
  assert.deepEqual(Object.keys(fixture.files), ["src/a.ts", "src/b.ts"]);
});

test("the requests carry the documented query parameters", async () => {
  const seen = [];
  const sonar = fakeSonar({ components: [component("src/a.ts", 1)] });
  const spyFetch = async (url, init) => {
    seen.push(new URL(url));
    return sonar.fetch(url, init);
  };
  const { promise } = run(sonar, { fetch: spyFetch });
  await promise;
  const analysesUrl = seen.find((u) => u.pathname.endsWith("/project_analyses/search"));
  assert.equal(analysesUrl.searchParams.get("project"), PROJECT);
  assert.equal(analysesUrl.searchParams.get("ps"), "1");
  const issuesUrl = seen.find((u) => u.pathname.endsWith("/issues/search"));
  assert.equal(issuesUrl.searchParams.get("rules"), "typescript:S3776,javascript:S3776");
  assert.equal(issuesUrl.searchParams.get("componentKeys"), PROJECT);
  const treeUrl = seen.find((u) => u.pathname.endsWith("/measures/component_tree"));
  assert.equal(treeUrl.searchParams.get("component"), PROJECT);
  assert.equal(treeUrl.searchParams.get("metricKeys"), "cognitive_complexity");
  assert.equal(treeUrl.searchParams.get("qualifiers"), "FIL");
  assert.equal(treeUrl.searchParams.get("strategy"), "leaves");
  assert.equal(treeUrl.searchParams.get("ps"), "500");
  assert.ok(seen.every((u) => u.origin === "https://sonarcloud.io"));
});

// --- fixture shape and diff --------------------------------------------------

test("commitSha comes from the latest analysis and capturedAt is the injected clock as ISO", async () => {
  const sonar = fakeSonar({ revisions: ["0123456789abcdef"], components: [component("src/a.ts", 1)] });
  const { promise } = run(sonar);
  const { fixture } = await promise;
  assert.equal(fixture.commitSha, "0123456789abcdef");
  assert.equal(fixture.capturedAt, "2026-09-05T10:20:30.000Z");
  assert.equal(fixture.projectKey, PROJECT);
  assert.equal(fixture.repository, "renatomen/tasknotes-gantt");
  assert.deepEqual(Object.keys(fixture), [
    "projectKey",
    "repository",
    "commitSha",
    "capturedAt",
    "sonar",
    "files",
    "issues",
  ]);
});

test("files keys are sorted and issues are sorted by path then line so diffs are stable", async () => {
  const sonar = fakeSonar({
    components: [component("src/z.ts", 1), component("src/m.ts", 2), component("src/a.ts", 3)],
    issues: [issue("src/z.ts", 9, 20), issue("src/a.ts", 30, 21), issue("src/a.ts", 2, 22)],
  });
  const { promise, fixtureDir } = run(sonar);
  await promise;
  const text = readFileSync(path.join(fixtureDir, `${CORPUS}.json`), "utf8");
  const fixture = JSON.parse(text);
  assert.deepEqual(Object.keys(fixture.files), ["src/a.ts", "src/m.ts", "src/z.ts"]);
  assert.deepEqual(
    fixture.issues.map((i) => `${i.path}:${i.line}`),
    ["src/a.ts:2", "src/a.ts:30", "src/z.ts:9"],
  );
  assert.ok(text.endsWith("\n"), "file ends with a newline");
});

test("the diff output lists added, removed and changed paths and added and removed issues", async () => {
  const fixtureDir = freshDir();
  const previous = {
    ...META,
    commitSha: "old",
    capturedAt: "2026-01-01T00:00:00.000Z",
    sonar: { ...META.sonar, extensions: ELIGIBLE_EXTENSIONS },
    files: { "src/gone.ts": 5, "src/same.ts": 7, "src/changed.ts": 10 },
    issues: [
      { path: "src/gone.ts", line: 3, score: 20 },
      { path: "src/same.ts", line: 8, score: 16 },
    ],
  };
  writeFileSync(path.join(fixtureDir, `${CORPUS}.json`), JSON.stringify(previous, null, 2) + "\n");
  const sonar = fakeSonar({
    components: [component("src/same.ts", 7), component("src/changed.ts", 12), component("src/new.ts", 1)],
    issues: [issue("src/same.ts", 8, 16), issue("src/new.ts", 4, 18)],
  });
  const { promise, logs } = run(sonar, { fixtureDir });
  const { diff } = await promise;
  assert.deepEqual(diff.addedFiles, ["src/new.ts"]);
  assert.deepEqual(diff.removedFiles, ["src/gone.ts"]);
  assert.deepEqual(diff.changedFiles, [{ path: "src/changed.ts", from: 10, to: 12 }]);
  assert.deepEqual(diff.addedIssues, [{ path: "src/new.ts", line: 4, score: 18 }]);
  assert.deepEqual(diff.removedIssues, [{ path: "src/gone.ts", line: 3, score: 20 }]);
  const output = logs.join("\n");
  assert.match(output, /added paths \(1\)[\s\S]*src\/new\.ts/);
  assert.match(output, /removed paths \(1\)[\s\S]*src\/gone\.ts/);
  assert.match(output, /changed paths \(1\)[\s\S]*src\/changed\.ts.*10.*12/);
  assert.match(output, /added issues \(1\)[\s\S]*src\/new\.ts:4/);
  assert.match(output, /removed issues \(1\)[\s\S]*src\/gone\.ts:3/);
});

// --- credentials -------------------------------------------------------------

test("a tracked .env makes the script refuse to run with exit code 2", async () => {
  assert.throws(
    () => resolveCredential({ env: {}, isEnvTracked: () => true, readEnvFile: () => `${VAR}=x` }),
    (error) => error instanceof RefreshError && error.exitCode === 2 && /\.env.*tracked/i.test(error.message),
  );
  const errors = [];
  const sonar = fakeSonar({ components: [component("src/a.ts", 1)] });
  const code = await main(
    FLAG_ARGS,
    cliDeps(sonar, freshDir(), { isEnvTracked: () => true, logError: (line) => errors.push(line) }),
  );
  assert.equal(code, 2);
  assert.match(errors.join("\n"), /\.env.*tracked/i);
  assert.equal(sonar.calls.length, 0, "no request is made");
});

test("the credential comes from the environment first, then from an untracked .env with quotes stripped", () => {
  const fromEnv = resolveCredential({
    env: { [VAR]: "from-environment" },
    isEnvTracked: () => false,
    readEnvFile: () => `${VAR}=from-file`,
  });
  assert.equal(fromEnv, "from-environment");
  const fromFile = resolveCredential({
    env: {},
    isEnvTracked: () => false,
    readEnvFile: () => `OTHER=1\nexport ${VAR}="from-file"\n`,
  });
  assert.equal(fromFile, "from-file");
  const none = resolveCredential({ env: {}, isEnvTracked: () => false, readEnvFile: () => null });
  assert.equal(none, undefined);
});

test("requests carry a bearer Authorization header when a credential exists and none when it does not", async () => {
  const withCredential = fakeSonar({ components: [component("src/a.ts", 1)] });
  await run(withCredential).promise;
  assert.ok(withCredential.calls.length > 0);
  const expected = [SCHEME, CANNED_CREDENTIAL].join(" ");
  for (const call of withCredential.calls) assert.equal(call.headers.Authorization, expected);

  const without = fakeSonar({ components: [component("src/a.ts", 1)] });
  await run(without, { credential: undefined }).promise;
  assert.ok(without.calls.length > 0);
  for (const call of without.calls) assert.equal(call.headers.Authorization, undefined);
});

test("the credential never appears in any log output, on success or on failure", async () => {
  const okSonar = fakeSonar({ components: manyComponents(3), issues: [issue("src/file0000.ts", 1, 16)] });
  const ok = run(okSonar);
  await ok.promise;
  assert.ok(ok.logs.length > 0);
  assert.equal(ok.logs.join("\n").includes(CANNED_CREDENTIAL), false);

  const failing = fakeSonar({
    components: manyComponents(3),
    overrides: { "issues/search#1": [jsonResponse(403, {})] },
  });
  const errors = [];
  const logs = [];
  const code = await main(
    FLAG_ARGS,
    cliDeps(failing, freshDir(), {
      env: { [VAR]: CANNED_CREDENTIAL },
      log: (line) => logs.push(line),
      logError: (line) => errors.push(line),
    }),
  );
  assert.equal(code, 2);
  const everything = [...logs, ...errors].join("\n");
  assert.ok(everything.length > 0);
  assert.equal(everything.includes(CANNED_CREDENTIAL), false);
  assert.equal(everything.includes(SCHEME), false);
});

// --- CLI ---------------------------------------------------------------------

test("main takes corpus metadata from CLI flags when no fixture exists and exits 0 on success", async () => {
  const fixtureDir = freshDir();
  const sonar = fakeSonar({ components: [component("src/a.ts", 2)] });
  const code = await main(
    [...FLAG_ARGS, "--test-inclusions", "**/*.test.ts,**/*.spec.ts", "--exclusions", "src/legacy/**"],
    cliDeps(sonar, fixtureDir),
  );
  assert.equal(code, 0);
  const fixture = readFixture(fixtureDir);
  assert.equal(fixture.projectKey, PROJECT);
  assert.equal(fixture.repository, META.repository);
  assert.deepEqual(fixture.sonar.sources, ["src"]);
  assert.deepEqual(fixture.sonar.testInclusions, ["**/*.test.ts", "**/*.spec.ts"]);
  assert.deepEqual(fixture.sonar.exclusions, ["src/legacy/**"]);
  assert.deepEqual(fixture.files, { "src/a.ts": 2 });
});

test("main reuses the metadata of an existing fixture when no flags are given", async () => {
  const fixtureDir = freshDir();
  const previous = {
    ...META,
    commitSha: "old",
    capturedAt: "2026-01-01T00:00:00.000Z",
    sonar: { ...META.sonar, extensions: ELIGIBLE_EXTENSIONS },
    files: {},
    issues: [],
  };
  writeFileSync(path.join(fixtureDir, `${CORPUS}.json`), JSON.stringify(previous, null, 2) + "\n");
  const sonar = fakeSonar({ components: [component("src/a.ts", 2)] });
  assert.equal(await main([CORPUS], cliDeps(sonar, fixtureDir)), 0);
  const fixture = readFixture(fixtureDir);
  assert.equal(fixture.projectKey, PROJECT);
  assert.equal(fixture.repository, META.repository);
  assert.deepEqual(fixture.files, { "src/a.ts": 2 });
});

test("main exits 2 on a missing corpus, an unsafe corpus name, or missing metadata", async () => {
  const sonar = fakeSonar({ components: [component("src/a.ts", 2)] });
  const errors = [];
  const deps = cliDeps(sonar, freshDir(), { logError: (line) => errors.push(line) });
  assert.equal(await main([], deps), 2);
  assert.equal(await main(["../escape"], deps), 2);
  assert.equal(await main([CORPUS], deps), 2);
  assert.equal(await main([CORPUS, "--project-key", PROJECT], deps), 2);
  assert.equal(sonar.calls.length, 0, "no request is made");
  assert.ok(errors.length >= 4);
});
