---
title: "feat: Grammar QG P6 — Learner Calibration and Telemetry"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p6.md
---

# feat: Grammar QG P6 — Learner Calibration and Telemetry

## Overview

Move the Grammar question generator programme from **release correctness** (P1–P5) into **learner calibration**. Add learner-safe telemetry, template health aggregation, mixed-transfer shadow analysis, retention-after-secure monitoring, and P5 content advisory fixes. No change to reward, Star, Mega, monster, Concordium, or mastery semantics.

---

## Problem Frame

P1–P5 delivered a deterministic, audited, machine-verifiable content release pipeline. The 78-template corpus is correct by construction. But correctness does not prove pedagogical effectiveness — the programme cannot yet answer: "Which templates are helping learners? Which are too easy, ambiguous, or support-dependent? Does secure knowledge persist?"

P6 introduces the calibration loop: telemetry → aggregation → health classification → triage recommendations. All analytics-only — no scoring mutations.

(see origin: `docs/plans/james/grammar/questions-generator/grammar-qg-p6.md`)

---

## Requirements Trace

- R1. Close P5 governance gaps (strict-tag predicate, real report validation, metadata conventions)
- R2. Add learner-safe telemetry schema for template/concept calibration without leaking answer keys
- R3. Build template and concept health aggregation with configurable time windows
- R4. Add mixed-transfer shadow calibration (analytics-only, no scoring changes)
- R5. Add retention-after-secure and post-Mega monitoring
- R6. Clear all 27 P5 content-quality advisories to zero
- R7. Harden reviewer sample-pack for human QA usability
- R8. Introduce template triage classification and recommendation output
- R9. Produce machine-verifiable P6 final report with distinct commit metadata fields
- R10. Preserve existing denominator (78 templates, 18 concepts) and all scoring/mastery semantics unchanged

---

## Scope Boundaries

- No new template IDs unless a deliberate content correction forces a bump
- No AI-generated questions or AI-marked free writing
- No change to Star, Mega, monster, Concordium, reward, or mastery thresholds
- No learner-facing exposure of telemetry data, answer keys, or internal classifications
- No seventh subject, Hero Mode dependency, or cross-subject reward dependency
- No production scoring mutations from calibration data — shadow mode only
- No learner-facing demotion copy or secure-status revocation

### Deferred to Follow-Up Work

- P7: Acting on triage recommendations (retiring/expanding templates based on evidence)
- P7: Promoting mixed-transfer shadow weights to production scoring (pending P6 evidence)
- P7: UI dashboard for calibration data (P6 produces script-generated reports)
- P7: Cross-concept pair-weakness targeting from mixed-transfer miss patterns

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/engine.js` — emits structured events with `templateId`, `variantSignature`, `generatorFamilyId`, `supportLevel`, `score`, `correct`, `mode` (lines 1670–1700)
- `worker/src/subjects/grammar/content.js` — `GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p5-2026-04-28'` (line 7961), `GRAMMAR_TEMPLATE_METADATA` frozen array
- `scripts/audit-grammar-question-generator.mjs` — `buildSignatureAudit()` strict-tag check at line 100 (hard-codes `qg-p1`, `qg-p3`, `qg-p4` — misses `qg-p5`)
- `scripts/validate-grammar-qg-completion-report.mjs` — validates denominator tables against live audit, currently only used by test with mock report paths
- `scripts/generate-grammar-review-pack.mjs` — `stripHtml()` at line 43 collapses whitespace without paragraph-break preservation
- `scripts/audit-grammar-content-quality.mjs` — hard-fail + advisory audit, advisory rule 8 checks mixed-transfer feedback mentions both concepts
- `tests/grammar-qg-p5-depth.test.js`, `tests/grammar-qg-p5-content-quality.test.js`, `tests/grammar-qg-p5-report-validation.test.js` — P5 test suite
- `worker/src/subjects/grammar/read-models.js` — `buildGrammarReadModel()` redacts server-private keys

### Institutional Learnings

