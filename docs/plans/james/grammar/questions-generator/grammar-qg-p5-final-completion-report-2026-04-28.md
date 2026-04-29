---
title: "Grammar QG P5 — Final Completion Report"
type: final-completion-report
status: complete
date: 2026-04-28
subject: grammar
plan: docs/plans/2026-04-28-008-feat-grammar-qg-p5-release-automation-hardening-plan.md
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p5.md
previous_final_report: docs/plans/james/grammar/questions-generator/grammar-qg-p4-final-completion-report-2026-04-28.md
contentReleaseId: grammar-qg-p5-2026-04-28
implementation_merge_commit: e1a2bf4
---

# Grammar QG P5 — Final Completion Report

## Executive Summary

Grammar QG P5 converts Grammar QG from a manually interpreted content release into a **machine-verifiable release process**. It eliminates all 12 known deep-seed low-depth generated families, adds content-quality linting as a hard release gate, and makes it impossible for completion reports to overclaim against executable audit output.

**Headline claim:** Grammar QG P5 is complete. The content release ID is `grammar-qg-p5-2026-04-28`. All acceptance criteria are met. Zero regressions to reward, Star, Mega, monster, or mastery semantics.

### Shipped Denominator

```text
Content release id:            grammar-qg-p5-2026-04-28
Concepts:                      18
Templates:                     78
Selected-response templates:   58
Constructed-response templates: 20
Generated templates:           52
Fixed templates:               26
Answer-spec templates:         47
CR answer-spec templates:      20 / 20
Manual-review-only templates:  4
Explanation templates:         17
Concepts with explanation:     18 / 18
Mixed-transfer templates:      8
Concepts with mixed-transfer:  18 / 18
Default-window repeated:       0
Cross-template collisions:     0
Deep low-depth families:       0
```

---

## Final Denominator Comparison

| Measure | P4 Final | P5 Final | Delta |
|---|---:|---:|---:|
| Concepts | 18 | 18 | — |
| Templates | 78 | 78 | — |
| Selected-response | 58 | 58 | — |
| Constructed-response | 20 | 20 | — |
| Generated | 52 | 52 | — |
| Fixed | 26 | 26 | — |
| Answer-spec | 47 | 47 | — |
| CR answer-spec | 20/20 | 20/20 | — |
| Manual-review-only | 4 | 4 | — |
| Explanation | 17 | 17 | — |
| Explanation coverage | 18/18 | 18/18 | — |
| Mixed-transfer | 8 | 8 | — |
| Mixed-transfer coverage | 18/18 | 18/18 | — |
| Default-window repeats | 0 | 0 | — |
| Cross-template collisions | 0 | 0 | — |
| Deep low-depth families (<8/30) | 12 | **0** | **-12** |

P5 preserved the 78-template denominator unchanged. The only substantive delta is the elimination of all 12 deep low-depth families.

---

## What Shipped

### U1. First-class Grammar QG verification command (PR #542)

Added `audit:grammar-qg`, `audit:grammar-qg:deep`, and `verify:grammar-qg` package scripts. One command now proves the entire release gate — denominator, depth, collisions, answer-spec completeness, selection reachability, and engine behaviour.

### U2. Expand 12 low-depth generated families (PR #545)

Expanded case banks for all 12 families that had <8 unique variant signatures over seeds 1..30:

| Family | Before | After |
|---|---:|---:|
| `qg_active_passive_choice` | 3 | 10 |
| `qg_formality_classify_table` | 3 | 12 |
| `qg_pronoun_referent_identify` | 3 | 10 |
| `proc_hyphen_ambiguity_choice` | 4 | 10 |
| `proc3_hyphen_fix_meaning` | 4 | 9 |
| `proc3_parenthesis_commas_fix` | 4 | 9 |
| `proc2_formality_choice` | 5 | 9 |
| `proc_colon_list_fix` | 6 | 9 |
| `proc_dash_boundary_fix` | 6 | 9 |
| `proc2_modal_choice` | 6 | 9 |
| `proc3_word_class_contrast_choice` | 6 | 9 |
| `proc_semicolon_choice` | 7 | 9 |

All families now have 9+ unique visible variants over 30 seeds. No new template IDs were created. All expanded templates received the `qg-p5` tag for strict enforcement.

### U3. Content-quality linting gate (PR #544)

Created `scripts/audit-grammar-content-quality.mjs` with:
- **5 hard-fail checks:** unknown misconception IDs, duplicate normalised options, multiple correct answers, missing correct answer, raw-equals-accepted fix items
- **3 advisory checks:** reversed curly quotes, -ly hyphenation, transfer feedback completeness
- Fixed the non-registered `possession_hyphen_transfer_confusion` misconception (replaced with `apostrophe_possession_confusion`)

### U4. Machine-verifiable completion reports (PR #549)

