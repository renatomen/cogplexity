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

Documented with the calibration harness (later unit).

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
