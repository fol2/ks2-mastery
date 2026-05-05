---
title: Punctuation QG P15 Baseline Measurement Report
subject: punctuation
phase: punctuation-qg-p15
sourceBaseline: punctuation-qg-p14-3564-2026-05-04
status: BASELINE_MEASURED_NOT_EXPANDED
generatedAt: 2026-05-04
---

# Punctuation QG P15 — baseline measurement report

## Verdict

`BASELINE_MEASURED_NOT_EXPANDED`

The P14 pool is source/local delivered but far below the P20 heavy-play target. This is expected. P15 is the measurement and contract phase, not the content-expansion phase.

## Baseline P14 evidence from the uploaded ZIP

```text
release ID:                  punctuation-qg-p14-3564-2026-05-04
fixed items:                 512
generated items:             3,052
runtime items:               3,564
generated families:          42
transfer items:              276
model self-marking failures: 0
P14 source audit:            PASS locally
P14 session variety audit:   PASS locally
P14 production smoke:        missing from supplied snapshot
```

The missing production smoke path is:

```text
reports/punctuation/punctuation-qg-p14-production-smoke.json
```

So P14 is not production-certified from the supplied ZIP, even though source/local checks pass.

## P15 anti-fake-variety measurement

The P20 expansion audit was added as a future acceptance gate and run against the P14 baseline. It correctly fails on the current pool.

Current measured counts:

```text
runtime items:                  3,564
generated items:                3,052
fixed items:                    512
unique learner-facing surfaces: 3,558
unique variant signatures:      3,564
generated families:             42
duplicate surface groups:       6
model self-marking failures:    0
```

Current mode distribution:

```text
choose:     740
insert:     720
fix:        717
combine:    606
paragraph:  505
transfer:   276
```

Current per-skill item distribution:

```text
sentence_endings:           256
list_commas:                355
apostrophe_contractions:    256
apostrophe_possession:      353
speech:                     355
fronted_adverbial:          355
parenthesis:                354
comma_clarity:              156
colon_list:                 355
semicolon:                  354
dash_clause:                256
semicolon_list:             156
bullet_points:              253
hyphen:                     156
```

## P20 gates that fail on the P14 baseline

The failing gates are correct and intentional:

```text
releaseIdentity
poolDepth
learnerSurfaceVariety
generatedFamilyDepth
perSkillBalance
reviewGovernance
negativeVectorCoverage
heavyPlayVariety
```

The only P20 gate already satisfied by the P14 baseline is model self-marking: all model answers mark correct locally.

## Why this matters

The current pool is good enough to validate the P14 direction, but not enough for the ultimate product goal. The system needs structural expansion, not only deeper generation. Adding more item IDs without increasing learner-facing and cognitive variety would make the product look larger while still feeling repetitive to heavy learners.

P16-P20 must therefore add new generator dimensions, new family structures, balanced skill depth, stronger open-answer marking, scheduler cooldowns, reviewer governance, and production evidence.

## Machine evidence

Baseline machine audit:

```text
reports/punctuation/punctuation-qg-p15-baseline-audit.json
```

Future post-P20 audit command:

```bash
npm run verify:punctuation-qg:p20
```

This command is expected to fail until P16-P20 are actually implemented and production evidence is present.
