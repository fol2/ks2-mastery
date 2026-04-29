---
title: "Grammar QG P7 — Production Calibration Activation — Final Completion Report"
contentReleaseId: grammar-qg-p6-2026-04-29
analytics_schema_version: grammar-qg-p7-calibration-v1
content_release_id_changed: false
scoring_or_mastery_change: false
implementation_prs:
  - "https://github.com/fol2/ks2-mastery/pull/578"
  - "https://github.com/fol2/ks2-mastery/pull/586"
  - "https://github.com/fol2/ks2-mastery/pull/588"
  - "https://github.com/fol2/ks2-mastery/pull/590"
  - "https://github.com/fol2/ks2-mastery/pull/592"
final_content_release_commit: 287f58e
post_merge_fix_commits: []
final_report_commit: pending-report-commit
post_deploy_smoke: not-run
post_deploy_smoke_evidence: null
---

# Grammar QG P7 — Production Calibration Activation — Final Completion Report

## 1. Executive Summary

Grammar QG P7 moves the programme from **shadow-mode telemetry** (P6) into **production calibration activation**. The phase delivers a complete evidence pipeline: event export with learner anonymisation, canonical per-concept expansion, cross-report calibration (health, mixed-transfer, retention), evidence-led action candidate generation with confidence thresholds, decision gates for mixed-transfer maturity and retention maintenance, and an internal calibration panel for adult/admin review — all without changing reward, Star, Mega, monster, Concordium, or mastery semantics.

**Key outcomes:**
- Client elapsed timing plumbed into `elapsedMsBucket` (previously hardcoded `null`)
- Production event export with HMAC-SHA-256 learner anonymisation (P0 security: event.id scrubbing)
- Canonical event expansion pipeline bridging multi-concept events to per-concept analytics rows
- Calibration runner orchestrating health, mixed-transfer, retention reports from expanded rows
- `transfer_gap` and `retention_gap` cross-report classifications (confidence-gated)
- `weakCorrectAttemptRate` and `weakToSecureRecoveryRate` as distinct metrics
- 9-category action candidate generation with confidence thresholds (never auto-actioned)
- Mixed-transfer maturity decision gate (keep_shadow / prepare_experiment / do_not_promote)
- Retention-after-secure maintenance decision gate with family-level lapse clustering
- Admin-only GrammarCalibrationPanel reading report artefacts
- Governance hardened: placeholder tokens rejected, machine-derived test counts, canonical smoke path
- `verify:grammar-qg-p7` release gate: **184 tests, 0 failures**
- P6 backward-compatibility: **199/199 pass** — zero regression

---

## 2. Shipped Denominator

| Measure | P6 value | P7 value | Movement |
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
| Content-quality advisories | 0 | 0 | — |

The template/concept denominator is **unchanged**. P7 is analytics-only — no learner-facing content changes, no content release ID bump.

---

## 3. Implementation Units Delivered

### U0. Governance Closure and Release Evidence Hardening

- Hardened `validateReleaseFrontmatter()` with `/^(pending|todo|tbc|unknown|n\/a|tbd)$/i` placeholder rejection
- Confirmed canonical smoke evidence path: `reports/grammar/grammar-production-smoke-${contentReleaseId}.json`
- Created `scripts/capture-verification-summary.mjs` for machine-derived test counts
- Updated `verify:grammar-qg-p7` release gate in package.json
- Added internal `bucketElapsedMs` guard against NaN/Infinity for direct callers

### U1. Client Elapsed Timing Plumbing

- Added `clientElapsedMs` parameter to `applyGrammarAttemptToState()` in engine.js
- Validation: accept only finite numbers in `[0, 180000]`; invalid/missing → `null`
- `bucketElapsedMs()` now receives validated client timing instead of hardcoded `null`
- Read model redaction (`safeRecentAttempt`) continues to strip `elapsedMsBucket`
- Five coarse bands preserved: `<2s`, `2-5s`, `5-10s`, `10-20s`, `>20s`

