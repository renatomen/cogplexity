// Consumer-style type check: both entry points must resolve through the package's own
// `exports` map, and `./score` must need no ESLint types.
import plugin, { score } from "cogplexity";
import { score as scoreOnly } from "cogplexity/score";

export const name: string = plugin.meta.name;
export const fns: [typeof score, typeof scoreOnly] = [score, scoreOnly];
