// The plugin object and the flat-config scoping helper (R22). Both live here so `scoped()`
// can reference the plugin without a circular import through the entry point.
import { createRequire } from "node:module";

import { rule } from "./rule.js";

const { name, version } = createRequire(import.meta.url)("../package.json");

export const plugin = {
  meta: { name, version },
  rules: { "cognitive-complexity": rule },
};

/**
 * One flat-config entry that runs the rule as an error on `files`. It sets no parser and
 * ships no preset globs: the consumer chooses both.
 *
 * @param {string[]} files Non-empty list of file globs.
 * @param {number | { threshold?: number, templateThreshold?: number | false, topContributors?: number }} [options]
 *   Rule options; defaults to the bare threshold 15.
 */
export function scoped(files, options) {
  if (!Array.isArray(files) || files.length === 0 || !files.every((file) => typeof file === "string")) {
    throw new TypeError("cogplexity: scoped() expects a non-empty array of file globs");
  }
  return {
    files,
    plugins: { cogplexity: plugin },
    rules: { "cogplexity/cognitive-complexity": ["error", options ?? 15] },
  };
}
