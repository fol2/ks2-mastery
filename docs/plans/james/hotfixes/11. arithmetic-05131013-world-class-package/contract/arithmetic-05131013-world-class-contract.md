# Arithmetic 05131013 World-Class Hardening Contract

## Scope

This patch is Arithmetic-only. It modifies:

- `shared/arithmetic/content.js`
- `tests/worker-arithmetic-runtime.test.js`
- `tests/react-arithmetic-surface.test.js`

It does not modify other subjects, platform routing, Hero Mode, monsters, rewards, learner identity, global shell, Worker auth, D1 schema, or production deployment configuration.

## Source boundary

Primary implementation snapshot: uploaded ZIP `ks2-mastery-lean-05131013.zip`.

GitHub `main` was used only as supplementary exact-file comparison evidence for Arithmetic source shape. The uploaded ZIP remains the source of truth for this patch.

Source ZIP SHA-256:

`3590a34029601d5d15646eb029f909028cccd3e878924b90752d40b109b471a5`

Patch SHA-256:

`a4d5df85b4b2349921bd4b100e7997b03e04071c270e2e45481b02b061932c88`

## Product intent

The goal is not just “more Arithmetic questions”. The goal is a stricter, cleaner, more exam-useful and more trustworthy Arithmetic subject:

- exact marking where the answer form matters;
- KS2-clean question surfaces for core practice;
- stretch material that is genuinely useful but does not pollute SATs-style test mode;
- fewer low-quality generated variants;
- stronger regression protection around answer parsing and generated content.

## Changes

### 1. Reject malformed mixed-number answers

Before this patch, malformed mixed-number forms such as `0 3/2` or `1 3/2` could be accepted when their numeric value matched the expected answer. That is mathematically sloppy and undermines the subject’s simplest-form discipline.

The patch now treats a mixed-number answer as fully correct only when:

- the whole-number part is non-zero;
- the fractional numerator is positive;
- the fractional numerator is smaller than the denominator;
- the fraction is in simplest form;
- the numeric value matches the expected answer.

Equivalent but malformed forms are no longer silently accepted as correct.

### 2. Tighten missing-digit marking

Missing-digit items now require exactly one digit, not any numeric expression with the same value. Inputs such as `05`, `5.0`, and `+5` no longer pass when the missing digit is `5`.

### 3. Improve generated fraction question quality

Core fraction generators now avoid unsimplified displayed source fractions such as `2/4 of 56`, `4/8 + 1/2`, or mixed-number fractional parts that are reducible. This improves KS2 discipline and avoids training children to treat non-simplified forms as the default presentation.

### 4. Remove zero-result subtraction drills from fraction templates

Fraction, mixed-number, and fraction-decimal hybrid subtraction now avoids same-value subtraction such as `4/5 − 4/5`, `3 1/2 − 3 1/2`, or `1/4 − 0.25`. Zero can still appear naturally in Arithmetic, but these generated items are weak fluency practice and too easy to over-repeat.

### 5. Keep True-Test-style order-of-operations answers cleaner

Difficulty-1 order-of-operations items now avoid negative final answers. This keeps the SATs-style blueprint cleaner while still preserving higher-stretch structure in the broader bank.

### 6. Fix decimal missing-digit visual alignment

Formal decimal missing-digit questions now preserve fixed decimal places in all rows and align the display by decimal point. Difficulty 2 now supports 3-decimal-place stretch items as extra-credit style content.

## Acceptance criteria

The patch is accepted only if these pass from a fresh extraction of `ks2-mastery-lean-05131013.zip`:

```bash
patch -p1 --dry-run < arithmetic-05131013-world-class.patch
patch -p1 < arithmetic-05131013-world-class.patch
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
node --check tests/worker-arithmetic-runtime.test.js
node --test tests/worker-arithmetic-runtime.test.js
node --test tests/react-arithmetic-surface.test.js
node docs/plans/james/hotfixes/11.\ arithmetic-05131013-world-class-package/validation/current-2026-05-13/scripts/arithmetic-paper-realism-audit.mjs
```

The custom Arithmetic audit should report:

- 30 templates;
- 90 reward units;
- 135,000 generated cases checked;
- 0 correct-answer self-mark failures;
- 0 bad percent-unit acceptances;
- 0 pound-unit acceptances;
- 0 non-division zero-remainder acceptances;
- division zero-remainder notation still accepted where explicitly allowed;
- 0 malformed mixed-number acceptances;
- 0 bad multi-character digit acceptances;
- 0 unsimplified displayed input fractions in the audited core fraction templates;
- 0 zero-result fraction subtraction drills;
- 0 negative difficulty-1 order-of-operations outputs;
- 0 malformed decimal missing-digit visuals;
- 0 binary decimal artefacts;
- 0 findings.

## Known limits

The original ZIP package did not certify live production deployment. The current production rollout must add same-folder deployment and production-smoke evidence before closure.

The lean ZIP does not include installed dependencies. The React Arithmetic surface test cannot run locally in that extracted ZIP until dependencies are installed. In the current repo worktree, `npm install` supplied `esbuild`, and the React Arithmetic surface test passes with the committed 30-second fixture timeout.
