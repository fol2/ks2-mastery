# Reading Post-Implementation Hardening Contract

## Scope

Reading subject only.

In scope:

- Reading content generator correctness.
- Reading deterministic marking edge cases.
- Reading question/content quality checks.
- Reading tests that lock the fixed behaviours.

Out of scope:

- Other subjects.
- Hero Mode.
- rewards/monsters beyond Reading tests already in scope.
- platform/auth/capacity changes.
- production deployment itself.

## Baseline under review

Uploaded lean ZIP: `ks2-mastery-lean-05111651.zip`.

Baseline Reading content summary:

- content version: 5
- passages: 210
- questions: 2072
- strict papers: 75
- genre split: 71 fiction, 71 non-fiction, 68 poetry
- long passages: 166

Baseline official Reading audit passed with 0 failures and 0 advisories. A deeper Reading-only post-implementation audit found gaps that the existing gate did not yet cover:

- 107 learner-facing unresolved template copy occurrences from Phase 5 fiction generation (`undefined` in passages, inference stems and prediction explanations).
- 1 short-answer model answer that was not accepted by its own keyword check because the answer used a hyphenated compound (`star-patterned mat`).
- 1 evidenceShort model answer + first evidence quote that did not reach full marks (`svg_q3`).
- 5 open-response model answers that did not satisfy every rubric point in the deterministic marker.

## Required patch behaviours

1. Phase 5 fiction generation must not leak unresolved placeholders into learner-facing passage blocks, stems, model answers, explanations or hints.
2. Phase 5 fiction q1 retrieval stems must use natural learner-facing copy rather than the clipped scaffold `Before <challenge>, which pocket object...`.
3. Reading keyword matching must accept sensible hyphenated compound components, e.g. `star-patterned mat` must satisfy `['star', 'patterned', 'mat']`.
4. The hyphenated-compound matcher must not weaken existing local negation guards.
5. Known model answer / rubric / answerCheck drift in Reading content must be corrected without changing content counts or answer-key exposure boundaries.
6. Browser-facing Reading metadata must remain answer-safe.
7. Content counts must remain version 5 with 210 passages, 2072 questions, and 75 strict papers.

## Files changed by patch

- `scripts/audit-reading-content-quality.mjs`
- `shared/reading/content.js`
- `shared/reading/phase5-expansion.js`
- `worker/src/subjects/reading/engine.js`
- `tests/worker-reading-runtime.test.js`
- `tests/reading-content-contract.test.js`
- `tests/reading-phase5-next1000-contract.test.js`

## Acceptance commands

From a clean extraction of `ks2-mastery-lean-05111651.zip` after applying the patch:

```bash
git apply --check patches/001-reading-post-implementation-hardening.patch
git apply patches/001-reading-post-implementation-hardening.patch
node --check shared/reading/phase5-expansion.js
node --check scripts/audit-reading-content-quality.mjs
npm run audit:reading-content
# Optional validation-only deep audit after copying this package's script into repo scripts/:
# node scripts/reading-deep-audit.mjs
node --test tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js tests/reading-phase5-next1000-contract.test.js
```

Expected results:

- patch check/apply passes
- node check passes
- official Reading audit: 0 failures, 0 advisories
- deep Reading audit: 0 failures, 0 warnings
- focused Reading tests: all pass

## Known local environment limit

`tests/reading-session-interface.test.js` requires `esbuild`, which is not installed in the lean ZIP environment used here. This is recorded as an environment-limit validation artefact, not as a Reading surface failure. Run it in dependency-complete CI before deployment.
