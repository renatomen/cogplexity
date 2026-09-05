# AGENTS.md

Standing instructions for anyone — human or agent — working in this repository. `STRATEGY.md` is the product authority; `docs/plans/` holds the implementation plan.

## What this package is

One ESLint rule, `cogplexity/cognitive-complexity`, implemented from G. Ann Campbell's published Cognitive Complexity specification, plus the scoring function it wraps. Nothing else. See `PROVENANCE.md` before touching scoring code.

## Boundaries (from STRATEGY.md)

- No second rule in this package — a new guardrail gets its own repository.
- Not a quality target or dashboard metric — a guardrail against outliers only; never optimised toward, never charted.
- No line-count metric, ever, in any form.
- No reference to, or dependency on, the owner's private repositories — the package must stay developable and testable if they disappear; calibration uses a public corpus.
- Resist a change when it would add a second check, a runtime dependency, or a build step to this package, or chase Sonar's output rather than the published spec without a recorded reason.

## Licence and provenance

Never read, copy, adapt, or consult `eslint-plugin-sonarjs` source of any version, nor any other SonarSource analyzer source. Resolve an ambiguous clause from the white paper, from `gocognit`, or from calibration against SonarCloud's published numbers. The metric is attributed to G. Ann Campbell and SonarSource in the README.

## Engineering conventions

- Zero runtime dependencies; no build step; plain ESM JavaScript with JSDoc types and hand-written `.d.ts` files. `package.json` carries no `build`, `prepare`, `prepack`, `install` or `postinstall` script.
- Tests run on `node:test` (`npm test`). Test-first for the scoring core and the rule: write the fixture with its hand-derived expected score from the paper, watch it fail, then implement. One behaviour per test; a test's name is a claim about a value, not a shape.
- No coverage target. Every specification clause has a named test instead.
- The package lints itself with its own rule at threshold 15 (`npm run lint`).
- Commits use conventional-commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), one logical unit each, staged by path. Do not credit AI tools as authors or co-authors on commits, PRs, or issues.
- Pre-commit hook: `git config core.hooksPath .githooks` runs lint and tests. Do not bypass it with `--no-verify`.
- GitHub Actions are pinned to full commit SHAs with `permissions: contents: read`.
- Exact dependency versions, committed lockfile, `npm ci --ignore-scripts` everywhere.

## Release governance

- Tags are bare semver (`1.0.0`) and must match `package.json`'s version. A repository tag ruleset forbids creating semver tags outside the release process and forbids moving or deleting them.
- `publish.yml` runs in the `release` environment (required reviewer) and re-runs lint, type check, tests and the pack check before `npm publish --provenance`.
- Consumers installing from the git URL should commit a lockfile and use `npm ci`; the lockfile pins the resolved commit while a tag is mutable.

## Calibration

The exact-match cross-check against SonarCloud lives under `calibration/` and is corpus-agnostic. The refresh script needs a SonarCloud personal access token in the `SONAR_TOKEN` environment variable or a git-ignored `.env`; never commit it, never print request headers. The specification is the authority — a divergence from Sonar is decided case by case and recorded in `calibration/ledger.json` with a reason.
