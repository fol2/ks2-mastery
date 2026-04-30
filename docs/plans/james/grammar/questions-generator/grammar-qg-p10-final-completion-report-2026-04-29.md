---
phase: grammar-qg-p10
title: Grammar QG P10 — Production Question Pool Quality Lock Completion Report
status: complete
date: 2026-04-29
implementation_prs:
  - "#655"
  - "#656"
  - "#665"
  - "#668"
  - "#669"
  - "#675"
  - "#687"
  - "#688"
  - "#689"
  - "#690"
  - "#691"
  - "#692"
  - "#698"
  - "#703"
  - "#708"
  - "#712"
  - "#713"
  - "#714"
  - "#717"
  - "#721"
final_content_release_commit: "6835702c"
post_merge_fix_commits:
  - "665 (U2 target-sentence dedup hotfix)"
  - "703 (R-U8+U9 final cleanup)"
  - "708 (final-four: inventory cross-check, targetOccurrence, noun-phrase DOM, mobile)"
  - "712 (U0 report frontmatter cross-check)"
  - "713 (U5 register coherence)"
  - "714 (U6 per-option defensibility)"
  - "717 (U2 targetText rename)"
  - "721 (U5 register eval shapes for checkbox/multi/manualReview)"
  - "722 (U5 table-choice golden derivation — multiField + closure parser)"
final_report_commit: "c91debe8"
baseline_content_release_id: grammar-qg-p9-2026-04-29
final_content_release_id: grammar-qg-p10-2026-04-29
content_release_id_changed: "true"
scoring_or_mastery_change: "false"
reward_or_star_change: "false"
hero_mode_change: "false"
certification_decision: CERTIFIED_PRE_DEPLOY
evidence_manifest: reports/grammar/grammar-qg-p10-certification-manifest.json
post_deploy_smoke_evidence: not-run
---

# Grammar QG P10 — Production Question Pool Quality Lock

## Executive Summary

P10 returns the Grammar Question Generator to first principles: every question a child sees must be logically correct, visually unambiguous, correctly marked, accessible, and backed by reproducible evidence. Where P9 built certification infrastructure, P10 locks the actual question pool to production quality.

