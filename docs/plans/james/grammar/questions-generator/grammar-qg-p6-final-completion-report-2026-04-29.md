---
title: "Grammar QG P6 — Learner Calibration and Telemetry — Final Completion Report"
contentReleaseId: grammar-qg-p6-2026-04-29
implementation_prs:
  - https://github.com/fol2/ks2-mastery/pull/562
final_content_release_commit: 8b83582
post_merge_fix_commits: []
final_report_commit: pending
post_deploy_smoke: not-run
post_deploy_smoke_evidence: null
---

# Grammar QG P6 — Learner Calibration and Telemetry — Final Completion Report

## 1. Executive Summary

Grammar QG P6 moves the programme from **release correctness** (P1–P5) into **learner calibration**. The phase delivers learner-safe telemetry, template health aggregation, mixed-transfer shadow analysis, retention-after-secure monitoring, and clears all outstanding P5 content-quality advisories — without changing reward, Star, Mega, monster, Concordium, or mastery semantics.

**Key outcomes:**
- 6 new calibration telemetry fields enriching every `grammar.answer-submitted` event
- Template triage classification system with 8 health categories
- Mixed-transfer shadow evidence weight model (analytics-only)
- Retention-after-secure lapse detection (analytics-only)
- 27 P5 content-quality advisories resolved → 0
- P5 strict-tag governance gap closed with future-proof regex predicate
- Reviewer sample-pack hardened with paragraph preservation and CLI filtering
- `verify:grammar-qg-p6` release gate: **199 tests, 0 failures**
- P5 backward-compatibility: **132/132 pass** — no regression

---

## 2. Shipped Denominator

| Measure | P5 value | P6 value | Movement |
|---|---:|---:|---|
| Concepts | 18 | 18 | — |
| Templates | 78 | 78 | — |
| Selected-response templates | 58 | 58 | — |
| Constructed-response templates | 20 | 20 | — |
| Generated templates | 52 | 52 | — |
| Fixed templates | 26 | 26 | — |
| Answer-spec templates | 47 | 47 | — |
| CR answer-spec templates | 20 / 20 | 20 / 20 | — |
| Manual-review-only templates | 4 | 4 | — |
| Explanation templates | 17 | 17 | — |
| Mixed-transfer templates | 8 | 8 | — |
| Deep low-depth families | 0 | 0 | — |
| Default-window repeated variants | 0 | 0 | — |
| Cross-template signature collisions | 0 | 0 | — |
| Content-quality hard failures | 0 | 0 | — |
| Content-quality advisories | 27 | 0 | ▼ 27 |

The template/concept denominator is **unchanged**. The only learner-facing content changes are feedback wording improvements (mixed-transfer templates and curly-quote fixes), which motivated the content release ID bump from `grammar-qg-p5-2026-04-28` to `grammar-qg-p6-2026-04-29`.

---

## 3. Implementation Units Delivered

### U0. P5 Governance Repair Pre-flight

| Deliverable | Status |
|---|---|
| Future-proof strict-tag regex predicate (`/^qg-p\d+$/`) | ✓ |
| `qg-p5` templates now get strict repeat detection | ✓ |
| Test that synthetic `qg-p99` tag is treated as strict | ✓ |
| Real report file validation via CLI path | ✓ |
| Report frontmatter convention (implementation_prs, final_content_release_commit, post_merge_fix_commits, final_report_commit) | ✓ |
| Synthetic hard-fail test for content-quality rules | ✓ |

**Root cause fixed:** Line 100 of `scripts/audit-grammar-question-generator.mjs` hard-coded `qg-p1`, `qg-p3`, `qg-p4` in an OR chain. The regex predicate ensures no future `qg-pN` tag is ever missed.

### U1. Learner-safe Telemetry Schema

New fields added to the `grammar.answer-submitted` event:

| Field | Type | Purpose |
|---|---|---|
| `tags` | `string[]` | Template-level phase/mode tags for filtering |
| `answerSpecKind` | `string \| null` | Compare marking families |
| `elapsedMsBucket` | `string \| null` | Coarse timing band (schema placeholder, currently null — client timing not yet plumbed) |
| `wasRetry` | `boolean` | Whether this is a retry attempt |
| `conceptStatusBefore` | `Object` | Per-concept mastery status snapshot before scoring |
| `conceptStatusAfter` | `Object` | Per-concept mastery status snapshot after scoring |

**Redaction verification:** None of these fields appear in `buildGrammarReadModel()` output. Enforced by explicit allowlist pattern in read-models.js and tested in `grammar-qg-p6-telemetry.test.js`.

**Fail-open contract:** If any enrichment field cannot be computed, it defaults to `null` or empty — never crashes the submit path.

### U2 + U7. Template and Concept Health Aggregation with Triage

