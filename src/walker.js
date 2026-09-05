// Internal subtree walker for the Cognitive Complexity scoring core. Not part of the public
// API: `src/score.js` and `src/svelte.js` import it; the `exports` map hides it.
//
// Every rule here is implemented from G. Ann Campbell, "Cognitive Complexity" v1.7, Appendix B
// (the specification) and Appendix A (the JavaScript compensating usage). See PROVENANCE.md.

/** Increment identifiers. The template identifiers are produced by the Svelte facet. */
export const CONSTRUCTS = Object.freeze([
  "if",
  "elseIf",
  "else",
  "ternary",
  "switch",
  "loop",
  "catch",
  "logicalSequence",
  "labelledJump",
  "recursion",
  "ifBlock",
  "elseIfBlock",
  "elseBlock",
  "eachBlock",
  "awaitBlock",
  "thenBlock",
  "catchBlock",
]);

const ANONYMOUS = "<anonymous>";

/**
 * Own properties never descended into. `parent` is the back-reference ESLint and
 * svelte-eslint-parser attach to every node; the rest are token or type-level data.
 */
const SKIP_KEYS = new Set([
  "parent",
  "loc",
  "range",
  "tokens",
  "comments",
  "typeAnnotation",
  "returnType",
  "typeParameters",
  "typeArguments",
  "superTypeArguments",
  "implements",
]);

/** Node types with nothing to score inside them (type-level declarations and signatures). */
const NOT_WALKED = new Set([
  "TSDeclareFunction",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSAbstractMethodDefinition",
  "TSAbstractPropertyDefinition",
  "TSAbstractAccessorProperty",
  "TSIndexSignature",
  "TSEmptyBodyFunctionExpression",
]);

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

const TS_WRAPPERS = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion"]);

const LOOP_TYPES = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);

/** Nodes subject to a structural or hybrid increment (Appendix B §1): the ones whose presence at a function's top level makes it non-declarative (Appendix A). */
const STRUCTURE_TYPES = new Set(["IfStatement", "ConditionalExpression", "SwitchStatement", "CatchClause", ...LOOP_TYPES]);

/**
 * Nodes the walker scores as function-like entries of their own, so their contents are "nested
 * inside a sub-function" for Appendix A. A class field is not one: only a function-valued field
 * opens an entry (`visitValue`), and that function node is the boundary; any other field value
 * is scored into the enclosing function.
 */
const NESTED_SCOPE_TYPES = new Set([...FUNCTION_TYPES, "StaticBlock"]);

/** Class members `visitClassMember` handles: a computed key and a non-function value are scored into the enclosing function. */
const CLASS_MEMBER_TYPES = new Set(["MethodDefinition", "PropertyDefinition", "AccessorProperty"]);

/** Statement-level containers searched for hoisted `var` declarations. */
const STATEMENT_CONTAINERS = new Set([
  "BlockStatement",
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "TryStatement",
  "CatchClause",
  "SwitchStatement",
  "SwitchCase",
  "LabeledStatement",
  "StaticBlock",
  "TSModuleBlock",
]);

/** Minimal visitor-key table for the node types whose child order matters most; others use the generic fallback. */
const KEYS = {
  Program: ["body"],
  BlockStatement: ["body"],
  ExpressionStatement: ["expression"],
  ReturnStatement: ["argument"],
  ThrowStatement: ["argument"],
  VariableDeclaration: ["declarations"],
  CallExpression: ["callee", "arguments"],
  NewExpression: ["callee", "arguments"],
  MemberExpression: ["object", "property"],
  BinaryExpression: ["left", "right"],
  UnaryExpression: ["argument"],
  UpdateExpression: ["argument"],
  AwaitExpression: ["argument"],
  YieldExpression: ["argument"],
  SpreadElement: ["argument"],
  ArrayExpression: ["elements"],
  SequenceExpression: ["expressions"],
  TemplateLiteral: ["expressions"],
  TaggedTemplateExpression: ["tag", "quasi"],
  ChainExpression: ["expression"],
  TSAsExpression: ["expression"],
  TSSatisfiesExpression: ["expression"],
  TSNonNullExpression: ["expression"],
  TSTypeAssertion: ["expression"],
  LabeledStatement: ["body"],
  Identifier: [],
  Literal: [],
  ThisExpression: [],
  Super: [],
  TemplateElement: [],
  PrivateIdentifier: [],
};

