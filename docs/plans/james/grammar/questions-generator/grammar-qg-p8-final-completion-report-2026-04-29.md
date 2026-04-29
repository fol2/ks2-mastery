---
implementation_prs:
  - pending-branch-pr
final_content_release_commit: pending-after-merge
post_merge_fix_commits:
  - none
final_report_commit: pending-after-merge
content_release_id_changed: "true"
scoring_or_mastery_change: "false"
certification_decision: certified
---

# Grammar QG P8 — Final Completion Report

**Date:** 2026-04-29  
**Content release ID:** grammar-qg-p8-2026-04-29  
**Previous release ID:** grammar-qg-p6-2026-04-29  
**Phase:** Production Question Quality Certification

## Certification Decision

**CERTIFIED**

The Grammar question pool has been certified through automated oracles, adult content review, and UX structural validation. No S0 or S1 issues remain.

## Content Changes

| Change | Detail |
|--------|--------|
| speech_punctuation_fix no-op | Fixed: raw sentence now genuinely incorrect |
| Content release ID | Bumped from grammar-qg-p6-2026-04-29 to grammar-qg-p8-2026-04-29 |
| Scoring/mastery changes | None |
| Reward/Star changes | None |

## Known Issues Before P8

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | speech_punctuation_fix no-op (raw matches golden) | S0 | Fixed in U0 |
| 2 | Content-quality audit misses near-miss/golden equality | S1 | Fixed in U0 |
| 3 | Compound placeholder tokens not rejected | S2 | Fixed in U1 |
| 4 | Post-deploy smoke not run | S2 | Honestly documented (not-run) |

## Automated Quality Audit Summary

| Metric | Value |
|--------|-------|
| Templates checked | 78 |
| Seeds tested | 1–30 |
| Hard failures | 0 |
| Advisories | 0 |
| New hard-fail rules added | 3 (near-miss-marks-correct, near-miss-equals-golden, raw-prompt-passes) |

Run: `node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json`

## Oracle Suite Summary

| Oracle category | Tests | Pass |
|-----------------|-------|------|
| Selected-response (single_choice, checkbox, table) | 1215 | All |
| Constructed-response (golden/nearMiss/raw) | 483 | All |
| Manual-review-only | 40 | All |
| Redaction safety | 780 | All |
| Total | 2518 | All |

## Adult Content Review Summary

- All 18 concepts reviewed (register: reports/grammar/grammar-qg-p8-content-review-register.json)
- 78 templates signed off
- 0 rejected items
- 0 watchlist items

## UX Support Audit Summary

- Input types verified: single_choice, checkbox_list, table_choice, textarea, multi, text
- No answer leaks in client-facing data
- Structural checks: all pass
- Manual UX review: recommended for mobile table layout and accessibility (not blocking certification)

## Smoke Evidence Status

| Smoke type | Status | Evidence |
|-----------|--------|----------|
| Repository test evidence | Passed | verify:grammar-qg-p8 (all tests green) |
| Post-deploy production smoke | Not run | Awaiting deployment |

## Commands Run

```bash
npm run verify:grammar-qg-p7
npm run verify:grammar-qg-p8
node scripts/audit-grammar-content-quality.mjs --seeds=1,...,30 --json
node scripts/generate-grammar-qg-quality-inventory.mjs --seeds=1..60
node scripts/generate-grammar-qg-review-register.mjs
```

## Denominator

| Measure | Value | Movement |
|---------|------:|----------|
| Content release ID | grammar-qg-p8-2026-04-29 | bumped |
| Concepts | 18 | unchanged |
| Templates | 78 | unchanged |
| Selected-response templates | 58 | unchanged |
| Constructed-response templates | 20 | unchanged |
| Generated templates | 52 | unchanged |
| Fixed templates | 26 | unchanged |
| Answer-spec templates | 47 | unchanged |
| CR answer-spec templates | 20/20 | unchanged |
| Manual-review-only templates | 4 | unchanged |
| Explanation templates | 17 | unchanged |
| Mixed-transfer templates | 8 | unchanged |
| Content-quality hard failures | 0 | unchanged |
| Content-quality advisories | 0 | unchanged |
