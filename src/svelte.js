// The Svelte facets (KTD4): script bodies scored through the shared walker exactly like a
// `.ts` program, and the markup scored as one `template` entry under the package's own
// definition. That definition is not part of Campbell's specification and is never
// cross-checked against Sonar; every expression and inline function in markup is still scored
// by the shared walker (KTD2) so the two facets never disagree on an operator.
//
// Node shapes follow `svelte-eslint-parser`, which this module never imports: it dispatches on
// type strings and hands every non-Svelte node to the walker.
import { Walker, byPosition, children, isNode } from "./walker.js";

/** The KTD4 rows that carry an increment, keyed by the parser node's opening keyword. */
class TemplateWalker {
  /** @param {Walker} walker The shared walker, already switched to markup attribution. */
  constructor(walker) {
    this.walker = walker;
  }

  visit(node, nesting) {
    if (!isNode(node)) {
      return;
    }
    if (!node.type.startsWith("Svelte")) {
      this.walker.visit(node, nesting);
      return;
    }
    const handler = MARKUP_HANDLERS[node.type];
    if (handler) {
      handler.call(this, node, nesting);
    } else {
      this.visitChildren(node, nesting);
    }
  }

  /** Elements, tags, attributes and directives are transparent: their contents at the same nesting. */
  visitChildren(node, nesting) {
    for (const child of children(node)) {
      this.visit(child, nesting);
    }
  }

  visitAll(nodes, nesting) {
    for (const node of nodes ?? []) {
      this.visit(node, nesting);
    }
  }

  // --- locations ---------------------------------------------------------------------------

  /** The block's opening keyword, `{#if`, `{:else`, `{#each`, `{#await`, `{:then`, `{:catch`. */
  openerLoc(node) {
    const match = /^\{[#:]\w+/.exec(this.walker.source.slice(node.range[0], node.range[0] + 8));
    return this.walker.locOfToken(node.range[0], match ? match[0].length : 1);
  }

  /** `keyword` after `node` in the source (the `then`/`catch` of a shorthand `{#await}`). */
  keywordAfterLoc(node, keyword) {
    const offset = this.walker.source.indexOf(keyword, node.range[1]);
    return this.walker.locOfToken(offset === -1 ? node.range[1] : offset, keyword.length);
  }

  // --- KTD4 rows ---------------------------------------------------------------------------

  /** `{#if}` +1 structural; `{:else if}` (the block with `elseif: true`) +1 hybrid; children one deeper. */
  visitIfBlock(node, nesting) {
    this.walker.emit(node.elseif ? "elseIfBlock" : "ifBlock", nesting, !node.elseif, this.openerLoc(node));
    this.visit(node.expression, nesting);
    this.visitAll(node.children, nesting + 1);
    this.visit(node.else, nesting);
  }

  /** The `{:else if}` wrapper is transparent; a real `{:else}` (of `if` or `each`) is +1 hybrid. */
  visitElseBlock(node, nesting) {
    if (node.elseif) {
      this.visitAll(node.children, nesting);
      return;
    }
    this.walker.emit("elseBlock", nesting, false, this.openerLoc(node));
    this.visitAll(node.children, nesting + 1);
  }

  /** `{#each}` +1 structural; its expression, context, index and key at the block's nesting. */
  visitEachBlock(node, nesting) {
    this.walker.emit("eachBlock", nesting, true, this.openerLoc(node));
    for (const key of ["expression", "context", "index", "key"]) {
      this.visit(node[key], nesting);
    }
    this.visitAll(node.children, nesting + 1);
    this.visit(node.else, nesting);
  }

  /** `{#await}` +1 structural; pending, then and catch contents one deeper; then/catch +1 hybrid each. */
  visitAwaitBlock(node, nesting) {
    this.walker.emit("awaitBlock", nesting, true, this.openerLoc(node));
    this.visit(node.expression, nesting);
    this.visitAll(node.pending?.children, nesting + 1);
    this.visitAwaitBranch(node.then, "thenBlock", node, nesting);
    this.visitAwaitBranch(node.catch, "catchBlock", node, nesting);
  }

  /**
   * `{:then}` / `{:catch}` at the await's nesting, children one deeper. In the shorthand form
   * (`{#await p then v}`) the branch starts where the await does, so the keyword is located instead.
   */
  visitAwaitBranch(branch, construct, awaitBlock, nesting) {
    if (!isNode(branch)) {
      return;
    }
    const shorthand = branch.range[0] === awaitBlock.range[0];
    const keyword = construct === "thenBlock" ? "then" : "catch";
    this.walker.emit(construct, nesting, false, shorthand ? this.keywordAfterLoc(awaitBlock.expression, keyword) : this.openerLoc(branch));
    this.visitChildren(branch, nesting + 1);
  }

  /** `{#snippet}` is method-like: +0, parameters and children one deeper. */
  visitSnippetBlock(node, nesting) {
    this.visitAll(node.params, nesting + 1);
    this.visitAll(node.children, nesting + 1);
  }
}

/**
 * Handlers for the Svelte node types that are not transparent. `{#key}`, `{@render}`, `{@html}`,
 * `{@const}`, `{@debug}`, elements, attributes and directives fall through to `visitChildren`.
 */
const MARKUP_HANDLERS = {
  SvelteScriptElement() {},
  SvelteStyleElement() {},
  SvelteIfBlock: TemplateWalker.prototype.visitIfBlock,
  SvelteElseBlock: TemplateWalker.prototype.visitElseBlock,
  SvelteEachBlock: TemplateWalker.prototype.visitEachBlock,
  SvelteAwaitBlock: TemplateWalker.prototype.visitAwaitBlock,
  SvelteSnippetBlock: TemplateWalker.prototype.visitSnippetBlock,
};

/**
 * Walk a `svelte-eslint-parser` root: every `<script>` body (instance and module) as a program,
 * then the markup as the `template` entry. Increments are returned in source order.
 */
export function walkSvelte(program, sourceText, options = {}) {
  const walker = new Walker(sourceText, options);
  const template = { kind: "template", score: 0, increments: [] };
  for (const node of program.body) {
    if (node.type === "SvelteScriptElement") {
      walker.visitStatements(node, 0);
    }
  }
  walker.withAttribution(template, true, () => new TemplateWalker(walker).visitAll(program.body, 0));
  const { functions, topLevel } = walker.finish();
  template.increments.sort(byPosition);
  return { functions, topLevel, template };
}