// --- node helpers ----------------------------------------------------------------------

export function isNode(value) {
  return value !== null && typeof value === "object" && typeof value.type === "string";
}

/** Peel `as`, `satisfies`, `!` and `<T>` wrappers, which the specification does not see. */
function unwrap(node) {
  let current = node;
  while (isNode(current) && TS_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

function isFunctionNode(node) {
  return isNode(node) && FUNCTION_TYPES.has(node.type);
}

/** The function a value declares, or null when the value is not a function. */
function functionValue(node) {
  const inner = unwrap(node);
  return isFunctionNode(inner) ? inner : null;
}

/** Own child nodes of `node`, from the key table or the generic fallback. */
export function* children(node) {
  const keys = KEYS[node.type] ?? Object.keys(node);
  for (const key of keys) {
    if (SKIP_KEYS.has(key)) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          yield child;
        }
      }
    } else if (isNode(value)) {
      yield value;
    }
  }
}

/** Offsets at which each line starts, honouring the same terminators as the parsers. */
function lineStartsOf(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 10 || ch === 0x2028 || ch === 0x2029) {
      starts.push(i + 1);
    } else if (ch === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        i++;
      }
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Offset of `token` in `text` between `from` and `to`, skipping whitespace, comments and
 * parentheses. The callers only ever search slices that hold punctuation around one token.
 */
function findToken(text, from, to, token) {
  let i = from;
  while (i < to) {
    if (text.startsWith(token, i)) {
      return i;
    }
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? to : end;
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? to : end + 2;
    } else {
      i++;
    }
  }
  return -1;
}

/** In-order operators and leaf operands of a `&&`/`||` tree, seen through TS wrappers. */
function flattenLogical(node, operators, leaves) {
  const inner = unwrap(node);
  if (isNode(inner) && inner.type === "LogicalExpression" && inner.operator !== "??") {
    flattenLogical(inner.left, operators, leaves);
    operators.push({ operator: inner.operator, left: inner.left, right: inner.right });
    flattenLogical(inner.right, operators, leaves);
  } else {
    leaves.push(node);
  }
}

/** Name of a class member or object property key, or null for computed keys. */
function keyName(node) {
  if (!node.computed) {
    if (node.key.type === "Identifier") {
      return node.key.name;
    }
    if (node.key.type === "PrivateIdentifier") {
      return `#${node.key.name}`;
    }
  }
  if (node.key.type === "Literal" && typeof node.key.value === "string") {
    return node.key.value;
  }
  return null;
}

/** Source spelling of an assignment target when it is a chain of plain identifiers. */
function targetName(node) {
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression" && !node.computed) {
    const object = node.object.type === "ThisExpression" ? "this" : targetName(node.object);
    const property = node.property.type === "PrivateIdentifier" ? `#${node.property.name}` : node.property.name;
    return object === null ? null : `${object}.${property}`;
  }
  return null;
}

// --- Appendix A: declarative outer function --------------------------------------------

/**
 * Paper p. 14: an outer function used "purely as a declarative mechanism" is ignored, and the
 * paper's test for the opposite is "the presence at the top level of a function (i.e. not
 * nested inside a sub-function) of statements subject to structural increments". So a function
 * is declarative when nothing outside its nested functions is subject to a structural or hybrid
 * increment. Calls, assignments and returns do not disqualify it (the paper's own example
 * assigns `bar.myFun`), and neither do logical sequences or labelled jumps, which are
 * fundamental increments.
 */
function isDeclarative(fn) {
  // Everything `visitFunctionContents` scores at the function's own level: its parameters
  // (a default value may hold a ternary) and its body, which is a statement list for a static block.
  const body = Array.isArray(fn.body) ? fn.body : [fn.body];
  return ![...(fn.params ?? []), ...body].some(containsStructure);
}