- **Machine-verifiable release process** (`docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md`): One-command release gate, deep-seed expansion, frozen fixture strategy
- **pickBySeed modulo pattern** (`docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md`): Use modulo not PRNG for small banks
- **D1 atomicity** (memory): `batch()` not `withTransaction` — the latter is a production no-op
- **D1 tail latency** (`docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md`): P95/P50 ratio ~4.2x is platform-level; design telemetry writes to tolerate burst latency
- **Grammar P7 deterministic event IDs** (`docs/solutions/architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md`): Replace `Date.now()` with `requestId + computedStars` for replay idempotency

---

## Key Technical Decisions

- **Telemetry as event enrichment, not new pipeline**: Extend the existing `grammar.answer-submitted` event payload with additional calibration fields (elapsedMsBucket, wasRetry, conceptStatusBefore/After). No separate telemetry pipeline — consumers read the same event stream
- **Aggregation as script-generated reports, not UI**: Health reports are `node scripts/` outputs producing JSON/Markdown in `reports/grammar/`. Adult-facing dashboard deferred to P7
- **Shadow mode via report columns, not code branches**: Mixed-transfer calibration computes `suggestedEvidenceWeight` in the health report, never writes to mastery state
- **Future-proof strict-tag predicate**: Replace hard-coded tag list with `/^qg-p\d+$/` regex match so future phases never repeat the P5 oversight
- **Content release ID bumps only for learner-facing content changes**: Telemetry schema additions, report scripts, and validation logic do not bump the release ID. Feedback wording fixes (U5) DO bump it
- **Elapsed-time bucketing, not raw milliseconds**: Privacy-safe timing via 5 buckets (`<2s`, `2-5s`, `5-10s`, `10-20s`, `>20s`) — no raw timing in aggregates

---

## Open Questions

### Resolved During Planning

- **Where do telemetry aggregates live?** In script-generated report files (`reports/grammar/`) and optionally in D1 for cross-session queries. P6 starts with script-only; D1 aggregation table is optional stretch
- **Does feedback wording change need a content release bump?** Yes — learner-facing content change requires bump to `grammar-qg-p6-YYYY-MM-DD`
- **Should mixed-transfer shadow weights be visible to adults?** Yes — in the internal health report only, not in learner-facing read models

### Deferred to Implementation

- Exact D1 table schema for persistent aggregation (depends on whether script-only approach is sufficient for P6)
- Precise elapsed-time bucket boundaries (finalised during U1 implementation against real timing distributions)
- Whether `conceptStatusBefore`/`After` can be computed cheaply inside the engine's existing submit flow or needs a pre-query

---

## Implementation Units

- U0. **P5 governance repair pre-flight**

**Goal:** Fix strict-tag audit gap, add real report file validation to release gate, improve completion report metadata conventions

**Requirements:** R1, R9

**Dependencies:** None

**Files:**
- Modify: `scripts/audit-grammar-question-generator.mjs`
- Modify: `scripts/validate-grammar-qg-completion-report.mjs`
- Create: `tests/grammar-qg-p6-governance.test.js`

**Approach:**
- Replace line 100's hard-coded tag list with regex predicate: `(template.tags || []).some(tag => /^qg-p\d+$/.test(tag))`
- Add a test that generates a synthetic template with `qg-p99` tag and verifies it is treated as strict
- Extend `validate-grammar-qg-completion-report.mjs` to accept a real report path from CLI and validate against live audit output (not just test-internal mocks)
- Add report frontmatter convention requiring `implementation_prs`, `final_content_release_commit`, `post_merge_fix_commits`, `final_report_commit` as separate fields
- Add synthetic hard-fail test for content-quality rules (unknown misconception ID, duplicate options)

**Execution note:** Characterisation-first — snapshot current audit output before modifying the strict-tag predicate to prove no unintended regressions

**Patterns to follow:**
- `tests/grammar-qg-p5-depth.test.js` — existing P5 audit test pattern
- `tests/grammar-qg-p5-report-validation.test.js` — existing report validation pattern

