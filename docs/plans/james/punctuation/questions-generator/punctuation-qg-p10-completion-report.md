---
phase: punctuation-qg-p10
title: Punctuation QG P10 — Post-Deploy Certification Report
status: certified_post_deploy
owner: KS2 Mastery / Punctuation
language: en-GB
created: 2026-04-30
source_contract: docs/plans/james/punctuation/questions-generator/punctuation-qg-p10.md
verification_log: reports/punctuation/punctuation-qg-p10-verify.log
verification_log_sha256: fe9f36d7766e5e1136ef6465cc091b06a434cb44afa1fdadf3348a4152f9a320
---

# Punctuation QG P10 — Post-Deploy Certification Report

## Executive summary

P10 closes the remaining generated-item lexical-preservation leak for closed punctuation transfer items. Closed generated and fixed `insert` and `fix` items now reject any failed preservation, including same-count lexical substitutions where the learner changes a content word but keeps the punctuation shape.

The machine-verifiable P10 gates pass under Node `v22.16.0` / npm `10.9.2`. James has accepted the depth-4 P10 release scope as product owner: 192 production items and 47 review-required clusters. The release was deployed to production and the Punctuation production smoke passed against `https://ks2.eugnel.uk`, so the canonical verifier reports `CERTIFIED_POST_DEPLOY`.

## Delivery mapping

| Contract item | Delivery state | Evidence |
|---|---:|---|
| U1 lexical preservation lock | Done | `shared/punctuation/marking.js` rejects any failed preservation for closed `insert` / `fix` transfer items. |
| U2 P10 lexical-replacement oracle | Done | `tests/punctuation-closed-lexical-preservation-p10.test.js`, 4 tests passing. |
| U3 P10 verifier | Done | `npm run verify:punctuation-qg:p10`, 10 top-level gates / 56 logical gates. |
| U4 certification manifest and validator | Done, post-deploy certifying | `reports/punctuation/punctuation-qg-p10-certification-manifest.json` and `scripts/validate-punctuation-qg-certification-evidence.mjs`. |
| U5 human acceptance truth gate | Done | Fixture records James as product-owner acceptor for 192 items and 47 review-required clusters, with no blockers. |
| U6 live production smoke | Done | `reports/punctuation/punctuation-qg-p10-production-smoke-2026-04-30.json`; release `punctuation-r4-full-14-skill-structure`, 192 runtime items, generated depth 4. |
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
Certification: CERTIFIED_POST_DEPLOY
```

Post-deploy production smoke:

```text
node ./scripts/punctuation-production-smoke.mjs --env production --commit-sha 2169acdac51848c9f0f2691b2da00f5fe5aa6c55 --json
origin: https://ks2.eugnel.uk
worker: b9a9bf07-817a-44d8-b7b1-7897f4f334d9
releaseId: punctuation-r4-full-14-skill-structure
runtimeItems: 192
generatedDepth: 4
sha256: 0d80db44fa033f5ddc5874fa318f3e7aca3006446afb6a19d16c91bfbce04196
```

Archived verifier output:

```text
reports/punctuation/punctuation-qg-p10-verify.log
sha256: fe9f36d7766e5e1136ef6465cc091b06a434cb44afa1fdadf3348a4152f9a320
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

Live-production-proven: proven. Production smoke passed against `https://ks2.eugnel.uk` for release `punctuation-r4-full-14-skill-structure`, merged main commit `2169acdac51848c9f0f2691b2da00f5fe5aa6c55`, and Worker version `b9a9bf07-817a-44d8-b7b1-7897f4f334d9`.

## Final status

Punctuation QG P10 is certified post-deploy for the depth-4 source snapshot. The correct current status is:

```text
CERTIFIED_POST_DEPLOY
```
