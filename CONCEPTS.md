# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Scoring

### Increment
One unit of Cognitive Complexity assessed for a single construct, carrying the construct it was assessed for, its amount, its nesting contribution and its source location. The amount is one plus the nesting contribution; the ordered list of a function's increments is its breakdown.

The paper names three kinds. A structural increment (if, ternary, switch, loop, catch) raises the nesting level for what it contains and receives a nesting contribution equal to its own depth. A hybrid increment (else, else if) raises the nesting level but receives no nesting contribution. A fundamental increment (a logical sequence, a labelled jump, recursion) does neither.

### Nesting level
The depth at which a construct sits inside structural and hybrid increments and inside function-like scopes. Every function-like scope raises it by one for its contents unless the scope is promoted (see Declarative outer function).

### Logical sequence
A maximal run of one binary boolean operator read left to right through a logical-expression tree, ignoring precedence; each run is one fundamental increment and remembers which operator it was. A parenthesised or negated operand starts a new run; the nullish operator is not boolean and is ignored.

### Recursion increment
One fundamental increment for every function in a call cycle, direct or indirect, resolved within one file. A call inside a nested function is an edge from every function in its attribution chain, so a function whose callback calls it back is in a cycle; a promoted function's calls never count against its former container.

### Root function
A function whose score the rule reports: one declared at the top of a file or a class, or one promoted by the Appendix A exception. Its score is inclusive of everything nested inside it, so a root always scores at least as much as any function within it; nested functions still have entries of their own, with a parent link, so a reader can see which callback carries the weight.

### Attribution chain
The functions an increment accrues to: the function it is written in and every enclosing function up to its root. The chain resets at a promoted function, which is how promotion moves complexity out of its container.

### Declarative outer function
The paper's Appendix A compensating usage for JavaScript: an outermost function that contains no statement subject to a structural increment at its own level (parameters included, nested functions excluded) is treated as a namespace or faux class. It scores its own fundamental increments only and does not raise the nesting level for the functions inside it; those become root functions, called promoted roots. Only an outermost function can be such a container: a promoted root nests its own functions like any other, matching the paper's lambda-in-a-method example.
*Avoid:* declarative container (as a distinct concept), namespace function

### Top level
The statements of a file that lie outside any function. They are scored at nesting zero into their own entry, never reported by the rule, and included in the file total so it can be compared with a per-file measure.

### Template facet
The second, independent score a Svelte file carries for its markup control-flow blocks, under this package's own definition rather than the paper's, against its own threshold. It is never part of a file total and never cross-checked against SonarCloud.

## Calibration

### Calibration corpus
A public repository analysed on SonarCloud whose per-file measures and per-function findings serve as the external oracle. The harness is corpus-agnostic; a corpus is identified by its repository, its SonarCloud project key and the exact analysed commit, and the harness reads files at that commit so the working tree of the clone does not matter.

### Fixture
The checked-in capture of a corpus: the analysed commit, the capture time, the eligible-file rules SonarCloud applied, every eligible file's total, and every per-function finding with its line and score. Refreshed on demand from the SonarCloud API; a refresh aborts on any failure rather than writing a partial capture.

### Own-body score
What SonarCloud reports per function: the score of a function's own increments with nested functions excluded and nesting counted from the function's own body rather than from the file. Distinct from the inclusive score the rule reports for a root function; the harness derives it from the same increments so the two oracles can be compared like with like.

### Exception ledger
The checked-in list of recorded divergences between the specification and SonarCloud, each with a one-line reason. A divergence is decided case by case and recorded, never chased; the specification is the authority and SonarCloud is a cross-check. Entries are stale, and fail the run, when they explain nothing.

### Clause entry
A ledger entry naming a construct (and, for a logical sequence, optionally its operator) that SonarCloud counts differently from the specification. Every clause entry present in a file must together explain the file's whole delta; the same entries explain a per-function mismatch when the own-body score minus their increments matches what SonarCloud reported.

### File entry
A ledger entry pinning one corpus file whose divergence is not a construct sum, typically a nesting difference, to an exact expected delta expressed as SonarCloud minus local. A file that drifts from its expected delta fails the run; a file entry also accepts that file's per-function mismatches.

### Contradiction
A corpus file whose total already equals SonarCloud's although it contains a construct a clause entry records as uncounted. It fails the run because either SonarCloud has started counting that construct or the entry is wrong; files pinned by a file entry are exempt.

### Construct presence
The report line stating whether the corpus at its pinned commit contains at least one recursion cycle and at least one declarative outer function. A question about SonarCloud's behaviour on a construct can be recorded as answered only when that construct is present.

### Variant fitting
The diagnosis method for a calibration mismatch: score the corpus once, re-score the emitted increments under each candidate hypothesis about the oracle, count files that match exactly, and read the residuals sorted by size to find the next hypothesis. The walker stays faithful to the paper throughout; hypotheses live in a throwaway script.

## Flagged ambiguities

- "Nesting" has been used for both the paper's nesting level and a function entry's starting level. The entry field records the level at which the function's body starts; the nesting contribution on an increment is the level at the construct. Both are the same scale.
- "Root" is reserved for a function the rule reports. A function nested in a non-declarative function is a nested entry, never a root, even when it is the one carrying the complexity.
