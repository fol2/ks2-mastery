---
phase: grammar-qg-p13
title: Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification
certification_decision: CERTIFIED_POST_DEPLOY
certification_phase: grammar-qg-p13
final_content_release_id: grammar-qg-p11-2026-04-30
content_release_unchanged: true
scoring_change: none
mastery_change: none
reward_change: none
hero_mode_change: none
post_deploy_smoke_evidence: reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json
template_count: 78
concept_count: 18
inventory_item_count: 2340
limitations: []
---

# Grammar QG P13 — Runtime Certification Authority and Post-Deploy Production Certification

## Executive Summary

P13 keeps `grammar-qg-p11-2026-04-30` as the frozen content release and productionises the certification source. The learner-facing scheduler now uses a Worker-safe generated runtime status module derived from `reports/grammar/grammar-qg-p11-certification-status-map.json`; it no longer loads the historical P10 status map, uses Node `fs` or `require`, or creates an all-approved metadata fallback.

Current decision: **CERTIFIED_POST_DEPLOY**. The live Worker at `https://ks2.eugnel.uk` has been deployed from `e3e214b57e1f86dd815da8b4fb858237aed3cefd`, production bundle audit passed, and post-deploy Grammar smoke evidence is committed at `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json`.

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
| Production smoke honesty | Report moved to post-deploy only after `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` existed and passed validation. |
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
| Production smoke | `reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` | post-deploy pass |

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

This report moved to `CERTIFIED_POST_DEPLOY` after the smoke evidence proved the production endpoint is reachable, the Worker serves `grammar-qg-p11-2026-04-30`, item creation and selected/constructed answer submission work, read models update, semantic cue assertions pass and client-facing payloads do not leak answer internals.

## Post-Deploy Hardening

The first post-deploy smoke runs found three live read-model issues before certification was claimed:

1. Summary read models exposed `sessionId`; fixed in PR #798.
2. Faded support contrast exposed the server-only `nearMiss` key; fixed in PR #801 by projecting `commonMixUp`.
3. Prompt cue metadata was generated but dropped by the Worker read-model allow-list; fixed in PR #802 by projecting learner-facing cue fields through fail-closed allow-lists.

All three fixes were merged, deployed, and covered by the final production smoke evidence.

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
| `npm run verify:grammar-qg-production-release` | Node v24.2.0 / npm 11.6.3, branch `codex/grammar-qg-p13-runtime-certification` | Passed. This covered the P11 release chain, P13 runtime authority tests, semantic prompt-cue audit (`totalChecked: 2340`, no findings), and the certification evidence validator. |
| `npm run check` | Node v24.2.0 / npm 11.6.3, branch `codex/grammar-qg-p13-runtime-certification` | Passed. Wrangler dry-run completed after `npm run build`, `npm run assert:build-public`, and `npm run audit:client`. |
| `git diff --check` | Working tree | Passed. |
| `npm test` | Node v24.2.0 / npm 11.6.3, branch `codex/grammar-qg-p13-runtime-certification` | Passed: 16,240 tests; 16,234 passed; 0 failed; 6 skipped. |
| PR #802 GitHub CI | `codex/grammar-focus-cue-read-model-hotfix` | Passed: `npm test + npm run check`, `npm run audit:client`, `npm run audit:punctuation-content`, path classification and GitGuardian. |
| `npm run deploy` | `e3e214b57e1f86dd815da8b4fb858237aed3cefd` | Passed. Cloudflare Worker version `85604165-1e04-4ad9-b278-5959abdcdb9a`; production bundle audit passed for `https://ks2.eugnel.uk/`. |
| `npm run smoke:production:grammar -- --json --evidence-origin=post-deploy --expected-release=grammar-qg-p11-2026-04-30 --out=reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` | Production `https://ks2.eugnel.uk`, commit `e3e214b57e1f86dd815da8b4fb858237aed3cefd` | Passed. Evidence `ok: true`; all answer-spec families covered; target-sentence and noun-phrase cue assertions passed; forbidden-key scan passed. |
| `npx -y node@22 --test tests/grammar-qg-p5-report-validation.test.js` | Branch `codex/grammar-qg-p13-post-deploy-certification` | Passed: 5 tests, 0 failed. The missing-evidence regression now uses an isolated temporary root so it remains valid after the real smoke evidence file is committed. |
| `npm run verify:grammar-qg-production-release` | Branch `codex/grammar-qg-p13-post-deploy-certification` | Passed. This revalidated the full P11 chain, P13 runtime authority, semantic prompt-cue audit (`totalChecked: 2340`) and post-deploy report/evidence consistency. |
| `npm test` | Branch `codex/grammar-qg-p13-post-deploy-certification` | Passed: 16,274 tests; 16,268 passed; 0 failed; 6 skipped. |
| `npm run check` | Branch `codex/grammar-qg-p13-post-deploy-certification` | Passed. Wrangler dry-run completed after build, public asset assertion and client bundle audit. |
| `git diff --check` | Branch `codex/grammar-qg-p13-post-deploy-certification` | Passed. |

Post-deploy production certification is complete for `grammar-qg-p11-2026-04-30`.
