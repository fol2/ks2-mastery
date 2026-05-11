# Grammar QG P21A Pool Expansion + Learner-Local Anti-Repetition Contract

Status: apply-ready patch package  
Base: `ks2-mastery-lean-05102302.zip` after the previous Grammar 05102302 validation/hotfix patch has been applied  
Primary evidence layer: uploaded ZIP/local patched snapshot  
GitHub layer: supplementary only  
Production layer: not certified by this package

## Purpose

P21A expands the Grammar question pool without lowering marking quality, and hardens selection so a learner focusing heavily on one Grammar concept is less likely to feel repeated practice.

The goal is not to flood the system with random generated sentences. The goal is a curated expansion slice plus a stronger learner-local anti-repetition gate.

## Non-negotiables

1. Grammar-only change.
2. No reward, Stars, mastery, Hero Mode, monster, event-projection, or cross-subject change.
3. New P21 content must be closed selected-response only.
4. Every new P21 case must have exactly four visible options and exactly one accepted answer.
5. New content must be runtime-certified before it can be scheduled.
6. Focused practice must not repeat the same visible generated surface inside the local audit window.
7. The scheduler must avoid local repetition before simply relying on a larger raw pool.
8. Existing Grammar QG audits must remain green.

## Delivered patch scope

The patch adds:

- `GRAMMAR_CONTENT_RELEASE_ID = grammar-qg-p21-2026-05-11`.
- 36 curated P21 templates.
- 288 curated selected-response cases.
- Coverage across all 18 Grammar concepts.
- Two new P21 template families per concept:
  - closed-choice variety;
  - explanation-choice variety.
- Runtime certification entries for the new templates.
- A learner-local repetition audit script.
- P21 pool expansion tests.
- P21 local repetition tests.
- Package scripts:
  - `audit:grammar-qg:p21-local-repetition`
  - `verify:grammar-qg-p21`

Expected inventory after patch:

| Metric | Expected |
|---|---:|
| Total templates | 546 |
| P21 templates | 36 |
| P21 cases | 288 |
| P21 concepts covered | 18 |
| P21 templates per concept | 2 |
| P21 cases per template | 8 |
| P21 answer shape | exact selected-response |

## Scheduler anti-repetition rules

The patch hardens Grammar selection with these local windows:

| Rule | Window |
|---|---:|
| Generated visible-variant repeat avoidance | 40 recent attempts |
| Generative template repeat avoidance | 12 recent attempts |
| Static/non-generative template repeat avoidance | 40 recent attempts |

The older selection flow already used recent template, concept, and variant indexes, but the generated-variant freshness check only blocked recent variants within a short local window. P21A extends that protection and adds stricter static-template protection.

## New audit contract

The new audit script is:

```bash
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=40 --json
```

The audit simulates focused learners across Grammar modes and concept focus. It records:

- exact visible surface repeats;
- visible variant repeats;
- template repeat rhythm;
- family/concept rhythm;
- unique templates;
- unique prompts;
- unique visible variants;
- question-type distribution.

Hard failures:

- exact visible surface repeat inside the focused simulation;
- visible variant repeat inside the focused simulation;
- insufficient unique variant coverage.

Warnings:

- prompt-rhythm repeats where the short instruction text repeats but the full visible surface differs, such as repeated table prompts with different rows/options.

Warnings are not release blockers by themselves, but they are product-review signals.

## Required validation before merge

Run from the patched repo root:

```bash
node --test tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-question-generator-audit.test.js
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=40 --json
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --deep --json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
```

The package script may also be used:

```bash
npm run verify:grammar-qg-p21
```

Expected results:

- P21 tests pass.
- Existing Grammar QG audit tests pass.
- Local repetition audit status is `pass`.
- Local repetition hard violation count is `0`.
- Grammar QG audit has no repeated generated variants.
- Grammar QG deep audit has no generated signature collisions.
- Content quality seeds 1..3 have `0` hard failures and `0` advisories.

## Release-readiness boundary

This patch is locally validated and apply-ready. It is not production-certified.

Before live rollout, regenerate or refresh any release evidence your release process requires, especially:

- render inventory;
- certification evidence manifest;
- production smoke evidence;
- any report that embeds the previous P20 release id;
- any CI evidence requiring a full seed window.

## Known limits

This is P21A, a safe first expansion slice. It is not the final 900-1,100 template endpoint. The final endpoint should continue concept-by-concept expansion after this harness is merged, using the same local repetition audit as a release gate.