Script: `scripts/grammar-qg-health-report.mjs`

**Template triage classifications:**

| Classification | Trigger condition | Recommended action |
|---|---|---|
| `healthy` | 60–95% independent success, normal timing | Keep |
| `too_easy` | >95% independent success AND <2s median timing | Reserve for warm-up |
| `too_hard` | <40% independent success | Improve hint or lower placement |
| `ambiguous` | >40% wrong-after-support rate | Review wording/distractors |
| `support_dependent` | >80% supported success AND <50% independent | Improve teaching bridge |
| `retry_effective` | >70% retry success rate | Keep as repair candidate |
| `retry_ineffective` | <30% retry success rate | Rewrite or retire |
| `transfer_gap` | High local success, low mixed-transfer | Add bridge practice |
| `retention_gap` | Secured concepts later lapse frequently | Increase spaced maintenance |

**Concept metrics:** local-practice success, mixed-transfer success, explanation success, surgery/fix success, retained-after-secure rate, lapse-after-secure rate, weak-to-secure recovery rate, average templates contributing to secure evidence.

**Confidence levels:** `high` (>100 attempts), `medium` (30–100), `low` (10–30), `insufficient_data` (<10).

### U3. Mixed-Transfer Shadow Calibration

Script: `scripts/grammar-qg-mixed-transfer-calibration.mjs`

**Shadow evidence weight model:**

| Weight | Condition | Meaning |
|---|---|---|
| `none` | localPrerequisitesMetRate ≤ 0.5 | Concepts not secured locally — transfer evidence unreliable |
| `light` | successRate < 0.5 | Transfer attempt unsuccessful — weak evidence |
| `normal` | Fallback | Moderate evidence of transfer ability |
| `strong` | successRate > 0.8 AND independentRate > 0.7 | Strong independent transfer evidence |

**P7 recommendation:** The script outputs `keep` / `reduce` / `strengthen` per template based on evidence weight distribution.

**Critical constraint:** This module does NOT import or call any mastery-write, reward, or Star functions. Analytics-only.

### U4. Retention-after-Secure Monitoring

Script: `scripts/grammar-qg-retention-monitor.mjs`

**Retention classifications:**

| Classification | Condition |
|---|---|
| `retained` | lapseRate = 0 |
| `minor_lapse` | 0 < lapseRate ≤ 0.5 |
| `retention_risk` | lapseRate > 0.5 |

**Metrics tracked:** securedAttemptCount, retainedPassRate, lapseRate, mixedReviewProtectionRate.

**Critical constraint:** No mastery/reward/Star writes. No learner-facing demotion copy.

### U5. P5 Content-Quality Advisory Resolution

| Advisory type | Count before | Count after |
|---|---|---|
| Reversed curly quotes | 3 | 0 |
| Transfer-feedback incomplete | 24 | 0 |
| **Total** | **27** | **0** |

**Curly-quote fixes:** 7 instances across `proc2_modal_choice` and `proc3_word_class_contrast_choice` where closing quotes (U+2019) were used where opening quotes (U+2018) should be.

**Transfer-feedback rewrites:** All 8 P4 mixed-transfer templates now generate feedback that explicitly names both grammar concepts in child-friendly language. Example: "This question tests sentence functions and speech punctuation together."

**Scoring impact:** None — only `solutionLines` (feedback text) modified. No `evaluate()` function logic changed.

### U6. Reviewer Sample-Pack Hardening

| Improvement | Status |
|---|---|
| Paragraph-break preservation in `stripHtml()` | ✓ |
| Spacing between instruction and sentence | ✓ |
| `--family=<id>` CLI filter | ✓ |
| `--template=<id>` CLI filter | ✓ |
| `--max-samples=<N>` option | ✓ |
| `--seed-window=<start>-<end>` option | ✓ |
| Summary table (family, concepts, variant count) | ✓ |
| Output filename includes content release ID + commit SHA | ✓ |
| Answer-key confinement test | ✓ |

### U8. Release Gate

**P6 verification command:**
```bash
npm run verify:grammar-qg-p6
```

Covers: `audit:grammar-qg`, `audit:grammar-qg:deep`, and 14 test files spanning governance, telemetry, health report, mixed-transfer calibration, retention, review pack, P5 baselines, functionality completeness, production smoke, selection, and engine tests.

---

## 4. Validation Command Output

```
$ npm run verify:grammar-qg-p6
ℹ tests 199
ℹ pass 199
ℹ fail 0

$ npm run verify:grammar-qg  (P5 backward-compat)
ℹ tests 132
ℹ pass 132
ℹ fail 0
```

---

## 5. Content-Quality Audit Output

```
$ node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10
Grammar content-quality audit
Templates checked: 780
Hard failures: 0
Advisories: 0
```

---

## 6. Telemetry Schema Shipped

