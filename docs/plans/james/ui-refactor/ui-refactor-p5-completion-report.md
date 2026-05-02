# UI Refactor P5 Completion Report

Date: 2026-05-02

Status: completed for source, local verification, PR merge, and live production replay on `https://ks2.eugnel.uk`.

## Scope Boundary

- Source boundary: implemented on branch `ui-refactor` and merged through PR `#831`.
- GitHub boundary: PR `#831` was squash-merged into `main` as `3e85fdb2ee819357559ac63f21e2e9cf9a6ea9e7`.
- Production boundary: deployed from `main` commit `3e85fdb2ee819357559ac63f21e2e9cf9a6ea9e7` with Worker version `9cc7c30b-6c0b-4806-b782-c76f11ce7530`.
- Screenshot-pack boundary: the P4 screenshot manifest is now explicit and the blocker follow-up commits all 12 named PNG entries as `captured`.

## Implemented Changes

- Added the `SubjectVisualAdapter` contract for ready subjects and safe placeholder subjects.
- Added the visual evidence verifier and tests for present, missing, external, and omitted screenshot entries.
- Extended Admin Visual Engine diagnostics with visual adapter status, evidence-pack status, deployment metadata, and smoke-file rows.
- Locked Home hero operating states so each branch keeps one primary learner action.
- Locked ready-subject journeys across setup, session HUD, summary, and return-home affordances.
- Locked companion-panel data quality and responsive layout contracts.
- Locked summary-frame ownership across Spelling, Grammar, and Punctuation, including Boss Dictation no-drill safety.
- Updated subject expansion documentation to point future subjects at the visual adapter contract.

## Verification

Environment:

- Node/OS: `v25.9.0 darwin arm64`

Commands:

- `npm test` - passed locally, 21,543 tests, 21,537 pass, 0 fail, 6 skipped.
- `npm run check` - passed locally after rebase; dry-run deploy ran build, public assertion, and client audit. Main bundle was `188356 / 232000` bytes gzip.
- `npm run audit:client` - passed locally before PR; main bundle was within the existing ceiling.
- `node scripts/verify-ui-refactor-visual-evidence.mjs` - passed, 12 screenshot entries checked.
- `git diff --check HEAD~1..HEAD` - passed before PR.
- Focused P5 matrix passed, 89/89:

```text
node --test \
  tests/ui-production-evidence-contract.test.js \
  tests/ui-visual-evidence-pack.test.js \
  tests/home-hero-no-duplicate-primary.test.js \
  tests/ui-visual-journey-ready-subjects.test.js \
  tests/ui-session-hud-contract.test.js \
  tests/ui-session-hud-adapter-render.test.js \
  tests/ui-companion-panel-contract.test.js \
  tests/ui-companion-panel-data-contract.test.js \
  tests/ui-companion-panel-responsive-contract.test.js \
  tests/ui-summary-engine-contract.test.js \
  tests/ui-summary-no-duplicate-actions.test.js \
  tests/admin-visual-engine-diagnostics.test.js \
  tests/ui-subject-visual-adapter-contract.test.js \
  tests/csp-inline-style-budget.test.js \
  tests/bundle-byte-budget.test.js
```

GitHub checks on PR `#831`:

- `npm test + npm run check` - passed.
- `npm run audit:client` - passed.
- `npm run audit:punctuation-content` - passed.
- GitGuardian Security Checks - passed.
- `Chromium + mobile-390 golden paths` - skipped by path classification.

## Production Evidence

Deployment:

- Command: `npm run deploy`
- Worker version: `9cc7c30b-6c0b-4806-b782-c76f11ce7530`
- Source commit: `3e85fdb2ee819357559ac63f21e2e9cf9a6ea9e7`
- Deploy client audit: passed, main bundle `188352 / 232000` bytes gzip.
- Production bundle audit: passed for `https://ks2.eugnel.uk/` with 1 HTML-referenced bundle, 6 transitive chunks, 19 direct paths, 5/5 security-header checks, and 15/15 cache-split checks.

Smoke artefacts:

- Bootstrap: `reports/ui-refactor/ui-refactor-p5-bootstrap-production-smoke-2026-05-02.json` (`ok: true`, HTTP 200, `bootstrapCapacity` present).
- Grammar: `reports/ui-refactor/ui-refactor-p5-grammar-production-smoke-2026-05-02.json` (`ok: true`, release `grammar-qg-p14-2026-05-01`, session, mini-test, repair, summary, answer-spec families, and forbidden-key scans covered).
- Punctuation: `reports/ui-refactor/ui-refactor-p5-punctuation-production-smoke-2026-05-02.json` (`ok: true`, release `punctuation-qg-p11-2026-05-01`, smart summary, generated incorrect path, dash/Oxford-comma acceptance, GPS review, parent evidence covered).
- Spelling summary path: covered inside the punctuation smoke artefact through the one-word Spelling command path (`progressTotal: 1`, prompt token present). The blocker follow-up removes `audio.sessionId` from the public Spelling audio cue and locks the redaction contract with Worker tests; the dense-history production smoke must be re-run after that follow-up deploy.
- Admin Visual Engine route: `reports/ui-refactor/ui-refactor-p5-admin-visual-engine-real-browser-evidence-2026-05-02.json` (`ok: true`) captured from an existing logged-in Chrome/CDP session against real production APIs. `/api/auth/session`, `/api/bootstrap`, and `/api/hubs/admin` returned HTTP 200, and the Visual Engine route rendered adapter, evidence, deployment, smoke-file, and diagnostic-only sections.
- Admin Visual Engine screenshot: `output/playwright/ui-refactor-p5-production-2026-05-02/admin-visual-engine-real-cdp.png`.

## Evidence Boundary

Production evidence proves the deployed source commit and the smoke/browser routes listed above. It does not claim pixel-perfect visual correctness beyond the captured Admin Visual Engine screenshot and the explicitly present screenshot artefacts.

The P4 screenshot pack now remains strict: all 12 named PNGs are committed, all manifest entries are `captured`, and the verifier plus contract test fail future missing-file or omitted-entry regressions.

## Non-Goals Preserved

- No Hero Coins, Hero Camp, Hero economy, or reward inflation.
- No admin visual asset publishing, upload, mutation, or write workflow.
- No new marking logic, scheduler logic, content generation, or Star semantics.
- No production engines for Reading, Reasoning, or Arithmetic.
- No bundle-budget re-baseline.
- No P6 UI-refactor phase proposed.

## Closure

P5 closes the Visual Engine operating contract. Future UI work should move into named product streams rather than another generic UI-refactor phase.
