// Calibration against SonarCloud (plan KTD9, R24–R26): one test per corpus that
// compares per-file totals and per-function findings with the checked-in fixture.
//
//   COGPLEXITY_CORPUS=<local git clone of the corpus> npm run calibrate
//
// Unset, the corpus is reported as skipped with the reason — never as passed.
// `COGPLEXITY_FIXTURE_DIR` and `COGPLEXITY_LEDGER` override the fixture directory
// and the ledger path; the harness's own tests use them with synthetic data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareFixture, formatReport } from "./harness.js";
import { assertCommitPresent, listFilesAt, scoreFileAt } from "./corpus.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = process.env.COGPLEXITY_FIXTURE_DIR ?? path.join(ROOT_DIR, "calibration", "fixtures");
const LEDGER_PATH = process.env.COGPLEXITY_LEDGER ?? path.join(ROOT_DIR, "calibration", "ledger.json");

/**
 * Each corpus with its identity and the refresh command that captures its fixture. The
 * identity is asserted against the fixture so a rewritten fixture cannot calibrate against
 * another repository or SonarCloud project.
 */
const CORPORA = [
  {
    name: "tasknotes-gantt",
    repository: "renatomen/tasknotes-gantt",
    projectKey: "renatomen_obsidian-gantt",
    refresh:
      "node scripts/refresh-fixture.mjs tasknotes-gantt --project-key renatomen_obsidian-gantt " +
      "--repository renatomen/tasknotes-gantt --sources src",
  },
];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function corpusClone() {
  const clone = process.env.COGPLEXITY_CORPUS;
  return clone && clone.trim() !== "" ? path.resolve(clone) : null;
}

function identity(source) {
  return `${source.repository} (project key ${source.projectKey})`;
}

/** Fails, never skips, when the fixture names another repository or SonarCloud project than the corpus. */
function assertFixtureIdentity(corpus, fixture) {
  assert.ok(
    fixture.repository === corpus.repository && fixture.projectKey === corpus.projectKey,
    `${corpus.name}: fixture identifies ${identity(fixture)} but the corpus is ${identity(corpus)}`,
  );
}

async function calibrate(t, corpus) {
  const clone = corpusClone();
  if (clone === null) {
    return t.skip("COGPLEXITY_CORPUS is unset; point it at a local git clone of the corpus repository to calibrate");
  }
  const fixturePath = path.join(FIXTURE_DIR, `${corpus.name}.json`);
  if (!existsSync(fixturePath)) {
    return t.skip(`no fixture captured yet; run \`${corpus.refresh}\` with a SonarCloud credential`);
  }
  const fixture = readJson(fixturePath);
  assertFixtureIdentity(corpus, fixture);
  const ledger = existsSync(LEDGER_PATH) ? readJson(LEDGER_PATH) : [];
  await assertCommitPresent(clone, fixture.commitSha);

  const comparison = await compareFixture({
    fixture,
    ledger,
    scoreFile: scoreFileAt(clone, fixture.commitSha),
    listFiles: listFilesAt(clone, fixture.commitSha),
  });
  const report = formatReport(comparison);
  for (const line of report.split("\n").slice(0, 2)) t.diagnostic(line);
  assert.ok(comparison.ok, `${corpus.name} at ${fixture.commitSha} diverges from SonarCloud:\n${report}`);
  return undefined;
}

for (const corpus of CORPORA) {
  test(`${corpus.name}: per-file totals and per-function findings match SonarCloud`, (t) => calibrate(t, corpus));
}
