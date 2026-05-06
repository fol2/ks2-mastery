# Reading P3 validation audit report

## Source boundary

Primary implementation source requested by the user: GitHub `main`.
Local validation and patch-base source: uploaded lean ZIP `ks2-mastery-lean-05061443.zip` extracted under `/mnt/data`.

The uploaded ZIP proves the supplied bundle. Local test runs prove behaviour only for that extracted snapshot. GitHub metadata proves the fetched repository ref only when fetched separately. Production readiness remains separate and needs live smoke/release evidence.

## What was audited

I audited the Reading implementation after P2 content and monster-threshold work. I checked:

- Reading content contract and 50-mark paper totals.
- Reading Worker engine save/submit/mark/move behaviour.
- Answer leakage protection in delayed-feedback and strict paper mode.
- Subject registry readiness.
- Reading Hero/provider and monster reward regression surface.
- The delegated Reading question-session interface.

## Bugs/glitches found

1. `Full question list` was exposed in setup but not actually rendered in the React Reading surface. The learner still got the one-question panel.
2. Question/session navigation could move before saving the visible form response to the Worker.
3. Section-level marking did not merge the visible list-mode form payload before deterministic marking.
4. Stale `state.error` from invalid strict section marking could remain visible after a later valid save/move/mark.
5. Reading read models did not provide a safe current-section question list, making a real list-mode surface harder to render without browser-side data reconstruction.
6. `nodeStatus()` still used raw `Date.now()` instead of the Worker-injected clock, weakening deterministic local replay around due/secured status.

## Patch summary

The patch adds:

- A safe current-section question list to the Reading Worker read model.
- Section response serialisation for prefixed list-mode form fields.
- `save-response` support for whole-section drafts and form-aware navigation.
- `mark-section`/`mark-session` support for merging visible form responses before marking.
- Stale session and stale section guards.
- Error clearing after valid save/submit/move/mark paths.
- A real delegated `QuestionListPanel` for `viewMode === 'list'`.
- A one-question status rail and safer Previous/Next/Finish behaviour.
- Scoped Reading CSS for the richer question interface.
- New tests for Reading session interface and Worker draft/list behaviours.

## Validation run

Focused Reading check:

```bash
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

Result: 24 tests passed, 0 failed.

Broader non-React subject/reward regression check:

```bash
node --test \
  tests/monster-system.test.js \
  tests/grammar-monster-roster.test.js \
  tests/punctuation-monster-migration.test.js \
  tests/hero-pool-registry.test.js \
  tests/hero-providers.test.js \
  tests/hero-launch-adapters.test.js \
  tests/worker-hero-read-model.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-content-contract.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

Result: 170 tests passed, 0 failed.

## Build limit

`npm run build` was attempted in the lean ZIP environment. It failed because dependencies are not installed:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from scripts/build-client.mjs
```

That is an environment/dependency limitation of this ZIP workout folder, not a demonstrated Reading product failure. Final build certification should run in the dependency-installed repository or CI.
