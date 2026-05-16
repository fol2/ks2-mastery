# Arithmetic next improvement contract

## Objective

Move Arithmetic one step closer to a world-class KS2 Arithmetic subject by fixing learner-facing marking tolerance, tightening True Test UX, and enriching the procedural question bank while keeping the Arithmetic engine isolated from the other subjects.

## Source authority

Primary authority: `ks2-mastery-lean-05121221.zip`.

Supplementary authority: GitHub exact-file access for reference only.

Production authority: not claimed. This package is a patch and validation bundle for the supplied snapshot, not a live deployment certificate.

## In-scope files

```text
shared/arithmetic/content.js
worker/src/subjects/arithmetic/engine.js
src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx
tests/worker-arithmetic-runtime.test.js
```

## Non-goals

No changes to Spelling, Grammar, Punctuation, Reading, Reasoning, platform routing, global rewards, monster thresholds, Hero economy, database schema, or deployment configuration.

No change to the number of Arithmetic templates or reward units.

No claim of official handwritten method-mark automation. Long multiplication and long division still auto-score final answers while preserving the adult/self-review limitation.

## Contract changes

### 1. Unit-aware numeric marking

Ordinary numeric answers must reject stray `%` and `£` symbols. A plain number question whose expected answer is `44` must not accept `44%` or `£44`.

A percentage-output item may explicitly allow a trailing `%`. For example, a question asking “Write 0.5 as a percentage” may accept both `50` and `50%`.

Currency is not accepted anywhere in the current Arithmetic bank because the bank does not currently contain money-answer templates.

### 2. True Test UI and summary correctness

The answer form must remount or otherwise reset from the saved paper entry when moving between True Test questions.

The test summary must report the paper denominator, not only the count of answered questions. A blank 12-question short test should report a 12-question paper and make the answered count clear.

### 3. Content enrichment

The existing template contract stays stable, but selected narrow pools are expanded:

```text
mental_subtraction
mental_multiplication
fraction_add_sub
fraction_multiply_fraction
fdp_equivalent
fraction_decimal_hybrid
```

The enrichment must preserve deterministic generation from template id, seed, and difficulty.

The enrichment must keep generated answers finite and self-markable.

The enrichment must preserve the short paper shape at 12 questions / 14 marks and the full paper shape at 36 questions / 40 marks.

## Acceptance checks

From a fresh extraction of `ks2-mastery-lean-05121221.zip`, the patch must pass:

```bash
patch -p1 --dry-run < arithmetic-next-improvement.patch
patch -p1 < arithmetic-next-improvement.patch
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
node --test tests/worker-arithmetic-runtime.test.js
```

The custom Arithmetic audit must show:

```text
30 templates
90 reward units
45,000 generated question cases checked
0 bad percent-unit acceptances on plain numeric answers
0 pound-unit acceptances
all explicit percentage-output cases accept % correctly
0 content findings
short paper: 12 questions / 14 marks
full paper: 36 questions / 40 marks
```

## Rollback

The patch touches only four Arithmetic files. Rollback is to reverse this patch or restore those files from the uploaded ZIP snapshot.
