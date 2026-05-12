# Grammar QG P21 Post-Implementation Review and P22 Recommendation

## Source boundary

Primary review source: uploaded `ks2-mastery-lean-05111651.zip`.  
Supplementary source: GitHub recent Grammar commit metadata only.  
Production: not independently certified by this review package.

The ZIP contains the implemented Grammar QG P21 release:

- `GRAMMAR_CONTENT_RELEASE_ID = grammar-qg-p21-2026-05-11`
- 546 total Grammar templates
- 36 P21 templates
- 288 P21 curated selected-response cases
- 18/18 Grammar concepts covered

## Review verdict

P21 is broadly healthy. The pool expansion, local repetition harness, answer acceptance, content-quality, and smart-practice audits all passed locally against the uploaded ZIP snapshot.

The review found no Grammar interface-frame regression and no reward/mastery/Stars/Hero/monster-scope change. The P21 work is mostly QG and scheduler-side.

Two hardening items should be implemented before treating the system as best-class under repeated learner focus:

1. Scheduler performance: the P21 anti-repeat freshness checks were correct in outcome, but too expensive in how they scanned candidates.
2. Explanation enrichment: P21 explanation items were valid but used repeated generic distractors across concepts.

## Baseline validation from the uploaded ZIP

`npm run verify:grammar-qg-p21`:

- exit `0`
- 9/9 tests passed

P21 learner-local repetition audit, 60 steps:

```json
{
  "violationCount": 0,
  "warningCount": 0,
  "minUniqueTemplates": 18,
  "minUniquePrompts": 53,
  "minUniqueVariants": 59
}
```

Grammar content-quality audit, seeds 1..3:

```json
{
  "totalTemplatesChecked": 1638,
  "hardFailCount": 0,
  "advisoryCount": 0
}
```

Open-response fairness audit, seeds 1..3:

```json
{
  "findingCount": 0
}
```

P20 answer/spec targeted tests:

- 53/53 passed

P19 smart-practice audit, seeds 1..3:

- 33 sessions
- 0 failures
- 0 advisories

## Performance review

### Issue

The scheduler was still materialising many generated candidate questions while checking freshness. At P21 size, a single 10-item queue probe made 3,687 `createGrammarQuestion` calls.

This still passed the older R6 call-count ratio gate, but the ratio gate is too loose for the P21 catalogue size. The older wall-clock kill-switch also skips when catalogue size exceeds its calibration horizon, so this regression had no strong active gate.

### Patch

The P22 patch adds fast pre-checks:

- If a recent variant family has not appeared, skip candidate question materialisation for variant freshness.
- If a template has not appeared recently, skip candidate question materialisation for prompt-rhythm freshness.
- Keep release-window prompt collision audits as the cross-template safety net.

### Result

Baseline:

```json
{"calls":3687,"templateCount":546}
```

Patched:

```json
{"calls":256,"templateCount":546}
```

Baseline local benchmark p95:

```text
416.765 ms
```

Patched local benchmark p95:

```text
40.593 ms
```

The patch adds a deterministic `<= 1200` call-count ceiling so this cannot silently regress.

## Content-quality and enrichment review

### Issue

The new P21 explanation templates were technically valid, but every concept reused the same generic explanation distractors. That weakens perceived variety and does not train concept-specific misconceptions well.

### Patch

The P22 patch adds concept-specific distractor sets for all 18 Grammar concepts, then updates P21 explanation generation to use those distractors.

A new regression test checks that every P21 explanation template avoids the old generic fillers.

## Interface review

No frame violation found in this scope. P21/P22 do not add new visible frame surfaces, primary CTAs, sidebars, reward widgets, or cross-subject UI. The Grammar question-session interface remains governed by the existing session renderer.

## Bug/glitch review

No learner-facing marking bug was found in the P21 implementation during this pass. The main issue was performance cost hidden inside the freshness checks, not incorrect scoring.

## Accuracy review

Manual spot-checks and content-quality audits did not find inaccurate P21 Grammar concepts. The P22 enrichment patch makes explanation distractors more accurate because they now map to the target concept rather than using generic filler text.

## Recommended next phase

After P22, the next expansion step should be a larger P23 content slice that expands the smallest concept pools first, especially:

- modal verbs
- hyphen ambiguity
- sentence functions
- relative clauses
- pronouns/cohesion

Do not add a large content dump until the P22 performance tripwire is merged, because the selection path must remain cheap as the catalogue grows.
