// Hand-written declarations for the scoring function. This entry point references no ESLint
// or parser types so the number can be imported without ESLint installed.

/** Identifier of the construct an increment was assessed for (KTD2). */
export type Construct =
  | "if"
  | "elseIf"
  | "else"
  | "ternary"
  | "switch"
  | "loop"
  | "catch"
  | "logicalSequence"
  | "labelledJump"
  | "recursion"
  | "ifBlock"
  | "elseIfBlock"
  | "elseBlock"
  | "eachBlock"
  | "awaitBlock"
  | "thenBlock"
  | "catchBlock";

/** Every `Construct` value, frozen, in the order they are documented. */
export declare const CONSTRUCTS: readonly Construct[];

/** 1-based line, 0-based column, as ESTree parsers report them. */
export interface Position {
  line: number;
  column: number;
}

export interface Location {
  start: Position;
  end: Position;
}

/** One increment; `amount` is `1 + nesting`, where `nesting` is the nesting contribution. */
export interface Increment {
  construct: Construct;
  amount: number;
  nesting: number;
  loc: Location;
  /** The operator of a `logicalSequence` run; absent on every other construct. */
  operator?: "&&" | "||";
}

/**
 * One function-like node (function, arrow, method, class field value, static block). Its score
 * includes everything nested inside it; `parent` indexes `functions`, or is null for a root.
 */
export interface FunctionEntry {
  name: string;
  kind: "function";
  depth: number;
  parent: number | null;
  /** Nesting level at which the body starts: 0 for a root, otherwise the level at the function's position plus one. */
  nesting: number;
  loc: Location;
  nameLoc: Location;
  score: number;
  increments: Increment[];
}

/** Statements outside any function, scored at nesting 0. */
export interface TopLevelEntry {
  kind: "topLevel";
  score: number;
  increments: Increment[];
}

/** The Svelte template facet; present only for Svelte roots and excluded from `total`. */
export interface TemplateEntry {
  kind: "template";
  score: number;
  increments: Increment[];
}

export interface ScoreResult {
  functions: FunctionEntry[];
  topLevel: TopLevelEntry;
  template?: TemplateEntry;
  /** Sum of the root functions' scores plus `topLevel.score`. */
  total: number;
}

/** Any ESTree-shaped node; the scorer needs `type`, `range` and `loc` on every node. */
export interface Node {
  type: string;
  [key: string]: unknown;
}

/** The subset of an ESLint-style scope manager the scorer reads to resolve callees. */
export interface ScopeManagerLike {
  scopes: ReadonlyArray<{
    references: ReadonlyArray<{
      identifier: Node;
      resolved: { defs: ReadonlyArray<{ type: string; node: Node }> } | null;
    }>;
  }>;
}

export interface ScoreOptions {
  /** When supplied, callees resolve through it; otherwise the scorer keeps its own scope map. */
  scopeManager?: ScopeManagerLike;
}

/**
 * Score every function in a parsed file per G. Ann Campbell's Cognitive Complexity
 * specification (v1.7). `ast` is an ESTree/TSESTree `Program` parsed with `range` and `loc`.
 */
export declare function score(ast: Node, sourceText: string, options?: ScoreOptions): ScoreResult;