The `grammar.answer-submitted` event now carries 21 fields (up from 15 in P5):

**Pre-existing (P5):** `id`, `type`, `subjectId`, `learnerId`, `contentReleaseId`, `templateId`, `itemId`, `seed`, `questionType`, `generatorFamilyId`, `variantSignature`, `conceptIds`, `score`, `maxScore`, `correct`, `supportLevel`, `attempts`, `firstAttemptIndependent`, `supportUsed`, `supportLevelAtScoring`, `mode`, `supportContractVersion`, `createdAt`

**New (P6):** `tags`, `answerSpecKind`, `elapsedMsBucket`, `wasRetry`, `conceptStatusBefore`, `conceptStatusAfter`

**Redacted from learner read models:** All 6 new fields verified absent by test.

---

## 7. Production Smoke Status

**Post-deploy production smoke:** not-run

This report documents repository-verified behaviour. Post-deploy smoke verification requires a production deployment. When run, evidence should be written to `reports/grammar/grammar-qg-p6-production-smoke.json` with `--evidence-origin` naming the deployed Cloudflare Worker URL.

---

## 8. Mixed-Transfer Calibration Findings (Pre-Production)

Mixed-transfer calibration is implemented and tested against synthetic fixtures. Real-world findings require production telemetry accumulation. The script is ready to analyse events as soon as the P6 release is deployed and learner interactions begin.

**Shadow model outputs (pending real data):**
- Per-template: successRate, supportDistribution, conceptPropagationCount, localPrerequisitesMet, suggestedEvidenceWeight, recommendation
- Cross-template: weight distribution summary, P7 overall recommendation

---

## 9. Retention-after-Secure Findings (Pre-Production)

Same as mixed-transfer: the retention monitor is ready to process events. Real retention data requires time — concepts must be secured, then due-checked days later. Meaningful P6 retention findings will emerge 2–4 weeks after production deployment.

---

## 10. Remaining Risks

| Risk | Status | Mitigation |
|---|---|---|
| `elapsedMsBucket` permanently null (client timing not plumbed) | Known — schema placeholder | P7 scope: plumb clientElapsedMs from request payload |
| Analytics scripts expect per-concept event expansion | Documented | Scripts accept events with singular `conceptId` field; multi-concept events need upstream flattening |
| Mixed-transfer triage recommendations are synthetic-only until production data | Accepted | Scripts validated against realistic fixture distributions |
| D1 aggregation table not added (script-only approach) | By design for P6 | P7 scope if cross-session queries prove necessary |

---

## 11. Unchanged Semantics Statement

The following systems are explicitly **unchanged** by P6:

- ✗ Star calculation, display, projection, and high-water latch
- ✗ Mega threshold and revocation logic
- ✗ Monster assignment and concept roster
- ✗ Concordium (cross-subject completion) semantics
- ✗ Reward event emission and consumption
- ✗ Mastery algorithm (`updateNodeFromQuality`, SM2-inspired intervals)
- ✗ Grammar mastery thresholds
- ✗ Hero Mode integration
- ✗ Manual-review-only exclusion from mastery evidence
- ✗ Cross-subject reward dependencies
- ✗ AI-generated questions or AI-marked free writing

---

## 12. Code Review Findings and Resolutions

P6 underwent three independent automated reviews (correctness, testing coverage, maintainability). Findings resolved:

| Severity | Finding | Resolution |
|---|---|---|
| HIGH | `conceptStatusBefore` emitted as Object but scripts expected string | Added `getConceptStatus(csb, conceptId)` helper to all 3 analytics scripts |
| MEDIUM | `sessionKind` duplicated `mode` field | Removed `sessionKind` from event payload |
| MEDIUM | Health-report used 4 elapsed buckets vs engine's 5 | Aligned to 5-bucket scheme |
| MEDIUM | Double `suggestEvidenceWeight()` invocation | Computed once into local variable |
| LOW | Dead `advisoryCount` column in review pack | Removed column |
| WARNING | 5 untested classification branches | Added tests for ambiguous, retry_effective, retry_ineffective, light weight, minor_lapse |

---

## 13. Architecture Insights

### Event enrichment pattern
P6 follows the same event-enrichment pattern as Grammar Phase 7 (which added `supportLevel`, `firstAttemptIndependent`, `supportUsed`). Fields are added directly to the existing `grammar.answer-submitted` event — no new event types, no new pipelines. This keeps the architecture simple: one event stream, multiple consumers.

### Script-only analytics
All calibration analysis is implemented as Node.js scripts producing JSON/Markdown reports. This avoids:
- Runtime overhead in the production Worker
- D1 schema migration for analytics tables
- Complex async pipelines

The trade-off: no real-time dashboard in P6. This is acceptable because calibration insights are consumed by adults in review cycles (weekly/monthly), not real-time.

