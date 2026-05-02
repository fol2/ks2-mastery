---
phase: grammar-qg-p18
certification_phase: grammar-qg-p18
final_content_release_id: grammar-qg-p18-2026-05-02
certification_decision: CERTIFIED_POST_DEPLOY
---

# Grammar QG P18 Completion Report

P18 promotes the combined P15-P18 manual expansion pack into the live Grammar question generator under `grammar-qg-p18-2026-05-02`. P14 remains the historical depth-and-variety base release; this release keeps those P14 contracts active and adds the P15, P16, P17 and P18 manual expansion families to production runtime scheduling.

## Release Scope

| Area | Result |
| --- | --- |
| Active content release | `grammar-qg-p18-2026-05-02` |
| Runtime template denominator | 510 templates |
| Manual expansion source | 400 families, 4,800 source cases |
| Render inventory | 15,300 items across seeds 1..30 |
| Learner-visible diversity | 7,293 unique learner-visible surfaces and 5,795 unique prompts |
| Low-diversity active families | 0 templates below 10 learner-visible surfaces |
| Runtime certification status | 506 approved + 4 approved_with_limitation |
| Quality register blocks | 0 blocked templates |
| Distractor audit | 7,680 selected-response items, 0 S0 failures, 0 S1 failures |
| Marking matrix | 945 marking matrix entries across 9 variant categories |
| Content-quality hard failures | 0 hard failures across 15,300 checked render items |

## Contract Closure

| Contract | Status | Evidence |
| --- | --- | --- |
| P14 baseline, no same-template repeat and low-diversity expansion | Done | `tests/grammar-selection.test.js`, `tests/grammar-qg-p14-depth-variety.test.js`, `reports/grammar/grammar-qg-p18-render-inventory.json` |
| P14 quick/deep/mini-test distinction and learner telemetry | Done | `tests/grammar-qg-p14-surface-telemetry.test.js`, `reports/grammar/grammar-qg-p18-learner-surface-audit.json`, `reports/grammar/grammar-qg-p18-star-pacing-simulation.json` |
| P15 deployment and pool-check fixes | Done | `scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json`, seed-range parser support for `1..30`, zero-template hard-fail guard |
| P15-P18 combined manual expansion | Done | `scripts/generate-grammar-manual-expansion.mjs`, `worker/src/subjects/grammar/manual-expansion.generated.js`, `GRAMMAR_MANUAL_EXPANSION_RELEASE_SUMMARY` |
| P16/P17/P18 answer safety and distractor quality | Done | `reports/grammar/grammar-qg-p18-distractor-audit.json`, `reports/grammar/grammar-qg-p18-marking-matrix.json` |
| P18 semantic prompt-cue/read-aloud safety | Done | `reports/grammar/grammar-qg-p18-semantic-prompt-cue-audit.json`, `tests/grammar-qg-p10-prompt-cue-contract.test.js` |
| Runtime certification authority | Done | `reports/grammar/grammar-qg-p18-certification-status-map.json`, `worker/src/subjects/grammar/certification-status.generated.js` |
| Production release gate | Done | `reports/grammar/grammar-qg-p18-certification-manifest.json`, `npm run verify:grammar-qg-production-release`, `reports/grammar/grammar-production-smoke-grammar-qg-p18-2026-05-02.json` |

Manual expansion promotion is authorised by the P18 release evidence, not by a blanket human review claim. The source pack is marked `certified_scheduler_ready`; runtime generation fails closed if that status regresses, and `npm run verify:grammar-qg-production-release` byte-checks `worker/src/subjects/grammar/manual-expansion.generated.js` against the certified source. Adult-review decisions in the quality register cover the templates flagged by the distractor audit; the remaining approved templates are promoted by automated oracle, render, semantic, marking, and runtime-certification evidence.

## Evidence Artefacts

| Artefact | Path |
| --- | --- |
| Manifest | `reports/grammar/grammar-qg-p18-certification-manifest.json` |
| Render inventory | `reports/grammar/grammar-qg-p18-render-inventory.json` |
| Render inventory, redacted | `reports/grammar/grammar-qg-p18-render-inventory-redacted.md` |
| Quality register | `reports/grammar/grammar-qg-p18-quality-register.json` |
| Distractor audit | `reports/grammar/grammar-qg-p18-distractor-audit.json` |
| Marking matrix | `reports/grammar/grammar-qg-p18-marking-matrix.json` |
| Certification status map | `reports/grammar/grammar-qg-p18-certification-status-map.json` |
| Semantic prompt-cue audit | `reports/grammar/grammar-qg-p18-semantic-prompt-cue-audit.json` |
| Learner surface audit | `reports/grammar/grammar-qg-p18-learner-surface-audit.json` |
| Star-pacing simulation | `reports/grammar/grammar-qg-p18-star-pacing-simulation.json` |
| Production smoke | `reports/grammar/grammar-production-smoke-grammar-qg-p18-2026-05-02.json` |
| Runtime certification source | `worker/src/subjects/grammar/certification-status.generated.js` |

## Oracle Windows

The release keeps per-family oracle windows explicit rather than claiming a uniform all-templates-by-all-seeds pass:

| Evidence family | Seed window |
| --- | --- |
| selected-response oracle | seeds 1..15 |
| constructed-response oracle | seeds 1..10 |
| manual-review oracle | seeds 1..5 |
| redaction oracle | seeds 1..30 |
| content-quality audit | seeds 1..30 |
| semantic-prompt-cue audit | seeds 1..30 |

## Production State

Current decision is `CERTIFIED_POST_DEPLOY`.

| Check | Result |
| --- | --- |
| PR merge | `#842` merged into `main` at `e2013cf0861dee47e19cc79f38584bed9a6920b6` |
| Latest deployed checkout | `c504ee3a32064c5e4114de9246c673de1baa4582` |
| Deploy command | `npm run deploy` |
| Cloudflare Worker version | `23313fbe-0d5f-467a-bbd2-9ac45c2c61f8` |
| Production bundle audit | Passed for `https://ks2.eugnel.uk/` |
| Production smoke | Passed at `2026-05-02T23:00:28.572Z` |
| Production content release | `grammar-qg-p18-2026-05-02` |

The post-deploy smoke used a production demo-session fixture, verified normal round creation/submission/read-model update, mini-test behaviour, repair support, answer-leak guards, semantic prompt-cue/read-aloud assertions, and confirmed the live `contentReleaseId` is `grammar-qg-p18-2026-05-02`.
