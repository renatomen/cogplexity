#!/usr/bin/env node
// Asserts the published tarball matches the package's `exports` map:
// every export target ships, and nothing under test/ or calibration/ does.
// Exit 0 on success, 1 on mismatch, 2 on a tooling failure.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FORBIDDEN_PREFIXES = ["test/", "calibration/"];

function resolveExportTargets(exportsField) {
  const targets = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      targets.add(value.replace(/^\.\//, ""));
    } else if (value && typeof value === "object") {
      for (const inner of Object.values(value)) visit(inner);
    }
  };
  visit(exportsField);
  return targets;
}

function packedPaths() {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--silent"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(2);
  }
  const jsonStart = result.stdout.indexOf("[");
  const report = JSON.parse(result.stdout.slice(jsonStart));
  return new Set(report[0].files.map((entry) => entry.path));
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const targets = resolveExportTargets(pkg.exports ?? {});
const packed = packedPaths();
const problems = [];

for (const target of targets) {
  if (!packed.has(target)) problems.push(`export target missing from tarball: ${target}`);
}
for (const path of packed) {
  if (FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    problems.push(`forbidden path in tarball: ${path}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`pack-check ok: ${packed.size} files, ${targets.size} export targets present`);