**Test scenarios:**
- Happy path: `qg-p5` tagged template with repeated variants in seeds 1..3 is caught as strict failure (currently silently passed)
- Happy path: `qg-p6` or `qg-p99` tagged synthetic template treated as strict by the regex predicate
- Edge case: Template with tag `qg-p` (no digit) is NOT treated as strict
- Edge case: Template with tag `my-qg-p5-thing` (substring match risk) is NOT treated as strict
- Error path: Real report file claiming denominator mismatch with live audit is rejected
- Error path: Report claiming `post_deploy_smoke: passed` without evidence file is rejected
- Integration: `npm run verify:grammar-qg` passes with the updated predicate (no false positives from P1–P5 baselines)

**Verification:**
- `npm run verify:grammar-qg` passes (existing baselines unbroken)
- New test file passes with explicit strict-tag regression coverage

---

- U1. **Learner-safe telemetry schema**

**Goal:** Enrich the existing `grammar.answer-submitted` event with calibration-ready fields without leaking private data to learner-facing read models

**Requirements:** R2, R10

**Dependencies:** U0

**Files:**
- Modify: `worker/src/subjects/grammar/engine.js`
- Modify: `worker/src/subjects/grammar/read-models.js`
- Create: `tests/grammar-qg-p6-telemetry.test.js`

**Approach:**
- Add to the existing event payload (engine.js, ~line 1670–1700): `elapsedMsBucket`, `wasRetry`, `conceptStatusBefore`, `conceptStatusAfter`, `tags` (from template metadata), `answerSpecKind`, `sessionKind` (mode alias)
- `elapsedMsBucket` computed from `nowTs - sessionStartTs` with 5-tier bucketing
- `conceptStatusBefore` already partially available (engine pre-computes `statusesBefore` Map at line ~1714); carry it into the event
- `conceptStatusAfter` computed after mastery update (already computed at ~1714 for the `concept-secured` event)
- Verify the forbidden-key oracle test still passes — new fields must NOT appear in learner read models
- `manualReviewOnly` attempts emit telemetry with `nonScored: true` (already present) — test that they do not feed mastery aggregation

**Patterns to follow:**
- Existing `supportLevel`, `firstAttemptIndependent`, `supportUsed` fields added in P7 Grammar Phase 7 (same enrichment pattern)
- `tests/grammar-production-smoke.test.js` forbidden-key redaction assertion pattern

**Test scenarios:**
- Happy path: Event emitted from a scored attempt contains all new calibration fields with correct types
- Happy path: `elapsedMsBucket` maps 3.2 seconds to `'2-5s'` bucket
- Happy path: `conceptStatusBefore` is `'weak'` and `conceptStatusAfter` is `'due'` when learner answers correctly
- Edge case: First-ever attempt on a concept has `conceptStatusBefore: 'new'`
- Edge case: `manualReviewOnly` attempt carries `nonScored: true` and calibration fields but excludes from health scoring
- Error path: None of the new telemetry fields appear in `buildGrammarReadModel()` output — forbidden-key oracle catches leaks
- Integration: Engine test submitting an answer produces event with telemetry fields; read model built from same state has none of them

**Verification:**
- Existing `verify:grammar-qg` passes unchanged
- Forbidden-key oracle test explicitly covers new field names
- Engine test asserts event shape includes new fields

---

- U2. **Template and concept health aggregation script**

**Goal:** Produce a template/concept health report from telemetry events, identifying the worst-performing and best-performing templates by evidence strength

**Requirements:** R3, R8

**Dependencies:** U1

**Files:**
- Create: `scripts/grammar-qg-health-report.mjs`
- Create: `tests/grammar-qg-p6-health-report.test.js`

**Approach:**
- Script accepts a JSON event log (or reads from D1 export) and aggregates per-template and per-concept metrics over configurable windows (7d, 28d, 90d, all-time for current release)
- Template metrics: attempt count, independent first-attempt success rate, supported success rate, wrong-after-support rate, median elapsed bucket, retry success rate, partial-credit distribution, skip/empty-answer rate, repeat frequency, confidence delta
- Concept metrics: local-practice success rate, mixed-transfer success rate, explanation success rate, surgery/fix success rate, retained-after-secure pass rate, lapse-after-secure rate, weak-to-secure recovery rate, average templates contributing to secure evidence
- Output: JSON (machine-readable) + Markdown (human-readable) to `reports/grammar/grammar-qg-p6-health-report.{json,md}`
- Minimum sample-size threshold (configurable, default 10 attempts) before generating a classification
- Template triage classification logic: maps metric patterns to `healthy`, `too_easy`, `too_hard`, `ambiguous`, `support_dependent`, `retry_effective`, `retry_ineffective`, `transfer_gap`, `retention_gap`