Created `scripts/validate-grammar-qg-completion-report.mjs` that:
- Runs both audits programmatically
- Compares 16+ claimed fields against live output
- Validates production-smoke evidence file existence
- Distinguishes repository vs post-deploy smoke claims
- Fixed CRLF handling for Windows environments

### U5. Production-smoke evidence capture (PR #543)

Modified `scripts/grammar-production-smoke.mjs` to support:
- `--json` flag for writing structured evidence artefacts to `reports/grammar/`
- `--evidence-origin` flag distinguishing repository from post-deploy runs
- Artefact includes: ok, origin, contentReleaseId, testedTemplateIds, answerSpecFamiliesCovered, per-phase results, timestamp, commitSha

### U6. P5 baseline fixture and drift detection (PR #548)

- Generated `tests/fixtures/grammar-legacy-oracle/grammar-qg-p5-baseline.json` (includes deep-audit fields)
- Generated `tests/fixtures/grammar-functionality-completeness/grammar-qg-p5-baseline.json`
- Added `readGrammarQuestionGeneratorP5Baseline()` helper
- P5 denominator assertions pin all key numbers
- P1-P4 fixtures remain frozen and untouched

### U7. Reviewer sample pack (PR #547)

Created `scripts/generate-grammar-review-pack.mjs` producing a deterministic 3551-line review document covering all 52 generated families. Prompt sections show only learner-visible content. Answer keys are confined to a clearly-labelled appendix.

### U8. Content release ID bump (PR #551)

Bumped `GRAMMAR_CONTENT_RELEASE_ID` to `grammar-qg-p5-2026-04-28`. Updated all downstream references. Regenerated P5 fixtures. Added P5 test files to the verify script.

---

## Deep Seed Analysis

### Before P5 (P4 state)

12 generated families had <8 unique visible variants over seeds 1..30:

```
qg_active_passive_choice:3, qg_formality_classify_table:3,
qg_pronoun_referent_identify:3, proc_hyphen_ambiguity_choice:4,
proc3_hyphen_fix_meaning:4, proc3_parenthesis_commas_fix:4,
proc2_formality_choice:5, proc_colon_list_fix:6,
proc_dash_boundary_fix:6, proc2_modal_choice:6,
proc3_word_class_contrast_choice:6, proc_semicolon_choice:7
```

### After P5

```
Low-depth families (<8 unique): 0
```

All 52 generated families produce 8+ unique variants. No allowlist needed.

---

## Content-Quality Audit Result

```
Hard failures: 0
Advisories: 27
  - 3 × reversed-curly-quote (proc2_modal_choice)
  - 24 × transfer-feedback-incomplete (8 P4 mixed-transfer templates × 3 seeds)
```

All advisories are pre-existing P4 content patterns, not P5 regressions. The transfer-feedback advisory reflects P4's design choice where feedback focuses on the primary grammar concept rather than explicitly naming both transfer concepts. These are documented as advisory-only findings for future P6 content improvement.

---

## Production Smoke Status

**Repository smoke:** Not separately re-run as a standalone command in P5 — covered by the existing `smoke:production:grammar` script which validates against the repository code.

**Post-deploy production smoke:** Not run. P5 infrastructure changes have not been deployed to a live Cloudflare Workers environment. The production-smoke evidence capture mechanism is ready; a post-deploy run will produce `reports/grammar/grammar-production-smoke-grammar-qg-p5-2026-04-28.json` when deployment occurs.

**Distinction:** This report explicitly states that post-deploy smoke was not run. It does not claim production validation beyond repository-level proof.

---

## Unchanged Invariants

The following systems remain completely unchanged by P5:

- Star progression and display (100-Star curve, starHighWater latch, epsilon guard)
- Mega rewards and never-revoked semantics
- Monster rewards and presentation
- Concordium state machine
- Mastery thresholds and concept node scoring
- Grammar engine state machine (session creation, attempt marking, summary events)
- Grammar selection queue (freshness, weakness bias, mini-pack, focus mode)
- Grammar read-model construction and forbidden-key redaction
- Answer-spec evaluation semantics (6 kinds unchanged)
- Learner session data schema
- All non-Grammar subjects (Spelling, Punctuation)
- Admin console
- Hero Mode

---

## New Infrastructure Delivered

| Script/Artefact | Purpose |
|---|---|
| `npm run verify:grammar-qg` | Full release gate in one command |
| `npm run audit:grammar-qg` | Default-window audit (JSON) |
| `npm run audit:grammar-qg:deep` | 30-seed deep audit (JSON) |
| `scripts/audit-grammar-content-quality.mjs` | Content-quality linting |
| `scripts/validate-grammar-qg-completion-report.mjs` | Report claim validator |
| `scripts/generate-grammar-review-pack.mjs` | Reviewer sample pack generator |
| `reports/grammar/grammar-qg-p5-review-pack.md` | Human-readable review artefact |
| `--json` + `--evidence-origin` on smoke script | Machine-readable evidence capture |

---

