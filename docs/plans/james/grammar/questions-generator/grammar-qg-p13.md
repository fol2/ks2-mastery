---
phase: grammar-qg-p13
title: Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification Contract
status: proposed
language: en-GB
owner: Grammar / Platform Engineering
baseline_content_release_id: grammar-qg-p11-2026-04-30
intended_certification_outcome: CERTIFIED_POST_DEPLOY
scoring_or_mastery_change: false
reward_or_star_change: false
hero_mode_change: false
---

# Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification Contract

## 1. Purpose

P12 closes the evidence artefact gap for the `grammar-qg-p11-2026-04-30` content release: the manifest, render inventory, quality register, distractor audit, marking matrix and status map are all regenerated under P11 identity, and the release validator is manifest-driven.

However, P12 is still a pre-deploy certification package. P13 is the productionisation contract. It must prove that the runtime Worker, the release gate, and the deployed production environment are all using the same certified content and the same certification status source.

The central issue P13 must fix is simple: evidence artefacts must not be passive documents. The learner-facing scheduler must be governed by the same certification status decisions that the P11/P12 evidence package declares.

## 2. Current P12 validation finding that motivates P13

The P12 artefacts are present and internally consistent, but the current runtime `worker/src/subjects/grammar/certification-status.js` still reads `reports/grammar/grammar-qg-p10-certification-status-map.json` in Node and falls back to an all-approved map derived from `GRAMMAR_TEMPLATE_METADATA` in Cloudflare Worker environments.

That means the P11 certification status map exists as an evidence artefact, but it is not the production runtime authority. It also means a future new template added to `GRAMMAR_TEMPLATE_METADATA` could be treated as approved in the Worker fallback path even if it had never been added to the certification status map. That is the opposite of fail-closed production behaviour.

P13 must replace this with a Worker-safe generated status source that contains the certified P11 decisions directly and fails closed for unknown template IDs.

## 3. Non-goals

P13 must not add new templates, concepts, question types or reward mechanics.

P13 must not change Grammar scoring, mastery progression, Stars, Mega, Concordium, Hero Mode, Hero Coins or monster progression.

P13 must not treat production certification as complete until live smoke evidence exists for `grammar-qg-p11-2026-04-30`.

## 4. Required implementation units

### U0 — Freeze the release evidence boundary

Treat `grammar-qg-p11-2026-04-30` as the content release being certified. P13 may change release tooling, generated runtime status code, tests, reports and deployment evidence, but it must not change the question pool unless a blocking S0/S1 content defect is found.

Acceptance:

- `GRAMMAR_CONTENT_RELEASE_ID` remains `grammar-qg-p11-2026-04-30`.
- P13 report states that P13 is a production-certification phase for P11 content, not a new content release.
- Any content change requires an explicit release ID decision and a new evidence rebuild.

### U1 — Replace runtime status fallback with a Worker-safe certified map

Generate a Worker-safe source module from `reports/grammar/grammar-qg-p11-certification-status-map.json`.

The generated module must not use Node `fs`, `require`, dynamic JSON loading, or an all-approved fallback. It must embed the certified template entries directly or import them from a bundler-safe generated JS module.

The runtime helper must use the certified entries as its only source of truth:

```js
export function isTemplateBlocked(templateId) {
  if (typeof templateId !== 'string' || !templateId) return true;
  const entry = CERTIFICATION_STATUS_MAP[templateId];
  if (!entry) return true;
  return entry.status === 'blocked' || entry.status === 'retire_candidate';
}
```

`approved_with_limitation` and `approved_with_review` remain schedulable, but their decision must be preserved for diagnostics, analytics and parent/admin surfaces.

Acceptance:

- `worker/src/subjects/grammar/certification-status.js` no longer references `grammar-qg-p10-certification-status-map.json`.
- It no longer builds an all-approved map from `GRAMMAR_TEMPLATE_METADATA` as a Worker fallback.
- Runtime map contains 78 entries and release ID `grammar-qg-p11-2026-04-30`.
- The four `approved_with_limitation` templates are represented as such in runtime diagnostics, not flattened to plain approved.
- Unknown template IDs return blocked.
- Tests simulate a newly added metadata template with no status entry and prove it is blocked.