**Patterns to follow:**
- `scripts/audit-grammar-question-generator.mjs` — script structure with `build*()` export pattern
- `scripts/audit-grammar-content-quality.mjs` — hard-fail + advisory output pattern

**Test scenarios:**
- Happy path: Given 50 synthetic events for a template with 90% independent success rate, classification is `healthy`
- Happy path: Template with 30% independent success rate and 80% supported rate classified as `support_dependent`
- Happy path: Concept with 95% local success and 40% mixed-transfer success shows `transfer_gap` signal
- Edge case: Template with only 5 attempts (below threshold) gets `insufficient_data` classification, not a false diagnosis
- Edge case: Window filter correctly excludes events outside the requested 7d/28d/90d window
- Error path: Malformed event (missing required field) is skipped with a warning count, not a crash
- Integration: Script produces valid JSON that can be parsed back and matches expected schema structure

**Verification:**
- Script runs deterministically on synthetic event fixtures and produces stable output
- Test file validates classification logic against known-distribution fixtures
- Output JSON validates against a declared schema

---

- U3. **Mixed-transfer shadow calibration**

**Goal:** Measure whether P4's 8 mixed-transfer templates behave as appropriate higher-order evidence or inflate concept nodes too quickly — analytics-only, no scoring changes

**Requirements:** R4, R10

**Dependencies:** U2

**Files:**
- Create: `scripts/grammar-qg-mixed-transfer-calibration.mjs`
- Create: `tests/grammar-qg-p6-mixed-transfer-calibration.test.js`

**Approach:**
- Filter telemetry to `tags.includes('mixed-transfer')` events
- Per mixed-transfer template, compute: success rate vs concept-local templates, support-level distribution, partial-credit distribution (multiField), concept propagation count (how many concept nodes improve from one attempt), local-secure-predicts-transfer correlation, local-retention-after-transfer correlation, pair-weakness patterns from misses
- Compute `suggestedEvidenceWeight`: `'none' | 'light' | 'normal' | 'strong'` with reason
- Shadow evidence model: `{ localPrerequisitesMet, transferCorrect, suggestedEvidenceWeight, reason }`
- Output to `reports/grammar/grammar-qg-p6-mixed-transfer-calibration.{json,md}`
- Final report must include recommendation for P7: keep / reduce / strengthen mixed-transfer mastery weight

**Patterns to follow:**
- `tests/grammar-qg-p4-mixed-transfer.test.js` — existing mixed-transfer selection tests
- U2 health report script structure

**Test scenarios:**
- Happy path: Template with 85% transfer success where both concepts are locally secure gets `suggestedEvidenceWeight: 'strong'`
- Happy path: Template with 40% transfer success where one concept is not locally secure gets `suggestedEvidenceWeight: 'none'` with reason `'not-secure-locally'`
- Edge case: Template with partial credit (multiField) — only full-credit attempts count as `transferCorrect: true`
- Edge case: Template where all concepts are secure but transfer fails consistently signals pair-weakness, not individual concept weakness
- Error path: No production mastery mutation code path exists in this module — assert that no import of mastery-write functions is present
- Integration: Script output includes a `recommendation` field with `keep` / `reduce` / `strengthen` and supporting evidence summary

**Verification:**
- Zero mastery-write imports in the calibration module
- Script produces coherent recommendations from synthetic fixtures
- Shadow model output shape validated by test

---

- U4. **Retention-after-secure and post-Mega monitoring**

**Goal:** Detect whether secured Grammar concepts remain stable over time, without revoking learner-facing status

**Requirements:** R5, R10

**Dependencies:** U2

**Files:**
- Create: `scripts/grammar-qg-retention-monitor.mjs`
- Create: `tests/grammar-qg-p6-retention.test.js`

