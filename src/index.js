// Package entry point (KTD11): the plugin object (default), the rule, the scoring function
// and the flat-config scoping helper.
import { plugin, scoped } from "./config.js";
import { rule } from "./rule.js";
import { score } from "./score.js";

export { plugin, rule, score, scoped };
export default plugin;
