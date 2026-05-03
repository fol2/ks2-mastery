---
title: "Grammar QG P2 completion report"
type: report
status: completed
date: 2026-04-28
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p2.md
release_id: grammar-qg-p2-2026-04-28
---

# Grammar QG P2 completion report

## Summary

Grammar QG P2 closes the constructed-response marking migration for the 57-template Grammar release. All 20 constructed-response templates now emit explicit Worker-private `answerSpec` data, the legacy constructed-response adapter count is zero, and open creative responses are captured as manual-review-only rather than being auto-scored.

The shipped release keeps the QG P1 denominator stable:

- 18 concepts.
- 57 templates.
- 37 selected-response templates.
- 20 constructed-response templates.
- 31 generated templates.
- 26 fixed templates.
- Zero thin-pool concepts.
- Zero single-question-type concepts.

## Marking coverage

The current audit reports 26 answer-spec templates:

- `acceptedSet`: 2 templates.
- `exact`: 4 templates.
- `manualReviewOnly`: 4 templates.
- `multiField`: 2 templates.
- `normalisedText`: 5 templates.
- `punctuationPattern`: 9 templates.

Every constructed-response template now declares `requiresAnswerSpec`, `answerSpecKind`, and hidden emitted `answerSpec` data. `manualReviewOnly` responses save the learner response with `correct: false`, `score: 0`, `maxScore: 0`, `nonScored: true`, and `manualReviewOnly: true`.

## Runtime behaviour

Score-bearing constructed responses still use deterministic marking only. No AI path can award marks, mastery, concept-secured evidence, Star evidence, or monster reward progress.

Manual-review-only attempts are deliberately non-scored:

- They do not mutate concept, template, question-type, or item mastery.
- They do not enqueue retry work.
- They do not emit misconception, answer-submitted, concept-secured, Star-evidence, or reward events.
- They emit `grammar.manual-review-saved` so the response can be replayed and audited.
- The child UI renders the saved response as neutral feedback and hides repair or enrichment actions for that result.

Reward and Star evidence now carries the active Grammar content release id, `grammar-qg-p2-2026-04-28`.

## Release evidence

The audit fixture split preserves QG P1 as the previous release and adds a QG P2 baseline for the current release. The production smoke now has visible-data probes for every answer-spec family: `exact`, `multiField`, `normalisedText`, `punctuationPattern`, `acceptedSet`, and `manualReviewOnly`.

Verification run during implementation:

- `node scripts/worktree-setup.mjs`
- `node --check worker/src/subjects/grammar/content.js`
- `node --check worker/src/subjects/grammar/answer-spec.js`
- `node --check worker/src/subjects/grammar/engine.js`
- `node --check worker/src/subjects/grammar/read-models.js`
- `node --check worker/src/subjects/grammar/commands.js`
- `node --check scripts/grammar-production-smoke.mjs`
- `node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-question-generator-audit.test.js tests/grammar-ui-model.test.js tests/grammar-engine.test.js tests/grammar-functionality-completeness.test.js tests/grammar-production-smoke.test.js tests/worker-grammar-subject-runtime.test.js tests/grammar-rewards.test.js tests/grammar-star-persistence.test.js tests/react-grammar-surface.test.js`

Repository-level gates are recorded on the PR once the branch is ready for review.

## Follow-up boundary

P2 intentionally does not expand the catalogue or add runtime AI marking. The next sensible content slice is QG P3, focused on explanation-template depth for the remaining weaker concepts, after the declarative marking foundation has landed.
