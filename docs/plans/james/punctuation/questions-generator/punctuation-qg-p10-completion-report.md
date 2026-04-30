---
phase: punctuation-qg-p10
title: Punctuation QG P10 — Pre-Deploy Certification Report
status: certified_pre_deploy
owner: KS2 Mastery / Punctuation
language: en-GB
created: 2026-04-30
source_contract: docs/plans/james/punctuation/questions-generator/punctuation-qg-p10.md
verification_log: reports/punctuation/punctuation-qg-p10-verify.log
verification_log_sha256: d50205eb5d034233a13e275c853209543f608fbf0daa0ccb07e9e291d8cb4b8e
---

# Punctuation QG P10 — Pre-Deploy Certification Report

## Executive summary

P10 closes the remaining generated-item lexical-preservation leak for closed punctuation transfer items. Closed generated and fixed `insert` and `fix` items now reject any failed preservation, including same-count lexical substitutions where the learner changes a content word but keeps the punctuation shape.

The machine-verifiable P10 gates pass under Node `v22.16.0` / npm `10.9.2`. James has accepted the depth-4 P10 release scope as product owner: 192 production items and 47 review-required clusters. The canonical verifier therefore reports `CERTIFIED_PRE_DEPLOY`. Live production smoke is still `not_run`, so post-deploy certification is not claimed.

## Delivery mapping

| Contract item | Delivery state | Evidence |
|---|---:|---|
| U1 lexical preservation lock | Done | `shared/punctuation/marking.js` rejects any failed preservation for closed `insert` / `fix` transfer items. |
| U2 P10 lexical-replacement oracle | Done | `tests/punctuation-closed-lexical-preservation-p10.test.js`, 4 tests passing. |
| U3 P10 verifier | Done | `npm run verify:punctuation-qg:p10`, 10 top-level gates / 56 logical gates. |
| U4 certification manifest and validator | Done, pre-deploy certifying | `reports/punctuation/punctuation-qg-p10-certification-manifest.json` and `scripts/validate-punctuation-qg-certification-evidence.mjs`. |
| U5 human acceptance truth gate | Done | Fixture records James as product-owner acceptor for 192 items and 47 review-required clusters, with no blockers. |
| U6 live production smoke | Not run | Manifest records `liveProductionSmoke.status: not_run`; verifier blocks post-deploy certification. |
| U7 depth-6 scope | Preserved blocked | `PRODUCTION_DEPTH` remains 4; depth-6 candidate delta remains blocked. |

## AI simulated acceptance

James requested a simulated human-acceptance pass after the first machine-gate delivery. That review has been recorded as:

```text
reports/punctuation/punctuation-qg-p10-ai-simulated-acceptance.json
sha256: cfbe2bc3da100a4d37b80258741ee1a95e5bfec8537835e04f099525c6337f0c
decision: ACCEPTED_AS_AI_SIMULATION
certificationAuthority: false
mustNotBeUsedAsHumanAcceptance: true
```

This is useful second-pass review evidence, but it deliberately does not satisfy the P10 human acceptance requirement. The P10 human acceptance requirement is satisfied only by James's explicit depth-4 approval, recorded separately in the reviewer fixture and manifest.

## Verification evidence

Canonical P10 verifier:

```text
PATH=/Users/jamesto/.nvm/versions/node/v22.16.0/bin:$PATH npm run verify:punctuation-qg:p10
Top-level gates: 10
Logical gates: 56
Passed: 10/10
Failed: 0
Production depth: 4
Certification: CERTIFIED_PRE_DEPLOY
```

Archived verifier output:

```text
reports/punctuation/punctuation-qg-p10-verify.log
sha256: d50205eb5d034233a13e275c853209543f608fbf0daa0ccb07e9e291d8cb4b8e
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
PASS.
```

Repository checks:

```text
npm run check
PASS: Wrangler dry-run build, public assert, and client bundle audit passed.

npm test
PASS: 16266 pass, 0 fail, 6 skipped.
```

## Evidence boundaries

Source-proven: the P10 preservation lock, lexical-replacement oracle, verifier, manifest validator, reviewer count checks, depth-4 lock, and depth-6 block are all present in the working tree and locally exercised under Node 22.

Local-run-proven: the P10 verifier and focused Punctuation gates pass locally. The archived verifier log is recorded with an exact SHA-256 digest.

AI-simulated accepted: proven as a non-certifying review artefact. It is explicitly barred from satisfying human acceptance.

Human-accepted: proven for depth 4. James accepted the 192-item production pool and 47 review-required clusters on 2026-04-30 as product owner, with no blockers.

Live-production-proven: not proven. No smoke was run against `https://ks2.eugnel.uk` for this P10 release identity.

## Final status

Punctuation QG P10 is certified pre-deploy for the depth-4 source snapshot. The correct current status is:

```text
CERTIFIED_PRE_DEPLOY
```

The release may only move to `CERTIFIED_POST_DEPLOY` after live production smoke passes with origin, environment, release identity, deployed commit or Worker version, timestamp, result, artefact path, and artefact SHA-256.
