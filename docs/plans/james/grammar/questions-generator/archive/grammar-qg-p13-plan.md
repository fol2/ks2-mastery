---
title: "Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p13.md
---

# Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification

## Overview

Deliver P13 as a production-certification phase for the already frozen P11 content release (`grammar-qg-p11-2026-04-30`). The main change is to make the Worker runtime use the P11/P12 certification status map as its fail-closed scheduling authority, then make the release validator prove that runtime authority matches the manifest artefact.

## Requirements Trace

- R1. Keep `GRAMMAR_CONTENT_RELEASE_ID` at `grammar-qg-p11-2026-04-30`.
- R2. Replace the P10/Node-fs runtime status fallback with a Worker-safe generated source.
- R3. Preserve `approved_with_limitation` and `approved_with_review` as schedulable diagnostic decisions.
- R4. Add a generator and drift guard for the committed runtime status module.
- R5. Extend the release validator to compare manifest, status-map artefact and runtime status authority.
- R6. Validate manifest output paths and use `manifest.artefacts` as canonical release evidence.
- R7. Keep post-deploy certification honest: no `CERTIFIED_POST_DEPLOY` report until live smoke evidence exists.
- R8. Add rollback/blocklist operating notes.
- R9. Do not change scoring, mastery, rewards, Hero Mode, Stars, Mega, Hero Coins or monster progression.

## Scope Boundaries

- No new Grammar templates, concepts, question types or reward mechanics.
- No question-pool changes unless an S0/S1 content defect is found.
- P10 artefacts remain historical only; they must not be active production authority for the P11 release.
- Live production smoke requires a deployed Worker. If deployment is not possible in the current environment, the report must stay pre-deploy and record the exact command to run after deployment.

## Implementation Units

### U1 — Runtime Certification Source

Create `scripts/generate-grammar-qg-runtime-certification-status.mjs`, generate `worker/src/subjects/grammar/certification-status.generated.js` from `reports/grammar/grammar-qg-p11-certification-status-map.json`, and refactor `worker/src/subjects/grammar/certification-status.js` to import it without Node `fs`, `require`, dynamic JSON loading or all-approved fallback behaviour.

Acceptance:
- Runtime map has release ID `grammar-qg-p11-2026-04-30` and 78 entries.
- Unknown, empty and non-string template IDs are blocked.
- `blocked` and `retire_candidate` are unschedulable; `approved_with_limitation` and `approved_with_review` remain schedulable.

### U2 — Generator Drift Guard

The generator must validate release ID, duplicate IDs, template count, missing current templates and unknown non-retired entries. The release validator must regenerate to a temporary file and fail if the committed generated source is stale.

Acceptance:
- A newly added metadata template with no status entry fails closed.
- A stale generated runtime source fails the release validator.

### U3 — Runtime Authority Validator

Extend `scripts/validate-grammar-qg-certification-evidence.mjs` so it verifies `manifest.artefacts.certificationStatusMap`, status-map metadata, runtime release ID, runtime entries, exact template coverage, unknown-template blocking and absence of active P10 runtime authority.

Acceptance:
- P10 runtime loading and all-approved fallback patterns fail validation.
- Mismatch messages name exact template IDs.

### U4 — Test Label and Authority Repair

Update stale P9/P10/P11 scheduler tests so historical artefacts remain historical, while active scheduler tests assert P11/P12-derived runtime authority.

Acceptance:
- Release-critical tests do not load P10 status maps as P12/P13 authority.
- Historical P10 tests are clearly named historical and excluded from active runtime parity claims.

### U5 — Manifest Path Validation

Update the P11 manifest generator and committed manifest so `expectedOutputPaths` names existing canonical render inventory paths. Add validator coverage for missing expected output paths.

Acceptance:
- Every `expectedOutputPaths` entry exists.
- Canonical release validation uses `manifest.artefacts`.

### U6 — Report and Operating Notes

Create the P13 completion/certification report. Keep status pre-deploy until production smoke evidence exists. Add rollback/blocklist notes that explain how to block a template, regenerate the runtime source and rerun gates.

Acceptance:
- No `CERTIFIED_POST_DEPLOY` claim without valid smoke JSON.
- Report counts match artefact metadata.
- Report documents Node/version evidence collected locally and the Node 22 production-gate requirement.

## Verification

- `node scripts/generate-grammar-qg-runtime-certification-status.mjs --status-map=reports/grammar/grammar-qg-p11-certification-status-map.json --out=worker/src/subjects/grammar/certification-status.generated.js`
- `node --test tests/grammar-qg-p13-runtime-certification.test.js tests/grammar-qg-p12-validator-paths.test.js tests/grammar-qg-p12-release-gate.test.js tests/grammar-qg-p11-scheduler-blocklist.test.js tests/grammar-qg-p10-scheduler-safety.test.js tests/grammar-qg-p9-blocklist-scheduler.test.js`
- `npm run verify:grammar-qg-production-release`
- `npm test`
- `npm run check`

Production smoke after deployment:

```bash
npm run smoke:production:grammar -- \
  --json \
  --evidence-origin=post-deploy \
  --expected-release=grammar-qg-p11-2026-04-30 \
  --out=reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json
```
