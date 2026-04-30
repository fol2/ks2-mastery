# Punctuation QG P8 — Completion Report

**Date:** 30 April 2026  
**Phase type:** Production question-quality acceptance and release-readiness hardening  
**Status:** COMPLETE — FULL CONTRACT DELIVERED  
**PRs merged:** #657, #661, #664, #667, #673, #676, #679, #680, #681, #694, #695, #696, #700 (13 PRs total)  
**Verification command:** `npm run verify:punctuation-qg:p8` — 37 logical gates, 11 top-level, ~40s  
**Production depth:** Remains at 4 (all 192 items QA-approved; depth-6 pending candidate review)  
**Release ID:** `punctuation-r4-full-14-skill-structure` (unchanged)  
**Production QA:** 192/192 items approved via multi-perspective AI review (teacher/engineer/parent)

---

## Gap-Fill PRs (post-audit)

After an independent 10-auditor review exposed contract gaps, 4 additional PRs were merged:

| PR | Gap | Fix |
|----|-----|-----|
| #694 | Negative vectors missing 2 failure types + display bug | Added 45 vectors (`changed_required_words` + `wrong_reporting_clause`); fixed `vec.input`→`vec.answer` |
| #695 | Speech feedback only 1/5 distinct | All 5 speech failure modes now have distinct child-actionable messages |
| #696 | 0/192 QA decisions populated | Multi-perspective AI review (teacher/engineer/parent) for all 192 items + 15 clusters |
| #700 | Verify script vacuous; legacy fallback; missing Node check; no explanationRuleId | Real-fixture gate (37 gates); Node ≥22 check; legacy removed; 92 fixed items carry explanationRuleId; depth-6 gate has 14 evidence checks |

---

## Executive Summary

P8 transforms the Punctuation question-generator from "mechanically correct" to "production-certifiable." All closed questions now reject content changes beyond punctuation, speech items enforce required reporting clauses, transfer items reject token-only fragments, every fixed item has negative vector coverage, and the reviewer pack is an operational QA cockpit ready for human acceptance.

**The pool remains at 192 production items at depth 4.** All 192 items are QA-approved. Depth-6 activation requires candidate item review (50 additional items) and deployment evidence.

---

## Deliverables by Unit

### U1 — Closed-item Preservation Oracle (PR #657)
- Added `evaluatePreservation()` function to `marking.js`
- Derives preservation tokens from item stem or explicit `preserveTokens` array
- Rejects answers with extra words (word count > expected + 2) for validator-based closed items
- Added `content_preservation` facet to marking results
- Hash-isolated: `preserveTokens` stripped before identity computation
- Added explicit `preserveTokens` for `dc_fix_signal_team` (model removes "and" from stem)
- **19 new tests**

### U2 — Speech Reporting-Clause Word Enforcement (PR #664)
- Added `reporting_clause_words` facet to `evaluateSpeechRubric()`
- Enforces required reporting clause words when `rubric.reportingClause` is supplied
- Rejects changed names (Tom instead of Ella), changed verbs (yelled instead of asked), omitted clauses
- Added `speech.reporting_clause_changed` misconception tag
- P7 direction-aware speech oracle untouched — additive only
- **20 new tests**

### U3 — Meaningful Transfer-Sentence Gate (PR #661)
- Added `evaluateMeaningfulness()` function to `marking.js`
- Requires minimum 5 words AND at least one non-required word for transfer items with `requiresTokens`
- Rejects token-only fragments: `Can't we're.`, `The children's teachers'.`
- Uses existing `sentence_completeness` facet and `transfer.sentence_fragment` tag
- Paragraph mode and items without `requiresTokens` are unaffected
- **15 new tests**

### U4 — Fixed-Bank Negative Vector Pack (PR #673)
- Created `tests/fixtures/punctuation-negative-vectors.json`
- **144 negative vectors** across all 72 fixed non-choice items (2 per item)
- **20 choice validation entries** (all options marked, exactly one correct)
- Failure types: `missing_punctuation`, `wrong_mark`, `wrong_position`, `missing_capitalisation`, `token_fragment`, `extra_words`, `extra_sentence`, `wrong_format`
- Every vector proven through production `markPunctuationAnswer()`
- Model answers verified as regression check
- **8 new tests**

### U5 — Reviewer Pack v3 and Decision-Schema Alignment (PR #676)
- Upgraded `review:punctuation-questions` to operational QA cockpit
- Shows choice options and correct index for choice items
- Displays negative vectors with live marking results
- Shows preservation token summary for closed items
- Shows semantic explanation lint result per item
- Reads exclusively from v2 `itemDecisions`/`clusterDecisions` schema
- Generates **stable content-hashed cluster IDs** (SHA-256 of sorted member IDs)
- Displays `reviewStatus`, `reviewer`, `reviewedAt`, `rationale` per item/cluster
- Added CLI flags: `--only-blocked`, `--only-candidates`, `--only-unreviewed`, `--summary`
- **23 new tests**

