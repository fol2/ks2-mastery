---
phase: grammar-qg-p14
certification_phase: grammar-qg-p14
final_content_release_id: grammar-qg-p14-2026-05-01
certification_decision: CERTIFIED_POST_DEPLOY
post_deploy_smoke_evidence: reports/grammar/grammar-production-smoke-grammar-qg-p14-2026-05-01.json
limitations:
  - Depth effectiveness needs production telemetry over time; this report certifies release safety and local depth simulations only.
---

# Grammar QG P14 Completion Report

## Decision

P14 is complete for post-deploy production release certification under `grammar-qg-p14-2026-05-01`.

The active Grammar QG pool now has 110 templates, 3,300 render-inventory items, 2,496 unique learner-visible surfaces and 1,622 unique prompt texts across seeds 1..30. Quality evidence records 106 approved + 4 approved_with_limitation templates, 0 blocked templates, 33 adult-review decisions, 2,190 distractor audit items with 0 S0/S1 failures, 0 P14 selected-response surface-cue flags, and 120 marking matrix entries.

The distractor audit still records heuristic surface-cue warnings on prior-pool templates. Those are monitored as residual prior-pool review signals, not hidden P14 clean-room claims. P14's new selected-response templates have 0 likely surface-cue flags.

## Unit Closure

| Unit | Status | Evidence |
| --- | --- | --- |
| U0 diversity baseline | Done | `reports/grammar/grammar-qg-p14-diversity-baseline.json`, `.md` are explicitly marked as pre-P14 comparator evidence from the P11 inventory |
| U1 no same-template normal-session repeat | Done | `tests/grammar-selection.test.js`, `tests/grammar-qg-p14-depth-variety.test.js` |
| U2 low-diversity fixed-bank handling | Done | Former 23 low-diversity fixed-bank families expanded; active low-diversity count is 0 and every active template has at least 10 learner-visible surfaces |
| U3 deeper priority concept families | Done | 32 P14 templates; four depth families across eight priority concepts |
| U4 quick/deep/mini-test session meaning | Done | Setup copy, length labels, start labels, summary depth label |
| U5 Star pacing review | Done | `reports/grammar/grammar-qg-p14-star-pacing-simulation.json`, `.md` |
| U6 click-path learner surface audit | Done | `reports/grammar/grammar-qg-p14-learner-surface-audit.json`, `.md` |
| U7 distractor rationale | Done | `reports/grammar/grammar-qg-p14-distractor-audit.json`; P14 templates have 0 likely surface-cue flags, and all 33 active review-required templates have `adultReviewDecision` entries in the quality register |
| U8 repetition/depth telemetry | Done | session depth, duplicate count, unique template/concept counts, low-diversity exposure, elapsed-by-depth, and abandonment-by-template/input read-model fields |
| U9 release certification chain | Done post-deploy | P14 manifest, render inventory, quality register, distractor audit, marking matrix, status map, runtime source, and production smoke evidence |

## Artefacts

| Artefact | Path |
| --- | --- |
| Manifest | `reports/grammar/grammar-qg-p14-certification-manifest.json` |
| Render inventory | `reports/grammar/grammar-qg-p14-render-inventory.json` |
| Render inventory, redacted | `reports/grammar/grammar-qg-p14-render-inventory-redacted.md` |
| Quality register | `reports/grammar/grammar-qg-p14-quality-register.json` |
| Distractor audit | `reports/grammar/grammar-qg-p14-distractor-audit.json` |
| Marking matrix | `reports/grammar/grammar-qg-p14-marking-matrix.json` |
| Certification status map | `reports/grammar/grammar-qg-p14-certification-status-map.json` |
| Runtime status source | `worker/src/subjects/grammar/certification-status.generated.js` |

## Depth Effectiveness

The Star-pacing simulation keeps high-stage progress out of reach for repeated shallow items. No Star threshold or migration change is included in P14. The product copy separates quick practice from deep practice so a five-question session is not framed as mastery completion.

Non-priority concepts keep their existing P1-P13 coverage and are not expanded in this phase because P14 prioritised the eight concepts named in the contract. This is a product-scope rationale, not an effectiveness claim; production telemetry should decide the next expansion slice.

## Post-Deploy Smoke

The P14 release is `CERTIFIED_POST_DEPLOY`. Production smoke evidence is committed at `reports/grammar/grammar-production-smoke-grammar-qg-p14-2026-05-01.json`.

```bash
npm run smoke:production:grammar -- --json --evidence-origin=post-deploy --expected-release=grammar-qg-p14-2026-05-01 --out=reports/grammar/grammar-production-smoke-grammar-qg-p14-2026-05-01.json
```

The smoke passed against `https://ks2.eugnel.uk` with `ok: true`, `environment: production`, `contentReleaseId: grammar-qg-p14-2026-05-01`, and passing item-creation, answer-submission, read-model, answer-leak, semantic-cue, prompt-cue, read-aloud and release-ID assertions. It covered the exact, multi-field, normalised-text, punctuation-pattern, accepted-set and manual-review-only answer-spec families.

Depth effectiveness still needs production telemetry over time. That is a measurement limitation, not a release blocker.
