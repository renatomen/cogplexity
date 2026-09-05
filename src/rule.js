// The ESLint rule: a thin wrapper over `score()` (KTD2) with KTD5 options and KTD6 messages.
// It reads `context.sourceCode` only — `getSourceCode()`, `getScope()` and `getAncestors()`
// were removed in ESLint 10.
import { score } from "./score.js";

const DEFAULT_THRESHOLD = 15;
const DEFAULT_TEMPLATE_THRESHOLD = 15;

/** KTD6: header, then one line per increment carried in the `breakdown` placeholder. */
const MESSAGE = "{{name}}: cognitive complexity {{score}} exceeds {{threshold}}{{breakdown}}";

/**
 * @typedef {object} Options
 * @property {number} threshold Root functions scoring strictly above this are reported.
 * @property {number | false} templateThreshold Template threshold, or `false` to skip the facet.
 * @property {number} [topContributors] Cap on breakdown lines; undefined means the full list.
 */

/**
 * KTD5: normalise `context.options[0]`. ESLint's `defaultOptions` merge replaces the default
 * object when the user passes a primitive, so a bare number arrives as-is and must keep the
 * template default; an object is merged over the defaults.
 *
 * @param {number | Partial<Options> | undefined} option
 * @returns {Options}
 */
export function normalizeOptions(option) {
  if (typeof option === "number") {
    return { threshold: option, templateThreshold: DEFAULT_TEMPLATE_THRESHOLD };
  }
  return { threshold: DEFAULT_THRESHOLD, templateThreshold: DEFAULT_TEMPLATE_THRESHOLD, ...(option ?? {}) };
}

/** Largest amount first; equal amounts in source order. */
function byAmountThenPosition(a, b) {
  return b.amount - a.amount || a.loc.start.line - b.loc.start.line || a.loc.start.column - b.loc.start.column;
}

/**
 * The `breakdown` placeholder: a newline before every line so the header stays on its own
 * line. ESTree columns are 0-based; the message counts from 1 to match editors and ESLint's
 * own location output.
 */
function formatBreakdown(increments, topContributors) {
  const ordered = [...increments].sort(byAmountThenPosition);
  const shown = topContributors === undefined ? ordered : ordered.slice(0, topContributors);
  const lines = shown.map(
    (inc) => `+${inc.amount} (incl. ${inc.nesting} nesting) ${inc.construct} at ${inc.loc.start.line}:${inc.loc.start.column + 1}`,
  );
  const hidden = ordered.length - shown.length;
  if (hidden > 0) {
    lines.push(`… ${hidden} more`);
  }
  return lines.map((line) => `\n${line}`).join("");
}

function report(context, messageId, loc, name, entry, threshold, options) {
  context.report({
    loc,
    messageId,
    data: { name, score: entry.score, threshold, breakdown: formatBreakdown(entry.increments, options.topContributors) },
  });
}

/** KTD7: only root functions are reported; nested entries appear in their root's breakdown. */
function reportFunctions(context, functions, options) {
  for (const fn of functions) {
    if (fn.parent === null && fn.score > options.threshold) {
      report(context, "functionComplexity", fn.nameLoc, fn.name, fn, options.threshold, options);
    }
  }
}

/** The template facet, present only for Svelte roots and silenced by `templateThreshold: false`. */
function reportTemplate(context, template, options) {
  if (!template || options.templateThreshold === false || template.score <= options.templateThreshold) {
    return;
  }
  const first = template.increments[0];
  const loc = first ? first.loc : { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } };
  report(context, "templateComplexity", loc, "template", template, options.templateThreshold, options);
}

const nonNegativeInteger = { type: "integer", minimum: 0 };

export const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Report functions whose cognitive complexity (G. Ann Campbell's specification) exceeds a threshold",
      url: "https://github.com/renatomen/cogplexity#options",
    },
    schema: [
      {
        oneOf: [
          nonNegativeInteger,
          {
            type: "object",
            properties: {
              threshold: nonNegativeInteger,
              templateThreshold: { oneOf: [nonNegativeInteger, { const: false }] },
              topContributors: { type: "integer", minimum: 1 },
            },
            additionalProperties: false,
          },
        ],
      },
    ],
    defaultOptions: [{ threshold: DEFAULT_THRESHOLD, templateThreshold: DEFAULT_TEMPLATE_THRESHOLD }],
    messages: {
      functionComplexity: MESSAGE,
      templateComplexity: MESSAGE,
    },
  },

  create(context) {
    const { sourceCode } = context;
    const options = normalizeOptions(context.options[0]);
    return {
      "Program:exit"() {
        const result = score(sourceCode.ast, sourceCode.text, { scopeManager: sourceCode.scopeManager });
        reportFunctions(context, result.functions, options);
        reportTemplate(context, result.template, options);
      },
    };
  },
};
