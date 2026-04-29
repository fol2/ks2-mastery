# Punctuation QG P4 — Evidence, Scheduler, Reviewer Governance and Full DSL Coverage

**Date:** 29 April 2026  
**Owner:** KS2 Mastery / Punctuation  
**Status:** Next-phase implementation plan  
**Depends on:** P1 deterministic generation, P2 release safety, P3 template DSL and golden marking tests

## 1. Executive summary

Punctuation QG is now in a governed deterministic state. P1 introduced generated variants and variant signatures. P2 hardened release-scoped evidence, redaction, production smoke and the 192-item production runtime bank. P3 introduced a teacher-authorable template DSL, golden accept/reject tests, and parity protection for the first seven priority generator families.

P4 should not raise production generated volume. The next phase should make the system harder to misuse, easier to review, and better aligned with real mastery evidence. The priority is to complete authoring governance, convert the remaining generator families to DSL, and improve scheduler/evidence behaviour so that children receive varied, spaced, misconception-aware practice rather than repeated surface variants.

The P4 headline is:

> Keep production volume stable, complete the authoring system, and make evidence/scheduler behaviour mature enough for later safe expansion.

## 2. Current validated baseline

The current production baseline should remain:

```text
Release id:                 punctuation-r4-full-14-skill-structure
Fixed items:                92
Published generator families: 25
Generated variants per family: 4
Generated runtime items:    100
Total runtime items:        192
Published reward units:     14
Runtime AI generation:      none
```

P4 must treat this as the stable production contract unless there is an explicit release decision. Audit-only capacity checks may use higher generated depth, but learner-facing production should stay at `generatedPerFamily = 4` during P4.

## 3. P4 starts with two P3 claim repairs

Before adding new feature work, fix the small tool-contract gaps from the P3 validation.

### 3.1 Add the missing preview npm alias

P3 introduced `scripts/preview-punctuation-templates.mjs`, and the script has useful functionality. However, the reported command `npm run preview:punctuation-templates` must exist in `package.json` if it is part of the public authoring workflow.

Add:

```json
{
  "scripts": {
    "preview:punctuation-templates": "node scripts/preview-punctuation-templates.mjs"
  }
}
```

Acceptance:

```bash
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 4
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8 --json
npm run preview:punctuation-templates -- --all --variants 8
```

The command must exit non-zero if any template golden accept/reject case fails.

### 3.2 Implement or remove the `--reviewer-report` claim

The P3 report describes a `--reviewer-report` flag for the punctuation content audit. P4 should make that true, rather than leaving reviewer work as an informal interpretation of the existing audit output.

Add:

```bash
npm run audit:punctuation-content -- --reviewer-report
npm run audit:punctuation-content -- --reviewer-report --json
npm run audit:punctuation-content -- --strict --generated-per-family 4 --reviewer-report
```

The reviewer report should be designed for a human content reviewer, not only for CI.

It must include:

```text
1. Runtime summary: fixed, generated, total, reward units, release id.
2. DSL coverage: DSL-backed vs legacy families.
3. Per-family depth: production signatures, capacity signatures, template ids.
4. Duplicate generated signatures: hard failure.
5. Duplicate stems: review signal with item ids and families.
6. Duplicate models: review signal with item ids and families.
7. Validator coverage by skill and mode.
8. Golden test coverage by DSL family/template.
9. Generated model-answer marking failures.
10. Metadata/redaction risk checks.
11. Recommended reviewer actions.
```

Reviewer-report output should not replace strict audit. It should sit beside it.

## 4. Non-negotiables

P4 must keep these rules:

1. Do not use runtime AI to generate learner-facing questions.
2. Do not globally raise `GENERATED_ITEMS_PER_FAMILY` in production.
3. Do not weaken release-scoped Star evidence.
4. Do not expose validators, accepted answers, generator family ids, template ids, raw rubrics or raw golden tests to learner read models.
5. Do not let repeated generated surfaces count as independent deep mastery evidence.
6. Do not add generated templates without golden accept/reject cases.
7. Do not treat duplicate stems/models as automatic failures unless they are semantically unsafe; classify and review them.
8. Do not let Hero Mode, UI reward surfaces or game-layer features mutate Punctuation mastery directly.

