// Hand-written declarations for the package entry point. The rule is typed structurally so
// consumers need no ESLint types to import it; ESLint's own `Rule.RuleModule` is a subtype.
import type { Location } from "./score.js";

export type { Construct, FunctionEntry, Increment, Location, Node, Position, ScopeManagerLike, ScoreOptions, ScoreResult, TemplateEntry, TopLevelEntry } from "./score.js";
export { CONSTRUCTS, score } from "./score.js";

/** KTD5: the object form of the rule options. */
export interface CognitiveComplexityOptions {
  /** Root functions scoring strictly above this are reported. Default 15. */
  threshold?: number;
  /** Svelte template threshold, or `false` to skip the template facet. Default 15. */
  templateThreshold?: number | false;
  /** Cap on breakdown lines (top N by amount); unset means the full list. */
  topContributors?: number;
}

/** A bare number sets `threshold` only; `templateThreshold` keeps its default. */
export type RuleOptions = number | CognitiveComplexityOptions;

/** KTD6: the two message ids; a finding's id says which score it reports (R17). */
export type MessageId = "functionComplexity" | "templateComplexity";

export interface MessageData {
  name: string;
  score: number;
  threshold: number;
  /** The per-increment lines, each preceded by a newline. */
  breakdown: string;
}

/** The subset of ESLint's `SourceCode` the rule reads. */
export interface SourceCodeLike {
  ast: { type: string; [key: string]: unknown };
  text: string;
  scopeManager: unknown;
}

/** The subset of ESLint's rule context the rule uses. */
export interface RuleContextLike {
  options: unknown[];
  sourceCode: SourceCodeLike;
  report(descriptor: { loc: Location; messageId: MessageId; data: MessageData }): void;
}

export interface RuleMeta {
  type: "suggestion";
  docs: { description: string; url: string };
  schema: unknown[];
  defaultOptions: [{ threshold: number; templateThreshold: number | false }];
  messages: Record<MessageId, string>;
}

/** ESLint `Rule.RuleModule`-shaped, declared without importing ESLint's types. */
export interface RuleModule {
  meta: RuleMeta;
  create(context: RuleContextLike): { "Program:exit"(): void };
}

export interface CogplexityPlugin {
  meta: { name: string; version: string };
  rules: { "cognitive-complexity": RuleModule };
}

/** One flat-config entry as returned by `scoped()`. */
export interface ScopedConfig {
  files: string[];
  plugins: { cogplexity: CogplexityPlugin };
  rules: { "cogplexity/cognitive-complexity": ["error", RuleOptions] };
}

/** The `cogplexity/cognitive-complexity` rule. */
export declare const rule: RuleModule;

/** The plugin object: `meta` from `package.json` and the single rule. */
export declare const plugin: CogplexityPlugin;

/**
 * One flat-config entry running the rule as an error on `files` (a non-empty list of globs)
 * with `options` (default: the bare threshold 15). Sets no parser and ships no preset globs.
 */
export declare function scoped(files: string[], options?: RuleOptions): ScopedConfig;

export default plugin;
