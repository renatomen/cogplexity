// Public scoring entry point and dispatcher (KTD2): parser-agnostic, imports nothing from
// ESLint or any parser. An ESTree/TSESTree `Program` is walked as one program; a
// `svelte-eslint-parser` root yields the script facets plus the `template` facet (KTD4).
import { walkSvelte } from "./svelte.js";
import { CONSTRUCTS, walkProgram } from "./walker.js";

export { CONSTRUCTS };

/** A `svelte-eslint-parser` root: a `Program` whose body holds Svelte script, element or block nodes. */
function isSvelteRoot(ast) {
  return Array.isArray(ast.body) && ast.body.some((node) => node && typeof node.type === "string" && node.type.startsWith("Svelte"));
}

/**
 * Score every function in a parsed file per the Cognitive Complexity specification, and the
 * template of a Svelte file under KTD4. `total` sums the root functions and `topLevel` only;
 * the template facet never joins it.
 *
 * @param {object} ast An ESTree/TSESTree `Program` with `range` and `loc` on every node.
 * @param {string} sourceText The source the AST was parsed from.
 * @param {{ scopeManager?: object }} [options] An ESLint-style scope manager for callee resolution.
 */
export function score(ast, sourceText, options = {}) {
  if (ast === null || typeof ast !== "object" || typeof ast.type !== "string") {
    throw new TypeError("cogplexity: score() expects an AST root node");
  }
  if (typeof sourceText !== "string") {
    throw new TypeError("cogplexity: score() expects the source text as a string");
  }
  const scopeManager = options.scopeManager;
  if (scopeManager !== undefined && (scopeManager === null || !Array.isArray(scopeManager.scopes))) {
    throw new TypeError("cogplexity: options.scopeManager must be a scope manager with a scopes array");
  }
  if (ast.type !== "Program") {
    throw new TypeError(`cogplexity: score() expects a Program root, got ${ast.type}`);
  }
  const walk = isSvelteRoot(ast) ? walkSvelte : walkProgram;
  const result = walk(ast, sourceText, { scopeManager });
  const total = result.functions.reduce((sum, fn) => (fn.parent === null ? sum + fn.score : sum), result.topLevel.score);
  return { ...result, total };
}
