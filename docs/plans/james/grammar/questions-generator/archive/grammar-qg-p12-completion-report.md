---
phase: grammar-qg-p12
title: Grammar QG P12 — Completion Report
status: complete
certification_outcome: CERTIFIED_PRE_DEPLOY
content_release_id: grammar-qg-p11-2026-04-30
certification_phase: grammar-qg-p12
prs_merged: 8
tests_added: 89
review_iterations: 2
date: 2026-04-30
---

# Grammar QG P12 — Completion Report

## Executive Summary

Grammar QG P12 delivered the production evidence lock for the `grammar-qg-p11-2026-04-30` content release. All evidence artefacts are regenerated under P11 identity, the certification validator reads paths from the manifest (not hardcoded P10 filenames), and the release gate validates P11. The terminal certification state is **CERTIFIED_PRE_DEPLOY** — production smoke requires live deployment.

## Contract Requirements vs Delivery

| # | Requirement | Status |
|---|---|---|
| 1 | One command validates P11 release | Delivered — `verify:grammar-qg-production-release` |
| 2 | Command fails if artefact says P10 while code says P11 | Delivered — `requireArtefact` + release ID cross-check |
| 3 | Final report has no placeholder frontmatter | Delivered — validator rejects `pending-*`, `todo-*`, `tbd-*`, `unknown-*` |
| 4 | Evidence manifest names every artefact | Delivered — 8-key `artefacts` map in P11 manifest |
| 5 | Validator reads paths from manifest | Delivered — `requireArtefact`/`readJsonArtefact` pattern |
| 6 | Semantic audit passes 2,340 items | Delivered — `semantic-prompt-cue-audit: '1..30'` in manifest |
| 7 | Status map covers 78 templates | Delivered — certification-status-map.json has 78 entries |
| 8 | Production smoke proves deployed Worker | DEFERRED — requires live deployment |
| 9 | Report stays CERTIFIED_PRE_DEPLOY until smoke | Delivered — report uses PRE_DEPLOY |
| 10 | No reward/scoring/mastery/Hero Mode changes | Delivered — confirmed via git diff |

## Pull Requests

| PR | Title | Unit |
|----|-------|------|
| #752 | P11 certification manifest with artefacts map | U1 |
| #753 | P11 evidence artefacts with parameterised generators | U2 |
| #757 | Validator reads artefact paths from manifest | U3 |
| #762 | LEAN_ZIP_MANIFEST for reproducible release extraction | U6 |
| #763 | Package release gates target P11 | U4 |
| #764 | Smoke evidence infrastructure | U5 |
| #766 | Final production certification report (CERTIFIED_PRE_DEPLOY) | U7 |
| #768 | Update stale verify-chain assertions for P11 release gate | P4 fix |

## Architecture Decisions

- **Manifest-driven path resolution**: The validator now resolves all artefact paths from `manifest.artefacts[key]`, eliminating the P10→P11 path-update treadmill for future phases.
- **Generator parameterisation**: All generators accept `--out` or `--out-prefix` CLI args while retaining backward-compatible defaults.
- **P10 backward compatibility**: Manifests without `artefacts` (P10 shape) trigger legacy fallback with a console warning.
- **Certification status map**: New derived artefact — iterates quality register, emits one status entry per template with fail-closed enforcement.

## Test Coverage

- **89 new P12 tests** across 7 test files
- All P11 regression tests pass (verify-chain 11/11, distractor-matrix-truth 7/7, evidence-truth 14/14)
- Full P12 suite: 89/89 pass, 0 failures

## Review Iterations

- **Phase 3 (per-unit)**: U3 blocked on signature regression (1 fix round), U5 blocked on missing CLI declarations (1 fix round). All others first-pass approved.
- **Phase 4 (contract validation)**: 3 reviewers dispatched. 1 blocked on stale verify-chain assertion (fix PR #768). After fix, all reviewers pass.

## Deferred Items

- **Production smoke evidence**: DEFERRED (requires human). Script infrastructure ready. Runbook at `docs/plans/james/grammar/questions-generator/grammar-qg-p12-smoke-runbook.md`. After deployment, run the documented command and update report to CERTIFIED_POST_DEPLOY.

## Metrics

- PRs merged: 8
- New tests: 89
- Review iterations: 2 (U3 signature fix, P4 assertion fix)
- Generated artefacts: 7 files (render inventory, redacted MD, quality register, distractor audit, marking matrix, status map, manifest)
- Validator refactored: 6 hardcoded paths → manifest-driven
- Package scripts updated: 1 promoted, 1 renamed to historical
