---
title: SonarCloud calibration diverged on 103 of 172 files because Sonar's cognitive-complexity semantics differ from the paper in four ways
date: 2026-09-06
category: integration-issues
module: src/walker.js (cognitive complexity walker) and test/calibration harness
problem_type: integration_issue
component: static_analysis
symptoms:
  - "calibration harness failed exact-match totals on 103 of 172 SonarCloud fixture files, always with the local cognitive_complexity higher than Sonar's"
  - "harness reported 28 local root functions exceeding the S3776 threshold of 15 while SonarCloud reported zero issues for the same corpus"
  - "|| logical-operator sequences and recursive calls were scored as complexity increments though SonarCloud counts neither"
  - "the Appendix A declarative-outer-function exception was applied too narrowly (only declarations), so the construct-presence line read declarativeOuter=no on a corpus full of factory functions"
  - "functions nested inside a ternary within an otherwise-exempt root leaked one extra nesting level onto the rest of that root on Sonar's side, which the walker does not reproduce"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [cognitive-complexity, sonarcloud, calibration-harness, oracle-matching, eslint-plugin, s3776, appendix-a, variant-fitting]
related_components: [calibration_harness, eslint_rule, score_api]
---

# SonarCloud calibration diverged on 103 of 172 files because Sonar's cognitive-complexity semantics differ from the paper in four ways

## Problem

The first SonarCloud calibration of cogplexity's Cognitive Complexity walker (spec v1.7, Appendix B with Appendix A's JavaScript exception) failed on 103 of 172 corpus files, and the per-function oracle disagreed with Sonar even more sharply: 28 local roots scored over 15 while Sonar had raised no S3776 issue anywhere in the project. The cause was not one bug but four separate SonarCloud behaviours, three of which are Sonar diverging from the paper and one of which was a too-strict reading of Appendix A on our side. State described below is on `main` as of 2026-09-06 (commits 90012eb, ee3fe75, f9e3b6d).

## Symptoms

Corpus: `renatomen/tasknotes-gantt` at its commit `a29ec35c` (a commit of the corpus repository, not of this one), SonarCloud project `renatomen_obsidian-gantt`, fixture `calibration/fixtures/tasknotes-gantt.json` (172 files, 0 issues). Harness: `test/calibration/harness.js` driven by `test/calibration/calibrate.test.js`, reading each file with `git show <sha>:<path>` through `test/calibration/corpus.js`.

- 103 of 172 per-file totals differed; local was always higher than Sonar, never lower.
- 28 root functions had a local score above 15; the fixture's `issues` array was empty, so all 28 were per-function mismatches with `sonar none`.
- The report's second line read `construct presence: recursion=yes declarativeOuter=no`. Recursion was present in the corpus; no Appendix A promotion was detected, because the walker at that point required a declarative function to contain "only declarations", which almost no real outer function satisfies.
- The two files with the largest residual after everything else was explained were `src/bases/dailyNoteAccess.ts` (Sonar 37) and `src/datasource/calendarItems/externalCalendarSource.ts` (Sonar 211); both are paths inside the corpus repository, not files of this package.

## What Didn't Work

Every hypothesis was scored the same way (see the method under Solution) and judged by the number of files whose local total equalled Sonar's exactly. Baseline: 69/172.

