// Public scoring entry point: parser-agnostic, imports nothing from ESLint or any parser.
import { CONSTRUCTS, walkProgram } from "./walker.js";

export { CONSTRUCTS };

function isSvelteRoot(ast) {
  return Array.isArray(ast.body) && ast.body.some((node) => node && typeof node.type === "string" && node.type.startsWith("Svelte"));
}

/**
 * Score every function in a parsed file per the Cognitive Complexity specification.
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
  if (isSvelteRoot(ast)) {
    throw new Error("cogplexity: Svelte roots are handled in a later unit");
  }
  if (ast.type !== "Program") {
    throw new TypeError(`cogplexity: score() expects a Program root, got ${ast.type}`);
  }
  const { functions, topLevel } = walkProgram(ast, sourceText, { scopeManager });
  const total = functions.reduce((sum, fn) => (fn.parent === null ? sum + fn.score : sum), topLevel.score);
  return { functions, topLevel, total };
}