/** Whether the walker would emit a structural increment for `node` outside any nested scope; mirrors `visit`. */
function containsStructure(node) {
  if (!isNode(node) || NOT_WALKED.has(node.type)) {
    return false;
  }
  if (STRUCTURE_TYPES.has(node.type)) {
    return true;
  }
  if (NESTED_SCOPE_TYPES.has(node.type)) {
    return false;
  }
  if (CLASS_MEMBER_TYPES.has(node.type)) {
    return (Boolean(node.computed) && containsStructure(node.key)) || containsStructure(node.value);
  }
  for (const child of children(node)) {
    if (containsStructure(child)) {
      return true;
    }
  }
  return false;
}

// --- scopes (used when no scope manager is supplied) -----------------------------------

/** Bind every identifier in a binding pattern; `value` is the declared function, if any. */
function declarePattern(scope, pattern, value) {
  if (!isNode(pattern)) {
    return;
  }
  switch (pattern.type) {
    case "Identifier":
      scope.bindings.set(pattern.name, value);
      break;
    case "AssignmentPattern":
      declarePattern(scope, pattern.left, null);
      break;
    case "RestElement":
      declarePattern(scope, pattern.argument, null);
      break;
    case "TSParameterProperty":
      declarePattern(scope, pattern.parameter, null);
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        declarePattern(scope, element, null);
      }
      break;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        declarePattern(scope, property.type === "Property" ? property.value : property, null);
      }
      break;
    default:
      break;
  }
}

function declareVariables(scope, declaration) {
  for (const declarator of declaration.declarations) {
    declarePattern(scope, declarator.id, declarator.id.type === "Identifier" ? functionValue(declarator.init) : null);
  }
}

/** Declare what a statement binds in `scope`, before the statements are walked (hoisting). */
function declareStatement(scope, statement) {
  switch (statement.type) {
    case "FunctionDeclaration":
      if (statement.id) {
        scope.bindings.set(statement.id.name, statement);
      }
      break;
    case "VariableDeclaration":
      declareVariables(scope, statement);
      break;
    case "ClassDeclaration":
    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
      if (isNode(statement.id) && statement.id.type === "Identifier") {
        scope.bindings.set(statement.id.name, null);
      }
      break;
    case "ImportDeclaration":
      for (const specifier of statement.specifiers) {
        scope.bindings.set(specifier.local.name, null);
      }
      break;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
      if (isNode(statement.declaration)) {
        declareStatement(scope, statement.declaration);
      }
      break;
    default:
      hoistVars(scope, statement);
      break;
  }
}

/** `var` declarations nested in statement containers hoist out to the enclosing scope. */
function hoistVars(scope, node) {
  if (node.type === "VariableDeclaration") {
    if (node.kind === "var") {
      declareVariables(scope, node);
    }
    return;
  }
  if (!STATEMENT_CONTAINERS.has(node.type)) {
    return;
  }
  for (const child of children(node)) {
    hoistVars(scope, child);
  }
}

function declareStatements(scope, statements) {
  for (const statement of statements) {
    declareStatement(scope, statement);
  }
}

// --- callee resolution through a supplied scope manager ---------------------------------

function referenceMap(scopeManager) {
  const map = new Map();
  if (scopeManager) {
    for (const scope of scopeManager.scopes) {
      for (const reference of scope.references) {
        map.set(reference.identifier, reference);
      }
    }
  }
  return map;
}

