---
phase: grammar-qg-p13
title: Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification
certification_decision: CERTIFIED_PRE_DEPLOY
certification_phase: grammar-qg-p13
final_content_release_id: grammar-qg-p11-2026-04-30
content_release_unchanged: true
scoring_change: none
mastery_change: none
reward_change: none
hero_mode_change: none
post_deploy_smoke_evidence: pending-deployment
template_count: 78
concept_count: 18
inventory_item_count: 2340
limitations:
  - Production smoke evidence is pending deployment.
  - Node 22 release-gate evidence must be captured in CI or a Node 22 runtime before post-deploy certification.
  - Repository-wide npm test is currently blocked by non-P13 failures and must be green before deployment.
---

# Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification

## Executive Summary

P13 keeps `grammar-qg-p11-2026-04-30` as the frozen content release and productionises the certification source. The learner-facing scheduler now uses a Worker-safe generated runtime status module derived from `reports/grammar/grammar-qg-p11-certification-status-map.json`; it no longer loads the historical P10 status map, uses Node `fs` or `require`, or creates an all-approved metadata fallback.

Current decision: **CERTIFIED_PRE_DEPLOY**. Post-deploy certification remains pending until the deployed Worker is smoke-tested and the evidence JSON is committed or attached according to repository policy.

## Contract Mapping

| Requirement | Delivery |
|-------------|----------|
| Freeze P11 release boundary | `GRAMMAR_CONTENT_RELEASE_ID` remains `grammar-qg-p11-2026-04-30`; no content, scoring, mastery, reward, Stars, Mega, Hero Mode, Hero Coins or monster progression changes were made. |
| Worker-safe certified runtime map | Added `worker/src/subjects/grammar/certification-status.generated.js`, generated from the P11 status map, and refactored `certification-status.js` to import it directly. |
| Fail-closed unknown templates | `isTemplateBlocked()` blocks non-string, empty and unknown template IDs. |
| Preserve limited decisions | Runtime status counts are 74 approved + 4 approved_with_limitation templates; limited templates remain schedulable and diagnostic status is preserved. |
| Generated-source drift guard | Added `scripts/generate-grammar-qg-runtime-certification-status.mjs`; the validator regenerates expected source and fails on byte drift. |
| Runtime authority validator | `scripts/validate-grammar-qg-certification-evidence.mjs` now checks manifest status map, runtime release ID, template count, per-template status/evidence parity, fail-closed unknown IDs and active P10 authority references. |
| Manifest expected paths | `expectedOutputPaths` now names the canonical render inventory files, and the validator fails missing expected paths. |
| Production smoke honesty | Report remains pre-deploy until `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` exists and passes validation. |
| Rollback/blocklist notes | See the operating notes below. |

## Evidence Artefacts

| Artefact | Path | Status |
|----------|------|--------|
| Certification manifest | `reports/grammar/grammar-qg-p11-certification-manifest.json` | P11 release, P12/P13 evidence boundary |
| Render inventory | `reports/grammar/grammar-qg-p11-render-inventory.json` | 2,340 items |
| Render inventory redacted | `reports/grammar/grammar-qg-p11-render-inventory-redacted.md` | canonical learner-safe inventory |
| Quality register | `reports/grammar/grammar-qg-p11-quality-register.json` | 74 approved + 4 approved_with_limitation templates |
| Distractor audit | `reports/grammar/grammar-qg-p11-distractor-audit.json` | no S0/S1 hard failures |
| Marking matrix | `reports/grammar/grammar-qg-p11-marking-matrix.json` | 80 marking matrix entries |
| Certification status map | `reports/grammar/grammar-qg-p11-certification-status-map.json` | runtime authority source |
| Generated runtime source | `worker/src/subjects/grammar/certification-status.generated.js` | Worker-safe committed source |
| Production smoke | `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` | pending deployment |

## Release Gate

Run before deployment:

```bash
npm run verify:grammar-qg-production-release
```

Run after deployment:

```bash
npm run smoke:production:grammar -- \
  --json \
  --evidence-origin=post-deploy \
  --expected-release=grammar-qg-p11-2026-04-30 \
  --out=reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json
```

The report can move to `CERTIFIED_POST_DEPLOY` only after that smoke evidence proves the production endpoint is reachable, the Worker serves `grammar-qg-p11-2026-04-30`, item creation and selected/constructed answer submission work, read models update, semantic cue assertions pass and client-facing payloads do not leak answer internals.

## Rollback And Blocklist Notes

If production smoke fails after deployment:

1. Keep this report at `CERTIFIED_PRE_DEPLOY`.
2. Roll back the Worker using the normal Cloudflare deployment process or redeploy the last known-good commit.
3. If a template must be blocked temporarily, update `reports/grammar/grammar-qg-p11-certification-status-map.json` for that template to `decision: "blocked"` or `decision: "retire_candidate"`.
4. Regenerate runtime authority:

```bash
node scripts/generate-grammar-qg-runtime-certification-status.mjs \
  --status-map=reports/grammar/grammar-qg-p11-certification-status-map.json \
  --out=worker/src/subjects/grammar/certification-status.generated.js
```

5. Rerun `npm run verify:grammar-qg-production-release`, deploy, and rerun production smoke.
6. Blocking or retiring a template changes the active denominator and must be reflected in manifest/report counts before certification is claimed.

## Verification Status

Focused P13 gates are implemented in `tests/grammar-qg-p13-runtime-certification.test.js`.

| Check | Runtime | Result |
|-------|---------|--------|
| `npm run verify:grammar-qg-production-release` | Node v24.2.0 / npm 11.6.3, commit `6be41349` plus working-tree P13 changes | Passed. This covered the P11 release chain, P13 runtime authority tests, semantic prompt-cue audit (`totalChecked: 2340`, no findings), and the certification evidence validator. |
| `npm run check` | Node v24.2.0 / npm 11.6.3, commit `6be41349` plus working-tree P13 changes | Passed. Wrangler dry-run completed after `npm run build`, `npm run assert:build-public`, and `npm run audit:client`. |
| `git diff --check` | Working tree | Passed. |
| `npm test` | Node v24.2.0 / npm 11.6.3, commit `6be41349` plus working-tree P13 changes | Failed on existing repository-wide gates outside the P13 runtime authority path. Observed failures included dashboard child-phase assertions, subject contract/theme token assertions, UI raw-hex token ratchet, worker capacity overhead budget, hero read-model fixture shape, and missing mutation capability coverage for `/api/hero/command`. |

Post-deploy smoke is not yet present, no production deployment was performed from this branch, and this report deliberately does not claim post-deploy certification. Before deployment, repository-wide `npm test` should be made green or an explicit release-owner waiver should document why the unrelated failures do not block this Grammar release. A CI or local Node 22 run should also capture the release-gate evidence required by U6.
