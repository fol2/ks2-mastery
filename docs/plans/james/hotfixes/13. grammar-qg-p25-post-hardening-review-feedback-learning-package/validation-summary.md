# Grammar QG P25 Validation Summary

## Source ZIP

`ks2-mastery-lean-05131153.zip`

SHA-256:

`eb54de8e73a7fc2c68b297bcf06af3168bd432e00a3583e04c26b8d5888b032a`

ZIP integrity: passed.

## Patch

`patches/001-grammar-qg-p25-feedback-learning-cue-and-concept-stretch.patch`

Current SHA-256:

See `SHA256SUMS.txt`.

Current package application checks:

- `git apply --check`: passed against the current repository base.
- Clean `origin/main` temporary worktree `git apply --check`, `git apply`, and syntax checks on touched JavaScript files: passed.
- `node --check src/subjects/grammar/session-ui.js`: passed
- `node --check tests/grammar-qg-p25-feedback-learning-cue.test.js`: passed
- `node --check tests/grammar-qg-p24-distractor-quality.test.js`: passed

## Baseline review finding

A deterministic wrong-answer sample across the live Grammar template set and seeds `1..3` found `1161` cases where the Worker returned both a distinct `feedbackLong` and misconception-specific `minimalHint`. The existing React feedback panel would show `feedbackLong` and hide that hint.

Patched helper coverage:

- affected samples: `1161`
- visible learning cues after patch: `1161`
- missing: `0`

## Fresh-applied targeted validation

`node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js`

Result:

- `146` tests
- `146` pass
- `0` fail
- `0` skipped

## Patched Grammar gates

`npm run verify:grammar-qg-p21`: passed, `10/10`.

Content quality seeds `1..3`:

- `1638` checks
- `0` hard failures
- `0` advisories

P21 local repetition at `60` steps:

- status: `pass`
- violations: `0`
- warnings: `0`
- min unique templates: `18`
- min unique prompts: `52`
- min unique variants: `57`

Grammar QG P21 smart-practice seeds `1..3`:

- `33` sessions
- `0` failures
- `0` advisories

Open-response fairness seeds `1..3`:

- findings: `0`

Full repository gates in the development checkout:

- `npm test`: passed with `111516` pass, `0` fail, `12` skipped.
- `npm run check`: passed via `scripts/wrangler-oauth.mjs deploy --dry-run`.

## Runtime notes

- Node: `v22.16.0`
- npm: `10.9.2`
- `.nvmrc`: `22`
- Current validation ran in a full development checkout with React/jsdom dependencies installed; the render-harness tests executed instead of skipping.
- Production deployment and live browser smoke are recorded separately in the completion report for this task.