/** The function a resolved variable was declared with, or null. */
function definedFunction(variable) {
  for (const def of variable.defs) {
    if (def.type === "FunctionName" && isFunctionNode(def.node)) {
      return def.node;
    }
    if (def.type === "Variable" && def.node.type === "VariableDeclarator" && def.node.id.type === "Identifier") {
      const value = functionValue(def.node.init);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

// --- `this.<name>` members of a class body or object literal ----------------------------

/** Member node types whose `value` may be a function. */
const FUNCTION_MEMBER_TYPES = new Set(["MethodDefinition", "PropertyDefinition", "Property"]);

/** Member kinds that `this.<name>()` never calls. */
const UNCALLABLE_KINDS = new Set(["get", "set", "constructor"]);

function memberKey(isStatic, name) {
  return `${isStatic ? "static" : "instance"}:${name}`;
}

/** `[key, function]` for a member that `this.<name>()` can reach, or null. */
function callableMember(member) {
  const value = FUNCTION_MEMBER_TYPES.has(member.type) ? functionValue(member.value) : null;
  if (value === null || UNCALLABLE_KINDS.has(member.kind)) {
    return null;
  }
  const name = keyName(member);
  return name === null ? null : [memberKey(Boolean(member.static), name), value];
}

/** The callable members of a class body or object literal, keyed by `memberKey`. */
function memberTable(container) {
  const table = new Map();
  const members = container.type === "ObjectExpression" ? container.properties : container.body.body;
  for (const member of members) {
    const entry = callableMember(member);
    if (entry) {
      table.set(entry[0], entry[1]);
    }
  }
  return table;
}

// --- strongly connected components (Tarjan) for the recursion clause -------------------

function stronglyConnected(count, edges) {
  const index = new Array(count).fill(-1);
  const low = new Array(count).fill(0);
  const onStack = new Array(count).fill(false);
  const component = new Array(count).fill(-1);
  const stack = [];
  let next = 0;
  let components = 0;
  const connect = (v) => {
    index[v] = low[v] = next++;
    stack.push(v);
    onStack[v] = true;
    for (const w of edges[v]) {
      if (index[w] === -1) {
        connect(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], index[w]);
      }
    }
    if (low[v] === index[v]) {
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        component[w] = components;
      } while (w !== v);
      components++;
    }
  };
  for (let v = 0; v < count; v++) {
    if (index[v] === -1) {
      connect(v);
    }
  }
  return component;
}

export function byPosition(a, b) {
  return a.loc.start.line - b.loc.start.line || a.loc.start.column - b.loc.start.column;
}

// --- the walker -------------------------------------------------------------------------

export class Walker {
  /**
   * @param {string} sourceText
   * @param {{ scopeManager?: object }} options
   */
  constructor(sourceText, options = {}) {
    this.source = sourceText;
    this.lineStarts = lineStartsOf(sourceText);
    this.functions = [];
    this.topLevel = { kind: "topLevel", score: 0, increments: [] };
    /** Entries receiving the increments emitted right now (a root and its nested chain). */
    this.chain = [this.topLevel];
    /** Frames of the functions lexically enclosing the current node. */
    this.frames = [];
    /** Functions-in-markup mode (KTD2): a function raises nesting but opens no entry. */
    this.markup = false;
    this.entryByNode = new Map();
    this.scope = null;
    this.references = referenceMap(options.scopeManager);
    this.useScopeManager = options.scopeManager !== undefined;
    /** `{ container, isStatic }` naming what `this` refers to, or null when unknown. */
    this.thisContext = null;
    this.currentClass = null;
    this.members = new Map();
    this.calls = [];
  }

  // --- positions -------------------------------------------------------------------------

  positionAt(offset) {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.lineStarts[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low + 1, column: offset - this.lineStarts[low] };
  }

  locOfToken(offset, length) {
    const start = this.positionAt(offset);
    return { start, end: { line: start.line, column: start.column + length } };
  }

  /** Location of the keyword that opens `node`. */
  keywordLoc(node, keyword) {
    return this.locOfToken(node.range[0], keyword.length);
  }

  /** Location of `token` found in the source between two child nodes. */
  betweenLoc(before, after, token) {
    const offset = findToken(this.source, before.range[1], after.range[0], token);
    return this.locOfToken(offset === -1 ? before.range[1] : offset, token.length);
  }

  copyLoc(node) {
    return {
      start: { line: node.loc.start.line, column: node.loc.start.column },
      end: { line: node.loc.end.line, column: node.loc.end.column },
    };
  }

  firstTokenLoc(node) {
    const match = /^[A-Za-z_$][\w$]*/.exec(this.source.slice(node.range[0], node.range[0] + 16));
    return this.locOfToken(node.range[0], match ? match[0].length : 1);
  }

  // --- increments ------------------------------------------------------------------------

  /** `extra` adds construct-specific fields to the increment (the operator of a logical sequence). */
  emit(construct, nesting, nestingIncrement, loc, extra = undefined) {
    const contribution = nestingIncrement ? nesting : 0;
    for (const entry of this.chain) {
      entry.increments.push({ construct, amount: 1 + contribution, nesting: contribution, loc, ...extra });
      entry.score += 1 + contribution;
    }
  }

  /**
   * KTD2's attribution contract for the Svelte facet: everything emitted while `body` runs
   * accrues to `entry` alone, and with `markup` set a function raises nesting for its contents
   * without opening an entry (KTD4's method-like inline function).
   */
  withAttribution(entry, markup, body) {
    const saved = { chain: this.chain, markup: this.markup };
    this.chain = [entry];
    this.markup = markup;
    body();
    this.chain = saved.chain;
    this.markup = saved.markup;
  }

  // --- traversal -------------------------------------------------------------------------

  visit(node, nesting) {
    if (!isNode(node) || NOT_WALKED.has(node.type)) {
      return;
    }
    const handler = HANDLERS[node.type];
    if (handler) {
      handler.call(this, node, nesting);
    } else {
      this.visitChildren(node, nesting);
    }
  }

  visitChildren(node, nesting) {
    for (const child of children(node)) {
      this.visit(child, nesting);
    }
  }

  visitAll(nodes, nesting) {
    for (const node of nodes) {
      this.visit(node, nesting);
    }
  }

  /** The walker's own scope map is only consulted without a scope manager; with one, skip building it. */
  withScope(declare, body) {
    if (this.useScopeManager) {
      body();
      return;
    }
    const scope = { parent: this.scope, bindings: new Map() };
    this.scope = scope;
    declare(scope);
    body();
    this.scope = scope.parent;
  }

  visitStatements(node, nesting) {
    this.withScope(
      (scope) => declareStatements(scope, node.body),
      () => this.visitAll(node.body, nesting),
    );
  }

  // --- functions -------------------------------------------------------------------------

  /**
   * Open an entry for a function-like node and walk its contents. `hint` names the function
   * from its syntactic owner (declarator, assignment, property or class member) and says what
   * `this` means inside it.
   */
  visitFunction(node, nesting, hint = {}) {
    if (this.markup) {
      this.visitInlineFunction(node, nesting);
      return;
    }
    const parentFrame = this.frames.at(-1);
    // Appendix A: a declarative container does not nest its functions; they become roots. Only
    // an outer function is a container: a promoted function is a method of the faux class and
    // nests its own functions like any other (the paper's lambda-in-a-method example).
    const isRoot = parentFrame === undefined || parentFrame.container;
    const entry = {
      name: hint.name ?? (node.id ? node.id.name : ANONYMOUS),
      kind: "function",
      depth: isRoot ? 0 : parentFrame.entry.depth + 1,
      parent: isRoot ? null : parentFrame.index,
      nesting: isRoot ? 0 : nesting + 1,
      loc: this.copyLoc(hint.owner ?? node),
      nameLoc: this.nameLoc(node, hint),
      score: 0,
      increments: [],
    };
    const index = this.functions.push(entry) - 1;
    this.entryByNode.set(node, index);
    const saved = { chain: this.chain, thisContext: this.thisContext };
    this.chain = isRoot ? [entry] : [...saved.chain, entry];
    if (node.type !== "ArrowFunctionExpression" || hint.thisContext !== undefined) {
      this.thisContext = hint.thisContext ?? null;
    }
    this.frames.push({ index, entry, node, container: parentFrame === undefined && isDeclarative(node) });
    this.visitFunctionContents(node, isRoot ? 0 : nesting + 1);
    this.frames.pop();
    this.chain = saved.chain;
    this.thisContext = saved.thisContext;
  }

  /** Functions-in-markup mode: +0, no entry, contents one level deeper (KTD4). */
  visitInlineFunction(node, nesting) {
    this.visitFunctionContents(node, nesting + 1);
  }

  /** Parameters and body in the function's own scope; `nesting` is the level inside it. */
  visitFunctionContents(node, nesting) {
    this.withScope(
      (scope) => this.declareFunctionScope(scope, node),
      () => {
        this.visitAll(node.params ?? [], nesting);
        if (Array.isArray(node.body)) {
          this.visitAll(node.body, nesting);
        } else {
          this.visit(node.body, nesting);
        }
      },
    );
  }

  nameLoc(node, hint) {
    if (hint.nameNode) {
      return this.copyLoc(hint.nameNode);
    }
    return node.id ? this.copyLoc(node.id) : this.firstTokenLoc(node);
  }

  declareFunctionScope(scope, node) {
    if (node.type === "FunctionExpression" && node.id) {
      scope.bindings.set(node.id.name, node);
    }
    for (const param of node.params ?? []) {
      declarePattern(scope, param, null);
    }
    if (Array.isArray(node.body)) {
      declareStatements(scope, node.body);
    }
  }

  visitStaticBlock(node, nesting) {
    this.visitFunction(node, nesting, { name: ANONYMOUS, thisContext: { container: this.currentClass, isStatic: true } });
  }

  // --- specification clauses -------------------------------------------------------------

  visitIf(node, nesting) {
    this.emit("if", nesting, true, this.keywordLoc(node, "if"));
    this.visitIfParts(node, nesting);
  }

  /** Shared by `if` and `else if`: condition at the current level, branches one deeper. */
  visitIfParts(node, nesting) {
    this.visit(node.test, nesting);
    this.visit(node.consequent, nesting + 1);
    if (!node.alternate) {
      return;
    }
    if (node.alternate.type === "IfStatement") {
      this.emit("elseIf", nesting, false, this.keywordLoc(node.alternate, "if"));
      this.visitIfParts(node.alternate, nesting);
    } else {
      this.emit("else", nesting, false, this.betweenLoc(node.consequent, node.alternate, "else"));
      this.visit(node.alternate, nesting + 1);
    }
  }

  visitTernary(node, nesting) {
    this.visit(node.test, nesting);
    this.emit("ternary", nesting, true, this.betweenLoc(node.test, node.consequent, "?"));
    this.visit(node.consequent, nesting + 1);
    this.visit(node.alternate, nesting + 1);
  }

  visitSwitch(node, nesting) {
    this.emit("switch", nesting, true, this.keywordLoc(node, "switch"));
    this.visit(node.discriminant, nesting);
    this.withScope(
      (scope) => node.cases.forEach((switchCase) => declareStatements(scope, switchCase.consequent)),
      () => {
        for (const switchCase of node.cases) {
          this.visit(switchCase.test, nesting + 1);
          this.visitAll(switchCase.consequent, nesting + 1);
        }
      },
    );
  }

  visitLoop(node, nesting) {
    const keyword = node.type === "DoWhileStatement" ? "do" : node.type === "WhileStatement" ? "while" : "for";
    this.emit("loop", nesting, true, this.keywordLoc(node, keyword));
    this.withScope(
      (scope) => [node.init, node.left].filter(isNode).forEach((head) => declareStatement(scope, head)),
      () => {
        for (const key of ["init", "test", "update", "left", "right"]) {
          this.visit(node[key], nesting);
        }
        this.visit(node.body, nesting + 1);
      },
    );
  }

  visitTry(node, nesting) {
    this.visit(node.block, nesting);
    if (node.handler) {
      this.emit("catch", nesting, true, this.keywordLoc(node.handler, "catch"));
      this.withScope(
        (scope) => declarePattern(scope, node.handler.param, null),
        () => this.visit(node.handler.body, nesting + 1),
      );
    }
    this.visit(node.finalizer, nesting);
  }

  visitJump(node) {
    if (node.label) {
      this.emit("labelledJump", 0, false, this.copyLoc(node.label));
    }
  }

  /**
   * Sequences of binary logical operators (paper p. 7-8): read the operands of a `&&`/`||`
   * tree left to right, ignoring precedence, and increment once per run of one operator.
   * `??` is ignored (p. 6); a negated or otherwise opaque operand starts its own tree.
   */
  visitLogical(node, nesting) {
    if (node.operator === "??") {
      this.visitChildren(node, nesting);
      return;
    }
    const operators = [];
    const leaves = [];
    flattenLogical(node, operators, leaves);
    let previous = null;
    for (const { operator, left, right } of operators) {
      if (operator !== previous) {
        this.emit("logicalSequence", 0, false, this.betweenLoc(left, right, operator), { operator });
        previous = operator;
      }
    }
    this.visitAll(leaves, nesting);
  }

  // --- calls (recursion is scored after the walk) -----------------------------------------

  /**
   * Record a call for the recursion pass. The call is an edge from every function it accrues
   * to (the attribution chain), so a function whose callback calls it back is in a cycle, while
   * a promoted function's calls never count against its declarative container. `owner` is the
   * function the call is written in, so `scoreRecursion` can locate a root's increment on its
   * own call rather than on one made by a nested function.
   */
  visitCall(node, nesting) {
    const callee = unwrap(node.callee);
    const target = this.resolveCallee(callee);
    if (target && this.frames.length > 0) {
      const token = callee.type === "Identifier" ? callee : callee.property;
      const owner = this.frames.at(-1).index;
      this.calls.push({ from: this.ancestry(owner), owner, target, loc: this.copyLoc(token) });
    }
    this.visitChildren(node, nesting);
  }

  /** The function node a callee names: a declared function, a function-valued variable or `this.<name>`. */
  resolveCallee(callee) {
    if (callee.type === "Identifier") {
      return this.resolveIdentifier(callee);
    }
    if (callee.type === "MemberExpression" && !callee.computed && callee.object.type === "ThisExpression" && this.thisContext) {
      const name = callee.property.type === "PrivateIdentifier" ? `#${callee.property.name}` : callee.property.name;
      return this.memberFunction(this.thisContext.container, name, this.thisContext.isStatic);
    }
    return null;
  }

  resolveIdentifier(identifier) {
    if (this.useScopeManager) {
      const reference = this.references.get(identifier);
      return reference && reference.resolved ? definedFunction(reference.resolved) : null;
    }
    for (let scope = this.scope; scope !== null; scope = scope.parent) {
      if (scope.bindings.has(identifier.name)) {
        return scope.bindings.get(identifier.name);
      }
    }
    return null;
  }

  /** Function-valued members of a class body or object literal, keyed by static-ness and name. */
  memberFunction(container, name, isStatic) {
    if (!container) {
      return null;
    }
    let table = this.members.get(container);
    if (!table) {
      table = memberTable(container);
      this.members.set(container, table);
    }
    return table.get(memberKey(isStatic, name)) ?? null;
  }

  /**
   * Indices of the entries a function's increments accrue to: itself and its ancestors up to
   * its root. `parent` mirrors the attribution chain (a root resets it, a nested entry extends it).
   */
  ancestry(index) {
    const indices = [];
    for (let i = index; i !== null; i = this.functions[i].parent) {
      indices.push(i);
    }
    return indices;
  }

  /**
   * The call graph over function entries, in source order: `edges[i]` are the targets reachable
   * from entry `i`, and `callsFrom[i]` the calls behind them, each flagged `direct` when entry
   * `i` is the function the call is written in.
   */
  callGraph() {
    const count = this.functions.length;
    const edges = Array.from({ length: count }, () => []);
    const callsFrom = Array.from({ length: count }, () => []);
    for (const call of this.calls.sort(byPosition)) {
      const target = this.entryByNode.get(call.target);
      if (target === undefined) {
        continue;
      }
      for (const source of call.from) {
        edges[source].push(target);
        callsFrom[source].push({ target, loc: call.loc, direct: source === call.owner });
      }
    }
    return { edges, callsFrom };
  }

  /**
   * Paper p. 8: +1 for each function in a recursion cycle, direct or indirect. The increment is
   * located on the function's own call that participates in the cycle when it has one, and only
   * otherwise on the nested function's call that put it there (a root also receives its nested
   * functions' increments, so this keeps the two at distinct locations).
   */
  scoreRecursion() {
    const { edges, callsFrom } = this.callGraph();
    const component = stronglyConnected(this.functions.length, edges);
    for (let i = 0; i < this.functions.length; i++) {
      const inCycle = (call) => component[call.target] === component[i];
      const cycleCall = callsFrom[i].find((call) => call.direct && inCycle(call)) ?? callsFrom[i].find(inCycle);
      if (cycleCall) {
        for (const index of this.ancestry(i)) {
          this.functions[index].increments.push({ construct: "recursion", amount: 1, nesting: 0, loc: cycleCall.loc });
          this.functions[index].score += 1;
        }
      }
    }
  }

  /** Score recursion and return the function entries and the top-level entry, increments in source order. */
  finish() {
    this.scoreRecursion();
    for (const entry of [...this.functions, this.topLevel]) {
      entry.increments.sort(byPosition);
    }
    return { functions: this.functions, topLevel: this.topLevel };
  }

  // --- naming owners and `this` contexts ---------------------------------------------------

  visitDeclarator(node, nesting) {
    this.visit(node.id, nesting);
    this.visitValue(node.init, nesting, node.id.type === "Identifier" ? { name: node.id.name, nameNode: node.id } : {});
  }

  visitAssignment(node, nesting) {
    this.visit(node.left, nesting);
    const name = node.operator === "=" ? targetName(node.left) : null;
    this.visitValue(node.right, nesting, name === null ? {} : { name, nameNode: node.left });
  }

  visitObject(node, nesting) {
    for (const property of node.properties) {
      if (property.type !== "Property") {
        this.visit(property, nesting);
        continue;
      }
      const value = functionValue(property.value);
      const isMethod = value !== null && value.type === "FunctionExpression";
      this.visitProperty(property, nesting, isMethod ? { thisContext: { container: node, isStatic: false } } : {});
    }
  }

  visitProperty(node, nesting, extra = {}) {
    if (node.computed) {
      this.visit(node.key, nesting);
    }
    const name = keyName(node);
    const hint = { ...extra, ...(name === null ? {} : { name, nameNode: node.key }) };
    this.visitValue(node.value, nesting, node.method || node.kind !== "init" ? { ...hint, owner: node } : hint);
  }

  visitClass(node, nesting) {
    this.withScope(
      (scope) => {
        if (node.type === "ClassExpression" && node.id) {
          scope.bindings.set(node.id.name, null);
        }
      },
      () => {
        this.visitAll(node.decorators ?? [], nesting);
        this.visit(node.superClass, nesting);
        const savedClass = this.currentClass;
        this.currentClass = node;
        this.visitAll(node.body.body, nesting);
        this.currentClass = savedClass;
      },
    );
  }

  visitClassMember(node, nesting) {
    if (node.computed) {
      this.visit(node.key, nesting);
    }
    const name = keyName(node);
    const thisContext = { container: this.currentClass, isStatic: Boolean(node.static) };
    const hint = { owner: node, thisContext, ...(name === null ? {} : { name, nameNode: node.key }) };
    const savedThis = this.thisContext;
    this.thisContext = thisContext;
    this.visitValue(node.value, nesting, hint);
    this.thisContext = savedThis;
  }

  /** Visit an expression that may be a function, forwarding the naming hint when it is. */
  visitValue(node, nesting, hint) {
    const value = functionValue(node);
    if (value) {
      this.visitFunction(value, nesting, hint);
    } else {
      this.visit(node, nesting);
    }
  }
}

const HANDLERS = {
  Program: Walker.prototype.visitStatements,
  BlockStatement: Walker.prototype.visitStatements,
  TSModuleBlock: Walker.prototype.visitStatements,
  FunctionDeclaration: Walker.prototype.visitFunction,
  FunctionExpression: Walker.prototype.visitFunction,
  ArrowFunctionExpression: Walker.prototype.visitFunction,
  StaticBlock: Walker.prototype.visitStaticBlock,
  IfStatement: Walker.prototype.visitIf,
  ConditionalExpression: Walker.prototype.visitTernary,
  SwitchStatement: Walker.prototype.visitSwitch,
  TryStatement: Walker.prototype.visitTry,
  LogicalExpression: Walker.prototype.visitLogical,
  BreakStatement: Walker.prototype.visitJump,
  ContinueStatement: Walker.prototype.visitJump,
  CallExpression: Walker.prototype.visitCall,
  VariableDeclarator: Walker.prototype.visitDeclarator,
  AssignmentExpression: Walker.prototype.visitAssignment,
  ObjectExpression: Walker.prototype.visitObject,
  Property: Walker.prototype.visitProperty,
  ClassDeclaration: Walker.prototype.visitClass,
  ClassExpression: Walker.prototype.visitClass,
  MethodDefinition: Walker.prototype.visitClassMember,
  PropertyDefinition: Walker.prototype.visitClassMember,
  AccessorProperty: Walker.prototype.visitClassMember,
};
for (const type of LOOP_TYPES) {
  HANDLERS[type] = Walker.prototype.visitLoop;
}

/**
 * Walk an ESTree/TSESTree `Program` and return the function entries and the top-level entry.
 * Increments are returned in source order.
 */
export function walkProgram(program, sourceText, options = {}) {
  const walker = new Walker(sourceText, options);
  walker.visit(program, 0);
  return walker.finish();
}