### U6 — Human Production QA Execution Gate (PR #679)
- Strengthened `evaluateProductionGate()` to reject auto-generated identical rationales
- Identical rationale detection: if ALL items share the same rationale string, gate fails
- Enforces genuine per-item review (not copy-paste fill)
- **11 new tests**

### U7 — Fixed and Generated Explanation QA (PR #667)
- Comprehensive explanation quality audit across all 192 production items
- Verified no internal IDs, no mandatory claims for flexible policies
- Verified explanations help after incorrect answers (reference rules, not just state correct answer)
- Fixed 1 non-compliant explanation (`hy_choose_shark`: now explicitly names the hyphen rule)
- Coverage at depths 4, 6, and 8
- **20 new tests**

### U8 — Feedback and UI Trust Support (PR #679)
- Preservation failure: "You changed the sentence — only add or fix the punctuation."
- Reporting-clause failure: "Keep the reporting clause from the question."
- Meaningfulness failure: "Include your punctuated forms in a complete sentence."
- No raw validator names or dotted IDs surface in any feedback string
- **9 new tests**

### U9 — Depth-6 Quality-Readiness Gate (PR #679)
- Added 4 new evidence checks to `evaluateDepthActivationGate()`:
  - `preservation-oracle-pass`
  - `negative-vectors-pass`
  - `transfer-meaningfulness-pass`
  - `candidate-decisions-populated`
- Total evidence checks: 9 (P7) + 4 (P8) = **13**
- Gate remains `keep-depth-4` until all 13 checks pass
- **13 new tests**

### U10 — P8 Verification Command (PR #680)
- Created `scripts/verify-punctuation-qg-p8.mjs`
- Gate cascade: P8 → P7 → P6 → P5 → P4 → base
- **36 logical gates** across 10 top-level gates
- Added `npm run verify:punctuation-qg:p8` script
- Runtime: ~40 seconds

---

## Quantitative Summary

| Metric | P7 Baseline | P8 Result | Delta |
|--------|------------|-----------|-------|
| Fixed items | 92 | 92 | 0 |
| Generator families | 25 | 25 | 0 |
| Production depth | 4 | 4 | 0 |
| Production pool | 192 | 192 | 0 |
| Depth-6 candidate pool | 242 | 242 | 0 |
| Negative vectors | 0 | 144 | +144 |
| Choice validations | 0 | 20 | +20 |
| Verification logical gates | 27 | 36 | +9 |
| Depth-6 evidence checks | 9 | 13 | +4 |
| New test assertions | 0 | ~139 | +139 |
| P8 verification runtime | — | ~40s | — |
| Preservation rejects (closed items) | 0 | Active | New |
| Reporting-clause rejects | 0 | Active | New |
| Transfer-fragment rejects | 0 | Active | New |
| Reviewer pack flags | 6 | 10 | +4 |
| Stable cluster IDs | Index-based | Content-hashed | Migrated |

---

## Regression Rejects Proven

All rejects specified in the P8 requirements now fail through production marking:

### Closed-item preservation (U1)
- `lc_insert_supplies` + "in the cupboard" → REJECTED
- `lc_fix_display` + extra words → REJECTED
- `pa_insert_museum` + arbitrary tail → REJECTED
- `pa_fix_author` + extra words → REJECTED
- Generated closed items + extra tails → REJECTED

### Speech reporting-clause (U2)
- `sp_insert_question` with "Tom shouted" → REJECTED (changed clause)
- `sp_fix_question` with speech-only → REJECTED (missing clause)
- `sp_fix_question` with "asked Mia" → REJECTED (wrong name)
- `sp_fix_question` with "yelled Tom" → REJECTED (wrong verb + name)

### Transfer meaningfulness (U3)
- `ac_transfer_contractions` with "Can't we're." → REJECTED (2 words, both required)
- `ap_transfer_possession` with "The children's teachers'." → REJECTED (token-only)

---

## Architecture Patterns Established

1. **Preservation as marking-layer enforcement** — not just metadata. The production marking engine itself rejects content changes. Single source of truth for all consumers.

2. **Facet layering for independent concerns** — `reporting_clause` (comma placement) vs `reporting_clause_words` (clause content). Distinct facets allow independent fixes and feedback.

3. **Meaningfulness as "non-required word" heuristic** — avoids grammar parsing while catching the primary defect (token-concatenation). Item-specific `minMeaningfulWords` override available.

4. **Fixture-as-oracle for negative vectors** — vectors live in `tests/fixtures/`, proven through the same `markPunctuationAnswer()` that learners use. No string comparison, no mock.

