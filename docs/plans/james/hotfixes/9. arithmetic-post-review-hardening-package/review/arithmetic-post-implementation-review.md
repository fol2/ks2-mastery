# Arithmetic post-implementation review

## Verdict

Arithmetic is materially implemented and integrated, not just registered. The ZIP contains a real shared Arithmetic content/marking layer, Worker command runtime, read model, client practice surface, reward projection, monster codex integration, Hero provider/launch adapter, and Arithmetic-focused tests.

The integration direction is sound. The main risks found in this review were not subject-boundary problems; they were learner-facing correctness and content-quality issues inside Arithmetic itself. The patch in this package fixes the highest-impact issues without changing the wider platform contract.

## What looked strong

The subject engine is isolated. Arithmetic owns its own templates, parsing, marking, scheduling, data shape, Worker handlers, read model, and tests. That preserves the intended subject-engine boundary.

The Worker architecture is respected. Practice creation, marking, learning updates, retry scheduling, read-model redaction, and reward-unit evidence happen server-side rather than in browser-only code.

Monster integration is correctly evidence-shaped. Arithmetic reward units are subject-scoped, project into the shared codex, and do not directly mutate other subjects.

Hero integration is modest and appropriate. Arithmetic exposes provider envelopes and launch adapters; Hero can route into Arithmetic, but it does not mark Arithmetic answers or own Arithmetic mastery.

The content bank is already broad: 30 procedural templates across number facts, place value, written operations, decimals, fractions, percentages, and mixed arithmetic. The review patch improves several edge cases rather than replacing the engine.

## Issues found and fixed

### Blank practice submissions counted as wrong attempts

Before the patch, a blank Arithmetic practice answer changed state, incremented the session answered count, logged a recent attempt, emitted an answer event, and pushed adaptive weakness/retry data. This is bad because empty clicks or accidental submits become false learning evidence.

After the patch, blank practice submissions set an Arithmetic validation error and do not mark, count, emit answer events, update mastery, or enqueue retries.

### Blank True Test answers poisoned adaptive data

Before the patch, a blank 12-question short test produced a paper summary with 0 answered questions, but still wrote 12 recent attempts, 12 retries, and skill wrong counts. That is especially harmful because a learner can abandon a paper and become incorrectly classified as weak across many skills.

After the patch, blank paper responses remain blank and score zero for the paper, but only non-blank responses update adaptive learning state.

### Client command response cleared Arithmetic validation errors

The Worker-side blank-answer fix was not enough by itself. The Arithmetic client command response layer was overwriting returned read-model errors with an empty string. The patch changes `applyArithmeticCommandResponse` so returned Arithmetic validation errors remain visible in the UI.

### Unicode mixed fractions regressed from the PoC

The PoC tolerated forms such as `2½`; the Worker parser interpreted that as `21/2`. The patch expands vulgar fractions before parsing and keeps adjacent whole-number glyphs as mixed numbers.

### Place-value partition edge case

A seed could generate `500,000 = 500,000 + 0 + 0 + 0 + 0 + 0` with no missing box and no finite expected value. The generator now retries until there are enough non-zero place-value components and chooses a finite missing part.

### Repeating decimals in difficulty-2 order of operations

Many difficulty-2 order-of-operations items produced repeating decimals. This is not a good fit for KS2 arithmetic fluency or SATs-style written arithmetic. The patch constrains the generator so audited difficulty-2 examples have whole-number answers.

### Fraction add/subtract variety

The procedural structure was correct, but the fraction add/subtract pool was thin. The patch expands the template pools across difficulty bands and the content audit now reports no low-variety finding.

## Open recommendations not patched here

The Arithmetic UI is functional but still visibly lean. The setup panel remains visible during an active session, and the practice surface is much simpler than the richer single-file PoC. That is not a correctness blocker, but the next product pass should polish the active-session flow, keyboard affordances, and progress card presentation.

The full React/Vite build was not run in this lean ZIP environment because `node_modules` is intentionally missing. The Node-level Arithmetic tests and static checks passed, but release CI should still run the full build/test pipeline after applying the patch.

No production deployment or live Cloudflare/D1 smoke was certified in this review.
