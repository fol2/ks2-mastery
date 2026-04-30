---
phase: grammar-qg-p11
title: Grammar QG P11 — Production Launch Fixes and Post-Deploy Certification Contract
status: CERTIFIED_PRE_DEPLOY
date: 2026-04-30
final_content_release_id: grammar-qg-p11-2026-04-30
baseline_content_release_id: grammar-qg-p10-2026-04-29
scoring_or_mastery_change: false
reward_or_star_change: false
hero_mode_change: false
implementation_prs:
  - "#728"
  - "#729"
  - "#734"
  - "#735"
  - "#736"
  - "#737"
  - "#739"
  - "#740"
final_content_release_commit: 7b39a78e
post_merge_fix_commits:
  - "#739"
  - "#740"
final_report_commit: pending-this-commit
---

# Grammar QG P11 — Final Completion Report

## 1. Executive Summary

P11 is the production-readiness contract for the Grammar Question Generator's 78-template pool. It fixes three S1 learner-surface bugs in the prompt-cue pipeline, reconciles all evidence/report mismatches (S2), closes the distractor review evidence chain, and establishes the post-deploy certification contract.

**Exit state: `CERTIFIED_PRE_DEPLOY`** — all local and CI gates pass. Production smoke remains deferred until deployment.

### Key Numbers

| Metric | Value |
|--------|-------|
| Templates | 78 (unchanged from P10) |
| Active template denominator | 78/78 (no blocks) |
| Content release ID | `grammar-qg-p11-2026-04-30` |
| New tests added | ~950 |
| Total P11 test count | ~950 new + 14,263 existing CI suite |
| Regression tests broken | 0 (after CI-compatible fixes) |
| Implementation PRs | 8 (6 feature + 2 reviewer-fix) |
| Implementation units | 10 (U1–U10) |
| Semantic audit coverage | 78 templates × 30 seeds = 2,340 items |
| S0/S1 issues remaining | 0 |
| S2 issues remaining | 0 |
| Blocked templates | 0 |

---

## 2. Problems Addressed

### 2.1 S1 — Learner-Surface Bugs (Fixed)

