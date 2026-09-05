// Corpus access for the calibration harness (plan KTD9): every read goes through
// `git` at the pinned commit, via `execFile` with an argument array, so the clone's
// working tree, checked-out branch and dirtiness never matter.
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { parseForESLint } from "@typescript-eslint/parser";

import { score } from "../../src/score.js";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * The environment for a git subprocess: the current one minus every `GIT_*` variable.
 * Inside a git hook, `GIT_DIR` and `GIT_INDEX_FILE` point at the repository being
 * committed to, and an inherited copy would redirect the corpus reads there.
 */
export function gitEnv(base = process.env) {
  return Object.fromEntries(Object.entries(base).filter(([name]) => !name.toUpperCase().startsWith("GIT_")));
}

async function git(clone, args) {
  const { stdout } = await execFileAsync("git", args, { cwd: clone, encoding: "utf8", maxBuffer: MAX_BUFFER, env: gitEnv() });
  return stdout;
}

/** Throws `corpus unavailable: …` when the clone does not contain the commit. */
export async function assertCommitPresent(clone, commitSha) {
  try {
    await git(clone, ["cat-file", "-e", `${commitSha}^{commit}`]);
  } catch {
    throw new Error(`corpus unavailable: ${commitSha} not found in ${clone}`);
  }
}

export function listFilesAt(clone, commitSha) {
  return async () => (await git(clone, ["ls-tree", "-r", "--name-only", "-z", commitSha])).split("\0").filter(Boolean);
}

export function readFileAt(clone, commitSha) {
  return (filePath) => git(clone, ["show", `${commitSha}:${filePath}`]);
}

function parserOptions(filePath) {
  const jsx = [".tsx", ".jsx"].includes(path.posix.extname(filePath));
  return { range: true, loc: true, sourceType: "module", ecmaVersion: "latest", ecmaFeatures: { jsx }, filePath };
}

/** Parses one corpus file with `@typescript-eslint/parser` and scores it with its scope manager. */
export function scoreSource(text, filePath) {
  const { ast, scopeManager } = parseForESLint(text, parserOptions(filePath));
  return score(ast, text, { scopeManager });
}

/** `scoreFile(path)` for `compareFixture`: read at the commit, parse, score. */
export function scoreFileAt(clone, commitSha) {
  const read = readFileAt(clone, commitSha);
  return async (filePath) => scoreSource(await read(filePath), filePath);
}
