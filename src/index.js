// Placeholder entry point. The rule, scoring function and config helper land in later units.
import { score } from "./score.js";

const plugin = {
  meta: { name: "cogplexity", version: "0.0.1" },
  rules: {},
};

export { plugin, score };
export default plugin;
