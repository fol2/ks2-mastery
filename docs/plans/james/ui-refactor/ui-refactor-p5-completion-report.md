# UI Refactor P5 Completion Report

Date: 2026-05-02

Status: completed for source, local verification, PR merge, blocker follow-up, and live production replay on `https://ks2.eugnel.uk`.

## Scope Boundary

- Source boundary: implemented on branch `ui-refactor` and merged through PR `#831`.
- GitHub boundary: PR `#831` was squash-merged into `main` as `3e85fdb2ee819357559ac63f21e2e9cf9a6ea9e7`.
- Production boundary: initially deployed from `main` commit `3e85fdb2ee819357559ac63f21e2e9cf9a6ea9e7` with Worker version `9cc7c30b-6c0b-4806-b782-c76f11ce7530`; blocker follow-ups were deployed through `main` commit `e0795100c167578eff96fa813ed060f12e203a6d` with Worker version `7d7e3afa-382b-410f-b623-a4e14c88f276`.
- Screenshot-pack boundary: the P4 screenshot manifest is now explicit and the blocker follow-up commits all 12 named PNG entries as `captured`.
- Redaction boundary: the dense Spelling production smoke now covers both start-session and submit-answer public read models, including forbidden-key scans after post-marking feedback.

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

Blocker follow-up verification:

- PR `#837` closed the screenshot-pack and `audio.sessionId` blockers; GitHub `npm test + npm run check`, `npm run audit:client`, `npm run audit:punctuation-content`, and GitGuardian all passed.
- PR `#838` closed the post-submit Spelling feedback redaction blocker; local `npm test` passed with 27,648 pass / 0 fail / 6 skipped, local `npm run check` passed, and GitHub `npm test + npm run check`, `npm run audit:client`, `npm run audit:punctuation-content`, and GitGuardian all passed.

## Production Evidence

Deployment:

- Command: `npm run deploy`
- Worker version: `9cc7c30b-6c0b-4806-b782-c76f11ce7530`
- Source commit: `3e85fdb2ee819357559ac63f21e2e9cf9a6ea9e7`
- Deploy client audit: passed, main bundle `188352 / 232000` bytes gzip.
- Production bundle audit: passed for `https://ks2.eugnel.uk/` with 1 HTML-referenced bundle, 6 transitive chunks, 19 direct paths, 5/5 security-header checks, and 15/15 cache-split checks.
- Blocker follow-up deployment: PR `#837` deployed Worker version `32c4f4cd-d4a2-4b17-8db2-38c9a15b3e23`; PR `#838` deployed Worker version `7d7e3afa-382b-410f-b623-a4e14c88f276` from source commit `e0795100c167578eff96fa813ed060f12e203a6d`. The final deploy client audit passed with main bundle `188340 / 232000` bytes gzip, and the production bundle audit passed again for `https://ks2.eugnel.uk/`.

Smoke artefacts:

- Bootstrap: `reports/ui-refactor/ui-refactor-p5-bootstrap-production-smoke-2026-05-02.json` (`ok: true`, HTTP 200, `bootstrapCapacity` present).
- Grammar: `reports/ui-refactor/ui-refactor-p5-grammar-production-smoke-2026-05-02.json` (`ok: true`, release `grammar-qg-p14-2026-05-01`, session, mini-test, repair, summary, answer-spec families, and forbidden-key scans covered).
- Punctuation: `reports/ui-refactor/ui-refactor-p5-punctuation-production-smoke-2026-05-02.json` (`ok: true`, release `punctuation-qg-p11-2026-05-01`, smart summary, generated incorrect path, dash/Oxford-comma acceptance, GPS review, parent evidence covered).
- Spelling dense path: `reports/ui-refactor/ui-refactor-p5-spelling-dense-production-smoke-2026-05-02.json` (`ok: true`, source commit `e0795100c167578eff96fa813ed060f12e203a6d`, finished `2026-05-02T22:17:14.684Z`, bootstrap capacity present, start-session and submit-answer both HTTP 200, no forbidden-key leak, `p95WallMs: 467.8` under the 750 ms gate).
- Admin Visual Engine route: `reports/ui-refactor/ui-refactor-p5-admin-visual-engine-real-browser-evidence-2026-05-02.json` (`ok: true`) captured from an existing logged-in Chrome/CDP session against real production APIs. `/api/auth/session`, `/api/bootstrap`, and `/api/hubs/admin` returned HTTP 200, and the Visual Engine route rendered adapter, evidence, deployment, smoke-file, and diagnostic-only sections.
- Admin Visual Engine screenshot: `output/playwright/ui-refactor-p5-production-2026-05-02/admin-visual-engine-real-cdp.png`.

## Evidence Boundary

Production evidence proves the deployed source commit and the smoke/browser routes listed above. It does not claim pixel-perfect visual correctness beyond the captured Admin Visual Engine screenshot and the explicitly present screenshot artefacts.

The P4 screenshot pack now remains strict: all 12 named PNGs are committed, all manifest entries are `captured`, and the verifier plus contract test fail future missing-file or omitted-entry regressions. The public Spelling read model also remains strict: post-submit feedback no longer exposes `answer` or `attemptedAnswer`, and the Worker command-route test scans the public read model with the production Spelling forbidden-key oracle.

## Non-Goals Preserved

- No Hero Coins, Hero Camp, Hero economy, or reward inflation.
- No admin visual asset publishing, upload, mutation, or write workflow.
- No new marking logic, scheduler logic, content generation, or Star semantics.
- No production engines for Reading, Reasoning, or Arithmetic.
- No bundle-budget re-baseline.
- No P6 UI-refactor phase proposed.

## Closure

P5 closes the Visual Engine operating contract and the reviewer-raised blocker follow-ups. Future UI work should move into named product streams rather than another generic UI-refactor phase.