Suggested starting point: use the attached `certification-status.p13.proposed.js` as a replacement template, then wire it into the repository with project naming conventions.

### U2 — Add a generated-source drift guard

Add a script such as:

```bash
node scripts/generate-grammar-qg-runtime-certification-status.mjs \
  --status-map=reports/grammar/grammar-qg-p11-certification-status-map.json \
  --out=worker/src/subjects/grammar/certification-status.generated.js
```

The release gate must regenerate to a temp file and compare byte-for-byte with the committed generated source. If the artefact changes and the generated runtime source is not updated, the gate must fail.

Acceptance:

- The generator validates release ID, template count, duplicate template IDs and stale entries.
- The generator rejects missing entries for any current `GRAMMAR_TEMPLATE_METADATA` template.
- The generator rejects unknown entries not present in `GRAMMAR_TEMPLATE_METADATA` unless explicitly marked as retired historical entries and excluded from runtime scheduling.
- The release gate fails if the committed generated module is stale.

### U3 — Make the release validator check runtime status authority

Extend `scripts/validate-grammar-qg-certification-evidence.mjs` with a runtime authority gate.

The validator must verify:

- manifest `contentReleaseId` equals code release ID;
- manifest `artefacts.certificationStatusMap` exists;
- status map metadata release ID equals manifest release ID;
- runtime `CERTIFICATION_STATUS_MAP` release ID equals manifest release ID;
- runtime entries match the status map entries;
- all current templates have exactly one runtime status entry;
- unknown template IDs are blocked;
- no P10 status map path is referenced by release-critical code.

Acceptance:

- A manifest pointing to P11 artefacts but a runtime module still loading P10 status map fails.
- A runtime module that all-approves metadata in Worker fallback fails.
- A status-map shape mismatch fails with a clear error.
- The validator output names the exact mismatching templates.

### U4 — Repair and rename stale P10/P11/P12 test labels

Current tests and comments still contain stale P10/P11 wording in several places. P13 must clean the release-critical tests so that their names match what they are actually proving.

Acceptance:

- Scheduler blocklist tests reference the P11/P12 status source, not P10.
- Tests do not load `grammar-qg-p10-certification-status-map.json` for a P12/P13 release decision.
- Historical P10 tests may remain, but they must be clearly named as historical and excluded from production-release authority.

### U5 — Validate expected output paths in the manifest

The P11 certification manifest still includes legacy `expectedOutputPaths` pointing to `grammar-qg-p11-question-inventory.json` and `grammar-qg-p11-question-inventory-redacted.md`, while the actual canonical artefacts are render inventory paths under `artefacts.renderInventory` and `artefacts.renderInventoryRedacted`.

P13 must either remove `expectedOutputPaths` or update and validate them.

Acceptance:

- Every path named in the manifest either exists or is explicitly marked as legacy/non-authoritative.
- The validator fails if a manifest names a missing expected output path.
- Canonical release validation uses `manifest.artefacts`, not stale expected path fields.

### U6 — Run the production release gate in a CI-compatible Node 22 environment

The local review environment may be Node 18, while the project declares Node 22. The CI/release environment must run the full release gate under the declared runtime.

Acceptance:

- CI evidence records Node version, command, commit SHA and pass/fail result.
- `npm run verify:grammar-qg-production-release` passes under Node 22.
- Any tests using Node 22 features such as `import.meta.dirname` are covered in CI.
- The final report does not rely on Node 18 local reviewer limitations.

### U7 — Produce live production smoke evidence

Run the production smoke after deploying the Worker that serves `grammar-qg-p11-2026-04-30`.

Required command shape:

```bash
npm run smoke:production:grammar -- \
  --json \
  --evidence-origin=post-deploy \
  --expected-release=grammar-qg-p11-2026-04-30 \
  --out=reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json
```

The smoke must prove at minimum:

- production endpoint reachable;
- Worker reports or serves `grammar-qg-p11-2026-04-30`;
- Grammar item creation succeeds;
- selected-response answer submission succeeds;
- constructed-response answer submission succeeds;
- a target-sentence cue item returns the correct read-aloud/screen-reader text;
- a noun-phrase underline item says noun phrase, not word;
- read model updates after submission;
- client-facing payload does not leak answer internals;
- evidence origin is `post-deploy` and environment is production.

Acceptance:

- Smoke JSON exists at the manifest production smoke path.
- Smoke JSON contains release ID, environment, deployed URL, timestamp, command, assertions and failure details.
- Validator rejects `CERTIFIED_POST_DEPLOY` if this file is absent, stale, malformed or for the wrong release.

### U8 — Upgrade final report only after live smoke passes

Until U7 passes, P13 final report must remain `CERTIFIED_PRE_DEPLOY` or `CERTIFIED_WITH_LIMITATIONS_PRE_DEPLOY`.

After U7 passes, update the final report to `CERTIFIED_POST_DEPLOY` and include:

- deployment URL;
- smoke evidence path;
- smoke timestamp;
- release ID;
- command run;
- pass/fail summary;
- any limitations still open.

Acceptance:

- `CERTIFIED_POST_DEPLOY` appears only after valid production smoke evidence is committed or attached according to the repository evidence policy.
- Report frontmatter has no placeholder values.
- Report count claims match artefact metadata.
- Report clearly says whether certification is pre-deploy or post-deploy.

### U9 — Add production rollback and blocklist operating notes

If production smoke fails after deployment, operators need a clear action path.

Acceptance:

- Add a short rollback/blocklist section to the P13 report or runbook.
- Document how to temporarily block a template in the certified runtime map.
- Document how to regenerate runtime status source and rerun gates.
- Document that blocking a template changes active denominator and must be reflected in reports.

## 5. Acceptance criteria

P13 is accepted only when all of the following are true:

- Runtime certification status source is P11/P12-derived, Worker-safe and fail-closed.
- No release-critical code loads P10 certification status artefacts for the P11 release.
- No all-approved metadata fallback remains in production runtime.
- Manifest artefact paths are all valid or explicitly marked legacy/non-authoritative.
- Semantic prompt-cue audit passes 2,340 items.
- Content-quality audit passes 2,340 checks with 0 hard failures and 0 advisories.
- Release validator passes manifest, report, artefacts, runtime status authority and smoke gating.
- Full release gate passes in Node 22 CI.
- Live production smoke exists and passes before any `CERTIFIED_POST_DEPLOY` claim.
- No scoring, mastery, reward, Stars, Mega, Hero Mode, Hero Coins or monster progression changes are made.

## 6. Definition of production-ready

Production-ready means more than local tests passing.

For Grammar QG, production-ready means:

1. the deployed Worker serves the certified release;
2. the scheduler is controlled by the certified runtime status source;
3. the question pool has passed content, marking, distractor and semantic prompt-cue checks;
4. live smoke proves learner-facing create/answer/read-model flow works in production;
5. the final report is evidence-backed and has no stale P10/P11/P12 path confusion.

Until then, the honest status is release candidate, not post-deploy certified production.

## 7. Suggested engineer checklist

1. Generate `certification-status.generated.js` from P11 status map.
2. Replace `certification-status.js` Node-fs/P10 fallback with generated source import.
3. Add runtime-vs-artefact validator gate.
4. Fix manifest `expectedOutputPaths` or mark them legacy.
5. Run P12/P13 tests under Node 22.
6. Deploy to production or staging-prod according to the release process.
7. Run production smoke and attach evidence.
8. Upgrade final report only after smoke passes.

## 8. Suggested product wording

Use this until live smoke passes:

> Grammar QG is pre-deploy certified for the P11 content release. The question pool and learner-surface evidence are locked, but post-deploy certification is pending production smoke.

Use this only after live smoke passes:

> Grammar QG is post-deploy certified for `grammar-qg-p11-2026-04-30`: the deployed Worker served the certified question pool, the scheduler used the certified runtime status source, learner item creation and answer submission passed, and no client-facing answer leakage was detected.