### U2. Canonical Event Expansion Pipeline

- Created `scripts/grammar-qg-expand-events.mjs`
- Multi-concept events → N per-concept rows with deterministic `rowId`
- Per-concept fields: `conceptId`, `conceptStatusBefore`, `conceptStatusAfter`, boolean flags
- Handles both legacy string and P6 object status shapes
- Malformed events skipped with summary count
- Exports `expandEvent()` and `expandEvents()` for downstream reuse

### U3. Production Telemetry Export and Anonymisation

- Created `scripts/export-grammar-qg-events.mjs`
- HMAC-SHA-256 hashing with external salt file (truncated 16 hex chars)
- **P0 security fix**: scrubs raw learnerId from `event.id` field (production format)
- Filters by subject, release ID (≥ P6), date range, template/concept
- Dry-run mode outputs summary without writing files
- Exports both raw filtered events and expanded canonical rows
- `.gitignore` entries for `*.salt`, `salt.txt`, `.hmac-salt`

### U4. Calibration Report Runner

- Created `scripts/grammar-qg-calibrate.mjs`
- Normalises numeric `createdAt` (production epoch ms) to ISO string for sub-reports
- Orchestrates: health report → mixed-transfer calibration → retention report → cross-report classifications
- Cross-report classifications:
  - `transfer_gap`: local success >70% AND mixed-transfer <50% AND ≥10 attempts in EACH modality
  - `retention_gap`: secure concepts lapse >25% with ≥30 secured attempts
- New metrics:
  - `weakCorrectAttemptRate`: correct / total attempts where `conceptStatusBefore === 'weak'`
  - `weakToSecureRecoveryRate`: status transition weak→secure(d) / total weak attempts
- Provenance metadata with `calibrationSchemaVersion: 'grammar-qg-p7-calibration-v1'`
- npm script: `grammar:qg:calibrate`

### U5. Evidence-Led Action Candidate Generation

- Created `scripts/grammar-qg-action-candidates.mjs`
- 9-category classification: keep, warm_up_only, review_wording, add_bridge_practice, expand_case_bank, rewrite_distractors, reduce_scheduler_weight, retire_candidate, increase_maintenance
- Confidence threshold: non-keep requires ≥30 attempts (otherwise → `insufficient_data`)
- Each candidate includes: category, confidence level, evidence count, human-readable rationale, source metrics
- No mastery-write/reward/Star imports (verified by grep in tests)
- **Candidates are report-only — never auto-actioned in P7**

### U6. Mixed-Transfer Evidence Decision Gate

- Created `scripts/grammar-qg-mixed-transfer-decision.mjs`
- Decision logic: ≥6/8 templates at medium (≥30) AND ≥3 at high (≥100) → `prepare_scoring_experiment`
- Harm detection: if mixed-transfer success significantly lower than local → `do_not_promote`
- Otherwise → `keep_shadow_only`
- Output includes per-template evidence and `futureActionRef`

### U7. Retention-After-Secure Maintenance Decision Gate

- Created `scripts/grammar-qg-retention-decision.mjs`
- Decision logic: average lapse rate >20% with ≥30 secured attempts → `recommend_maintenance_experiment`
- Low lapse rate (<10%) → `no_action_needed`
- Insufficient data → `defer_insufficient_data`
- Template-family lapse clustering identifies concentrated failure patterns
- Output includes per-concept evidence and family breakdown

### U8. Adult-Facing Calibration Panel

- Created `src/subjects/grammar/components/GrammarCalibrationPanel.jsx`
- Created `src/subjects/grammar/calibration-view-model.js` (pure data transform)
- Created `src/subjects/grammar/components/GrammarCalibrationPanel.css`
- Uses `AdminPanelFrame` wrapper — admin/internal only
- Six display sections: header, template health, action candidates, mixed-transfer, retention, confidence warnings
- No answer keys, no raw learner identifiers in rendered output
- Graceful empty state: "No calibration data available"

