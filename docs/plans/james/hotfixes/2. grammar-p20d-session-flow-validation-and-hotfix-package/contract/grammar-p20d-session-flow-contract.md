# Grammar P20d session-flow contract

## Source boundary

Primary authority is the uploaded lean ZIP snapshot:

`/mnt/data/ks2-mastery-lean-05070029.zip`

This package was rebuilt from that ZIP after the earlier Code Interpreter artifact expired. It is ZIP-local validation and patch evidence, not live production certification.

## Bugs/glitches fixed

### 1. Feedback action hierarchy

In a normal Grammar practice feedback state, the learner should see one active primary action for the next step. The baseline rendered a disabled primary `Saved` button and a secondary `Next question` / `Finish round` action.

Contract after patch:

- Pre-answer practice renders one primary `Submit` action.
- Post-answer feedback renders one active primary `Next question` or `Finish round` action.
- The disabled `Saved` submit button is not rendered in feedback.
- Feedback form submission is ignored, so stale form submits cannot resubmit an already-marked answer.
- The existing webapp frame, form, stage, HUD, repair actions, read-aloud, AI/enrichment panels, and end-round action remain in place.

### 2. Similar-problem readiness and repetition

The baseline Worker command `start-similar-problem` accepted calls during the pre-answer `session` phase. That could advance `currentIndex` while `answered` stayed at `0`, effectively skipping the visible question. It also forced the same template ID, making the repair path feel like a replay.

Contract after patch:

- `start-similar-problem` is feedback-only and requires a marked answer.
- Calling it before marking throws `grammar_repair_not_ready` and does not mutate session state.
- Blocked-template behaviour remains fail-closed: if the base template is blocked after the answer, the command returns no-change.
- Once available, similar problem uses the Grammar selector without a forced `templateId` and with the base skill as focus. The result should be a fresh same-skill template where the pool allows it.
- Similar problem still increments `repair.similarProblems`, resets current attempts/support, preserves goal/target semantics, and returns to the normal `session` phase.

## Scope

Patch scope is Grammar-only:

- `worker/src/subjects/grammar/engine.js`
- `src/subjects/grammar/components/GrammarSessionScene.jsx`
- `tests/grammar-engine-validation.test.js`
- `tests/grammar-qg-p10-scheduler-safety.test.js`
- `tests/react-grammar-surface.test.js`
- `tests/react-accessibility-contract.test.js`

Out of scope and intentionally untouched:

- Grammar content generation and answer-spec semantics
- Punctuation, Spelling, Reading, Arithmetic, Reasoning
- Stars, mastery, monster progression, rewards, Hero Mode, and game economy
- live production deployment or Cloudflare/D1 evidence
