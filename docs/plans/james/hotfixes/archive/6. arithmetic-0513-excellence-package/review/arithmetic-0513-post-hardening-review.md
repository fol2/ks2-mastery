# Arithmetic 2026-05-13 Post-Hardening Review

## Verdict

The post-hardening Arithmetic implementation in `ks2-mastery-lean-05130813.zip` is a real live subject implementation, not a placeholder. It has the expected shared Arithmetic content/marking layer, Worker runtime surface, command handling, read-model flow, client action handling, reward projection tests, and existing Worker tests.

I did not find a new structural integration failure in this pass. The remaining issues were inside Arithmetic itself: marking precision, decimal cleanliness, and content depth.

## What was already strong

The subject is Worker-backed and isolated. Arithmetic owns its question generation and marking logic in `shared/arithmetic/content.js`, and the existing Worker runtime tests exercise session creation, blank response handling, stale write rejection, duplicate submission rejection, read-model redaction, command-error surfacing, and reward projection boundaries.

The answer parser had already been hardened for sensible KS2 forms, including mixed/fraction input, Unicode minus, Unicode fraction glyphs, simplified-fraction discipline, and unit-aware percent/currency behaviour.

The content bank is already broad enough for KS2 practice: number facts, place value, mental arithmetic, written methods, decimals, fractions, percentages, order of operations, missing digits, and hybrid FDP material.

## Finding 1: zero-remainder notation was too permissive

The most important learner-facing bug was that zero-remainder notation was accepted globally for numeric answers. A learner could type `44 r 0` for a plain missing-number answer of `44`, and it would mark correct.

That is not good enough. Zero-remainder notation is reasonable for exact division, but it is noise or misunderstanding everywhere else. Accepting it globally weakens answer discipline and can mask confusion.

Patch response: `parseNumberInput` now only accepts zero-remainder notation when the expected answer explicitly opts in with `allowZeroRemainderText`. Exact short division and long division opt in; other numeric templates do not.

## Finding 2: powers-of-ten questions could expose floating-point artefacts

A custom audit found powers-of-ten generated values such as `293.8 ÷ 10 = 29.380000000000003`. This is a classic JavaScript floating-point issue, but in a primary arithmetic product it is still a product-quality bug.

Patch response: powers-of-ten answer and reverse-operation values now pass through a `tidyDecimal` helper. The audit window after patch found zero binary decimal artefacts.

## Finding 3: some written-method practice was not intentional enough

Column addition and subtraction were technically valid, but not all generated cases reliably exercised the intended exchange/carry behaviour. For top-tier preparation, written-method templates should not accidentally become too easy too often.

Patch response: column addition now requires carry events, and column subtraction now requires exchange events. The early band requires at least one; stronger bands require at least two.

## Finding 4: several templates could carry more structural variety

The bank had breadth, but some templates were still too predictable internally. Long-term use needs broad structural variation so repetition is hard to notice and learners build robust method recognition.

Patch response: the patch expands variation inside the existing templates, without changing the template count or reward-unit contract. The strongest additions are broader times-table fact forms, subtraction inverse equations, harder decimal stretch cases, richer high-band fractions of amounts, and extra-credit percentages such as `6.25%`, `12.5%`, `17.5%`, and `62.5%`.

## Risk review

### Low risk

The patch changes only Arithmetic content/marking and one Arithmetic Worker test file.

### Moderate risk

More intentional written-method generators may create slightly harder practice for some learners. This is acceptable because difficulty bands still exist, and the changes mainly make each band more honest.

### Preserved behaviours

- Fraction simplest-form discipline remains unchanged.
- Explicit percentage-output questions still accept `%` where the expected answer opts in.
- Currency answers remain rejected in the current bank.
- Exact division still accepts harmless zero-remainder notation.
- The release ID remains unchanged.

## Recommendation

Accept the patch after CI/full dependency tests. This is a clean Arithmetic-only improvement pass: it removes a real marking permissiveness bug, cleans decimal artefacts, and expands content quality without disturbing platform integration.