**Approach:**
- Track concepts where `conceptStatusBefore === 'secured'` and measure: pass rate on due-check attempts, days from secure to first lapse, post-Mega maintenance attempt outcomes, whether mixed-review protects better than local repetition
- Report: list secure concepts due for maintenance, retention pass rate by concept and question type, lapse-after-secure rate, mixed-review vs local-repetition comparison
- No learner-facing demotion — this is internal analytics only
- Output to `reports/grammar/grammar-qg-p6-retention.{json,md}`

**Patterns to follow:**
- U2 and U3 script structure
- `shared/grammar/grammar-status.js` — concept status taxonomy

**Test scenarios:**
- Happy path: Concept secured 30 days ago with 5/5 due-check passes shows `retained: true, retentionRate: 1.0`
- Happy path: Concept secured 14 days ago with 1/4 due-check passes shows `retentionRate: 0.25, lapsed: true`
- Edge case: Concept with zero post-secure attempts gets `insufficient_data`, not a false lapse signal
- Edge case: Post-Mega attempts are tracked separately from pre-Mega retention
- Error path: Module does not import or call any mastery-write or Star-write functions
- Integration: Report correctly separates mixed-review evidence from local-repetition evidence

**Verification:**
- No mastery/reward/Star writes in this module
- No learner-facing demotion copy produced
- Script output matches expected schema on synthetic fixtures

---

- U5. **Resolve P5 content-quality advisories**

**Goal:** Clear all 27 advisories to zero — 3 reversed-curly-quote fixes and 24 mixed-transfer feedback rewrites

**Requirements:** R6, R10

**Dependencies:** U0 (governance repair ensures audit catches issues)

**Files:**
- Modify: `worker/src/subjects/grammar/content.js`

**Approach:**
- Fix 3 reversed-curly-quote advisories in `proc2_modal_choice` template (line ~3392)
- Rewrite feedback for all 8 P4 mixed-transfer templates (tagged `["qg-p4", "mixed-transfer"]` at lines ~5140–5266) so each seed's feedback explicitly names both/all grammar concepts involved
- Feedback must be child-friendly, concise, and specific — name the actual concepts (e.g. "direct speech punctuation and sentence function") not generic "both grammar concepts"
- Bump `GRAMMAR_CONTENT_RELEASE_ID` to `'grammar-qg-p6-YYYY-MM-DD'` since learner-facing content changes
- Regenerate the P6 baseline fixtures after content changes
- Verify: `buildGrammarContentQualityAudit(seeds)` returns 0 hard failures AND 0 advisories

**Execution note:** Run `npm run audit:grammar-qg:deep` before AND after changes to prove advisory count drops from 27 to 0 without introducing new issues

**Patterns to follow:**
- Existing mixed-transfer template feedback format in content.js (~lines 5140–5266)
- P6 origin document example: "This uses direct speech punctuation and sentence function together..."

**Test scenarios:**
- Happy path: `audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10` returns 0 hard failures and 0 advisories
- Happy path: Each mixed-transfer template's feedback for seed 1 names both specific grammar concepts
- Edge case: Curly quote fix does not change the template's `variantSignature` (only cosmetic fix to non-prompt text)
- Edge case: Feedback wording change does not alter `evaluate()` marking logic or score outcomes
- Integration: P5 denominator (78 templates, 18 concepts, 52 generated, etc.) remains unchanged in audit output except for content release ID

**Verification:**
- `npm run audit:grammar-qg:deep` reports 0 advisories
- Denominator assertions in `tests/grammar-question-generator-audit.test.js` still pass (after fixture update for new release ID)
- No scoring behaviour changes detected

---

- U6. **Reviewer sample-pack hardening**

**Goal:** Make the review pack a reliable human QA artefact with readable formatting and filtering options

**Requirements:** R7

**Dependencies:** U5 (needs clean content for regeneration)

**Files:**
- Modify: `scripts/generate-grammar-review-pack.mjs`
- Modify or create: `tests/grammar-qg-p6-review-pack.test.js`

