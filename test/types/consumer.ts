// Consumer-style type check: both entry points must resolve through the package's own
// `exports` map, and `./score` must need no ESLint types.
import plugin, { rule, score, scoped } from "cogplexity";
import type { RuleOptions, ScopedConfig } from "cogplexity";
import { score as scoreOnly } from "cogplexity/score";
import type { ScoreResult } from "cogplexity/score";

export const name: string = plugin.meta.name;
export const fns: [typeof score, typeof scoreOnly] = [score, scoreOnly];
export const sameRule: boolean = plugin.rules["cognitive-complexity"] === rule;
export const description: string = rule.meta.docs.description;
export const messageIds: ["functionComplexity", "templateComplexity"] = ["functionComplexity", "templateComplexity"];
export const messageText: string = rule.meta.messages[messageIds[0]];

const bare: RuleOptions = 20;
const object: RuleOptions = { threshold: 20, templateThreshold: false, topContributors: 3 };
export const entries: ScopedConfig[] = [scoped(["**/*.svelte"]), scoped(["**/*.ts"], bare), scoped(["src/**/*.js"], object)];
export const files: string[] = entries[0].files;
export const severity: "error" = entries[0].rules["cogplexity/cognitive-complexity"][0];

export function total(result: ScoreResult): number {
  return result.functions.filter((fn) => fn.parent === null).reduce((sum, fn) => sum + fn.score, result.topLevel.score);
}