## 5. Workstream A — Complete DSL coverage for all generator families

P3 converted seven priority generator families to DSL. P4 should convert the remaining eighteen families so every published Punctuation generator family is authored through the same deterministic DSL pipeline.

### 5.1 Families to convert

Convert the remaining non-DSL families, expected to include:

```text
gen_apostrophe_possession_insert
gen_apostrophe_mix_paragraph
gen_speech_insert
gen_speech_paragraph
gen_list_commas_insert
gen_list_commas_fix
gen_fronted_adverbial_insert
gen_fronted_adverbial_combine
gen_parenthesis_insert
gen_parenthesis_choose_mark
gen_parenthesis_combine
gen_colon_list_insert
gen_colon_list_paragraph
gen_semicolon_fix
gen_semicolon_combine
gen_semicolon_paragraph
gen_bullet_points_fix
gen_bullet_points_consistency
```

If the current family list differs, update this list from `PUNCTUATION_GENERATOR_FAMILIES` and record the final mapping in the P4 completion report.

### 5.2 Conversion rule

For each converted family:

- preserve exact production output at `generatedPerFamily = 4` unless an intentional release change is approved;
- provide at least 8 audit-capacity variants per family;
- provide at least 4 golden accept/reject cases per template;
- keep validator/rubric definitions deterministic;
- keep misconception tags and readiness tags explicit;
- keep generated signatures stable for unchanged learner-visible output;
- add parity tests against the pre-conversion baseline.

### 5.3 Expected acceptance

P4 should reach:

```text
DSL-backed generator families:       25 / 25
Production generated depth:          4 per family
Production generated items:          100
Production runtime items:            192
Audit-only capacity depth:           8 per family
Audit-only capacity generated items: 200
Audit-only capacity runtime items:   292
Duplicate production signatures:     0
Duplicate capacity signatures:       0, or documented exception with hard reason
```

The production count should stay at 192 during P4.

## 6. Workstream B — Move from parity templates to real slot-based authoring

P3 rightly prioritised parity. Some DSL templates are therefore still close to one-to-one rewrites of legacy templates. P4 should begin moving towards real teacher-authored slot composition, while keeping production stable.

Add DSL support for:

```ts
slots: {
  frontedAdverbial: ['After lunch', 'Before sunrise', 'Without warning'],
  mainClause: ['the team checked the map', 'the class packed away', 'the goalkeeper dived left']
}
```

and template builders such as:

```ts
build({ frontedAdverbial, mainClause }) {
  return {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: `${frontedAdverbial}\n${capitalise(mainClause)}.`,
    model: `${frontedAdverbial}, ${mainClause}.`,
    validator: {
      type: 'frontedAdverbialCombine',
      phrase: frontedAdverbial,
      mainClause
    }
  };
}
```

The key rule is that prompt, stem, model answer, validator, misconception tags and golden tests should come from one teacher-reviewed spec. Avoid hand-copying the same data into multiple places.

Do not relax production parity silently. Where a slot-based rewrite intentionally changes learner-visible output, record it as a release/content change and update baselines explicitly.

## 7. Workstream C — Reviewer report and content quality workflow

The reviewer report should become the daily quality tool for Punctuation QG.

It should classify issues into:

```text
Fail:       unsafe or invalid; blocks merge.
Warning:    content may be valid but needs reviewer decision.
Info:       useful coverage signal.
```

Suggested classifications:

| Signal | Default severity | Notes |
|---|---:|---|
| Duplicate variant signature | Fail | Generated identity collision. |
| Generated model answer does not mark correct | Fail | Learner could be marked wrong for model answer. |
| Missing validator/rubric for generated item | Fail | Item cannot be reliably marked. |
| Missing golden tests for DSL template | Fail | No safe authoring evidence. |
| Duplicate stem | Warning | Often legitimate, but must be reviewed. |
| Duplicate model | Warning | Often legitimate in insert/fix items, but must be reviewed. |
| Thin mode coverage for a skill | Warning | Affects mastery confidence. |
| Thin transfer/open-response coverage | Warning | Affects deep evidence. |
| Low capacity depth | Warning | Blocks future volume increase. |
| Legacy non-DSL family | Warning in early P4, Fail by end of P4 | Target is 25/25 DSL. |
| Read-model forbidden field | Fail | Learner-facing leakage risk. |

The report should produce both human-readable markdown/text and machine-readable JSON.

## 8. Workstream D — Scheduler maturity

The current scheduler avoids recent signature repeats. P4 should make scheduler behaviour explicitly mastery-oriented.

### 8.1 Sibling-template retry after misconception

When a child misses a generated item and the misconception tag is known, the near retry should prefer a sibling item with:

```text
same skill or same reward unit;
same misconception tag;
different variantSignature;
different templateId where possible;
different stem where possible.
```

Do not immediately repeat the exact same generated surface unless there is no reasonable alternative.

Tests should cover:

- wrong generated answer schedules sibling retry;
- wrong fixed answer schedules either fixed remediation or generated sibling where appropriate;
- retry does not use same variant signature if alternatives exist;
- retry falls back gracefully when the family has too little depth.

### 8.2 Per-signature exposure limits

Add scheduler rules that reduce repeated exposure to the same generated surface.

Suggested policy:

```text
Avoid the same variantSignature in the same session.
Avoid the same variantSignature across the last N attempts.
Avoid the same variantSignature across the last M days when alternatives exist.
Allow explicit repeat only for short correction loops, and mark it as supported/recovery evidence.
```

The exact N/M values can be tuned, but they should be explicit and tested.

### 8.3 Mixed and spaced review

Secure and post-secure practice should include spaced return, mixed review and transfer-style tasks. The scheduler should not over-select easy generated variants simply because they are available.

Add reason tags such as:

```text
due-review
weak-skill-repair
misconception-retry
spaced-return
mixed-review
retention-after-secure
breadth-gap
```

These should appear in debug/admin output, not in child-facing learner copy unless written in child-safe language.

## 9. Workstream E — Star evidence hardening

Punctuation Stars should remain evidence of learning, not a count of questions completed.

P4 should harden the evidence model so that deeper Stars require varied independent evidence.

Suggested rules:

```text
Try evidence may come from an initial supported or simple correct attempt.
Practice evidence should require independent correctness.
Secure evidence should require spaced independent correctness.
Deep secure / late Stars should require varied modes and varied signatures.
Retention evidence should come after a time gap, not immediately after the same session.
```

For generated items:

```text
Two attempts with the same variantSignature should not count as two independent secure evidences.
Two attempts from the same templateId should be treated cautiously for deep evidence.
A fixed anchor plus generated transfer item is stronger than two near-identical generated items.
Paragraph and open-transfer items may support more than one skill, but should not over-credit all skills at full depth from one attempt.
```

Add tests for:

- signature dedupe;
- template-level dedupe where appropriate;
- fixed + generated varied evidence;
- supported attempt not unlocking deep secure;
- spaced return contributing after the configured interval;
- release mismatch not contributing to current release Stars.

## 10. Workstream F — Telemetry and analytics

P4 should add learning-health metrics before any future volume increase.

Minimum events/signals:

```text
generated_signature_exposed
generated_signature_repeated
scheduler_reason_selected
misconception_retry_scheduled
misconception_retry_passed
spaced_return_scheduled
spaced_return_passed
retention_after_secure_scheduled
retention_after_secure_passed
star_evidence_deduped_by_signature
star_evidence_deduped_by_template
reviewer_duplicate_stem_acknowledged
reviewer_duplicate_model_acknowledged
```

Useful dashboard metrics:

```text
Generated repeat rate by skill/family.
Sibling retry success rate.
Misconception recovery rate.
Spaced return pass rate.
Retention-after-secure pass rate.
Mode diversity before secure.
Signature diversity before secure.
Star inflation risk signals.
Generated marking failure rate.
```

Analytics must not include raw accepted answers, raw validators, raw rubrics or child-sensitive unnecessary payloads.

## 11. Workstream G — CI and command gates

Keep the current strict production audit. Add P4-specific authoring and reviewer gates.

Recommended commands:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4
npm run audit:punctuation-content -- --strict --generated-per-family 8 --min-signatures-per-family 8
npm run audit:punctuation-content -- --reviewer-report
npm run preview:punctuation-templates -- --all --variants 8
npm test -- --runInBand tests/punctuation-golden-marking.test.js
npm test -- --runInBand tests/punctuation-dsl-conversion-parity.test.js
npm test -- --runInBand tests/punctuation-content-audit.test.js
npm test -- --runInBand tests/punctuation-scheduler.test.js
npm test -- --runInBand tests/punctuation-star-projection.test.js
npm test -- --runInBand tests/punctuation-read-model-redaction.test.js
```

After deployment, keep production smoke:

```bash
npm run smoke:production:punctuation
```

If authenticated admin smoke is available, add it. If not, keep the limitation explicit in the P4 completion report.

## 12. Release policy

P4 should be a governance and maturity phase, not a volume-release phase.

Default release policy:

```text
Do not change the production release id if learner-visible production output is unchanged.
Change the release id only if learner-visible content, reward evidence semantics or marking behaviour changes materially.
Do not raise generatedPerFamily in production during P4.
Use audit-only capacity mode to prove future readiness.
```

If a marking policy changes, provide migration notes and release-scoped evidence tests.

## 13. P4 acceptance checklist

P4 is complete only when all of the following are true:

```text
[ ] package.json exposes preview:punctuation-templates.
[ ] audit-punctuation-content supports --reviewer-report in text and JSON modes.
[ ] Reviewer report is useful to a non-engineer content reviewer.
[ ] All 25 published generator families are DSL-backed.
[ ] Every DSL template has golden accept/reject tests.
[ ] Production runtime remains 192 unless a release decision says otherwise.
[ ] Audit-only depth 8 works across all 25 families.
[ ] Duplicate production variant signatures are 0.
[ ] Duplicate capacity variant signatures are 0, or documented as blocked with exact family/action.
[ ] Duplicate stems/models are listed, classified and either fixed or intentionally accepted.
[ ] Generated model answers all mark correct.
[ ] Scheduler avoids repeated signatures when alternatives exist.
[ ] Misconception retry prefers sibling templates.
[ ] Star projection dedupes repeated generated evidence.
[ ] Secure/deep evidence requires varied and spaced independent attempts.
[ ] Read-model redaction tests still pass.
[ ] Production smoke still passes.
[ ] P4 completion report clearly separates implemented facts from residual risks.
```

## 14. Out of scope for P4

Do not do these in P4:

- global production increase from 4 generated variants per family;
- runtime AI generation;
- large new child-facing reward economy;
- Hero Mode integration that mutates Punctuation Stars;
- replacement of the Punctuation scheduler by a cross-subject scheduler;
- removal of fixed anchor items in favour of generated-only practice.

These belong to later platform or product phases.

## 15. Expected phase after P4

If P4 succeeds, P5 can safely consider mature portfolio expansion:

```text
P5: controlled production volume increase, monitoring, and mature content portfolio.
```

P5 should decide whether to raise selected families from 4 to 6 or 8 generated variants in production. That decision should be based on P4 evidence: DSL coverage, reviewer report quality, duplicate review status, scheduler behaviour, Star evidence safety and production telemetry.

Do not enter P5 by simply changing one constant. Enter P5 only when the evidence says the engine can absorb more generated items without increasing repetition, unfair marking or Star inflation.