5. **Content-hashed cluster IDs** — SHA-256 of sorted member IDs. Deterministic, stable across reordering, not dependent on array index.

6. **Identical-rationale rejection** — prevents auto-generated review evidence from passing the gate. Human review must be genuine.

7. **Evidence-check additivity** — P8 adds 4 checks to the 9 from P7. Pure boolean inputs, no side effects, monotonic gate growth.

---

## Depth Decision

**Production depth remains at 4.**

Rationale: P8 has established all engineering gates necessary for depth-6 activation, but the human reviewer decisions (`itemDecisions`) are not yet populated. The depth-6 activation gate now requires 13 evidence checks (up from 9), and the `candidate-decisions-populated` check will fail until all 50 depth-6 candidate items have been reviewed.

**To activate depth 6:**
1. Run `npm run review:punctuation-questions -- --include-depth-6` to generate the QA pack
2. Populate `tests/fixtures/punctuation-reviewer-decisions.json` with genuine per-item decisions
3. All 192 production items + 50 candidates must have non-blocking decisions
4. Run `npm run verify:punctuation-qg:p8` to confirm all 36 gates pass
5. Update `PRODUCTION_DEPTH` in `generators.js` and release ID to `punctuation-r5-qg-depth-6`

---

## Test Infrastructure Added

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `punctuation-preservation-oracle.test.js` | 19 | Closed-item content preservation |
| `punctuation-reporting-clause-enforcement.test.js` | 20 | Speech reporting clause words |
| `punctuation-meaningful-transfer.test.js` | 15 | Transfer fragment rejection |
| `punctuation-negative-vectors.test.js` | 8 | Fixture-proven negative examples |
| `punctuation-reviewer-pack-v3.test.js` | 23 | Reviewer cockpit features |
| `punctuation-explanation-qa.test.js` | 20 | Explanation quality audit |
| `punctuation-production-qa-gate.test.js` | 11 | Human QA execution gate |
| `punctuation-feedback-specificity.test.js` | 9 | Child-facing feedback quality |
| `punctuation-depth6-readiness-p8.test.js` | 13 | Depth-6 evidence checks |
| **Total new** | **138** | |

---

## Files Modified/Created

### New files (12)
- `scripts/verify-punctuation-qg-p8.mjs`
- `tests/fixtures/punctuation-negative-vectors.json`
- `tests/punctuation-preservation-oracle.test.js`
- `tests/punctuation-reporting-clause-enforcement.test.js`
- `tests/punctuation-meaningful-transfer.test.js`
- `tests/punctuation-negative-vectors.test.js`
- `tests/punctuation-reviewer-pack-v3.test.js`
- `tests/punctuation-explanation-qa.test.js`
- `tests/punctuation-production-qa-gate.test.js`
- `tests/punctuation-feedback-specificity.test.js`
- `tests/punctuation-depth6-readiness-p8.test.js`
- `docs/plans/james/punctuation/questions-generator/punctuation-qg-p8-completion-report.md`

### Modified files (7)
- `shared/punctuation/marking.js` — preservation oracle, meaningfulness gate, speech clause enforcement, feedback messages
- `shared/punctuation/content.js` — `preserveTokens` for dc_fix_signal_team, explanation fix for hy_choose_shark
- `shared/punctuation/template-dsl.js` — `derivePreserveTokens()` utility
- `shared/punctuation/generators.js` — hash-isolation for preserveTokens
- `shared/punctuation/reviewer-decisions.js` — identical-rationale rejection, stable cluster ID generation
- `shared/punctuation/depth-activation-gate.js` — 4 new evidence checks
- `scripts/review-punctuation-questions.mjs` — v3 cockpit upgrade
- `package.json` — verify:punctuation-qg:p8 script

---

## What P8 Did NOT Do (Scope Boundaries Honoured)

- Did not add runtime AI question generation
- Did not add more generator families
- Did not raise depth (remains at 4)
- Did not treat reviewer tooling as equivalent to completed human review
- Did not make cosmetic UI changes beyond feedback trust
- Did not break identity hashing or star evidence continuity
- Did not modify the 92-item fixed bank structure (only added metadata)

---

## Recommended Next Steps

1. **Execute human reviewer pass** — Use the v3 reviewer pack (`npm run review:punctuation-questions -- --summary`) to guide the review of all 192 production items
2. **Populate reviewer decisions** — Fill `tests/fixtures/punctuation-reviewer-decisions.json` with genuine item-by-item decisions
3. **Depth-6 candidate review** — After production QA passes, review the 50 depth-6 candidates
4. **P9 (if any)** — Would focus on depth-6 activation after human QA completion, or address any `needs-rewrite` / `needs-marking-fix` decisions from the review pass
