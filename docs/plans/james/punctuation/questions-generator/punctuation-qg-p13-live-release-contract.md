# Punctuation QG P13 — Live Serving Release Contract

## Purpose

P13 is not another content-expansion phase. P12 created the 3000+ Punctuation QG content pool. P13 is the live-serving release gate that deploys that pool and proves production is actually serving it.

The P13 live claim is only valid when the live production smoke artefact proves the deployed origin is serving the P12 3000+ content pool.

## Source and evidence boundary

Evidence layers must stay separate:

- The uploaded lean ZIP proves the supplied source snapshot only.
- P12 local verification proves the source/runtime pool in that extracted snapshot.
- GitHub PR metadata proves merge/review state only.
- Production is proven only by a live smoke artefact from `https://ks2.eugnel.uk` with origin, timestamp, release id, deployed identity, runtime counts, and pass/fail result.

A local verifier pass must not be described as live-serving proof.

## P13 release semantics

- P13 phase id: `punctuation-qg-p13-live-serving`
- Content release id served by P13: `punctuation-qg-p12-3000-2026-05-02`
- Expected origin: `https://ks2.eugnel.uk`
- Expected production depth: `100`
- Expected fixed items: `512`
- Expected generated items: `2800`
- Expected total runtime items: `3312`
- Expected generated families: `28`
- Expected generated templates per family: `100`
- Expected published reward units: `14`

P13 does not need to rename the content release id. P13 is the deployment/live-serving gate for the P12 content release.

## What changed in this pack

This pack adds the missing P13 deployment and live-serving proof machinery:

1. `scripts/punctuation-qg-p13-live-smoke.mjs`
   - Creates a production demo session.
   - Starts a live Smart Practice six-question punctuation session.
   - Answers all six questions through Worker subject commands.
   - Verifies the live read model exposes 3312 runtime items.
   - Verifies the live session reaches a six-question summary.
   - Records every surfaced item id, mode, source, and skill ids.

2. `scripts/validate-punctuation-qg-p13-live-evidence.mjs`
   - Hard-gates the production smoke artefact.
   - Rejects P11-style 1268-item artefacts.
   - Rejects one-item-only Smart smoke as insufficient for P13.
   - Requires deployed identity via `workerCommitSha`, `workerVersionId`, or `deploymentId`.

3. `scripts/verify-punctuation-qg-p13-predeploy.mjs`
   - Runs P12 expansion verification.
   - Runs Punctuation service/runtime/release-smoke source tests.
   - Runs P13 live-evidence validator tests.
   - Writes `reports/punctuation/punctuation-qg-p13-predeploy-evidence.json`.

4. `scripts/deploy-punctuation-qg-p13-live.mjs`
   - Runs predeploy verification.
   - Runs the existing deployment command.
   - Runs the P13 live smoke.
   - Validates the P13 live smoke artefact.

5. Production smoke expectation fix
   - `scripts/punctuation-production-smoke.mjs` now derives local release-manifest expectations from the active runtime manifest instead of carrying stale P11 counts.

6. Source tests fixed for the P12/P13 pool
   - Punctuation service tests now expect 512 fixed, 2800 generated, and 3312 total runtime items.

## Commands

Predeploy source gate:

```bash
npm run verify:punctuation-qg:p13-predeploy
```

Production live smoke after deployment:

```bash
node scripts/punctuation-qg-p13-live-smoke.mjs \
  --env production \
  --authenticated \
  --origin https://ks2.eugnel.uk \
  --commit-sha <deployed-commit-sha> \
  --out reports/punctuation/punctuation-qg-p13-production-smoke.json
```

Validate the live evidence:

```bash
npm run verify:punctuation-qg:p13-live
```

One-command deployment wrapper, when run inside the real repository with Cloudflare credentials:

```bash
npm run deploy:punctuation-qg:p13 -- --commit-sha <deployed-commit-sha>
```

## Acceptance criteria

P13 is live-serving certified only when all of the following are true:

- P12 source verifier passes.
- Punctuation release-smoke/source runtime tests pass with P12/P13 counts.
- P13 predeploy evidence is generated and passing.
- Deployment command completes successfully.
- `reports/punctuation/punctuation-qg-p13-production-smoke.json` exists.
- The smoke artefact has `ok: true`.
- The smoke artefact origin is `https://ks2.eugnel.uk`.
- The smoke artefact attestation environment is `production`.
- The smoke artefact release phase is `punctuation-qg-p13-live-serving`.
- The smoke artefact release id is `punctuation-qg-p12-3000-2026-05-02`.
- The smoke artefact runtime count is `3312`.
- The smoke artefact generated depth is `100`.
- The smoke artefact includes a deployed identity: `workerCommitSha`, `workerVersionId`, or `deploymentId`.
- The smoke artefact proves authenticated coverage.
- The smoke artefact proves a live six-question Smart Practice session with six unique surfaced items and zero immediate repeats.
- The smoke artefact proves Parent Hub Punctuation evidence after the six-question command-path run, including redaction checks.
- The live evidence validator exits 0.

## Non-goals

P13 does not add more questions beyond P12.

P13 does not claim Admin Hub production smoke coverage unless admin credentials are available and the smoke artefact explicitly records it.

P13 does not claim full human review of every generated item. It proves the P12 source pool is deployed and live-serving through the production Worker path.

## Correct claim after successful P13 deploy

> Punctuation QG P13 is live-serving certified for the P12 3000+ content pool on `https://ks2.eugnel.uk`: production is serving 3312 runtime items, including 512 fixed and 2800 generated items, at generated depth 100. The proof is the P13 production smoke artefact with deployment identity and a six-question Smart Practice command-path run.

## Incorrect claims

Do not claim P13 is live-serving certified if only the ZIP/local verifier passes.

Do not claim P13 if production still reports P11 / 1268 items.

Do not claim P13 if the live smoke is one-item-only.

Do not claim deployed Worker identity if `workerCommitSha`, `workerVersionId`, and `deploymentId` are all absent.
