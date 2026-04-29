# Punctuation QG P6 — Completion Report

Date: 29 April 2026  
Release ID: `punctuation-r4-full-14-skill-structure` (unchanged — no learner-facing content shape change)  
Phase type: final production-quality acceptance  
Status: **COMPLETE**

---

## Executive Summary

P6 is the final production-quality acceptance phase for the Punctuation question-generation engine. It proves that every learner-visible question is fair, well-explained, correctly marked, and free of hidden structural bugs — without raising production depth or adding runtime AI generation.

**Headline outcome:** The engine is production-quality certified at depth 4. All 192 runtime items (92 fixed + 100 generated) pass marking, explanation, fairness, edge-case, and variety gates. Production depth remains at 4 pending future human reviewer QA of depth-6 candidates.

---

## Measured Counts

| Metric | Value |
|--------|-------|
| Fixed items tested (model answers) | 92 |
| Fixed accepted alternatives tested | 114+ |
| Generated items audited (depth 4) | 100 |
| Generated items audited (depth 6) | 150 |
| Generated items audited (depth 8) | 200 |
| Production runtime pool | 192 |
| Depth-6 candidate pool | 242 |
| Depth-8 capacity pool | 292 |
| Production generated depth | 4 (unchanged) |
| Capacity audit depth | 8 (unchanged) |
| DSL families with explanations | 25/25 |
| Edge-case matrix tests (14 skills) | 78 |
| Self-marking gate tests | 206 |
| Speech fairness tests | 12 |
| Normalisation regression tests | 7 |
| Explanation specificity tests | 6 |
| Perceived-variety tests | 7 |
| Feedback redaction tests | 9 |
| Telemetry proof/smoke classification | 22 |
| Total P6 verification gates | 18 |
| Total new test assertions | 347+ |

---

## PRs Merged (chronological)

| PR | Unit | Title |
|----|------|-------|
| #599 | U8 | refactor(punctuation): classify telemetry tests as proof-level or smoke-level |
| #601 | U1 | fix(punctuation): preserve whitespace after terminal possessive apostrophes |
| #600 | U4 | feat(punctuation): add rule-specific explanations to all 25 DSL families |
| #606 | U2 | test(punctuation): add fixed-bank self-marking gate for all 92 items |
| #607 | U5 | test(punctuation): add 14-skill edge-case accept/reject matrix |
| #608 | U3 | fix(punctuation): accept reporting-after speech when prompt is general |
| #610 | U6+U7 | feat(punctuation): add reviewer QA pack and perceived-variety report |
| #611 | U9 | feat(punctuation): verify feedback redaction and add sibling-retry messaging |
| #612 | U10+U11 | feat(punctuation): add P6 verification command with 18 gates |

---

## Critical Bug Fixes

### 1. Apostrophe normalisation (U1, PR #601)

**Problem:** `canonicalPunctuationText()` regex `([""''])\s+/g` unconditionally stripped whitespace after any apostrophe/quote character. Terminal possessive apostrophes like `teachers'` followed by a word (`notices`) were collapsed into `teachers'notices`, breaking `requiredTokenCoverage()` boundary matching.

**Root cause:** Line 55 of `marking.js` treated all apostrophes as closing speech marks.

**Fix:** Replaced the simple regex with a callback that inspects the character before the apostrophe. If it's a word character (`\w`), the apostrophe is possessive and the trailing space is preserved. Applied to both `canonicalPunctuationText` and `canonicalPunctuationLineText`.

**Impact:** `ap_transfer_possession` model answer now marks correct. All plural possessive forms work.

### 2. Speech transfer fairness (U3, PR #608)

**Problem:** `sp_transfer_question` item had `reportingPosition: 'before'` in its rubric but the prompt asks generally for direct speech ("Write one sentence of direct speech using these exact spoken words"). Children writing the valid reporting-after form `"Can we start now?" asked Mia.` were marked incorrect.

**Fix:** 
- Added `reportingPosition: 'any'` support to `speechWithWords` validator
- Modified `evaluateSpeechRubric` to bypass comma-before-quote check and capitalisation for reporting-after forms
- Updated `sp_transfer_question` rubric to `'any'` with both forms in accepted alternatives

**Impact:** Both reporting orders now mark correct for general speech prompts. Items with explicit position constraints still enforce them.

---

## Quality Improvements

### Rule-specific explanations (U4, PR #600)

Every DSL template across all 25 families now provides a child-readable, rule-specific explanation. The generic fallback `'This generated item practises the same published punctuation skill.'` is never used.

Examples:
- Fronted adverbial: "The comma marks where the main clause begins after the opening phrase."
- Speech: "Inverted commas show exactly which words were spoken, with punctuation inside the closing mark."
- Apostrophe possession: "The apostrophe shows that something belongs to the noun."
- Semicolon: "A semicolon joins two closely related sentences that could stand alone."

**Hash isolation:** The explanation field is stripped before computing template identity hashes, so adding explanations does not change `templateId` or `variantSignature` values — preserving star evidence continuity.

### Fixed-bank self-marking gate (U2, PR #606)

A new CI gate proves every fixed item's model answer and accepted alternatives mark correct through production marking. 206 assertions across 92 items — any future regression in fixed content is caught immediately.