### U9. Post-Deploy Smoke Evidence and Final Gate

- Finalised `verify:grammar-qg-p7` with all 7 P7 test files
- Smoke evidence schema enforcement: `ok`, `origin`, `contentReleaseId`, `commitSha`, `timestamp`
- P7 completion report structure validation (analytics_schema_version, no content bump)
- Content release ID confirmed unchanged at `grammar-qg-p6-2026-04-29`

---

## 4. Verification Summary

| Gate | Tests | Pass | Fail |
|---|---:|---:|---:|
| `verify:grammar-qg` (P5 baseline) | 132 | 132 | 0 |
| `verify:grammar-qg-p6` (P6 chain) | 199 | 199 | 0 |
| `verify:grammar-qg-p7` (P7 chain) | 184 | 184 | 0 |
| **Total unique P7 tests** | **184** | **184** | **0** |

### P7 Test Files

| File | Tests | Purpose |
|---|---:|---|
| grammar-qg-p7-governance.test.js | ~20 | Placeholder rejection, report validation, completion structure |
| grammar-qg-p7-elapsed-timing.test.js | ~15 | Timing plumbing, boundary validation, read model redaction |
| grammar-qg-p7-event-expansion.test.js | ~18 | Multi-concept expansion, determinism, row shape contract |
| grammar-qg-p7-health-report.test.js | ~20 | Calibration runner, transfer_gap, retention_gap, weak metrics |
| grammar-qg-p7-action-candidates.test.js | ~32 | 9 categories, confidence threshold, decision gates |
| grammar-qg-p7-production-evidence.test.js | ~21 | HMAC anonymisation, event.id scrubbing, smoke schema |
| grammar-qg-p7-analytics-view.test.js | ~49 | View model transforms, no-PII invariants, empty states |

---

## 5. Content Release and Analytics Schema

```text
Content release ID: grammar-qg-p6-2026-04-29
Content release ID changed: false
Analytics schema version: grammar-qg-p7-calibration-v1
Scoring or mastery change: false
```

P7 is entirely analytics-infrastructure work. No learner-facing content, template wording, feedback, marking behaviour, or scheduler semantics changed. The content release ID remains at P6's value.

---

## 6. Security and Privacy

### Measures taken

- **HMAC-SHA-256 anonymisation**: learner IDs hashed with external salt (never committed)
- **Event.id scrubbing**: raw learnerId stripped from production-format event identifiers (P0 security finding caught during review, fixed pre-merge)
- **Salt file protection**: `.gitignore` entries for `*.salt`, `salt.txt`, `.hmac-salt`
- **No PII in reports**: health/calibration/action-candidate reports contain only template/concept IDs and aggregate metrics
- **Read model redaction preserved**: `safeRecentAttempt()` continues to strip all P6/P7 calibration fields from learner-facing output
- **Admin-only panel**: GrammarCalibrationPanel uses AdminPanelFrame access gate

### Residual risks

- HMAC truncated to 64 bits (16 hex); sufficient for <100k learner population given salt secrecy
- Export summary exposes `uniqueLearnerCount`; policy: do not share exports with count <5
- `requestId` and session metadata not anonymised (operational correlation risk if combined with server logs)

---

## 7. Decisions Made

| Decision | Rationale |
|---|---|
| Analytics schema version instead of content release bump | P7 adds no learner-facing content changes |
| Event expansion as offline script, not runtime transform | Zero overhead on the production request path |
| Client timing via payload extension, not new command | Minimal API surface change; backward-compatible |
| Transfer-gap requires ≥10 attempts in both modalities | Prevents false positives with zero mixed-transfer data |
| Numeric createdAt → ISO string normalisation | Production D1 stores epoch ms; sub-reports validate string timestamp |
| Action candidates report-only, never auto-actioned | P6 precedent: "recommendations never auto-actioned in the same phase" |
| Mixed-transfer decision references "separate future plan" | Scoring experiments require independent reviewed plans |

---