| Hypothesis | Exact matches | Why it was wrong |
|---|---|---|
| Nested functions never raise nesting (Sonar ignores function nesting entirely) | 73 | Barely moved; Sonar does raise nesting for functions inside a non-declarative root. |
| Drop all logical sequences | 63 | Went down: `&&` runs are counted by Sonar, only `\|\|` runs are not. |
| Drop only `\|\|` runs | 126 | The single biggest step, but 46 files remained; it explains one Sonar defect, not the nesting difference. |
| Brute force over syntactic categories of nested functions (declaration, method shorthand, arrow property, callback, assigned arrow, ...) choosing per category whether it raises nesting | at most 131 | No syntactic category of the nested function predicts Sonar; the deciding property lives on the enclosing root, not on the nested function. |
| Appendix A structural test at true roots (a root with no structural or hybrid increment of its own does not raise nesting for its depth-1 functions), plus `\|\|` and recursion dropped | 170 | Correct model; the last two files are Sonar's nesting leak. |
| The same Appendix A test applied at every depth | 162 | Worse than roots-only: a promoted function must nest its own functions (the paper's lambda-in-a-method example scores 2). |
| The test re-applied to promoted roots | 165 | Same reason: promotion is a property of the outermost function only. |
| Appendix A test at true roots, `\|\|` dropped, recursion dropped, plus a "nesting leak" after each function placed inside a ternary within an exempt root | 172 | The final model. The leak only reproduces Sonar; it is not adopted. |

Wrong assumptions about S3776 that cost time:

- "Zero issues means the rule is off." It was not: `api/rules/show` confirmed S3776 active in the Sonar way TS profile, severity CRITICAL, threshold 15, and 161 S3776 issues existed elsewhere in the organisation. The zero was genuine.
- "Sonar reports the root's inclusive score." It does not. Scoring every function's own body only (nested functions excluded) with nesting still counted from the file left two functions over 15 (27 and 22). Scoring them standalone, with nesting restarting at the function's own body, gave 15 and 14. Sonar's per-function number is the own body with relative nesting, and the check is strict `>` 15 (the function at exactly 15 had no issue).
- "The paper's declarative function contains only declarations." The paper's own Appendix A example assigns `bar.myFun = function ...`, which is an assignment statement, and its operative test is "the presence at the top level of a function (i.e. not nested inside a sub-function) of statements subject to structural increments". The U2 implementer had tightened the prose into "only declarations"; that tightening produced `declarativeOuter=no` on a corpus full of factory functions.
- The CI calibration job could originally go green with the fixture absent (it skipped both steps and exited 0); the review commit ee3fe75 made a missing fixture fail the job, with the in-code comment "the job must never go green without comparing" (session history).

## Solution

### The method: variant fitting

A throwaway node script (not committed) scored the whole corpus once, then re-scored the increment lists under each candidate transform and counted exact matches. Its shape, worth keeping:

```js
// 1. score every fixture path once with the real walker
const files = Object.entries(fixture.files).map(([p, sonar]) => ({ p, sonar, result: scoreSource(readAt(sha, p), p) }));
// 2. a hypothesis is a function from a scored result to a candidate total
const hypotheses = {
  baseline: (r) => r.total,
  dropOr: (r) => r.total - sum(r, (inc) => inc.construct === "logicalSequence" && inc.operator === "||"),
  dropOrAndRecursion: (r) => hypotheses.dropOr(r) - sum(r, (inc) => inc.construct === "recursion"),
  // ...each new idea is one more entry
};
// 3. count exact matches and print residuals sorted by |delta|
for (const [name, h] of Object.entries(hypotheses)) {
  const rows = files.map((f) => ({ ...f, local: h(f.result), delta: h(f.result) - f.sonar }));
  console.log(name, rows.filter((r) => r.delta === 0).length, "/", rows.length);
  rows.filter((r) => r.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10).forEach((r) => console.log("  ", r.p, r.sonar, r.local, r.delta));
}
```

Transforms that only remove increments work on the emitted list; transforms that change nesting (the Appendix A variants) needed a walker flag and a re-score. The residual list after each step is what pointed at the next hypothesis: after `||` and recursion were removed, every remaining mismatch was a file with functions nested in a root that had no `if`/loop/ternary of its own; after the Appendix A fix, the two remaining files were the only exempt roots in the corpus containing a function node inside a ternary (per this session's analysis, 18 non-exempt roots with such functions behaved normally; that count lives only in the throwaway script's output).

### The four Sonar behaviours and the evidence

1. **`||` sequences are not counted; `&&` sequences are.** Dropping all logical sequences fell to 63; dropping only `||` runs rose to 126. Appendix B counts every sequence of binary logical operators. Kept per spec, recorded as a `clause` entry with `operator: "||"` in `calibration/ledger.json`.
2. **Recursion cycles are not counted.** Removing recursion increments on top of the `||` change moved the remaining files onto Sonar exactly. Appendix B: "each method in a recursion cycle". Kept per spec, recorded as a `clause` entry in `calibration/ledger.json`.
3. **Appendix A is applied using the paper's operative test at the outermost function only.** A root with no structural or hybrid increment at its own level (not counting its nested functions) does not raise nesting for the functions inside it; those become roots. Roots-only gave 170; every-depth gave 162; re-applied-to-promoted gave 165. This one is adopted, because it is what the paper says.
4. **Nesting leak inside an exempt root.** After each function placed in a ternary, Sonar adds one nesting level for the rest of that exempt root. Only two files in the corpus have that shape and both diverged; the model gave 172/172. The paper has no such rule, so the two files carry `file` entries with `expectedDelta` in `calibration/ledger.json`.

Per-function: Sonar's S3776 number is the function's own body with nesting counted relative to that body, strict `> 15`. Under that reading the corpus has no function over 15, which is what Sonar reported.

### The walker change (`src/walker.js`)

The Appendix A test is now literally the paper's: a function is declarative when nothing outside its nested functions is subject to a structural or hybrid increment.

- `STRUCTURE_TYPES` (`src/walker.js:67`) names the nodes with a structural or hybrid increment: `IfStatement`, `ConditionalExpression`, `SwitchStatement`, `CatchClause` and the loop types. Logical sequences and labelled jumps are fundamental increments and are deliberately absent.
- `NESTED_SCOPE_TYPES` (`src/walker.js:75`) is the boundary: function nodes and `StaticBlock`. A class field is not a boundary; only its function value is.
- `CLASS_MEMBER_TYPES` (`src/walker.js:78`) lists `MethodDefinition`, `PropertyDefinition`, `AccessorProperty`, whose computed key and non-function value are scored into the enclosing function.
- `isDeclarative` (`src/walker.js:270-275`) searches the function's params and body: `return ![...(fn.params ?? []), ...body].some(containsStructure);`. Params are included because a default value can hold a ternary; `body` is an array for a static block.
- `containsStructure` (`src/walker.js:278-297`) returns true at a `STRUCTURE_TYPES` node, false at a `NESTED_SCOPE_TYPES` node, and for a class member checks the computed key and the value; otherwise it recurses over `children(node)`.
- `visitFunction` (`src/walker.js:662-686`) computes `isRoot = parentFrame === undefined || parentFrame.container` and pushes a frame with `container: parentFrame === undefined && isDeclarative(node)`. That `parentFrame === undefined` is the roots-only decision: a promoted function is never itself a container, so it nests its own functions (the paper's lambda-in-a-method example).
- Each entry records `nesting: isRoot ? 0 : nesting + 1` (`src/walker.js:672`; typed at `src/score.d.ts:57-58`), which the harness needs for the own-body derivation.
- `visitLogical` (`src/walker.js:827`) passes `{ operator }` into `emit`, so every `logicalSequence` increment carries `operator: "&&" | "||"` (`src/score.d.ts:44-45`). This is what lets a ledger entry name only `||` runs.
- Recursion is unchanged in substance: calls are recorded with their attribution chain (`src/walker.js:843-852`), `callGraph` builds edges per entry (`src/walker.js:909-924`), and `scoreRecursion` (`src/walker.js:932-945`) adds one `recursion` increment per function in a strongly connected component, to the function and its ancestors.

The review commit ee3fe75 closed three Appendix A edge cases in `containsStructure`/`isDeclarative`: a ternary in a parameter default, a ternary in a non-function class-field initialiser, and a static block body being an array. Each is pinned in `test/fixtures/spec/declarative.ts` (`defaultTernary` at line 99, `fieldTernary` at line 86, `Checked`/`Unchecked` at lines 109-134), alongside the paper's example (`declarative` at line 2, which assigns `bar.myFun` and is declarative) and the roots-only case (`faux` at line 61).

### The harness and ledger changes (`test/calibration/harness.js`)

- **Own-body derivation.** `NESTING_BEARING` (`harness.js:153`) lists the constructs whose amount carries a nesting increment. `ownScores` (`harness.js:161-168`) filters a function's increments to those not enclosed by a child entry's `loc`, then sums:

  ```js
  const score = own.reduce((sum, inc) => sum + (NESTING_BEARING.has(inc.construct) ? inc.amount - entry.nesting : inc.amount), 0);
  ```

  Because `amount = 1 + nesting` (`src/walker.js:585`) and the entry's `nesting` is the level at which its body starts, `amount - entry.nesting` is exactly what the increment would have scored had nesting restarted at the function's body. Non-nesting-bearing constructs (`else`, `elseIf`, `logicalSequence`, `labelledJump`, `recursion`) keep their amount. `reportedCount` (`harness.js:170-172`) applies the strict `> THRESHOLD` (`THRESHOLD = 15`, `harness.js:51`), and `compareFindings` (`harness.js:203-216`) pairs each such function with a fixture issue on its name line carrying the same score.

- **Operator-aware, combinable clause entries.** `matchesClause` (`harness.js:97-99`) matches construct and, when present, operator. `clauseAmountIn` (`harness.js:102-106`) sums matching amounts in one increment list; `clauseAmount` sums over roots and top level. `clausesCovering` (`harness.js:123-127`) takes every clause entry naming at least one increment in the file and covers the file only when their amounts together equal the whole delta, so a recursion `+1` cannot hide an unrelated `+1`. `functionCoverage` (`harness.js:184-192`) applies the same entries to a per-function mismatch: the own-body score minus their increments must equal Sonar's number, or stay at or below 15 where Sonar reported nothing.

- **File entries.** `coversByFile` (`harness.js:135-137`) covers only when `expectedDelta === file.sonar - file.local`; `fileEntryFailure` (`harness.js:361-366`) fails the run naming both deltas when a pinned file drifts. A file entry also accepts every per-function mismatch on its path (`harness.js:185-186`).

- **Silent-pass checks added in review.** `ledgerContradictions` (`harness.js:348-359`) fails any delta-0 file that contains increments a clause entry names, unless a `file` entry pins it; `collectProblems` (`harness.js:298-310`) also fails when `summary.files === 0` so an empty fixture never calibrates. Clause entries that cover nothing are `staleEntries` (`harness.js:368-381`).

- **Construct presence.** `presenceOf` (`harness.js:387-392`) reports `recursion` from `constructAmount(result, "recursion") > 0` and `declarativeOuter` from `isPromotedRoot` (`harness.js:232-234`), which approximates a promotion as a root entry whose `loc` lies inside another entry's `loc`.

The four ledger entries on `main` (`calibration/ledger.json`): `logicalSequence` with `operator: "||"`, `recursion`, and `file` entries for `src/bases/dailyNoteAccess.ts` (`expectedDelta: 1`) and `src/datasource/calendarItems/externalCalendarSource.ts` (`expectedDelta: 11`). Note the sign: `expectedDelta` is Sonar minus local (`harness.js:6-9`), so the dailyNoteAccess entry says Sonar is one higher than local: the leak adds 4, the three uncounted `||` runs subtract 3.

## Why This Works

- **The spec-versus-Sonar split is principled because the paper is the contract, not Sonar.** `README.md` states it under Calibration: the specification is the authority, SonarCloud is a cross-check. Two of the divergences (`||`, recursion) are Sonar omitting clauses the paper states explicitly in Appendix B; chasing them would mean shipping a rule that contradicts the document it cites. Recording them as clause entries keeps the rule honest and keeps the harness exact: every one of those increments must be accounted for by the ledger, file by file, or the run fails.
- **Appendix A was the one place we were wrong, and the fix is the paper's own words.** The U2 tightening ("only declarations") was not in the paper; the paper's example assigns a property and is still declarative. Applying the operative test at true roots only is the reading that both matches the paper's lambda-in-a-method example (score 2, `test/fixtures/spec/declarative.ts:59-71`) and matches Sonar on 170 of 172 files. That agreement across two independent sources is what justified changing the walker rather than adding a ledger entry.
- **Own-body with relative nesting explains the zero issues without any further assumption.** The rule reports a root inclusively (plan KTD7); Sonar reports each function's own increments as if the function were the outermost scope. Under that quantity, the functions the rule flagged at 27 and 22 are 15 and 14, and 15 is not `> 15`. The harness derives Sonar's quantity from the same increments the rule emits, so the two reports are reconciled without maintaining two scorers.
- **The leak is attributable to Sonar because it is the residual, not the model.** Once every paper-conformant transform was applied, the only two mismatching files were the only two exempt roots with a function node inside a ternary; per this session's analysis, 18 non-exempt roots with the same shape were fine. A rule that applies only inside declarative roots, only after ternary-placed functions, and only for the remainder of the root is not in the paper. Reproducing it would add code with no textual basis; pinning it with `file` entries and an exact `expectedDelta` keeps the divergence visible and regression-checked.

## Prevention

**Run and read the calibration.**

```sh
COGPLEXITY_CORPUS=/path/to/tasknotes-gantt npm run calibrate
```

`package.json` maps this to `node --test test/calibration/calibrate.test.js`. With the variable unset the corpus is reported as skipped with the reason, never as passed. The first two report lines are printed as diagnostics: the counts line (`compared N file total(s) and M fixture issue(s); K function(s) over 15 by own body; L ledger entr(y/ies) applied`) and the presence line (`construct presence: recursion=yes|no declarativeOuter=yes|no`). Expected today: 172 totals, 0 issues, 3 functions over 15 by own body (each explained by the clause entries present in its own body: the `||` entry, and for one of them the recursion entry as well), 4 entries applied, `recursion=yes declarativeOuter=yes`.

**What a new mismatch means.** A line `path: sonar S, local L, delta +D (not covered by the ledger)` means the walker and Sonar disagree on a file and no entry explains all of `D`. Before touching the ledger, decide which side the paper is on: re-read the Appendix B clause, look at the increments the walker emitted for that file (`score()` returns them with locations), and check whether every one has textual support. If the walker is wrong, fix the walker and add a spec fixture under `test/fixtures/spec/`. If the paper supports the walker, the mismatch is a Sonar divergence and goes in the ledger. A `contradiction` line (`path: sonar S, local S, but the ledger records X as uncounted by Sonar (n present)`) means the opposite: Sonar agrees with us on a file that contains a ledgered construct, so either Sonar started counting it or the entry is wrong; investigate before editing.

**Adding a ledger entry honestly.**

- Use `clause` when the divergence is Sonar not counting (or counting differently) a construct the walker emits, and the difference is exactly the summed `amount` of those increments. The harness enforces this: the entry covers a file only when all clause entries present sum to the whole delta. For `logicalSequence` add `operator` when only one operator's runs differ; the validator rejects `operator` on any other construct or on a `file` entry.
- Use `file` when the divergence changes nesting rather than adding an increment, or is otherwise not expressible as a construct sum. `expectedDelta` is Sonar minus local, the negation of the report's `delta`. The entry must explain in `reason` what mechanism produces the number, so a later reader can tell a regression from the same leak.
- Never add an entry whose only justification is "Sonar says so". The spec is the authority: the entry must cite the Appendix B or Appendix A text that the walker follows and Sonar does not.
- Every entry must be exercised: an unused clause entry fails as stale, and a file entry whose path has no mismatch is stale too.

Ledger entry shapes:

```json
{ "kind": "clause", "match": "logicalSequence", "operator": "||", "reason": "...", "addedAt": "2026-09-06" }
{ "kind": "clause", "match": "recursion", "reason": "...", "addedAt": "2026-09-06" }
{ "kind": "file", "match": "src/bases/dailyNoteAccess.ts", "expectedDelta": 1, "reason": "...", "addedAt": "2026-09-06" }
```

**Do not record a Sonar behaviour the corpus cannot show.** The presence line gates the answer: a question about Sonar's treatment of recursion or of Appendix A promotion is only answered when the line says `yes` for that construct. The first run's `declarativeOuter=no` was itself the tell that our Appendix A test was too strict, not evidence that the corpus lacked the construct.

**When you need to fit a hypothesis again**, write the throwaway script, not a walker option. Keep the walker faithful to the paper; run candidate transforms over the emitted increments, count exact matches, and print the residuals sorted by absolute delta. The residuals after each step are the next hypothesis; the model is done when the residual set is empty or is small enough to read file by file.

## Related Issues

- `README.md`, section "Calibration": the user-facing statement of the same behaviour, including "What the ledger records today"; link there rather than duplicating it.
- `PROVENANCE.md`, "What was not used": the constraint the diagnosis method respects (ambiguous clauses are resolved from the paper or from calibration against SonarCloud's published numbers, never from Sonar's source); variant fitting is the compliant instance.
- `calibration/ledger.json`: the enforced record of the four divergences.
- `docs/plans/2026-09-04-1254-feat-cognitive-complexity-rule-plan.md`: KTD3 (the Appendix A row whose wording the walker now follows), KTD7 (inclusive attribution), KTD9 and R25 as amended on 2026-09-06.
- `test/fixtures/spec/declarative.ts` and `test/fixtures/spec/recursion.ts`: the executable pins for every case above.
- No related GitHub issues exist for this repository as of 2026-09-06.
