---
title: "Seeded PRNG index collision — pickBySeed modulo pattern for small banks"
date: "2026-04-28"
category: logic-errors
module: grammar-qg
problem_type: logic_error
component: service_object
severity: medium
symptoms:
  - "mulberry32 produces clustered first-call outputs for nearby seeds (0.627, 0.734, 0.720 for seeds 1,2,3)"
  - "Math.floor(prng * arr.length) maps consecutive seeds to identical indices for small arrays (N < 20)"
  - "Deterministic content generators repeat the same visible question for adjacent learner seeds"
  - "pickBySeed(0, arr) returns arr[-1] = undefined due to JavaScript negative remainder"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - documentation
tags:
  - seeded-prng
  - mulberry32
  - pick-by-seed
  - index-collision
  - modulo-selection
  - javascript-modulo
  - grammar-qg
  - deterministic-content
---

# Seeded PRNG index collision — pickBySeed modulo pattern for small banks

## Problem

Seeded PRNG functions like `mulberry32` produce correlated first-call outputs for nearby seeds, causing multiple sequential seeds to select the same case from small content banks. In Grammar QG, this manifested as 12 repeated variants across 6 template families — learners saw identical visible questions across sessions.

## Symptoms

- Grammar audit reported `legacyRepeatedGeneratedVariants: 12` across 6 families in default seed window `[1,2,3]`
- Seeds 1, 2, and 3 all produced the same variant signature for templates with banks of 2-5 items
- `pickBySeed(0, arr)` silently returned `undefined`, causing downstream TypeErrors with no obvious origin
- `-ly` adverb hyphenation error in content (secondary): 'brightly-coloured' incorrectly marked as correct

## What Didn't Work

- **Adding more cases to the bank** — shifts the collision window but doesn't eliminate it because mulberry32's first-call clustering is independent of bank size. Seeds 1-3 mapping to index 2 for a 4-item bank would just map to index 4 for a 7-item bank.
- **Using `pick(rng, array)` with mulberry32** — the standard pattern works for shuffling large pools but is structurally flawed for small-bank case selection where sequential variety is the requirement.
- **Naive modulo `(seed - 1) % arr.length`** — crashes for seed=0 because JavaScript's `%` operator preserves sign: `(-1) % 8 = -1`, and `arr[-1] = undefined`.

## Solution

Introduced `pickBySeed(seed, arr)` using double-modulo arithmetic:

```js
function pickBySeed(seed, arr) {
  return arr[((seed - 1) % arr.length + arr.length) % arr.length];
}
```

The dual strategy is now:
- **`pickBySeed`** — for deterministic bank-indexed selection (guaranteed distinct items for consecutive seeds)
- **`mulberry32` + `pick(rng, arr)`** — for within-question randomisation (option shuffling, subset sampling)

The content.js generators now call `pickBySeed(seed, cases)` for primary case selection and continue using `mulberry32(seed)` for option shuffling within the selected case.

## Why This Works

**Root cause:** `mulberry32(seed)` first-call values for seeds 1, 2, 3 are approximately 0.627, 0.734, 0.720. When mapped via `Math.floor(val * N)` for small N:
- N=4: all three produce index 2
- N=5: all three produce index 3
- N=3: two of three collide

This is inherent to linear PRNGs — the internal state needs multiple iterations to decorrelate nearby seeds. The first call is always the weakest.

**Why modulo fixes it:** `((seed - 1) % arr.length + arr.length) % arr.length` is a pure arithmetic mapping that guarantees: seed 1 → index 0, seed 2 → index 1, seed 3 → index 2. Any N consecutive seeds map to N distinct indices when bank size >= N.

**Why double-modulo:** JavaScript's `%` preserves sign. `(0 - 1) % 8 = -1`. Adding `arr.length` before the second `%` wraps negative remainders correctly: `(-1 + 8) % 8 = 7`.

## Prevention

- **Use modulo for deterministic case selection from small banks.** If the bank has fewer than ~20 items and sequential variety across nearby seeds matters, `pickBySeed` is structurally superior to PRNG first-call.
- **Reserve seeded PRNGs for distribution-quality tasks.** Shuffling answer options, sampling from large pools, generating random names — these benefit from statistical uniformity, not sequential variety.
- **Always use the double-modulo pattern when the operand can be zero or negative.** This includes: seed fallback paths (`Number(seed) || 0`), offset calculations, circular buffer indices.
- **Run the `--deep` audit (seeds 1..30)** to make repeat rates visible across wider windows before release.
- **Content review: never hyphenate -ly adverbs** in UK English KS2 teaching content. Use genuine compound modifiers (adjective-adjective or adjective-participle pairs: `bright-orange`, `well-known`, `hard-working`).

## Decision Matrix

| Scenario | Use `pickBySeed` (modulo) | Use `mulberry32` (PRNG) |
|----------|:---:|:---:|
| Select 1 case from a bank of 3-12 items | Yes | No |
| Cycle through variants across sessions | Yes | No |
| Shuffle 4 answer options into random order | No | Yes |
| Sample 5 words from a 200-word pool | No | Yes |
| Any index where seed can be 0 or negative | Double-modulo pattern | N/A |

## Related Issues

- [PR #536](https://github.com/fol2/ks2-mastery/pull/536) — Grammar QG P4: fixed 6 families, introduced `pickBySeed`
- `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — Related deterministic selection pattern (DJB2+LCG for Hero scheduler, different algorithm and module)
- `worker/src/subjects/grammar/content.js:7047` — `pickBySeed` implementation
- `scripts/audit-grammar-question-generator.mjs` — `--deep` flag for 30-seed depth analysis
