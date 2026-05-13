# Grammar QG P25 — Feedback Learning Cue and Concept-Specific Stretch Contract

Status: apply-ready patch package
Base: `ks2-mastery-lean-05131153.zip`
Primary evidence layer: uploaded ZIP and local ZIP runs
GitHub layer: supplementary orientation only
Production layer: not certified by this package

## Purpose

P21 expanded the Grammar pool, P22 hardened scheduler performance and explanation quality, P23 improved table-choice fidelity and practice rhythm, and P24 removed generic distractors while adding a first non-scored stretch cue. The post-P24 snapshot is healthy under the standard Grammar audits.

P25 fixes the next learner-experience gap: after an incorrect answer, the Worker already supplies a misconception-specific `minimalHint`, but the React feedback panel renders `feedbackLong || minimalHint`. Whenever `feedbackLong` contains an answer or summary, the learning hint disappears. That makes the miss feedback less useful than the engine result actually allows.

P25 also makes the correct-answer stretch cue concept-specific, so stronger learners get a precise extra challenge tied to the Grammar skill rather than a generic question-type prompt.

## Requirements

### R1. Keep misconception hints visible after misses

For incorrect, auto-marked feedback:

- if `result.minimalHint` is a non-empty string;
- and it is not the same text as `result.feedbackLong` after normalisation;
- render it as a separate child-facing learning cue.

The cue text must be short and use this prefix:

`Remember: <minimalHint>`

### R2. Do not show learning cues for correct or non-scored feedback

The new learning cue must not appear when:

- the answer is correct;
- the answer is manual-review only;
- the result is non-scored;
- the hint is absent;
- the hint duplicates `feedbackLong`.

### R3. Preserve existing feedback hierarchy

The existing feedback panel must continue to show:

- `feedbackShort` as the headline;
- `feedbackLong` or fallback hint as the main body;
- next-step copy;
- correct answer text when projected;
- optional stretch copy after correct answers.

P25 must add one extra cue without creating a new primary action or changing the action frame.

### R4. Make correct-answer stretch concept-specific

When a correct result has a current Grammar concept id, `grammarFeedbackStretchCopy` should prefer a concept-specific extra challenge for all 18 Grammar concepts.

Fallback to the existing question-type prompts when the current item lacks a recognised concept id.

### R5. No scoring, reward, or mastery changes

The learning cue and stretch cue are display-only. They must not change:

- answer marking;
- retry/similar-problem/worked-solution commands;
- scheduler weights;
- mastery, Stars, rewards, Hero Mode, monsters, event projection, or D1 schema;
- any subject other than Grammar.

## Acceptance checks

Minimum checks:

```bash
git apply --check patches/001-grammar-qg-p25-feedback-learning-cue-and-concept-stretch.patch
git apply patches/001-grammar-qg-p25-feedback-learning-cue-and-concept-stretch.patch
node --check src/subjects/grammar/session-ui.js
node --check tests/grammar-qg-p25-feedback-learning-cue.test.js
node --check tests/grammar-qg-p24-distractor-quality.test.js
node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js
npm run verify:grammar-qg-p21
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1,2,3 --json
# Historical script filename; generated evidence is P25-labelled.
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..3 --json-out=reports/grammar/grammar-qg-p25-smart-practice-smoke.json --md-out=reports/grammar/grammar-qg-p25-smart-practice-smoke.md
```

Expected results:

- Patch applies cleanly to the supplied ZIP snapshot.
- Pure session-ui tests pass.
- Render-harness tests run where React/jsdom dependencies are available and skip cleanly in lean ZIP environments without those dependencies.
- `grammarFeedbackLearningCueCopy` returns a cue for incorrect auto-marked feedback with a distinct `minimalHint` and returns empty for correct/manual-review-only/non-scored/duplicate cases.
- Concept-specific stretch copy overrides generic question-type copy when a recognised concept id is present.
- The P24 render regression is updated so the active/passive fixture expects the concept-specific stretch cue.
- Template denominator remains `546`.
- P21 local repetition remains pass with `0` violations and `0` warnings.
- Content-quality, smart-practice, and open-response fairness gates remain green.

## Non-goals

P25 does not add a new content release, expand the question pool, change any answer spec, change any Worker command, change rewards/mastery, or certify live production.