## 8. Review Findings Addressed

### Wave 1 (PR #578)
- Added 180000ms boundary test (off-by-one protection)
- Added placeholder rejection tests for `implementation_prs` array items
- Added expanded row shape contract test (health-report consumer compatibility)
- Added `bucketElapsedMs` NaN/Infinity guard for direct callers

### Wave 2 (PR #586)
- **P0 SECURITY**: Scrubbed learner ID from `event.id` field (production format leak)
- **CRITICAL**: Fixed numeric `createdAt` → ISO string normalisation (production events were all-skipped)
- **MEDIUM**: Added ≥10 attempt threshold for transfer_gap (false positive prevention)
- Added `.gitignore` entries for salt files
- Added production-format event.id test

### Wave 3 (PR #588)
- No blockers found (clean pass)

---

## 9. Production Telemetry Source Status

| Source | Status |
|---|---|
| Fixture-only | ✅ Implemented and tested |
| Staging | Not available (no staging environment) |
| Production | Ready — export script functional, awaiting post-deploy execution |

The calibration pipeline is verified against synthetic fixtures. Real production calibration conclusions require post-deploy execution of the export+calibrate pipeline against live D1 event data.

---

## 10. Production Calibration Conclusions

**No real production calibration conclusions were made in P7.**

P7 delivers the infrastructure to run production calibration. Actual findings require:
1. Deployment to production
2. Running `scripts/export-grammar-qg-events.mjs` against D1 event log
3. Running `npm run grammar:qg:calibrate` against exported data
4. Reviewing generated action candidates and decision gate outputs

---

## 11. Post-Deploy Smoke Status

```text
Repository smoke: passing (verify:grammar-qg-p7 — 184/184)
Post-deploy smoke: not-run
Evidence path: reports/grammar/grammar-production-smoke-grammar-qg-p6-2026-04-29.json
```

Post-deploy smoke requires deployment to production Worker. When run, evidence artefact will be written to the canonical path.

---

## 12. Action Candidates Produced

No action candidates generated from production data in P7 (fixture-only pipeline). The infrastructure is ready to produce candidates across 9 categories:

| Category | Trigger |
|---|---|
| `keep` | Healthy and stable |
| `warm_up_only` | Too easy, >95% success, high confidence |
| `review_wording` | Ambiguous or high wrongAfterSupportRate |
| `add_bridge_practice` | Transfer gap (local healthy, mixed weak) |
| `expand_case_bank` | High retry rate or timing collapse |
| `rewrite_distractors` | Support-dependent classification |
| `reduce_scheduler_weight` | Too hard, high confidence |
| `retire_candidate` | Persistently poor, >100 attempts |
| `increase_maintenance` | Retention gap after secure |

---

## 13. Remaining Risks

| Risk | Status | Mitigation |
|---|---|---|
| Insufficient production data for meaningful conclusions | Expected | Reports output `insufficient_data` rather than overclaiming |
| Client timing spoofable | Accepted | Never used for scoring; analytics-only |
| Salt file accidentally committed | Mitigated | .gitignore entries added |
| Admin panel data exposure | Mitigated | AdminPanelFrame gate, no answer keys, no raw learner IDs |
| D1 export may require schema migration | Deferred | Script works from fixture; D1 migration deferred unless necessary |

---

## 14. P8 Recommendations

P8 should be **evidence-led content and scheduler adjustment**, conditional on P7 production findings:

1. **Run production calibration** — Execute the P7 pipeline against live data. Measure confidence levels across templates and concepts.

2. **Act on high-confidence action candidates** — If production data yields high-confidence retire/reclassify/bridge candidates, implement them as reviewed content changes (bumping the content release ID).

3. **Evaluate mixed-transfer decision** — If the maturity gate outputs `prepare_scoring_experiment`, design a separate reviewed scoring plan for mixed-transfer weight promotion.

4. **Evaluate retention maintenance** — If the maintenance gate recommends an experiment, design scheduler adjustments with frozen baselines and monotonicity proofs.

