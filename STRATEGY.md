---
name: cogplexity
last_updated: 2026-09-04
---

# cogplexity Strategy

## Purpose

A licence-clean cognitive-complexity check for TypeScript, JavaScript and Svelte does not exist: the maintained implementation is SSAL-licensed, which forbids outside AI from reading its output — untenable where coding agents read lint on every run — and the alternatives are end-of-life LGPL or GPL. SonarCloud, the quality gate, reads no Svelte at all, so the components carrying the most logic have no complexity guardrail.

## Positioning

One check, forever: an independent implementation of Campbell's published cognitive-complexity specification, under our own licence, with zero runtime dependencies and no build step — principled and evidence-based the way gocognit is, so that the number stands on its own without needing Sonar's blessing or Sonar's licence.

## Users

**Primary:** The coding agent working in a consumer repo — it runs lint on every pass and is hiring cogplexity for a licence-clean signal it can read to know when a function has grown past the guardrail and logic should be extracted into a testable seam.

**Secondary:** The maintainer — reading what the agent surfaces at the commit boundary.

## Boundaries

- No second rule in this package — a new guardrail gets its own repo, following the same pattern.
- Not a quality target or dashboard metric — a guardrail against outliers only; never optimised toward, never charted.
- No line-count metric, ever, in any form — lines of code is the proxy Farley calls harmful, and decoupling legitimately adds lines.
- No reference to, or dependency on, the owner's private repositories — the package must stay developable and testable if they disappear; calibration uses a public corpus.

_Resist a change when:_ it would add a second check, a runtime dependency, or a build step to this package, or chase Sonar's output rather than the published spec without a recorded reason.

## Key metrics

- **Spec conformance** - every scoring clause of Campbell's spec has a fixture with a hand-derived expected score; all pass. Test suite.
- **Negative control fires** - a known-complex fixture produces findings at threshold 1, so a silent zero can never read as clean. Test suite.
- **Sonar cross-check within tolerance** - per-file totals vs SonarCloud's `cognitive_complexity` on a public reference codebase, at first release and on demand. A cross-check, not a gate: divergence is decided case by case and recorded. Checked-in fixture.
- **Zero deps, zero advisories** - runtime dependency count 0; dev-inclusive `npm audit` clean. CI.

## Tracks

### The rule

A parser-agnostic AST walk implementing every clause of Campbell's spec, on TypeScript, JavaScript and Svelte alike; default threshold 15, overridable.

_Why it serves the approach:_ Generic across languages is what lets one check serve every repo; the spec, not Sonar, is the authority.

### Standing on its own

Spec-conformance fixtures, the negative control, and the one-time Sonar cross-check.

_Why it serves the approach:_ A self-authored rule inverts the usual supply-chain controls — audit is trivially clean, cooldown is meaningless — so the fixtures are the only thing that makes the number trustworthy.

### Adoption in our repos

Published to npm with the git URL as fallback (overturning the originating report's git-only decision); a flat-config helper so each consumer chooses its own file scope; baseline-and-ratchet at adoption in each repository, retiring any SSAL-licensed dependency there.

_Why it serves the approach:_ Two copies drift; one pinned package doesn't. Scope stays the consumer's choice — Svelte only where Sonar already governs the TypeScript, everything elsewhere.

### Licence & provenance

MIT; attribution to G. Ann Campbell and SonarSource as the origin of the specification; a recorded statement that the implementation is written from the spec and never forked from any version of eslint-plugin-sonarjs.

_Why it serves the approach:_ The licence is the crux; the provenance record is what keeps it defensible as the code ages.