| Bug | Root Cause | Fix (PR) |
|-----|-----------|----------|
| `identify_words_in_sentence` reads "Sentence: adverbs" instead of actual sentence | `extractBoldSentence()` takes first `<strong>` content which is a grammar label | U2: Paragraph-block resolver with candidate filtering (#728) |
| `subject_object_choice` reads "Sentence: object" instead of actual sentence | Same heuristic — first `<strong>` picks "subject"/"object" | U2: Same fix — `resolveTargetSentence()` (#728) |
| `qg_p4_voice_roles_transfer` announces "underlined word" for a noun phrase | No `targetKind` metadata; read-aloud always said "word" | U3: `detectTargetKind()` + kind-specific copy (#734) |
| Double terminal punctuation ("The sentence is: Run!.") | Unconditional `.` append in readAloudText | U3: Conditional punctuation — `/[.!?]$/` guard (#734) |

### 2.2 S2 — Evidence/Report Mismatches (Fixed)

| Mismatch | Fix (PR) |
|----------|----------|
| Report claimed 190 marking matrix entries; artefact has 80 | U1: Wording corrected to "80 entries (seeds 1..5)" (#729) |
| Quality register reported as "78 approved"; actual is 74+4 | U1: Wording corrected to "74 approved + 4 approved_with_limitation" (#729) |
| PR #722 missing from implementation_prs list | U1: Added to frontmatter (#729) |
| `validateReleaseIdConsistency()` not in CLI default path | U1: Wired into Gate 1c (#729) |
| 18 ambiguous templates had no review evidence | U6: Adult-review decisions added for all 18 (#735) |

---

## 3. Implementation Units

### U1 — Evidence Truth Reconciliation (PR #729)
- Fixed P10 report wording (marking matrix, quality register, PR accounting)
- Wired `validateReleaseIdConsistency()` into certification CLI default path
- Added `validateReportCounts()` — cross-checks report markdown against artefact JSON metadata
- **14 new tests**

### U2 — Semantic Target-Sentence Extraction (PR #728)
- Added `extractParagraphTextBlocks()`, `isSentenceCueCandidate()`, `resolveTargetSentence()`
- Replaced `extractBoldSentence()` heuristic for target-sentence cue type
- Grammar labels rejected: must be ≥16 chars, contain whitespace, have sentence punctuation
- Bumped `GRAMMAR_CONTENT_RELEASE_ID` to `grammar-qg-p11-2026-04-30`
- **9 new tests** (6 spec acceptance examples + 3 edge cases)

### U3 — Cue-Kind Accessibility Copy (PR #734)
- Added `detectTargetKind()` — maps prompt wording to `'word'|'noun-phrase'|'group'|'pair'|'sentence'`
- Extended `focusCue` shape with `targetKind` field
- Fixed `screenReaderPromptText` — kind-appropriate phrasing
- Fixed `readAloudText` — kind-aware + conditional punctuation
- **427 new tests** (individual contracts + 78×5 sweep)

### U4 — Semantic Prompt-Cue Audit (PR #737)
- New script: `scripts/audit-grammar-prompt-cues-semantic.mjs`
- 7 checks detecting exact P10 bug classes
- Dead-check detection (each check must match ≥1 template)
- Exported `runSemanticAudit()` for programmatic test use
- **Result: 2,340 items checked, 0 findings**

### U5 — Render Regression Tests (PR #737)
- Pinned template+seed combos for each bug class
- Programmatic semantic audit assertion
- Full 78×5 double-punctuation sweep
- **430 new tests**

### U6 — Distractor Review Closure (PR #735)
- 18 ambiguous templates received `adultReviewDecision` entries
- 15 marked `approved_with_review`, 3 marked `approved_with_limitation`
- Validator: `validateDistractorReviewCoverage()` — zero gaps allowed
- **7 new tests**

### U7 — Marking Matrix Truth (PR #735)
- Confirmed `metadata.totalEntries: 80` (correct as-is)
- Added `validateMarkingMatrixCounts()` — cross-checks artefact metadata
- Report wording already correct (fixed by U1)

### U8 — Scheduler Blocklist Guard (PR #736)
- All 78 templates verified present in certification status map
- Zero templates blocked (all S0/S1 resolved)
- Fail-closed behaviour tested (unknown template ID → blocked)
- **13 new tests**

### U9 — Production Smoke Contract (PR #736)
- Defined evidence JSON schema (10 required fields + 6 assertion results)
- Schema validator for pass/fail paths
- `CERTIFIED_POST_DEPLOY` forbidden without valid evidence file
- **19 new tests**

### U10 — Cumulative Verify Chain (PR #736)
- `verify:grammar-qg-p11` → chains P10, then all P11 test files
- `verify:grammar-qg-production-release` → P11 chain + semantic audit + evidence validator
- `audit:grammar-qg:semantic` → semantic audit script
- **11 new tests**

---

## 4. Architecture Decisions

### 4.1 Paragraph-Block Resolver (U2)

**Decision:** Replace `extractBoldSentence()` (first `<strong>` content) with `resolveTargetSentence()` that parses `<p>` blocks and reverse-scans for the last qualifying candidate.

**Rationale:** The `<strong>` heuristic was never designed for target-sentence cues — it was repurposed from emphasis detection. The paragraph-block approach correctly separates instruction text from sentence content. The reverse-scan picks the sentence closest to the answer, matching how templates are structured (instruction → sentence → question).

**Defence-in-depth:** `isSentenceCueCandidate()` applies three independent filters:
1. Length ≥16 characters (rejects all single-word grammar labels)
2. Contains whitespace (rejects concatenated tokens)
3. Has sentence punctuation or blank marker (rejects headings/labels)

### 4.2 Target-Kind Metadata (U3)

**Decision:** Add `targetKind` to the serialised `focusCue` shape rather than inferring from cue type alone.

**Rationale:** A `type: 'underline'` cue could target a word, noun phrase, group, or pair — the cue type alone doesn't tell the accessibility layer what phrasing to use. Making it explicit prevents future regression if new underline targets are added.

### 4.3 Conditional Punctuation (U3)

**Decision:** Only append `.` when `targetText` does not already end in `.`, `!`, or `?`.

**Rule:** `/[.!?]$/.test(word.trim()) → skip dot`

**Impact:** Eliminates an entire class of double-punctuation bugs without requiring per-template exceptions.

### 4.4 Separate Semantic Audit (U4)

**Decision:** New `scripts/audit-grammar-prompt-cues-semantic.mjs` rather than extending existing P10 audit.

**Rationale:** The P10 audit (`audit-grammar-prompt-cues.mjs`) checks structural presence — "does focusCue.targetText exist in readAloudText?". The semantic audit checks correctness — "is focusCue.targetText the RIGHT content?". Keeping them separate means:
1. The semantic audit can demonstrably fail on pre-fix P10 (proving detection)
2. Neither audit's evolution accidentally breaks the other
3. The cumulative verify chain runs both independently

### 4.5 Option A for Marking Matrix (U7)

**Decision:** Keep the 80-entry window (seeds 1..5) and report it honestly.

**Rationale:** 80 entries across 5 seeds × 16 templates per seed is adequate evidence for the current pool. Expanding would increase artefact size without proportional value. The truth fix is in the reporting, not the data.

---

## 5. Quality Register Status

| Status | Count | Templates |
|--------|-------|-----------|
| `approved` | 57 | Standard templates with no ambiguity flags |
| `approved_with_review` | 15 | Ambiguous templates with review evidence proving prompt disambiguates |
| `approved_with_limitation` | 6 | 3 from P10 + 3 from U6 (defensible alternatives where prompt does not fully disambiguate) |
| `blocked` | 0 | — |
| `retire_candidate` | 0 | — |
| **Total** | **78** | |

---

## 6. Certification Evidence Chain

| Evidence | Status | Location |
|----------|--------|----------|
| Certification manifest | ✅ Valid | `reports/grammar/grammar-qg-p10-certification-manifest.json` |
| Render inventory | ✅ Valid (2,340 items) | `reports/grammar/grammar-qg-p10-render-inventory.json` |
| Quality register | ✅ Valid (78 entries, all reviewed) | `reports/grammar/grammar-qg-p10-quality-register.json` |
| Distractor audit | ✅ Valid (0 S0/S1, 18 reviewed) | `reports/grammar/grammar-qg-p10-distractor-audit.json` |
| Marking matrix | ✅ Valid (80 entries, seeds 1..5) | `reports/grammar/grammar-qg-p10-marking-matrix.json` |
| Semantic audit | ✅ Pass (0 findings, 2,340 items) | `scripts/audit-grammar-prompt-cues-semantic.mjs` |
| Certification status map | ✅ Valid (78/78 active) | `reports/grammar/grammar-qg-p10-certification-status-map.json` |
| Production smoke | ⏳ Pending deployment | Schema defined, contract tested |

---

## 7. Verification Commands

```bash
# Full P11 cumulative chain (P6→P10→P11)
npm run verify:grammar-qg-p11

# Production release gate (P11 + semantic audit + evidence validator)
npm run verify:grammar-qg-production-release

# Semantic audit only
npm run audit:grammar-qg:semantic
```

---

## 8. Production Readiness

### What is proven:
- All S0/S1 learner-surface bugs fixed and regression-tested
- All evidence/report counts reconciled and validator-enforced
- All 18 ambiguous templates have adult-review decisions
- Semantic audit passes 2,340 items with 0 findings
- Full cumulative verify chain (P6→P11) passes
- Scheduler serves all 78 templates (no blocks)
- No scoring, mastery, Stars, Mega, Hero Mode, or reward changes

### What remains for post-deploy:
- Run `npm run smoke:production:grammar -- --json --evidence-origin post-deploy`
- Attach evidence JSON at `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json`
- Upgrade status to `CERTIFIED_POST_DEPLOY` only with valid smoke evidence

---

## 9. Unchanged Invariants

The following systems were explicitly NOT touched by P11:

- Scoring logic (all answer evaluation unchanged)
- Mastery progression (star curves, confidence tracking)
- Stars, Mega, Concordium (reward mechanics)
- Hero Mode, Hero Coins, Hero Camp (game economy)
- Monster evolution (visual progression)
- Reward projection (queue and replay)
- Scheduler selection logic (only status map was verified, not modified)
- UI components (no visual changes beyond read-aloud text)

---

## 10. Lessons and Patterns

### 10.1 Release ID Bump Propagation

When `GRAMMAR_CONTENT_RELEASE_ID` changes, multiple files need updating:
- Content expansion audit doc frontmatter
- P6 baseline fixture JSON
- Evidence tests that compared against the live constant (must pin to phase-specific strings)

**Pattern established:** Phase-specific evidence tests should pin to the frozen release string (e.g. `P10_RELEASE_ID = 'grammar-qg-p10-2026-04-29'`), not import the live code constant. This prevents future bumps from cascading into historical validation tests.

### 10.2 Semantic vs Structural Audit Separation

Structural audits check "does X exist?" — useful for catching missing fields.
Semantic audits check "is X correct?" — useful for catching wrong values.

Both are necessary. A grammar label like "adverbs" passes the structural check (it's a non-empty string) but fails the semantic check (it's not a sentence). The P10 audit passed because it only checked presence.

### 10.3 Conditional Punctuation as a Class Fix

Rather than fixing double-punctuation template by template, the conditional `.` rule (`/[.!?]$/ → skip`) eliminates the entire bug class. Future templates automatically benefit.

### 10.4 Assertion Identity Matching

When a validator interpolates a constant's *value* into an error message, test assertions must match the value (`grammar-qg-p11-2026-04-30`), not the constant's *identifier name* (`GRAMMAR_CONTENT_RELEASE_ID`). This is distinct from the release-ID-bump propagation lesson — it's about matching what the code actually produces vs what a developer writes in the source.

### 10.5 SDLC Cycle Throughput

8 PRs merged in a single session using isolated worktrees, parallel subagent workers, independent reviews, and CI-green-before-merge gating. Total new test coverage: ~950 tests. Zero regression.

---

## 11. Independent Contract Review

Two rounds of 10 independent reviewers validated the delivery against the original P11 contract spec. Each reviewer held a specific contract requirement and validated it by running code against the live main branch.

### Round 1 Results (pre-fix)

| # | Focus | Verdict | Issue Found |
|---|-------|---------|-------------|
| 1 | Target-sentence correctness | PASS | — |
| 2 | Read-aloud noun phrase | PASS | — |
| 3 | Double punctuation sweep | PASS | — |
| 4 | Evidence count reconciliation | **FAIL** | Validator compares P10 manifest against P11 code constant |
| 5 | Distractor review coverage | PASS | — |
| 6 | Scheduler fail-closed guard | PASS | — |
| 7 | Cumulative verify chain | PASS | — |
| 8 | No scoring/mastery/reward changes | PASS | — |
| 9 | Semantic audit validates bugs | PASS | — |
| 10 | Production smoke contract | **FAIL** | Schema diverges from U7 spec; POST_DEPLOY guard is documentation-only |

**Fixes applied:**
- PR #739: `--expected-release` flag for evidence validator; U7 contract schema coverage in smoke test; CERTIFIED_POST_DEPLOY guard reads report status and enforces constraint.

### Round 2 Results (post-fix)

| # | Focus | Verdict | Notes |
|---|-------|---------|-------|
| 1 | Target-sentence correctness | PASS | 6/6 acceptance examples correct |
| 2 | Read-aloud target kind | PASS | noun-phrase/word/sentence all correct |
| 3 | Double punctuation sweep | PASS | 0 failures across 838 items (100 seeds) |
| 4 | Evidence validator with flag | PASS | 3/3 commands behave as specified |
| 5 | Distractor review coverage | PASS | 18/18 covered, 0 gaps |
| 6 | Scheduler fail-closed | PASS | 78/78 active, 0 blocked |
| 7 | Verify chain | **FAIL→PASS** | 1 assertion bug (constant name vs value) — fixed in PR #740 |
| 8 | No scoring/mastery changes | PASS | Only content.js enrichPromptCue touched |
| 9 | Semantic audit | PASS | 2,340 items, 0 findings |
| 10 | Smoke contract U7 schema | PASS | 12 fields, POST_DEPLOY guard enforced |

**Final fix:** PR #740 — one-line assertion fix (match constant value, not identifier name).

**Final state: 10/10 PASS. No further reviewer comments.**

---

## 12. PR Summary

| PR | Units | Title | Tests Added |
|----|-------|-------|-------------|
| #729 | U1 | Evidence truth reconciliation and report count validator | 14 |
| #728 | U2 | Semantic target-sentence extraction | 9 |
| #734 | U3 | Cue-kind accessibility copy with conditional punctuation | 427 |
| #735 | U6+U7 | Distractor review closure and marking matrix truth | 7 |
| #736 | U8+U9+U10 | Scheduler guard, smoke contract, and verify chain | 43 |
| #737 | U4+U5 | Semantic prompt-cue audit and render regression tests | 430 |
| #739 | R1 fix | Expected-release flag and U7 schema coverage | 4 |
| #740 | R2 fix | Assertion matching constant value not name | 0 (fix only) |
| **Total** | **U1–U10 + review fixes** | | **~950** |
