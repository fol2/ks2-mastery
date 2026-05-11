# Grammar QG P22 Post-Implementation Hardening Contract

Status: apply-ready hotfix/hardening package  
Scope: Grammar subject only  
Base: uploaded `ks2-mastery-lean-05111651.zip` / Grammar QG P21 implementation snapshot  
Primary evidence layer: uploaded ZIP + local runs from the extracted ZIP  
GitHub evidence layer: supplementary orientation only  
Production evidence layer: not certified by this package

## Purpose

P21 successfully expands Grammar from 510 to 546 templates and adds learner-local repetition gates. P22 keeps that implementation but hardens two areas found during post-implementation review:

1. Scheduler performance: avoid materialising generated Grammar questions for candidate templates that cannot match recent learner-local freshness windows.
2. P21 learner-quality enrichment: replace generic explanation distractors with concept-specific misconception distractors, and add a regression test so this does not drift back.

The change must not alter reward, Stars, mastery, Hero Mode, monster, subject routing, D1 schema, learner profile, spelling, punctuation, reading, reasoning, or arithmetic behaviour.

## Finding A: P21 selection performance regression

### Baseline problem

The P21 selector still passed the original R6 call-count gate, but the larger 546-template catalogue exposed a hidden inefficiency. The scheduler repeatedly called `createGrammarQuestion` while checking recent visible variants and prompt rhythm for templates that had no matching recent family/template.

Baseline deterministic probe from the uploaded ZIP:

```json
{"calls":3687,"templateCount":546,"node":"v22.16.0","config":{"mode":"smart","seed":1,"size":10}}
```

Baseline local benchmark, 40 iterations with 5 warm-up samples:

```json
{
  "p50": 377.3154990000003,
  "p95": 416.7651329999999,
  "max": 429.9058779999996,
  "improvementPct": 20.615711518351553
}
```

The older wall-clock kill-switch skips when the template catalogue exceeds the R6 calibration horizon, so the practical regression was not blocked by CI.

### Required fix

Selection should pre-check recent family/template membership before materialising a candidate question.

Acceptance criteria:

- `createGrammarQuestion` call count for the R6/P21 queue probe must be `<= 1200`.
- The previous R6 baseline ratio gate must still pass.
- P21 local repetition audit must remain pass with `0` violations and `0` warnings.
- P19 smart-practice audit must remain pass.
- The change must not reduce P21 local repetition uniqueness floors.

### Patched result

Patched deterministic probe:

```json
{"calls":256,"templateCount":546,"node":"v22.16.0","config":{"mode":"smart","seed":1,"size":10}}
```

Patched local benchmark:

```json
{
  "p50": 34.28295400000002,
  "p95": 40.59283300000004,
  "max": 40.88009800000009,
  "improvementPct": 92.26798762659595
}
```

The benchmark is local-run evidence only. The call-count ceiling is the stronger release gate because it is deterministic and directly tied to the regression.

## Finding B: P21 explanation distractor repetition

### Baseline problem

P21 explanation templates reused the same generic three distractors across every Grammar concept:

- `It only depends on the final punctuation mark.`
- `It is correct because it is the shortest option.`
- `It is correct because it sounds more exciting.`

This is not a marking failure, but it weakens learner-facing quality and makes the new pool feel more repetitive than it should.

### Required fix

Every P21 explanation template must use concept-specific misconception distractors.

Acceptance criteria:

- Every `qg-p21` explanation template across all 18 concepts must generate three distractors.
- None of those distractors may be one of the old generic filler options.
- Grammar content-quality audit must remain clean.
- P21 pool-expansion tests must include a regression assertion for this quality bar.

## Validation commands

Required local commands for this package:

```bash
git apply --check patches/001-grammar-qg-p22-selection-performance-and-explanation-quality.patch

git apply patches/001-grammar-qg-p22-selection-performance-and-explanation-quality.patch

node --check worker/src/subjects/grammar/selection.js
node --check worker/src/subjects/grammar/content.js

node --test tests/grammar-selection-perf-tripwire.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js

npm run verify:grammar-qg-p21

node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1,2,3 --out=reports/grammar/grammar-qg-p19-smart-practice-p22.json
```

Expected results:

- Patch applies cleanly to the uploaded P21 snapshot.
- Syntax checks pass.
- Targeted tests pass.
- `npm run verify:grammar-qg-p21` passes.
- P21 local repetition summary has `violationCount: 0`, `warningCount: 0`, `minUniqueTemplates >= 18`, `minUniquePrompts >= 53`, `minUniqueVariants >= 59`.
- Content quality has `0` hard failures and `0` advisories for seeds `1..3`.
- P19 smart-practice audit has `0` failures and `0` advisories for seeds `1..3`.

## Release boundary

This package is post-implementation hardening, not production certification. Before live rollout, regenerate any release artefacts that embed Grammar source or audit output if your release process requires them. Production readiness requires a live deployment smoke with origin, timestamp, release id, and pass/fail result.

## Non-goals

- No further template-count expansion.
- No interface redesign.
- No reward or mastery changes.
- No Hero Mode changes.
- No cross-subject changes.
- No production evidence claims from local ZIP checks.
