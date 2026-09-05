export { score } from "./score.js";

export interface CogplexityPlugin {
  meta: { name: string; version: string };
  rules: Record<string, unknown>;
}

export declare const plugin: CogplexityPlugin;
export default plugin;