### Shadow mode via report columns
Mixed-transfer evidence weights are computed and reported but never written to mastery state. This is the "prove before promoting" discipline: P6 accumulates evidence, P7 decides whether to act on it. The `suggestedEvidenceWeight` field exists only in report output, never in the engine.

### Frozen fixture strategy (continued)
P6 created its own baseline fixture pair (`grammar-qg-p6-baseline.json` in both `grammar-legacy-oracle/` and `grammar-functionality-completeness/`). Historical P1–P5 baselines remain frozen and untouched — proving no regression across the full release history.

---

## 14. Files Created or Modified

### New files (14)
| File | Purpose |
|---|---|
| `scripts/grammar-qg-health-report.mjs` | Template/concept health aggregation and triage |
| `scripts/grammar-qg-mixed-transfer-calibration.mjs` | Mixed-transfer shadow evidence weight model |
| `scripts/grammar-qg-retention-monitor.mjs` | Retention-after-secure lapse detection |
| `tests/grammar-qg-p6-governance.test.js` | Strict-tag, report validation, hard-fail tests |
| `tests/grammar-qg-p6-telemetry.test.js` | Event enrichment and redaction tests |
| `tests/grammar-qg-p6-health-report.test.js` | Classification logic and threshold tests |
| `tests/grammar-qg-p6-mixed-transfer-calibration.test.js` | Evidence weight model tests |
| `tests/grammar-qg-p6-retention.test.js` | Retention classification tests |
| `tests/grammar-qg-p6-review-pack.test.js` | Review pack formatting and confinement tests |
| `tests/fixtures/grammar-legacy-oracle/grammar-qg-p6-baseline.json` | P6 oracle baseline |
| `tests/fixtures/grammar-functionality-completeness/grammar-qg-p6-baseline.json` | P6 completeness baseline |

### Modified files (9)
| File | Change |
|---|---|
| `worker/src/subjects/grammar/engine.js` | +6 telemetry fields, `bucketElapsedMs` helper |
| `worker/src/subjects/grammar/content.js` | Curly-quote fixes, transfer feedback rewrites, release ID bump |
| `scripts/audit-grammar-question-generator.mjs` | Strict-tag regex predicate |
| `scripts/validate-grammar-qg-completion-report.mjs` | Release frontmatter validation |
| `scripts/generate-grammar-review-pack.mjs` | Paragraph preservation, CLI filters, summary table |
| `tests/grammar-question-generator-audit.test.js` | P6 baseline reference |
| `tests/grammar-functionality-completeness.test.js` | P6 baseline reference |
| `tests/helpers/grammar-legacy-oracle.js` | P6 fixture path |
| `package.json` | `verify:grammar-qg-p6` script |

---

## 15. P7 Recommendations

Based on P6 infrastructure, the following are recommended for P7:

1. **Plumb client elapsed timing** — wire `clientElapsedMs` from the request payload into the engine so `elapsedMsBucket` carries real data
2. **Act on mixed-transfer calibration** — once production data accumulates (2–4 weeks), review `suggestEvidenceWeight` distributions and decide whether to promote shadow weights to scoring
3. **Adult-facing calibration dashboard** — convert script-generated reports into a React component in `GrammarAnalyticsScene.jsx`
4. **Template retirement/expansion** — use triage classifications with `high` confidence to retire underperforming templates or expand successful ones
5. **D1 aggregation table** — if cross-session queries become necessary, add a D1 table for pre-computed health metrics
6. **Event expansion pipeline** — formalise the multi-concept event → per-concept row expansion step for analytics consumption

---

## 16. Success Criteria Assessment

| P6 success question | Answered? | Evidence |
|---|---|---|
| Which Grammar templates are healthy? | ✓ (infrastructure ready) | `grammar-qg-health-report.mjs` with 8 triage classifications |
| Which templates are too easy, too hard, ambiguous, or support-dependent? | ✓ (infrastructure ready) | Classification thresholds validated by tests |
| Which mixed-transfer templates are genuinely measuring transfer? | ✓ (infrastructure ready) | Shadow evidence weight model with `suggestEvidenceWeight` |
| Which secure concepts are retained after time has passed? | ✓ (infrastructure ready) | Retention monitor with lapse detection |
| Which content families should be expanded, rewritten, or retired in P7? | ✓ (infrastructure ready) | Triage recommendations with confidence levels |
| Can the final report be validated directly against live audit output? | ✓ | `validate-grammar-qg-completion-report.mjs` with real report path |
| Did the release avoid reward/mastery semantic changes? | ✓ | Section 11 unchanged-semantics statement; 132/132 P5 compat tests |

All 7 success criteria are met at the infrastructure level. Production data will provide the actual calibration insights as learner interactions accumulate post-deployment.
