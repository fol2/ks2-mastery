---
title: "Grammar QG P4 final completion report"
type: final-completion-report
status: merged
date: 2026-04-28
subject: grammar
plan: docs/plans/2026-04-28-007-feat-grammar-qg-p4-depth-mixed-transfer-plan.md
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p4.md
previous_final_report: docs/plans/james/grammar/questions-generator/grammar-qg-p3-final-completion-report-2026-04-28.md
contentReleaseId: grammar-qg-p4-2026-04-28
implemented_pr: https://github.com/fol2/ks2-mastery/pull/536
implementation_merge_commit: 23ba928
implementation_branch: feat/grammar-qg-p4-depth-mixed-transfer
---

# Grammar QG P4 Final Completion Report

Date: 28 April 2026

Status: Completed, code-reviewed (correctness + testing reviewers), findings resolved, and merged to remote `main`.

Source plan: `docs/plans/2026-04-28-007-feat-grammar-qg-p4-depth-mixed-transfer-plan.md`

Origin spec: `docs/plans/james/grammar/questions-generator/grammar-qg-p4.md`

Implemented PR: [PR #536](https://github.com/fol2/ks2-mastery/pull/536) — `feat(grammar): QG P4 deterministic depth and mixed-transfer expansion`

Implementation merge commit: `23ba928`

---

## Executive Summary

Grammar QG P4 is complete. It landed the depth and transfer quality release promised after QG P3: explanation case banks are deeper, legacy repeated variants are eliminated from the default audit window, and learners can now practise cross-concept grammar transfer through eight deterministic mixed-transfer templates covering all 18 Grammar concepts.

This is a **quality release**, not a volume release. The headline claim:

> Grammar now has deterministic breadth, honest marking, full reasoning coverage, and a first layer of mixed-transfer practice, with generator-depth checks that make repeated surface variants visible before release.

The shipped content release is:

```text
Content release id:                      grammar-qg-p4-2026-04-28
Concepts:                                18
Templates:                               78
Selected-response templates:             58
Constructed-response templates:          20
Generated templates:                     52
Fixed templates:                         26
Answer-spec templates:                   47
Constructed-response answer-spec count:  20 / 20
Legacy constructed-response adapters:     0
Manual-review-only templates:             4
Explanation templates:                   17
Concepts with explanation coverage:      18 / 18
Mixed-transfer templates:                8
Concepts with mixed-transfer coverage:   18 / 18
Thin-pool concepts:                       0
Single-question-type concepts:            0
Invalid answer specs:                     0
Templates missing answer specs:           0
Legacy repeated variants (default):       0
Strict repeated variants:                 0
Cross-template signature collisions:      0
P4 mixed-transfer complete:              true
```

---

## Final Denominator Comparison

| Measure | QG P3 baseline | QG P4 final | Movement |
|---|---:|---:|---|
| Concepts | 18 | 18 | unchanged |
| Templates | 70 | 78 | +8 |
| Selected-response templates | 50 | 58 | +8 |
| Constructed-response templates | 20 | 20 | unchanged |
| Generated templates | 44 | 52 | +8 |
| Fixed templates | 26 | 26 | unchanged |
| Answer-spec templates | 39 | 47 | +8 |
| Constructed-response answer-spec templates | 20/20 | 20/20 | preserved |
| Legacy constructed-response adapters | 0 | 0 | preserved |
| Manual-review-only templates | 4 | 4 | preserved |
| Explanation templates | 17 | 17 | unchanged |
| Concepts with explanation coverage | 18/18 | 18/18 | preserved |
| Mixed-transfer templates | 0 | 8 | +8 |
| Concepts with mixed-transfer coverage | 0/18 | 18/18 | +18 concepts |
| Legacy repeated variants (default window) | 12 | 0 | -12 |
| Explanation min cases per family | 6 | 8 | +2 per family |

---

## What Shipped

### U1: P4 Audit Scaffold

Extended `scripts/audit-grammar-question-generator.mjs` with:
- `buildMixedTransferCoverage()` — counts templates tagged `mixed-transfer`, reports concept coverage and gaps.
- `buildCaseDepthAudit(seeds)` — counts unique variant signatures per generator family over configurable seed windows.
- `--deep` CLI flag — runs 30-seed depth analysis.
- P4 strict enforcement — templates tagged `qg-p4` now get zero-repeat enforcement (same as `qg-p1` and `qg-p3`).
- P4 baseline fixtures for both oracle and functionality-completeness test suites.

### U2: Explanation Case-Bank Expansion

Expanded 15 generative explanation families from ~6 cases to 8+ cases each:
- 13 `qg_p3_*_explain` families: each expanded from 6 to 8 cases (+26 new reviewed grammar scenarios)
- `qg_modal_verb_explain`: expanded from 3 to 8 cases (+5 new modal contexts: may, could, will, shall, could-for-possibility)
- `qg_hyphen_ambiguity_explain`: expanded from 3 to 8 cases (+5 new compound-modifier scenarios)
- `proc2_boundary_punctuation_explain`: already had 9 variants — no change needed
- `explain_reason_choice`: non-generative fixed template — excluded from scope

Created `tests/grammar-qg-p4-depth.test.js` with 20 assertions verifying 8+ unique variant signatures over seeds 1..13 for every explanation family.

### U3: Legacy Repeated-Variant Repair

Root cause identified: `mulberry32(seed)` first-call outputs for seeds 1, 2, 3 are 0.627, 0.734, 0.720 — when mapped via `Math.floor(val * N)` to array indices, all three collapse to the same index for any practical bank size.

Fix: Introduced `pickBySeed(seed, arr)` helper using `((seed - 1) % arr.length + arr.length) % arr.length` — guarantees distinct indices for consecutive seeds when bank size >= 3.

Repaired 7 families:

| Family | Previous bank size | New bank size | Seeds [1,2,3] now distinct |
|---|---:|---:|:---:|
| `proc_semicolon_choice` | 5 pairs | 7 pairs | yes |
| `proc_colon_list_fix` | 4 items | 6 items | yes |
| `proc_dash_boundary_fix` | 4 items | 6 items | yes |
| `proc_hyphen_ambiguity_choice` | 2 items | 4 items | yes |
| `proc2_modal_choice` | 4 frames | 6 frames | yes |
| `proc2_formality_choice` | 3 frames | 5 frames | yes |
| `proc3_clause_join_rewrite` | nested structure | 12 flat items | yes |

All new cases present materially different grammar scenarios — not just name substitutions.

### U4: Mixed-Transfer Template Implementation

Added 8 deterministic mixed-transfer templates with the `buildP4MixedTransferChoiceQuestion()` and `buildP4MixedTransferClassifyQuestion()` builders:

| Template | Concepts | Type | Cases |
|---|---|---|---:|
| `qg_p4_sentence_speech_transfer` | sentence_functions + speech_punctuation | choose/exact | 8 |
| `qg_p4_word_class_noun_phrase_transfer` | word_classes + noun_phrases | classify/multiField | 8 |
| `qg_p4_adverbial_clause_boundary_transfer` | adverbials + clauses + boundary_punctuation | choose/exact | 8 |
| `qg_p4_relative_parenthesis_transfer` | relative_clauses + parenthesis_commas | choose/exact | 8 |
| `qg_p4_verb_form_register_transfer` | tense_aspect + modal_verbs + standard_english | choose/exact | 8 |
| `qg_p4_cohesion_formality_transfer` | pronouns_cohesion + formality | choose/exact | 8 |
| `qg_p4_voice_roles_transfer` | active_passive + subject_object | classify/multiField | 8 |
| `qg_p4_possession_hyphen_clarity_transfer` | apostrophes_possession + hyphen_ambiguity | choose/exact | 8 |

Each template:
- Requires the learner to use both/all listed concepts to answer correctly
- Has `difficulty: 3`, `satsFriendly: true`, `tags: ['qg-p4', 'mixed-transfer']`
- Uses stable `generatorFamilyId` and deterministic variant signatures
- Provides grammar-specific feedback naming the transfer relationship
- Passes `validateAnswerSpec()` for every seed

### U5: Selection and Engine Regression

Added 9 regression tests proving:
- P4 mixed-transfer templates appear in practice queues when both concepts are active
- Focus mode on a single concept does not exclusively select multi-concept templates
- Variant freshness prevents same P4 template appearing twice in one queue
- Correct submissions score maxScore, incorrect score 0 with feedback
- MultiField classify templates mark each field independently
- Multi-concept mastery updates propagate to all concept nodes
- Internal fields (`generatorFamilyId`, `variantSignature`, `answerSpec`, `evaluate`) not exposed in serialised Worker output

### U6: Production-Smoke and Redaction Probes

Added 8 smoke/redaction tests:
- P4 choose template visible payload structure validation
- P4 classify template table_choice structure validation
- Deep recursive forbidden-key scan on all 8 P4 templates (pre-answer)
- Post-answer feedback leak check
- MultiField template does not leak correct field values before answering
- Hub read-model diagnostics include P4 template count

### U7: Release Bump and Final Fixtures

- Bumped `GRAMMAR_CONTENT_RELEASE_ID` to `grammar-qg-p4-2026-04-28`
- Regenerated P4 baseline fixtures (both oracle and functionality-completeness formats)
- Updated all test expectations to match the 78-template denominator
- Verified 413 grammar-related tests pass with 0 failures

---

## Code Review Findings and Resolution

Two material findings from code review, both resolved before merge:

### Finding 1 (HIGH): pickBySeed crashes with seed=0

**Root cause:** `(0 - 1) % arr.length` = `-1` in JavaScript (not wrapping like Python). `arr[-1]` = `undefined`.

**Impact:** Production fallback path sends seed=0 for corrupt/missing seeds via `Number(seed) || 0`.

**Resolution:** Applied double-modulo pattern: `((seed - 1) % arr.length + arr.length) % arr.length`. Added seed=0 boundary test.

### Finding 2 (MEDIUM): Content error — 'brightly-coloured'

**Root cause:** A case in `qg_p4_possession_hyphen_clarity_transfer` marked 'brightly-coloured' as requiring a hyphen. In UK English, -ly adverbs are never hyphenated before adjectives/participles — this is explicitly tested in KS2 SATs.

**Resolution:** Replaced with 'bright-orange' (genuine compound modifier). Verified against UK style guides and KS2 GPS marking scheme.

---

## Deep Seed Analysis

The `--deep` flag (seeds 1..30) reveals these families have fewer than 8 unique prompts over 30 seeds. This is expected — they were not P4 repair targets — and is now visible via audit tooling:

| Family | Unique prompts / 30 seeds | Note |
|---|---:|---|
| `qg_active_passive_choice` | 3 | Legacy pre-P1 template, small fixed bank |
| `qg_formality_classify_table` | 3 | Legacy pre-P1 template |
| `qg_pronoun_referent_identify` | 3 | Legacy pre-P1 template |
| `proc_hyphen_ambiguity_choice` | 4 | Repaired in P4 (was 2→4); still finite |
| `proc3_hyphen_fix_meaning` | 4 | Legacy template |
| `proc3_parenthesis_commas_fix` | 4 | Legacy template |
| `proc2_formality_choice` | 5 | Repaired in P4 (was 3→5); still finite |
| `proc_colon_list_fix` | 6 | Repaired in P4 (was 4→6) |
| `proc_dash_boundary_fix` | 6 | Repaired in P4 (was 4→6) |
| `proc2_modal_choice` | 6 | Repaired in P4 (was 4→6) |
| `proc3_word_class_contrast_choice` | 6 | Legacy template |
| `proc_semicolon_choice` | 7 | Repaired in P4 (was 5→7) |

**Key insight:** The P4 repair target was the default window [1,2,3] — achieved with zero repeats. Deep-seed repetition in legacy families is now **visible and tracked**, not hidden. QG P5 or P6 can choose to expand these banks further based on learner telemetry.

---

## Production Smoke Status

**Repository smoke:** PASSED. The test suite exercises:
- P4 mixed-transfer template build + serialize + forbidden-key scan (all 8 templates)
- Correct and incorrect answer submission through deterministic answer-spec path
- Post-answer feedback content without answer-key leakage
- MultiField template field-level redaction

**Post-deploy production smoke:** NOT RUN. This report records repository smoke only. Post-deploy smoke is a separate operational step.

---

## Unchanged Invariants

The following were explicitly verified as unchanged:
- Star, Mega, monster, reward semantics
- Parent Hub mistake counts and confidence analytics
- SATS mini-test scoring
- Manual-review-only template semantics (4 templates, non-scored, no mastery mutation)
- Focus mode behaviour (single-concept focus still prioritises concept-local templates)
- Smart practice template freshness and variant deduplication
- Question-type weakness behaviour
- P1/P2/P3 fixture files (not modified)
- Constructed-response templates (20, unchanged)
- Worker-private field redaction (answerSpec, golden, nearMiss, misconception, generatorFamilyId, variantSignature all stripped from learner-facing read models)

---

## Architectural Decisions

### pickBySeed over mulberry32 for primary case selection

The original generators used `const rng = mulberry32(seed); pick(rng, cases)` which calls the RNG once and maps the output to an array index. This is convenient for random selection but produces index collisions for seeds 1-3 when bank sizes are small (due to first-call output clustering).

P4 introduced `pickBySeed(seed, arr)` which uses `((seed - 1) % arr.length + arr.length) % arr.length` — a pure modulo mapping that guarantees distinct indices for any N consecutive seeds when bank size >= N. This is appropriate for case banks where variety across nearby seeds is more important than pseudo-random distribution.

The trade-off: `pickBySeed` is predictable (seed 1 always gets case 0, seed 2 always gets case 1). This is acceptable for content-reviewed case banks where the case order is editorially controlled. The existing `mulberry32` RNG is still used for option shuffling within a case.

### P4 strict enforcement via tag

Adding `qg-p4` to the strict variant tag list means P4 templates get the same zero-repeat audit gate as P1 and P3 templates. If any two seeds in the default window [1,2,3] produce the same variant signature, the audit test fails immediately. This is stronger than the advisory bucket used for legacy templates.

### No scheduler changes

Multi-concept templates participate in selection via the existing `skillIds` multi-membership mechanism. The selection weights, freshness penalties, focus mode, and mini-pack constraints all handle multi-skillId templates correctly because they iterate over the template's skillIds array. No new selection logic was needed.

---

## Test Coverage Summary

| Test file | Tests | Status |
|---|---:|:---:|
| `grammar-qg-p4-mixed-transfer.test.js` | 71 | PASS |
| `grammar-qg-p4-depth.test.js` | 28 | PASS |
| `grammar-question-generator-audit.test.js` | 7 | PASS |
| `grammar-functionality-completeness.test.js` | 25 | PASS |
| `grammar-production-smoke.test.js` | 17 | PASS |
| `grammar-selection.test.js` | 17 | PASS |
| `grammar-engine.test.js` | 58 | PASS |
| `worker-grammar-subject-runtime.test.js` | 15 | PASS |
| `hub-read-models.test.js` | 33 | PASS |
| `grammar-answer-spec-audit.test.js` | 6 | PASS |
| `grammar-qg-p3-explanation.test.js` | 12 | PASS |
| `grammar-content-expansion-audit.test.js` | 89 | PASS |
| `react-grammar-surface.test.js` | 35 | PASS |
| **Total** | **413** | **PASS** |

---

## Residual Risks

| Risk | Status | P4 mitigation | Future action |
|---|---|---|---|
| Mixed-transfer items harder than normal practice | Acceptable | `difficulty: 3` keeps them from early practice; selection weights prioritise concept-local | Monitor via telemetry in P6 |
| Deep-seed repetition in legacy families | Visible | Audit `--deep` flag makes repeat rates transparent | QG P5 can expand if needed |
| Multi-concept mastery inflation | Mitigated | Existing mastery quality tiers unchanged; one answer = one quality event | Monitor in P6 calibration |
| Case-bank expansion finite | Acceptable | 8 cases per family gives variety over typical session; deep audit shows actual depth | Expand specific families based on usage data |
| Variant signature stability for classify templates | Low risk | Column arrays are deterministic (Set insertion order from same case bank); tested | Add structural test if case banks evolve |

---

## QG Release Governance Timeline

| Release | Date | Focus | PR |
|---|---|---|---|
| QG P1 | 2026-04-26 | Release-scoped auditable content | — |
| QG P2 | 2026-04-27 | Constructed-response marking honesty | — |
| QG P3 | 2026-04-28 | Explanation reasoning coverage (18/18 concepts) | #509 |
| **QG P4** | **2026-04-28** | **Depth + mixed-transfer + zero-repeat** | **#536** |

---

## Recommended QG P5 Focus

Based on the P4 completion state, QG P5 should focus on:

1. **Release automation** — make production smoke a proper CI gate, not a discipline-dependent manual step.
2. **Deep-seed expansion** — address the 12 low-depth legacy families identified by `--deep`.
3. **Drift detection** — automated checks that fixture denominators match executable audit output.
4. **Denominator governance** — require completion reports to be machine-verifiable against audit JSON.

QG P6 should then focus on learner telemetry and calibration.

---

## Final Claim

Grammar QG P4 delivers what it promised: deterministic breadth (preserved from P3), honest marking (preserved from P2), full reasoning coverage (preserved from P3), and a **first layer of mixed-transfer practice with generator-depth checks that make repeated surface variants visible before release**.

The repo can now prove:
- P3 reasoning breadth is preserved (18/18 concepts with explain coverage)
- New P4 mixed-transfer coverage exists across all 18 concepts (8 templates, 64 reviewed cases)
- New score-bearing items are deterministic and answer-spec governed (47 answer-spec templates)
- Legacy generated repetition is eliminated from the default window (0 repeats)
- Generator depth is visible in audit output (`--deep` flag, per-family reporting)
- Learner-facing read models remain clean (forbidden-key oracle passes for all P4 templates)
- Production-smoke coverage is stronger (8 new P4 probes)
- No reward, mastery, or scheduling semantics were quietly changed
