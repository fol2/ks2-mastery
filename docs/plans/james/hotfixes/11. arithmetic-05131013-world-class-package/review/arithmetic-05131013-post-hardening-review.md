# Arithmetic Post-Hardening Review — 05131013 Snapshot

## Review stance

I reviewed the uploaded `ks2-mastery-lean-05131013.zip` as the primary source of truth and used GitHub `main` only as supplementary exact-file comparison. The review stayed inside Arithmetic: shared content, marking, Worker runtime tests, generated question quality, SATs-style fit, and subject-level learner experience.

## Verdict

Arithmetic is now a real implemented subject, not a placeholder. The current state is broadly strong: Worker-backed, procedurally generated, reward-unit aware, monster-compatible, Hero-launch compatible, and already significantly hardened from the earlier passes.

I did not find a new subject-integration failure. The remaining issues are quality-edge issues inside Arithmetic itself: answer-form strictness, generated fraction cleanliness, decimal visual polish, and KS2/SATs fit in a few generated branches.

## Findings fixed by this package

### 1. Malformed mixed-number answers were accepted

The biggest marking issue was that malformed mixed-number notation could pass if the numeric value matched. Examples included forms such as `0 3/2` and `1 3/2`. These are not acceptable final forms for serious KS2 arithmetic practice.

The patch keeps tolerant parsing, but stops treating malformed mixed notation as fully correct.

### 2. Missing-digit answers were too permissive

Missing-digit formal-calculation items were using generic numeric marking. That means a single missing digit could be answered with `05`, `5.0`, or `+5` and still pass.

The patch now requires a single digit exactly. This matters because the cognitive task is “identify the missing digit”, not “enter a numeric equivalent”.

### 3. Too many displayed fractions were unsimplified

The audit found unsimplified source fractions in several fraction templates. Children should of course be able to simplify fractions, but routine generated Arithmetic prompts should not over-present reducible source fractions in core practice unless that is the point of the question.

The patch now uses proper simplified source fractions in the audited core fraction templates.

### 4. Generated zero-subtraction fraction drills were weak

Fraction subtraction and mixed-number subtraction could generate same-value subtraction, producing trivial zero answers. These are low-value variants and can make the bank feel repetitive.

The patch avoids same-value subtraction in those fraction templates.

### 5. Difficulty-1 order-of-operations could produce negative answers

Negative final answers are not always wrong mathematically, but they are not ideal inside a True-Test-style KS2 arithmetic blueprint. The patch keeps difficulty-1 order-of-operations non-negative while preserving meaningful operation-order structure.

### 6. Decimal missing-digit visuals sometimes hid decimal-place structure

Some formal decimal missing-digit visuals stripped trailing zeros or failed to preserve clear decimal-place layout in all rows. The patch displays fixed decimal places and aligns rows by decimal point.

## Enrichment added

The enrichment is deliberately inside existing Arithmetic templates rather than new platform wiring:

- cleaner fraction source forms;
- related-denominator mixed-number stretch at difficulty 2;
- 3-decimal-place formal missing-digit stretch at difficulty 2;
- stronger answer-form discipline for fraction and digit tasks.

This makes Arithmetic harder to master without making it noisier or less SATs-aligned.

## What I did not change

I did not change:

- Arithmetic subject registration;
- Worker runtime routing;
- Hero provider or launch adapter;
- monster progression;
- reward projection;
- admin overview;
- other subjects;
- production deployment settings.

That is intentional. The current pass is subject-internal hardening.

## Current closure of earlier recommendation

The earlier recommendation for a generated-paper realism audit is closed in the current worktree evidence. `validation/current-2026-05-13/scripts/arithmetic-paper-realism-audit.mjs` checks the short and full Arithmetic blueprints for test-friendly template usage, question counts, mark totals, difficulty progression, strand balance, written-method coverage, and fractions/percentages coverage. The saved JSON evidence reports no issues.