**Approach:**
- Fix `stripHtml()` to preserve paragraph breaks (`<p>`, `<br>`, `<div>`) as newlines before stripping remaining tags
- Add whitespace/newline between instruction text and sentence/input description in prompt rendering
- Add CLI options: `--family=<id>`, `--template=<id>`, `--max-samples=<N>`, `--seed-window=<start>-<end>`
- Add a summary table at the top: family, template, concept, answerSpec kind, unique variants, advisory count
- Add deterministic naming: output file includes content release ID and commit SHA
- Add a test that verifies prompt sections do not contain answer keys (golden, nearMiss, accepted values)

**Patterns to follow:**
- Existing `generate-grammar-review-pack.mjs` structure (buildFamilies → generateFamilyData → render)
- `scripts/audit-grammar-question-generator.mjs` CLI argument parsing pattern

**Test scenarios:**
- Happy path: Generated review pack for family `qg_active_passive_rewrite` shows readable prompts with proper spacing between instruction and sentence
- Happy path: `--max-samples=3` limits each family to 3 sample prompts
- Happy path: Summary table includes correct unique variant count matching the depth audit
- Edge case: Template with HTML `<p>` tags in stemHtml renders as paragraph breaks, not concatenated text
- Error path: No answer-key values (from `answerSpec.golden`, `answerSpec.nearMiss`, `answerSpec.accepted`) appear in the prompt section — only in the answer appendix
- Integration: Generated review pack is deterministic — same commit + seed window produces byte-identical output

**Verification:**
- Review pack renders readable prompts verified by test assertion
- Answer-key confinement test passes
- `--family` filter produces subset output that is valid Markdown

---

- U7. **Template triage recommendations**

**Goal:** Output structured recommendations mapping each template to a health classification with evidence strength and confidence

**Requirements:** R8

**Dependencies:** U2, U3, U4

**Files:**
- Modify: `scripts/grammar-qg-health-report.mjs` (extend with triage output section)
- Modify: `tests/grammar-qg-p6-health-report.test.js` (extend with triage tests)

**Approach:**
- Triage classifications: `healthy`, `too_easy`, `too_hard`, `ambiguous`, `support_dependent`, `retry_effective`, `retry_ineffective`, `transfer_gap`, `retention_gap`
- Classification rules based on metric thresholds (configurable): e.g. `too_easy` = independent success > 95% AND median elapsed bucket `<2s`; `support_dependent` = supported success > 80% AND independent success < 50%
- Output top 10 recommendations ranked by evidence strength (sample size × classification severity)
- Include confidence level per recommendation: `high` (>100 attempts), `medium` (30-100), `low` (10-30)
- No template retirement in P6 — recommendations only

**Patterns to follow:**
- U2 health report classification logic (extend, not duplicate)
- Content-quality audit advisory pattern (classify, report, do not auto-fix)

**Test scenarios:**
- Happy path: Synthetic fixture with 200 attempts at 98% success and <2s timing classified as `too_easy` with `high` confidence
- Happy path: Template with 50 attempts at 25% independent success classified as `too_hard` with `medium` confidence
- Happy path: Top 10 sorted by evidence strength (not alphabetical)
- Edge case: Template meeting two classifications simultaneously picks the more severe one
- Edge case: Template with <10 attempts excluded from recommendations entirely
- Integration: Triage output integrates cleanly with the health report JSON structure (same file, additional section)

**Verification:**
- Recommendations include sample size and confidence level
- No auto-retirement code paths exist
- Triage output validates against expected schema

---

- U8. **P6 final report and release gate**

**Goal:** Produce a machine-verifiable P6 completion report with proper metadata conventions and extend the release gate

**Requirements:** R9, R10

**Dependencies:** U0–U7

**Files:**
- Create: `docs/plans/james/grammar/questions-generator/grammar-qg-p6-final-completion-report-YYYY-MM-DD.md`
- Modify: `package.json` (extend or add `verify:grammar-qg-p6` script)
- Create: `tests/grammar-qg-p6-baseline.json` fixture (oracle)
- Create: `tests/fixtures/grammar-functionality-completeness/grammar-qg-p6-baseline.json`
- Create: `tests/fixtures/grammar-legacy-oracle/grammar-qg-p6-baseline.json`