## Test Coverage Summary

| Test File | Tests | Status |
|---|---:|---|
| `grammar-question-generator-audit.test.js` | 5 | Pass |
| `grammar-qg-p5-depth.test.js` | 15 | Pass |
| `grammar-qg-p5-content-quality.test.js` | 3 | Pass |
| `grammar-qg-p5-report-validation.test.js` | 5 | Pass |
| `grammar-functionality-completeness.test.js` | 24 | Pass |
| `grammar-production-smoke.test.js` | 6 | Pass |
| `grammar-selection.test.js` | 26 | Pass |
| `grammar-engine.test.js` | 48 | Pass |
| **Total** | **132** | **All pass** |

---

## Architectural Decisions

1. **Expand case banks, not template IDs:** All 12 families were expanded by adding items to existing `EXTRA_LEXICON` arrays or inline case banks. No new template IDs were created. This preserves the 78-template denominator and avoids cascading fixture/test changes.

2. **Content-quality audit as companion script:** Rather than bloating the main audit, a separate `audit-grammar-content-quality.mjs` keeps concerns clean. Both produce JSON and are consumed by the report validator.

3. **Report validator runs live audits:** Instead of comparing against saved JSON (which could go stale), the validator invokes audits programmatically. This makes stale-data masking impossible.

4. **`--evidence-origin` not `--origin`:** The smoke script already uses `--origin` for the HTTP target URL (via shared `configuredOrigin()`). A separate `--evidence-origin` flag avoids collision.

5. **P5 tags for strict enforcement:** All expanded templates receive `qg-p5` tag. The signature audit treats tagged templates as strict (zero repeats required) vs legacy (advisory).

6. **Frozen fixture strategy:** P5 baseline is generated from executable audit output. P1-P4 baselines are never edited. Each release adds a fixture pair; prior releases remain historical.

---

## Residual Risks

| Risk | Severity | Mitigation | Future Action |
|---|---|---|---|
| 27 advisory findings in content-quality audit | Low | All pre-existing P4 patterns, not P5 regressions | P6 should address transfer-feedback completeness |
| Post-deploy smoke not run | Medium | Infrastructure is ready; explicitly documented | Run after next Cloudflare deployment |
| Large `content.js` file (7960+ lines) | Low | Single-file-as-truth is deliberate; enables reliable cross-template auditing | Accept; splitting would break audit guarantee |
| Reviewer sample pack has no CI assertion | Low | Script runs deterministically; manual regeneration is trivial | Consider adding `generate + diff` CI step in P6 |

---

## QG Release Governance Timeline

| Phase | Date | Key Achievement |
|---|---|---|
| P1 | 2026-04-26 | Audit foundations, stable identity, CI gate |
| P2 | 2026-04-26 | Declarative answer specs, selection reachability |
| P3 | 2026-04-27 | Explanation coverage 18/18, redaction proof |
| P4 | 2026-04-28 | Mixed-transfer 18/18, depth for explanations, 0 default repeats |
| **P5** | **2026-04-28** | **Machine-verifiable governance, 0 deep low-depth, content-quality gate** |

---

## Recommended QG P6 Focus

P6 should move from release correctness into **learner calibration**:

1. Use real learner telemetry to decide which templates need retirement, expansion, or difficulty adjustment
2. Monitor mixed-transfer performance separately from concept-local practice
3. Address the 24 transfer-feedback-incomplete advisories — make feedback explicitly name both grammar concepts
4. Address the 3 reversed-curly-quote advisories in `proc2_modal_choice`
5. Calibrate mastery thresholds for multi-concept templates
6. Track retention-after-secure and post-Mega maintenance outcomes
7. Use error and retry telemetry to prioritise the next content expansion

P5 leaves clean telemetry hooks, machine-readable release evidence, and a verified baseline for P6 to build upon.

---

## Final Claim

Grammar QG P5 is complete. All 8 implementation units are merged. The content release is `grammar-qg-p5-2026-04-28`. Zero deep low-depth families remain. Content-quality linting is a hard gate. Completion reports are machine-verifiable. 132 tests pass. No reward, Star, Mega, monster, or mastery semantics were changed. The release process is now difficult to mis-state, easy to verify, and safer to deploy.

---

## PRs Merged

| PR | Title |
|---|---|
| #542 | feat(grammar): add verify:grammar-qg release gate command |
| #543 | feat(grammar): add production-smoke evidence capture for QG P5 |
| #544 | feat(grammar): add content-quality linting gate for QG P5 |
| #545 | feat(grammar): expand 12 low-depth generated families to >= 8 variants |
| #547 | feat(grammar): add P5 reviewer sample pack generator |
| #548 | feat(grammar): add P5 baseline fixture and denominator drift detection |
| #549 | feat(grammar): add machine-verifiable completion report validator for QG P5 |
| #551 | feat(grammar): bump content release ID to grammar-qg-p5-2026-04-28 |