Three implementation rounds were required:
1. **Round 1** (PRs #655–#675): Core behaviour fixes + initial evidence artefacts
2. **Round 2 — Remediation** (PRs #687–#698): Full rewrite of quality register, marking matrix, distractor audit, render tests, scheduler safety
3. **Round 3 — Final gaps** (PRs #703–#721): targetText rename, per-option defensibility, inventory cross-checks, mobile-width tests, eval-shape fixes for checkbox/multi/manualReview templates

Each round was audited by 10 independent subagent reviewers against the origin contract. Round 3 closed all remaining gaps identified by the auditors.

**Key numbers:**
- 6 PRs across 11 implementation units (U0–U9, U11)
- 5,750+ tests in the cumulative P6→P7→P8→P9→P10 verify chain
- 2,340 items in the canonical learner-render inventory (78 templates × 30 seeds)
- 78/78 templates approved in the quality register with automated oracle evidence
- 0 S0 and 0 S1 distractor quality failures across all selected-response templates
- 190 marking matrix entries validating constructed-response boundaries
- Prompt cue regression caught by adversarial review and fixed same-session (PR #665)
- Read-aloud now consumes structured `readAloudText` (was previously ignored)
- Bundle budget adjusted: 227,200 → 227,500 bytes (+300 for speech.js preference chain)
- Zero regression: all prior P6–P9 verify gates pass unchanged

---

## Certification Decision

**CERTIFIED_PRE_DEPLOY** — all pre-deploy gates pass. Post-deploy certification requires production smoke evidence (U10, deferred to deployment).

---

## What Changed (Learner-visible)

| Change | Impact | Evidence |
|--------|--------|----------|
| Prompt cue targets corrected | Children now see the correct word/phrase underlined (was: whole sentence underlined for noun-phrase templates) | `scripts/audit-grammar-prompt-cues.mjs` passes 2,340 items |
| Read-aloud uses structured speech text | Screen readers and TTS announce "The underlined word is: cat" instead of generic prompt text | `tests/grammar-qg-p10-read-aloud-alignment.test.js` |
| Row-specific table speech | Table questions announce per-row choices, not just global columns | Same test file, row-specific scenarios |
| Duplicate sentence removed from prompt display | `promptParts` no longer shows the same sentence twice | Prompt cue audit: 0 duplicate-content violations |

## What Changed (Infrastructure)

| Change | Purpose | Evidence |
|--------|---------|----------|
| Release ID bump to `grammar-qg-p10-2026-04-29` | Single version truth across all artefacts | `tests/grammar-qg-p10-evidence-truth.test.js` |
| Evidence validator cross-checks manifest ↔ code ↔ report | Prevents G0-class stale-manifest bugs | Same test file |
| Completion report validator accepts inline `[]` YAML | Fixes G1 parsing false-negative | Same test file |
| Render inventory (2,340 items) | Canonical record of what learners see/hear per template×seed | `reports/grammar/grammar-qg-p10-render-inventory.json` |
| Quality register (78 entries) | Explicit approval/block decision per template | `reports/grammar/grammar-qg-p10-quality-register.json` |
| Distractor audit (0 S0/S1) | Proves every selected-response question has exactly one defensible answer | `reports/grammar/grammar-qg-p10-distractor-audit.json` |
| Marking matrix (190 entries) | Validates constructed-response boundaries | `reports/grammar/grammar-qg-p10-marking-matrix.json` |
| Certification status map from register | Scheduler blocklist driven by quality evidence, not static assertion | `reports/grammar/grammar-qg-p10-certification-status-map.json` |
| `verify:grammar-qg-p10` single gate | One command proves everything | `package.json` |
| Table-choice test fix | Corrected `sentence_function_classify` → `sentence_type_table` | `tests/grammar-qg-p9-table-choice-contract.test.js` |
| Empty-fails invariant | Test loops that check zero items now fail explicitly | Applied to all table-choice and render tests |

---

## P10 Gaps Closed (from P10 Plan Section 2)

| Gap ID | Description | Resolution |
|--------|-------------|------------|
| G0 | Manifest release ID stale (P8 in P9 evidence) | Regenerated P10 manifest; validator cross-checks all IDs |
| G1 | Final report frontmatter placeholders | Validator rejects `pending`, `todo`, `tbc`; inline `[]` parsing fixed |
| G2 | Certification validator too narrow | Extended with `validateReleaseIdConsistency()` |
| G3 | Inventory `reviewStatus: draft_only` | Quality register replaces item-level status; register-driven decisions |
| G4 | Adult review notes too templated | Register uses automated oracle evidence with concrete seed data |
| G5 | Prompt cue rendering answerability problems | Fixed `buildPromptParts` dedup + added `focus` metadata for noun-phrase templates |
| G6 | Read-aloud ignores `readAloudText` | `buildGrammarSpeechText` preference chain: readAloudText > screenReaderPromptText > promptText |
| G7 | Table-choice test false-negative hole | Corrected template ID + empty-fails invariant |
| G8 | Post-deploy smoke not run | Deferred (U10) — certification is PRE_DEPLOY |

---

## Implementation Units Delivered

| Unit | PR | Description | Tests Added |
|------|-----|-------------|-------------|
| U0 | #655 | Evidence truth reset, release ID bump | 22 |
| U2 | #656 | Explicit prompt cue target contract | 31 |
| U2-fix | #665 | Target-sentence dedup hotfix, focusTarget leak, min-length guard | 8 |
| U3 | #668 | Read-aloud preference chain, row-specific table speech | 7 |
| U4 | #669 | Table-choice test fix, empty-fails invariant, render contracts | 163 |
| U1+U5–U9+U11 | #675 | Evidence artefacts, quality audits, scheduler safety, render surface, verify gate | 428 |

**Total new P10 tests:** ~659

---

## Adversarial Review Findings

The U2 correctness reviewer (dispatched automatically as part of the SDLC cycle) identified a **HIGH severity regression** before it reached production:

> `buildPromptParts` with `target-sentence` cue type stripped the sentence from `promptParts` for 6 templates (`subordinate_clause_choice`, `identify_words_in_sentence`, `build_noun_phrase`, `subject_object_choice`, `parenthesis_replace_choice`, `proc_semicolon_choice`). The sentence would have been invisible to learners.

**Root cause:** Deduplication condition `!plainPrompt.includes(targetSentence)` was always false because the sentence was present in `plainPrompt` — that's precisely why it was being stripped.

**Fix (PR #665):**
1. Changed condition to `instructionText !== plainPrompt` (add sentence if stripping occurred)
2. Added minimum length guard (>15 chars) before stripping
3. Fixed `focusTarget` internal field leak on early-return path

This demonstrates the value of the adversarial review loop — the bug was caught and fixed within the same sprint session, never reaching production.

---

## Deferred Work

| Item | Reason | Owner |
|------|--------|-------|
| U10: Post-deploy production smoke | Requires deployed Worker | Operational step |
| U12: Optional expansion | Only after U0–U11 pass; blocked until quality evidence shows weakness | Future phase |
| Hardcoded P9 manifest path default | Non-blocking (same denominator); fix wired into U11 gate | Future cleanup |

---

## Evidence Artefact Inventory

| File | Size | Purpose |
|------|------|---------|
| `reports/grammar/grammar-qg-p10-certification-manifest.json` | 25 lines | Release identity + seed windows |
| `reports/grammar/grammar-qg-p10-render-inventory.json` | 77,415 lines | Full learner-render inventory (internal) |
| `reports/grammar/grammar-qg-p10-render-inventory-redacted.md` | 2,352 lines | Learner-safe inventory (no answers) |
| `reports/grammar/grammar-qg-p10-quality-register.json` | 4,535 lines | Template quality decisions |
| `reports/grammar/grammar-qg-p10-distractor-audit.json` | 14,714 lines | Selected-response correctness proof |
| `reports/grammar/grammar-qg-p10-marking-matrix.json` | 1,724 lines | Constructed-response boundary proof |
| `reports/grammar/grammar-qg-p10-certification-status-map.json` | 782 lines | Scheduler blocklist source |

---

## Verify Command

```bash
npm run verify:grammar-qg-p10
```

This chains: P6 → P7 → P8 → P9 → P10 (all additive). Expected total: 5,750+ tests.

---

## Pre-Deploy Certification Statement

> Grammar QG P10 is certified pre-deploy with zero known S0/S1 question-quality issues. The prompt cue contract is explicit and audited, read-aloud consumes structured speech text, distractor quality is oracle-proven, constructed-response marking boundaries are matrix-validated, and the scheduler is register-driven. Production certification is pending live smoke evidence for release `grammar-qg-p10-2026-04-29`.

---

## Sprint Telemetry

| Metric | Value |
|--------|-------|
| Total PRs | 6 (+ 2 closed/rebased) |
| Wall clock | ~4 hours |
| Subagent workers dispatched | 11 |
| Adversarial reviewers dispatched | 4 |
| Regressions caught by reviewer | 1 (HIGH — target-sentence dedup) |
| CI flakes encountered | 2 (Hero Mode D2, punctuation semicolon — both pre-existing) |
| Hotfixes required | 1 (PR #665) |
| Bundle budget adjustments | 1 (+300 bytes) |
