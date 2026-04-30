# Punctuation QG P8 Addendum — P9 Audit Findings

**Date:** 2026-04-30
**Scope:** Post-P9 audit observations that clarify P8 report claims

---

## 1. Negative Vector Count

The negative vector fixture (`tests/fixtures/punctuation-negative-vectors.json`) contains **208 vectors** (exceeds the P8-era 144 minimum threshold). This increase results from P9 U3 negative vectors v2 expansion covering additional edge cases across all 14 punctuation skill families.

## 2. Test Count

Across all 86 punctuation test files, **2,131 tests** pass (0 failures). This includes the P9 additions: closed preservation productionisation probes, reviewer cluster alignment, review-authority truth labels, and production evidence validation.

## 3. Clarification: Review Decisions Are AI Pre-Review

The reviewer decisions recorded in `tests/fixtures/punctuation-reviewer-decisions.json` represent **AI pre-review** classifications, not human QA. The review-authority pipeline (`shared/punctuation/reviewer-decisions.js`) applies deterministic rules and heuristic scoring. Human QA sign-off is a separate evidence layer that occurs at deployment time.

## 4. Two-Layer Evidence Architecture

- **Local verification** (`npm run verify:punctuation-qg:p9`): runs all 47 logical gates (P8 composed + P9 specific) on the developer machine. This is the primary quality gate.
- **Live production smoke** (`liveProductionSmoke` in evidence JSON): a separate, post-deployment check that verifies the deployed artefact in the production environment. These are independent evidence layers; local verification passing does NOT imply production smoke has been run.

## 5. Depth-6 Remains Blocked

`PRODUCTION_DEPTH` remains at **4**. The `DEPTH_ACTIVATION_EVIDENCE` checklist contains 14 items, several of which (`candidate-decisions-populated`, `deployment-commit-sha`, `release-id-change`) cannot be satisfied until a formal depth-6 promotion is approved.

## 6. No Live Production Smoke

As of this audit, `liveProductionSmoke.status` is `"not_run"`. No live production smoke test has been executed. The evidence file (`reports/punctuation/punctuation-qg-p9-production-evidence.json`) records this state explicitly.