### Edge-case matrix (U5, PR #607)

78 test cases across 14 skills with explicit accept/reject assertions through production marking. Coverage includes:
- Straight/curly quote variants
- Terminal possessive apostrophes before nouns
- Reporting-before and reporting-after speech forms
- Oxford comma policy (accepted but not required)
- Bullet list consistent punctuation styles
- Ambiguity-avoiding hyphens vs random insertion

### Feedback redaction (U9, PR #611)

Verified that `normaliseItemForState()` whitelist blocks all internal metadata (templateId, validator, readiness, generatorFamilyId, misconceptionTags) from reaching the learner. Added sibling-retry messaging: "Here is a similar question to help you practise the same skill."

---

## Telemetry Proof Classification (U8, PR #599)

All 11 telemetry events now carry a `testLevel` field:
- **Proof-tested (1):** `SCHEDULER_REASON_SELECTED` — deterministically fires on every start/continue command
- **Smoke-tested (9):** Remaining emitted events — rely on scheduler randomness
- **Reserved (1):** `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` — no callsite, retained for future use

Health report distinguishes `declared`, `emitted`, `proof-tested`, `smoke-tested`, and `reserved`.

---

## Reviewer Tooling (U6+U7, PR #610)

### QA Pack

`npm run review:punctuation-questions` produces:
- Markdown report (stdout) with full item detail
- JSON output (`--json` flag) for filtering
- Per-item marking results (live, not cached)
- 192 items covered (92 fixed + 100 generated)

### Perceived-Variety Report

- Zero same-mode duplicate stem clusters (production invariant)
- 47 cross-mode overlap clusters detected (same sentence in fix + combine modes — intentional)
- Reviewer decisions fixture (`tests/fixtures/punctuation-reviewer-decisions.json`) ready for human population

---

## Depth Decision (U10)

**Decision: Keep production depth at 4.**

**Rationale:**
1. All quality gates pass at depth 4
2. Depth-6 candidates are mechanically viable (242 items, zero duplicate signatures)
3. No human reviewer QA has been conducted on depth-6 candidates
4. The plan explicitly states: "Do not raise production depth merely because the capacity audit passes"
5. Depth-6 activation is a one-constant change (`PRODUCTION_DEPTH` in `generators.js` + release ID bump) when reviewer QA approves

**Next steps for depth-6:** Run `npm run review:punctuation-questions -- --include-depth-6`, have a human reviewer inspect all 150 depth-6 candidates, populate the reviewer decisions fixture, then raise depth with a new release ID.

---

## Verification

Single command: `npm run verify:punctuation-qg:p6`

18 gates composing all P5 + P6 checks:
1. P4 release gates (strict + capacity, golden marking, DSL parity, redaction)
2. Golden marking (25/25 families)
3. Telemetry command-path
4. Learning-health report
5. Mixed-review integration
6. Sibling-retry lifecycle
7. Support evidence
8. Duplicate stem review
9. Production smoke attestation
10. Capacity raise mechanism
11. Fixed-bank self-marking (92 items)
12. Apostrophe normalisation regression
13. Speech transfer fairness
14. Explanation specificity
15. Edge-case matrix (14 skills)
16. Perceived-variety (strict)
17. Telemetry proof/smoke classification
18. Feedback redaction

---

## Remaining Risks

| Risk | Status | Mitigation |
|------|--------|------------|
| Depth-6 content quality unknown | Accepted | Human QA required before activation |
| Cross-mode overlaps not yet reviewed | Low | 47 clusters flagged, not blocking — same sentence in different modes is pedagogically intentional |
| 9/11 telemetry events smoke-only | Accepted | Honest labelling; deterministic forcing impractical for scheduler-driven events |
| Reviewer decisions fixture empty | Accepted | Structure ready; human reviewers populate decisions |

---

## P5 → P6 Cumulative Baseline

| Metric | P5 | P6 |
|--------|----|----|
| Production depth | 4 | 4 |
| Runtime pool | 192 | 192 |
| Golden marking families | 25/25 | 25/25 |
| Generic explanations | 100% of generated | 0% |
| Fixed-bank self-marking | not tested | 92/92 pass |
| Speech fairness | reporting-before only | both orders |
| Telemetry classification | undifferentiated | proof/smoke labelled |
| Edge-case coverage | golden tests only | 78 additional edge cases |
| Verification gates | 10 | 18 |
| Human QA tooling | none | full reviewer pack |

---

## Definition of Done — All Criteria Met

- [x] Every fixed model answer marks correct through production marking
- [x] Every fixed accepted alternative marks correct through production marking
- [x] `ap_transfer_possession` bug fixed and regression-tested
- [x] Speech transfer fairness fixed (both reporting orders accepted)
- [x] Every generated item at depth 4, 6, and 8 has a rule-specific explanation
- [x] All 14 skills have an edge-case accept/reject matrix
- [x] All production items included in a human QA pack
- [x] Perceived-variety clusters documented (0 same-mode duplicates)
- [x] Telemetry proof-level tests honestly classified
- [x] P6 verification command passes (18/18 gates)
- [x] Completion report documents depth decision with evidence

**Production depth decision:** Remain at 4 until human reviewer QA approves depth-6 candidates.
