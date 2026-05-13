# Arithmetic post-hardening review for ks2-mastery-lean-05131531.zip

## Verdict

Arithmetic is structurally healthy. The subject is implemented as a Worker-backed subject with shared procedural content, deterministic marking, read-model redaction, practice/test state, reward-unit evidence, and Arithmetic-specific tests. I did not find a new integration failure.

The new issues found were subject-quality issues, not architecture failures. They matter because the goal is a top-tier KS2 preparation product: answer-form discipline and formal-method presentation must be exact, not merely “close enough”.

## Findings

### 1. Malformed comma grouping was accepted as correct

The parser stripped all commas before validating the number. That meant a correct answer of `8780` could be entered as `87,80` and still mark correct. In the 135,000-case audit window, this produced 25,540 malformed-comma acceptances.

This is not a calculation bug, but it is a marking-quality bug. A serious arithmetic product should accept `1,234`, but not any arbitrary comma placement.

### 2. Double-negative denominator forms were accepted as positive fractions

The fraction parser accepted signed denominators. That meant `-1/-2` was accepted as a correct answer for `1/2`. In the audit window, this produced 22,633 negative-denominator acceptances.

This is mathematically equivalent in advanced algebra, but it is not an appropriate KS2 arithmetic answer form. The app already enforces simplest-form discipline, so denominator-sign discipline should match that quality bar.

### 3. Formal written-method visuals included thousands commas

Column addition/subtraction, short multiplication/division, long multiplication, and long division sometimes displayed algorithm rows with commas, such as:

```text
  5,747
+ 9,829
───────
```

The final-answer text can use commas, but the formal working layout should not put punctuation marks into the digit columns. The audit found 16,435 formal visual cases with comma-in-algorithm rows.

### 4. Order-of-operations variety was still narrow

The existing generator was safe, but each difficulty band used one dominant expression shape. This pass adds more exact whole-number structures, including division-before-subtraction/addition and bracketed stretch expressions, while preserving KS2-safe whole-number answers.

## Changes made

- Added comma-grouping validation before comma removal.
- Kept valid UK thousands separators accepted.
- Preserved zero-remainder division tolerance where explicitly allowed.
- Rejected signed denominators in simple fraction input.
- Kept useful numerator sign tolerance, including ordinary positive values.
- Removed thousands commas from formal written-method visuals only.
- Added additional order-of-operations expression structures.
- Added tests for comma discipline, fraction sign discipline, formal visual cleanliness, and order-of-operations whole/non-negative guarantees.

## Product impact

This is a genuine polish pass. It does not add noisy feature surface. It makes marking stricter where KS2 answer form matters, keeps helpful tolerance where it is genuinely helpful, makes written-method visuals clearer, and slightly improves challenge variety without changing the reward contract.

## Remaining watch items

- Full React surface and browser tests should run in CI with installed dependencies.
- A future Arithmetic pass could add a dedicated money/measure strand only if it remains SATs Paper 1 appropriate and does not dilute the arithmetic engine.
- A future pass could add a controlled adult-facing “method mark review” note for 2-mark questions, but the app should not pretend to auto-award handwritten method marks.
