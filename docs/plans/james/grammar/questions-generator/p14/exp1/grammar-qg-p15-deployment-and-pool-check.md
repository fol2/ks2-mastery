# Grammar QG Deployment and Pool Check — P14 Baseline

**Primary snapshot:** uploaded `ks2-mastery-lean-05012328.zip`  
**Release inspected:** `grammar-qg-p14-2026-05-01`  
**Status:** production-safe, but still needs more content depth.

## Deployment evidence

The supplied ZIP contains `reports/grammar/grammar-production-smoke-grammar-qg-p14-2026-05-01.json`.

The smoke evidence reports:

- `ok: true`
- `environment: production`
- `deployedUrl: https://ks2.eugnel.uk`
- `contentReleaseId: grammar-qg-p14-2026-05-01`
- answer-spec families covered: exact, multiField, normalisedText, punctuationPattern, acceptedSet, manualReviewOnly
- semantic cue, prompt cue, read-aloud, answer-leak and release-ID assertions all pass

## Current pool evidence from ZIP-local checks

`node scripts/audit-grammar-question-generator.mjs --json` reports:

| Measure | Count |
|---|---:|
| Concepts | 18 |
| Templates | 110 |
| Selected-response templates | 82 |
| Constructed-response templates | 28 |
| Generated templates | 84 |
| Fixed templates | 26 |
| Answer-spec templates | 79 |
| Manual-review-only templates | 4 |
| Explanation templates | 25 |
| Mixed-transfer templates | 16 |
| Legacy repeated variants | 0 |
| Signature collisions | 0 |
| Low-depth generated templates | 0 |

`reports/grammar/grammar-qg-p14-render-inventory.json` reports:

| Measure | Count |
|---|---:|
| Template count | 110 |
| Seed range | 1..30 |
| Render inventory items | 3,300 |

P14 completion evidence reports:

| Measure | Count |
|---|---:|
| Unique learner-visible surfaces | 2,496 |
| Unique prompt texts | 1,622 |
| Approved templates | 106 |
| Approved with limitation | 4 |
| Blocked templates | 0 |
| Distractor audit items | 2,190 |
| S0/S1 distractor failures | 0 |
| Marking matrix entries | 120 |

## Important local tooling note

`node scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json` silently checks zero templates in this snapshot because the script does not parse range syntax. Running with comma-separated seeds checks 3,300 items and reports 0 hard failures / 0 advisories.

Proposed fix: `grammar-qg-p15-fix-content-quality-seed-range.patch`.

## Product judgement

P14 is deployment-certified, but the complaint about repetition remains valid as a product-risk signal. P14 improved the pool from 78 to 110 templates, but children can still feel repetition if:

- many items share the same grammar operation,
- the learner hits the same concept repeatedly,
- quick practice uses too few items,
- the scheduler does not consider recent learner-visible surfaces,
- low-friction Star progress makes shallow exposure feel like completion.

The P15 expansion pack adds 1,080 draft cases and 90 proposed template families to address this.
