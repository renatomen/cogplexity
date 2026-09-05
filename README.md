# cogplexity

A licence-clean ESLint rule for **cognitive complexity** on TypeScript, JavaScript and Svelte — one rule, zero runtime dependencies, no build step, written from the published specification.

> Status: under construction. The scoring core, rule and Svelte support land unit by unit; this README grows with them.

## Why

The maintained cognitive-complexity implementation for the JavaScript ecosystem ships under a licence that forbids using outside AI to read what it produces, which rules it out anywhere coding agents read lint output. SonarCloud, meanwhile, does not analyse Svelte at all. `cogplexity` fills that gap with a single rule that traces every point to G. Ann Campbell's specification and is cross-checked against SonarCloud's own numbers.

## Attribution

The Cognitive Complexity metric and its specification are the work of **G. Ann Campbell** and **SonarSource**: *Cognitive Complexity: A new way of measuring understandability*, SonarSource white paper v1.7 (2023), https://www.sonarsource.com/docs/CognitiveComplexity.pdf. This package is an independent implementation written from that paper; see `PROVENANCE.md`.

## Installation

```sh
npm install --save-dev cogplexity
```

or, from the git URL at an exact tag:

```sh
npm install --save-dev github:renatomen/cogplexity#1.0.0
```

Either way, commit your lockfile and install with `npm ci`: the lockfile pins the resolved commit, while a git tag is mutable.

Requires Node `>=20.19.0` and ESLint `^9.15.0 || ^10.0.0`. Parsers are yours to supply: `@typescript-eslint/parser` for `.ts`/`.js`, `svelte-eslint-parser` (with the TypeScript parser nested) for `.svelte`.

## Usage

Documented with the rule (later unit).

## Options

Documented with the rule (later unit).

## Svelte template scoring

Documented with the Svelte facet (later unit). This scoring is the package's own definition; it is not part of the specification and is never cross-checked against Sonar.

## Calibration

The specification is the authority; SonarCloud is a cross-check. The calibration harness (`test/calibration/`) proves two things about a public reference corpus analysed on SonarCloud, and passes only on **exact** equality:

- **per-file totals** — `score().total` for every eligible file equals SonarCloud's `cognitive_complexity` file measure;
- **per-function findings** — every root function scoring above 15 has a SonarCloud S3776 issue on its name line with the same score, and every S3776 issue corresponds to such a function.

The corpus is [`renatomen/tasknotes-gantt`](https://github.com/renatomen/tasknotes-gantt) (SonarCloud project key `renatomen_obsidian-gantt`), a public repository chosen so this package never depends on private code; the harness is corpus-agnostic and accepts any fixture with the same shape.

**Fixture.** `calibration/fixtures/<corpus>.json` records `projectKey`, `repository`, the analysed `commitSha`, `capturedAt`, the `sonar` block that defines the eligible file set (`sources`, `testInclusions`, `exclusions`, `extensions`), `files` (path → total) and `issues` (`{ path, line, score }`). The harness reads every fixture path with `git show <commitSha>:<path>` from your clone, so a dirty working tree or a different checked-out branch never matters; a clone that lacks the commit fails as `corpus unavailable`, distinct from a mismatch. A fixture path absent at the commit, or an eligible file at the commit that the fixture lacks, fails naming the path.

**Run locally.**

```sh
COGPLEXITY_CORPUS=/path/to/tasknotes-gantt npm run calibrate
```

With `COGPLEXITY_CORPUS` unset (as in a plain `npm test`), the corpus is reported as *skipped* with the reason — never as passed. The CI `calibration` job clones the corpus at the fixture's commit and runs the same command; it needs no credential.

**Refresh the fixture.** Put a SonarCloud token in the `SONAR_TOKEN` environment variable or in a git-ignored `.env`, then:

```sh
node scripts/refresh-fixture.mjs tasknotes-gantt --project-key renatomen_obsidian-gantt --repository renatomen/tasknotes-gantt --sources src
```

The script aborts without touching the fixture on any API failure, replaces it atomically on success and prints what changed. The flags are only needed the first time; afterwards the metadata comes from the existing fixture.

**Ledger.** A divergence from Sonar becomes a recorded entry in `calibration/ledger.json`, never a chase. Entries are `{ kind, match, reason, addedAt, expectedDelta? }`:

- `kind: "clause"` — `match` is a `construct` identifier (`recursion`, `logicalSequence`, …). It covers a file only when the file's delta (local minus Sonar) equals the summed amount of that construct's increments in the file, so `recursion` explains a `+1` only where exactly one recursion increment exists. A clause entry that covers no file fails the run as stale.
- `kind: "file"` — `match` is the repo-relative path and `expectedDelta` (required) is **Sonar minus local**, i.e. the negation of the delta the report prints. The entry covers the file only when the observed delta equals `expectedDelta` exactly; a later regression on that file fails naming both deltas. A `file` entry also accepts that path's per-function mismatches — a `clause` entry never does.

Every entry carries a one-line `reason`.

**Construct-presence report.** After scoring, the harness prints how many totals and issues it compared and whether the corpus contains at least one `recursion` increment and at least one Appendix A promoted root (a declarative outer function), e.g. `construct presence: recursion=yes declarativeOuter=no`. A question about Sonar's behaviour on a construct can only be recorded as answered when that construct is present.

## Compatibility and versioning

The following are the package's public contract; a change to any of them is a major version:

- the rule name `cogplexity/cognitive-complexity`
- the option keys
- the message ids and the per-increment line grammar
- the `construct` identifiers and the `score()` result shape
- the `scoped()` helper's signature

## Maintainers

- Enable the pre-commit hook: `git config core.hooksPath .githooks`.
- Releases: bump `version` in `package.json`, tag with the bare semver (`git tag 1.2.3`), push the tag. The `publish.yml` workflow runs lint, type check, tests and the pack check in the `release` environment, then publishes through npm trusted publishing (OIDC). One-time setup: configure a trusted publisher on npmjs.com for this repository and workflow, create the `release` environment with a required reviewer, and add a tag ruleset protecting `[0-9]+.[0-9]+.[0-9]+` tags from creation outside releases, moves and deletion.

## Licence

MIT.
