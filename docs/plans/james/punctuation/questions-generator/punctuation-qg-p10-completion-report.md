---
phase: punctuation-qg-p10
title: Punctuation QG P10 — Machine-Gate Completion Report
status: blocked_pending_human_acceptance
owner: KS2 Mastery / Punctuation
language: en-GB
created: 2026-04-30
source_contract: docs/plans/james/punctuation/questions-generator/punctuation-qg-p10.md
verification_log: reports/punctuation/punctuation-qg-p10-verify.log
verification_log_sha256: 220f82ae796371183f15a8ae027e333bbe60c27b0f212755c0cb9b0935e6991a
---

# Punctuation QG P10 — Machine-Gate Completion Report

## Executive summary

P10 closes the remaining generated-item lexical-preservation leak for closed punctuation transfer items. Closed generated and fixed `insert` and `fix` items now reject any failed preservation, including same-count lexical substitutions where the learner changes a content word but keeps the punctuation shape.

The machine-verifiable P10 gates pass under Node `v22.16.0` / npm `10.9.2`. The canonical verifier reports `BLOCKED_PENDING_HUMAN_ACCEPTANCE`, not a production-certified status, because named human acceptance is still `not_started` in the reviewer fixture and live production smoke is `not_run`.

## Delivery mapping

| Contract item | Delivery state | Evidence |
|---|---:|---|
| U1 lexical preservation lock | Done | `shared/punctuation/marking.js` rejects any failed preservation for closed `insert` / `fix` transfer items. |
| U2 P10 lexical-replacement oracle | Done | `tests/punctuation-closed-lexical-preservation-p10.test.js`, 4 tests passing. |
| U3 P10 verifier | Done | `npm run verify:punctuation-qg:p10`, 10 top-level gates / 56 logical gates. |
| U4 certification manifest and validator | Done, non-certifying | `reports/punctuation/punctuation-qg-p10-certification-manifest.json` and `scripts/validate-punctuation-qg-certification-evidence.mjs`. |
| U5 human acceptance truth gate | Blocked honestly | Fixture still has `human_acceptance.status: not_started`; verifier blocks public certification. |
| U6 live production smoke | Not run | Manifest records `liveProductionSmoke.status: not_run`; verifier blocks post-deploy certification. |
| U7 depth-6 scope | Preserved blocked | `PRODUCTION_DEPTH` remains 4; depth-6 candidate delta remains blocked. |

## Verification evidence

Canonical P10 verifier:

```text
PATH=/Users/jamesto/.nvm/versions/node/v22.16.0/bin:$PATH npm run verify:punctuation-qg:p10
Top-level gates: 10
Logical gates: 56
Passed: 10/10
Failed: 0
Production depth: 4
Certification: BLOCKED_PENDING_HUMAN_ACCEPTANCE
```

Archived verifier output:

```text
reports/punctuation/punctuation-qg-p10-verify.log
sha256: 220f82ae796371183f15a8ae027e333bbe60c27b0f212755c0cb9b0935e6991a
```

Focused checks:

```text
node --test tests/punctuation-closed-lexical-preservation-p10.test.js
4 tests pass; 123 closed transfer items inspected; 481 lexical-replacement probes; 139 model/accepted answers checked.

node --test tests/punctuation-closed-preservation-productionisation.test.js
17 tests pass.

node --test tests/punctuation-negative-vectors.test.js
14 tests pass.

node --test tests/punctuation-reviewer-cluster-alignment.test.js tests/punctuation-review-authority.test.js tests/punctuation-production-evidence.test.js
24 tests pass.

node scripts/review-punctuation-questions.mjs --summary --json
192 production items approved; 47 review-required clusters approved.

node scripts/validate-punctuation-qg-certification-evidence.mjs reports/punctuation/punctuation-qg-p10-certification-manifest.json --root .
PASS, with the expected non-certifying warning that the current manifest is not tied to a committed source SHA.
```

Repository checks:

```text
npm run check
PASS: Wrangler dry-run build, public assert, and client bundle audit passed.

npm test
FAIL: 16209 pass, 15 fail, 6 skipped.
Observed reproduced failure: tests/grammar-phase3-child-copy.test.js has two dashboard fixture failures:
scopeDashboard: no data-grammar-phase-root="dashboard" landmark found in rendered HTML.
This is outside the Punctuation P10 marking/verifier change surface.
```

## Evidence boundaries

Source-proven: the P10 preservation lock, lexical-replacement oracle, verifier, manifest validator, reviewer count checks, depth-4 lock, and depth-6 block are all present in the working tree and locally exercised under Node 22.

Local-run-proven: the P10 verifier and focused Punctuation gates pass locally. The archived verifier log is recorded with an exact SHA-256 digest.

Human-accepted: not proven. The current fixture explicitly records `human_acceptance.status: not_started`.

Live-production-proven: not proven. No smoke was run against `https://ks2.eugnel.uk` for this P10 release identity.

## Final status

Punctuation QG P10 is machine-gate complete for the depth-4 source snapshot, but it is not public-production-certified yet. The correct current status is:

```text
BLOCKED_PENDING_HUMAN_ACCEPTANCE
```

The release may only move to `CERTIFIED_PRE_DEPLOY` after named human acceptance is recorded. It may only move to `CERTIFIED_POST_DEPLOY` after live production smoke passes with origin, environment, release identity, deployed commit or Worker version, timestamp, result, artefact path, and artefact SHA-256.
