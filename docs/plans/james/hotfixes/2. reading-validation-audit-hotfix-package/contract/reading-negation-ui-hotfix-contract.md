# Reading negation marking and session UI hotfix contract

## Evidence boundary

Primary source snapshot: uploaded `/mnt/data/ks2-mastery-lean-05080102.zip`.

Source ZIP SHA-256:

`b8f30cefff6178f7db18bfc47e53387b4ebd680d3ae35eee5aeba0ee4b91fe50`

This package proves a local ZIP-snapshot audit and a fresh local patch apply. It does not prove live production deployment. GitHub was used only as repository context in this rebuild; the patch and validation logs are ZIP-local evidence.

## Patch scope

The patch changes Reading-only marking, Reading session UI copy, and Reading tests:

- `worker/src/subjects/reading/engine.js`
- `src/subjects/reading/components/ReadingPracticeSurface.jsx`
- `tests/worker-reading-runtime.test.js`
- `tests/reading-session-interface.test.js`

It does not change Spelling, Grammar, Punctuation, Hero Mode, Stars, monsters, reward projection, migrations, production smoke scripts, or Reading content data.

## Defect fixed: negated correct phrases could receive credit

Before the patch, Reading phrase and keyword checks could award credit when a learner locally contradicted the expected phrase. Examples:

- `not speech marks` could match `speech marks`.
- `not folded slips of paper` could match a `fold/slip/paper` keyword group.
- A correct answer with negated evidence such as `not the house around her seemed to change` could receive the evidence mark through exact phrase or overlap fallback paths.

The patch makes Reading phrase, keyword, and evidence-overlap matching contradiction-aware. It blocks local contradiction cues before the matched answer/evidence span, including `not`, `never`, `no`, common negative contractions after normalisation, `opposite`, `false`, `wrong`, and `incorrect`. It keeps exact full-answer matches working and avoids treating `not only ...` as a contradiction cue.

## Interface improvement

The one-question delayed-feedback control no longer uses the generic label `Finish now`.

Mode-specific labels are now:

- `Mark now` for one-question delayed-feedback marking.
- `Mark this section` for list/section marking.
- `Mark whole paper` for strict SATs-style marking.

The UI also adds a small inline hint explaining what will be marked, while staying inside the existing Reading question-session frame.

## Acceptance gates

From a fresh ZIP extraction or repo root after applying the patch:

```bash
git apply --check patches/001-reading-negation-marking-and-session-ui.patch
git apply patches/001-reading-negation-marking-and-session-ui.patch

node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js

node validation/tools/reading-negation-audit.mjs
```

Expected results:

- Patch dry-run passes.
- Patch apply passes.
- Core Reading tests pass: `32/32` after patch.
- Adversarial negation audit reports `0` negated matcher acceptances and `0` negated evaluation risks after patch.
- Reading content quality remains stable: 21 passages, 182 questions, 12 papers, 12 skills/domains, 0 duplicate normalised stem groups, and 0 duplicate model answer groups.

## Local validation result

Baseline core Reading tests from the uploaded ZIP: `30/30` pass.

Patched core Reading tests: `32/32` pass.

Fresh ZIP apply core Reading tests: `32/32` pass.

Expanded adversarial negation audit:

- Baseline uploaded ZIP: `5100` negated matcher acceptances, `1008` negated evaluation risks.
- Patched working tree: `0` negated matcher acceptances, `0` negated evaluation risks.
- Fresh ZIP apply: `0` negated matcher acceptances, `0` negated evaluation risks.

The expanded audit intentionally probes four contradiction forms (`not`, `never`, `no`, `opposite of`) across phrase, keyword, evidence, and rubric checks, so its raw counts are broader than a single direct-smoke probe.

## Known limits

This environment has Node `v22.16.0`, matching `.nvmrc` major version `22`.

The lean ZIP does not include `node_modules`, and `tests/reading-session-interface.test.js` imports `esbuild`. Therefore the React-backed session-interface test cannot be faithfully executed here. The failure is captured in `validation/logs/patched-reading-session-interface-node22-no-node-modules.log` and is an environment/dependency limitation, not a product failure.

Production readiness still requires a fresh deploy/smoke artefact with origin, timestamp, release or commit ID, and pass result.
