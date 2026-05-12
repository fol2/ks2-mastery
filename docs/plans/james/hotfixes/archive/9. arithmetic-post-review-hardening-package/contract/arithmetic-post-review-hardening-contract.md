# Arithmetic post-implementation hardening contract

## Scope

This contract is Arithmetic-only. It may touch the Arithmetic shared content/marking layer, Arithmetic Worker engine, Arithmetic client command plumbing, and Arithmetic-specific tests. It must not change Spelling, Grammar, Punctuation, Reading, Reasoning, global reward semantics, or non-Arithmetic subject engines.

## Findings addressed

1. Blank practice submissions were counted as marked attempts. This polluted session counts, recent attempts, adaptive weakness tracking, and retry queues.
2. Blank True Test answers were scored as blank at the paper-summary level, but still wrote adaptive failures/retries for every unanswered paper item.
3. The Worker could return a blank-answer validation error, but the Arithmetic client command response layer cleared returned errors before the UI could display them.
4. Adjacent Unicode mixed fractions such as `2½` regressed from the PoC answer-form tolerance and were parsed as `21/2` rather than `2 1/2`.
5. A place-value partition generator edge case could produce no missing box and an undefined expected value.
6. Difficulty-2 order-of-operations items often produced repeating decimals, which is poor KS2 arithmetic-paper content.
7. Fraction add/subtract variety was too thin compared with the rest of the Arithmetic procedural bank.

## Required behaviour after patch

Practice mode:

- A response with no answer content must not be marked.
- A response with only draft/working content must not become an adaptive failure.
- The learner must get a visible prompt to enter an answer.
- Session answered/correct counts, recent attempts, events, mastery, retry queue, reward projection, and Hero handoff must remain unchanged for blank submissions.

True Test Mode:

- Blank paper responses remain blank and score zero for the paper.
- Blank paper responses contribute to the paper max score.
- Blank paper responses must not update adaptive mastery, recent attempts, retry queues, skill weakness, or reward units.
- Non-blank paper responses continue to be marked and learned from normally.

Answer parsing:

- Valid mixed-number and Unicode fraction forms that the PoC tolerated must remain accepted, including `2½`, `½`, `1 1/2`, `1 and 1/2`, and spaced fractions.
- Equivalent but non-simplified fraction forms remain handled under the existing simplification discipline.

Question generation:

- Place-value partition items must always include exactly one missing-box answer with a finite expected value.
- Difficulty-2 order-of-operations items must generate whole-number expected values in the audited seed window.
- Fraction add/subtract should have deeper procedural variety without changing SATs-facing marking semantics.

Client command layer:

- Arithmetic server-side validation errors in `subjectReadModel.error` must survive `applyArithmeticCommandResponse` and render through the existing Arithmetic UI error surface.

## Non-goals

- No new Arithmetic modes.
- No changes to global monster semantics.
- No change to the 100-star / Mega projection model.
- No change to Hero Mode economy or task scheduling outside Arithmetic provider compatibility.
- No production deployment claim.

## Acceptance checks

The patch is accepted when these pass on a fresh extraction of `ks2-mastery-lean-05111556.zip`:

```bash
patch -p1 --dry-run < arithmetic-post-review-hardening.patch
patch -p1 < arithmetic-post-review-hardening.patch
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check src/subjects/arithmetic/command-actions.js
node --test tests/worker-arithmetic-runtime.test.js
node --test tests/worker-arithmetic-runtime.test.js tests/worker-admin-content-overview.test.js tests/monster-celebrations.test.js tests/ui-subject-theme-contract.test.js tests/ui-subject-visual-adapter-contract.test.js
```

The custom content audit must also report:

- 30 templates.
- 18,000 generated question instances checked.
- 18,000 correct-answer self-marks.
- 0 findings for malformed text, non-finite expected answers, repeating-decimal order-of-operations difficulty-2 items, or low-variety template threshold.
