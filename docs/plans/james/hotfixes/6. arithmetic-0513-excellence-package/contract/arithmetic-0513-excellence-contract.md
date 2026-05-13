# Arithmetic 2026-05-13 Excellence Hardening Contract

## Source boundary

Primary implementation snapshot: uploaded `ks2-mastery-lean-05130813.zip`.

Supplementary reference: GitHub exact-file reads were permitted, but the uploaded ZIP remains the source of truth for this patch. The Arithmetic PoC HTML remains a behavioural reference for tolerant but disciplined answer parsing.

This package does not claim live production deployment or live Cloudflare/D1 verification.

## Scope

Arithmetic subject only.

Modified files:

```text
shared/arithmetic/content.js
tests/worker-arithmetic-runtime.test.js
```

No changes are made to:

```text
spelling
grammar
punctuation
reading
reasoning
platform reward projection
Hero Mode
global monster definitions
subject registry
Worker subject runtime wiring
React Arithmetic surface
```

## Product goals

The patch aims to move Arithmetic closer to a world-class KS2 Arithmetic trainer by tightening correctness discipline and improving long-term content variety while preserving the existing Worker-owned subject contract.

The learner-facing goals are:

1. Plain number answers must not accept irrelevant zero-remainder notation.
2. Exact division questions may still accept harmless `r 0`, `rem 0`, and `remainder 0` notation.
3. Powers-of-ten questions must not leak binary floating-point artefacts into expected values or explanations.
4. Formal written-method practice should more reliably require the intended exchange/carry behaviour.
5. Inverse equations, facts, decimals, fractions, and percentages should show broader structure without changing the subject contract.

## Behaviour changes

### 1. Zero-remainder notation is now context-aware

Before this patch, `44 r 0` could be accepted for many non-division numeric questions whose answer was `44`. That is too permissive for KS2 Arithmetic because remainder notation only belongs to division.

After this patch:

- `44 r 0` is rejected for a number bond, place-value, addition, percentage, decimal, or missing-number answer of `44`.
- `44 r 0`, `44 rem 0`, and `44 remainder 0` are accepted only where the question explicitly allows zero-remainder text.
- Current allowed templates are exact short division and exact long division.

### 2. Powers-of-ten decimal values are tidied

The powers-of-ten template now rounds/tidies computed answers and reverse-operation misconception values so learners and reviewers do not see values such as `29.380000000000003`.

### 3. Written-method generators are more intentional

Column addition now forces at least one carry at the early band and at least two carries in stronger bands. Column subtraction now forces exchanges in the same way.

### 4. Variety is expanded without changing the number of templates

The template count remains 30 and the reward-unit shape remains unchanged. Variety improves inside existing templates:

- Times-table fact prompts now cover missing factor and missing divisor/quotient structures.
- Missing-number inverse prompts now cover addition and subtraction inverses.
- Decimal multiplication and decimal division stretch bands include stronger decimal-place cases.
- Fractions of amounts broaden high-band denominators.
- Percentages of amounts add richer extra-credit percentages such as `6.25%`, `12.5%`, `17.5%`, and `62.5%` while keeping exact generated answers.

## Non-goals

This patch does not change:

- SATs paper length or marks.
- Arithmetic monster/reward semantics.
- Hero Mode task envelopes.
- Release ID.
- Browser/UI components.
- Parent/teacher analytics beyond the indirect effect of better attempts.

The release ID is intentionally left unchanged to avoid disrupting existing learner progress and monster evidence.

## Acceptance criteria

A reviewer should accept this patch if all of the following pass from a fresh extraction of the ZIP:

```bash
patch -p1 --dry-run < arithmetic-0513-excellence.patch
patch -p1 < arithmetic-0513-excellence.patch
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
node --check tests/worker-arithmetic-runtime.test.js
node --test tests/worker-arithmetic-runtime.test.js
node validation/scripts/arithmetic-0513-custom-audit.mjs --per-template=1500
```

Expected custom audit highlights after the patch:

```text
30 templates
135,000 generated cases checked
0 correct-answer self-mark failures
0 bad percent-unit acceptances
0 pound-unit acceptances
0 non-division r0 acceptances
9,000 division zero-remainder acceptances
0 powers-of-ten binary decimal artefacts
0 findings
```