**Approach:**
- Final report includes: shipped denominator, validation command output, content-quality audit output, real report validator output, production smoke status with evidence distinction, telemetry schema shipped, template health report sample, mixed-transfer calibration findings, retention findings, remaining risks, explicit unchanged semantics statement
- Frontmatter: `contentReleaseId`, `implementation_prs`, `final_content_release_commit`, `post_merge_fix_commits`, `final_report_commit`, `post_deploy_smoke`, `post_deploy_smoke_evidence`
- Extend `verify:grammar-qg` or add `verify:grammar-qg-p6` to include new test files: `grammar-qg-p6-governance.test.js`, `grammar-qg-p6-telemetry.test.js`, `grammar-qg-p6-health-report.test.js`, `grammar-qg-p6-mixed-transfer-calibration.test.js`, `grammar-qg-p6-retention.test.js`, `grammar-qg-p6-review-pack.test.js`
- Freeze P6 baseline fixtures from live audit output

**Patterns to follow:**
- `docs/plans/james/grammar/questions-generator/grammar-qg-p5-final-completion-report-2026-04-28.md` — report structure
- Frozen fixture strategy from P1–P5 (each release gets its own baseline pair)

**Test scenarios:**
- Happy path: `validate-grammar-qg-completion-report.mjs` applied to the P6 report file passes all assertions
- Happy path: All denominator values in the report match live `buildGrammarQuestionGeneratorAudit()` output
- Edge case: Report claiming `post_deploy_smoke: passed` without matching evidence file is rejected
- Edge case: Report omitting `post_merge_fix_commits` field when there are none is valid (field can be empty array)
- Integration: Full `verify:grammar-qg-p6` gate passes end-to-end covering all P6 test files

**Verification:**
- `npm run verify:grammar-qg-p6` passes
- P6 final report file passes machine validation
- Historical P1–P5 baselines remain frozen and untouched

---

## System-Wide Impact

- **Interaction graph:** Engine event payload enrichment (U1) is consumed by: (1) existing reward/Star pipeline (must ignore new fields gracefully), (2) new health aggregation scripts (U2–U4). No middleware changes
- **Error propagation:** Telemetry enrichment failures must not block the submit-answer flow — fail open with field omission, log warning
- **State lifecycle risks:** No new persistent state in D1 for P6 (script-generated reports only). If D1 aggregation table added as stretch, use `batch()` for writes
- **API surface parity:** Read-model redaction must cover all new telemetry field names — existing forbidden-key oracle pattern
- **Integration coverage:** The engine → read-model → client path must prove new fields are redacted. The engine → event → health-script path must prove fields are present
- **Unchanged invariants:** `buildGrammarReadModel()` output shape, `evaluateGrammarQuestion()` scoring logic, `updateNodeFromQuality()` mastery algorithm, Star/Mega/Concordium thresholds, reward event semantics — ALL unchanged

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Content release ID bump (U5) breaks existing session state | Engine already handles release-ID mismatch via session reset — tested in existing suite |
| Telemetry enrichment adds latency to submit path | New fields are pre-computed (statusBefore already exists) or trivial lookups (template metadata). No DB query added |
| Mixed-transfer feedback rewrite changes scoring | Feedback is post-evaluation text only — `evaluate()` functions are not modified. Verified by unchanged fixture comparison |
| Health report thresholds produce misleading classifications | Minimum sample-size gate (10 attempts). All classifications are recommendations, never auto-actions |
| P5 frozen baselines broken by strict-tag predicate change | Characterisation-first: snapshot before, assert equality after. The predicate change only promotes `legacyRepeatedGeneratedVariants` to `repeatedGeneratedVariants` for P5+ tags — P1/P3/P4 baselines unaffected |

---

## Sources & References

- **Origin document:** [Grammar QG P6 implementation brief](docs/plans/james/grammar/questions-generator/grammar-qg-p6.md)
- Related learning: `docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md`
- Related learning: `docs/solutions/architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md`
- Related learning: `docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md`
- P5 completion report: `docs/plans/james/grammar/questions-generator/grammar-qg-p5-final-completion-report-2026-04-28.md`