5. **Build durable admin dashboard** — If script reports prove useful in production, consider integrating the GrammarCalibrationPanel into the admin hub's live data pipeline.

6. **Expand elapsed timing analysis** — With real bucketed timing data, identify templates where learners consistently take >20s (potential difficulty or UX issues).

7. **Cross-subject calibration** — Consider applying the P7 pipeline pattern to Punctuation QG (which has a parallel analytics maturity path).

---

## 15. Files Created or Modified

### Created (16 files)

| File | Purpose |
|---|---|
| `scripts/capture-verification-summary.mjs` | Machine-derived test count artefact |
| `scripts/export-grammar-qg-events.mjs` | Production event export with anonymisation |
| `scripts/grammar-qg-calibrate.mjs` | Calibration report orchestrator |
| `scripts/grammar-qg-action-candidates.mjs` | 9-category action candidate generator |
| `scripts/grammar-qg-mixed-transfer-decision.mjs` | Mixed-transfer maturity gate |
| `scripts/grammar-qg-retention-decision.mjs` | Retention maintenance gate |
| `src/subjects/grammar/calibration-view-model.js` | Pure data transform for admin panel |
| `src/subjects/grammar/components/GrammarCalibrationPanel.jsx` | Admin calibration UI |
| `src/subjects/grammar/components/GrammarCalibrationPanel.css` | Panel styles |
| `tests/grammar-qg-p7-governance.test.js` | Governance validation tests |
| `tests/grammar-qg-p7-elapsed-timing.test.js` | Timing plumbing tests |
| `tests/grammar-qg-p7-event-expansion.test.js` | Expansion pipeline tests |
| `tests/grammar-qg-p7-health-report.test.js` | Calibration runner tests |
| `tests/grammar-qg-p7-action-candidates.test.js` | Action candidate + decision gate tests |
| `tests/grammar-qg-p7-production-evidence.test.js` | Export + anonymisation tests |
| `tests/grammar-qg-p7-analytics-view.test.js` | View model tests |

### Modified (4 files)

| File | Change |
|---|---|
| `scripts/validate-grammar-qg-completion-report.mjs` | Placeholder token rejection |
| `worker/src/subjects/grammar/engine.js` | clientElapsedMs parameter + NaN guard |
| `worker/src/subjects/grammar/commands.js` | Extract clientElapsedMs from payload |
| `package.json` | verify:grammar-qg-p7 + grammar:qg:calibrate scripts |

---

## 16. Implementation PRs

| Wave | PR | Scope |
|---|---|---|
| 1 | [#578](https://github.com/fol2/ks2-mastery/pull/578) | U0+U1+U2: Governance, timing, expansion |
| 2 | [#586](https://github.com/fol2/ks2-mastery/pull/586) | U3+U4: Export, calibration runner |
| 3 | [#588](https://github.com/fol2/ks2-mastery/pull/588) | U5+U6+U7: Action candidates, decision gates |
| 4 | [#590](https://github.com/fol2/ks2-mastery/pull/590) | U8: Calibration panel |
| 5 | [#592](https://github.com/fol2/ks2-mastery/pull/592) | U9: Smoke evidence, final gate |

---

## 17. Definition of Done Checklist

- [x] P6 governance gaps closed (placeholder rejection, canonical paths, machine-derived counts)
- [x] Client elapsed timing safely bucketed (null fallback for invalid/missing)
- [x] Raw Grammar events expandable to canonical per-concept rows
- [x] Health, mixed-transfer, and retention reports run from canonical rows
- [x] Action candidates generated with confidence thresholds
- [x] No reward/mastery/Star/Mega/monster semantics changed
- [x] Post-deploy smoke explicitly marked not-run (awaiting deployment)
- [x] Final report validated against live audit output and evidence artefacts
- [x] P6 backward-compatibility: 199/199 pass
- [x] P7 test gate: 184/184 pass
- [x] Zero content release ID change (analytics-only phase)
