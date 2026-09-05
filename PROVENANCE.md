# Provenance

`cogplexity` is an independent implementation of the Cognitive Complexity metric, written from the published specification:

> G. Ann Campbell, *Cognitive Complexity: A new way of measuring understandability*, SonarSource white paper, version 1.7 (29 August 2023). https://www.sonarsource.com/docs/CognitiveComplexity.pdf

Appendix B of that paper (the specification) is the clause list this package implements. Appendix A supplies the JavaScript compensating usage. Appendix C supplies worked examples whose expected totals are part of this package's test suite.

## What was not used

No source code from `eslint-plugin-sonarjs` — any version, under any licence (LGPL-3.0 for 2.x, SONAR Source-Available License for 3.x and later) — was read, copied, adapted, or consulted while writing this package. The same holds for SonarSource's other analyzers. Contributors must keep it that way: reading that code, even to "check" a clause, would change the legal object this package is. When a clause is ambiguous, resolve it from the paper, from `gocognit` (an MIT implementation of the same specification for Go, https://github.com/uudashr/gocognit), or from calibration against SonarCloud's published numbers — never from Sonar's source.

## What is this package's own definition

The specification defines scoring for code. The scoring of Svelte template blocks (`{#if}`, `{#each}`, `{#await}` and their relatives) is this package's own definition, documented in the README. It is not part of the specification and is never cross-checked against Sonar.

## Attribution

The metric and its specification are the work of G. Ann Campbell and SonarSource. This is a citation, not a licence obligation. Algorithms are not copyrightable; expression is, and none of theirs is here.

Started 2026-09-05.
