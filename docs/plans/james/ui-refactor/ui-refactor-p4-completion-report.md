# UI Refactor P4 Completion Report

Date: 2026-05-01

Status: source, local build, and deployed smoke evidence captured for `https://ks2.eugnel.uk`. P4 has no remaining production-smoke blocker. The committed screenshot pack proves only the screenshot files present in this repository; missing screenshot paths in the production visual evidence manifest are explicitly downgraded and are not bundled-image claims. P5 is tracked separately by `ui-refactor-p5.md`; this P4 report does not claim P5 delivery.

## Scope Boundary

- Source boundary: implemented and verified in local worktree `.worktrees/ui-refactor-p4` on branch `ui-refactor-p4`, then production evidence/fix work continued in `.worktrees/ui-refactor-p4-production-evidence-clean`.
- GitHub boundary: P4 source was merged through PR `#815`; the follow-up production-evidence closure and Admin Visual Engine routing fix were merged through PR `#823`.
- ZIP boundary: no ZIP snapshot was used as the source of truth after these edits; verification is from the local source checkout.
- Production boundary: deployed smoke 2026-05-01 against `https://ks2.eugnel.uk` passed; screenshot evidence was captured from an isolated production demo session plus a logged-in admin browser session.

## Implemented Changes

- Repaired P3 evidence drift: the P3 report now identifies U9 as PR `#788`, includes follow-up fix PRs `#791` and `#793`, and stops claiming byte-identical/no-layout-change evidence that P3 did not prove.
- Consolidated the home hero so `HomeHeroScene` receives the real home hero panel and no longer renders a duplicate primary action cluster.
- Added the P4 CSS layer for shared `ActionRow`, `SessionHUD`, `PracticeStage`, `SessionSummaryFrame`, companion panel, and home hero composition.
- Made `SessionHUD` the single visible session-progress surface across Spelling, Grammar, and Punctuation, with subject scenes no longer duplicating visible question-count copy.
- Replaced legacy subject summary action clusters with `SessionSummaryFrame` ownership: one primary action, secondary actions inside the shared action row, and subject-specific detail content inside the frame.
- Preserved Boss Dictation's Mega-safe invariant after the summary migration: Boss summaries do not render `Drill all` or per-word drill actions.
- Added explicit `visible` adoption to subject companion panels in setup scenes.
- Added `PracticeStage` motion states for setup, active session, and feedback/celebration phases.
- Kept Admin Visual Engine diagnostic-only/read-only while moving simple inline style sites into CSS classes.
- Fixed the Admin Visual Engine route after live validation found that `visual-engine` and `business` tabs were rendered but not accepted by the admin route allowlist; `AdminHubSurface` now receives and syncs the route section from `appState.route.adminSection`.
- Fixed the Spelling remote command response path after production validation found that the Worker returned a live `summary` read model but the client reload path discarded it through persisted-state rehydrate sanitisation. `applyCommandResponse` now reapplies the live Worker read model after repository reload.
- Hardened the Grammar production smoke manual-review probe so it derives a valid response from the current production-visible input options instead of relying on stale fixture values.
- Regenerated the CSP inline-style inventory after the admin diagnostics migration.

## Intentional Visual Changes

- Home now has one hero CTA hierarchy instead of two competing primary areas.
- Session progress reads from the shared HUD rather than duplicated local copy inside subject headers.
- Summary screens now use a consistent shared frame, headline hierarchy, detail slot, and action row.
- Setup scenes can explicitly show companion panels through the subject adapter contract.
- Practice-stage shells now expose calm, active, and celebration motion classes for consistent visual states.
- Admin Visual Engine diagnostics now use classed chips/rows and diagnostic copy rather than inline-styled fragments.

## Wrapper-Only Or Structural Changes

- `HomeHeroScene` gained a `heroPanel` slot and fallback action support; it does not change subject selection, Parent Hub routing, or the Codex route.
- `SessionSummaryFrame` gained action prop forwarding and a details slot; it does not compute rewards, mastery, stars, or learning state.
- `SessionHUD` clamps display values and adds data attributes; it does not mutate session progress.
- `PracticeStage` motion props are presentation metadata only.
- Test contracts and CSP inventory changes do not change learner data, D1 state, R2 assets, or deployment configuration.

## Verification

Environment:

- Node/OS: `v25.9.0 darwin arm64`

Command evidence:

- `node --test tests/ui-p3-guardrails.test.js tests/ui-subject-theme-contract.test.js tests/ui-action-engine-contract.test.js tests/ui-session-hud-contract.test.js tests/ui-practice-stage-contract.test.js tests/ui-companion-panel-contract.test.js tests/ui-summary-engine-contract.test.js tests/ui-home-hero-scene-contract.test.js tests/admin-visual-engine-diagnostics.test.js tests/csp-inline-style-budget.test.js tests/bundle-byte-budget.test.js tests/home-hero-no-duplicate-primary.test.js tests/ui-phantom-class-contract.test.js tests/ui-session-hud-adapter-render.test.js tests/ui-summary-no-duplicate-actions.test.js` - passed, 143/143.
- `node --test tests/spelling-boss.test.js` - passed, 45/45. This caught and then verified the Boss summary no-drill invariant after the shared summary-frame migration.
- `node --test tests/ui-production-evidence-contract.test.js tests/ui-component-adoption.test.js tests/spelling-boss.test.js` - passed, 56/56.
- `node scripts/inventory-inline-styles.mjs --check` - passed, inventory in sync with 246 inline-style sites.
- `npm test` - passed, 21,512 pass / 0 fail / 6 skipped after adding the production-evidence follow-up fixes.
- `npm run check` - passed. Wrangler dry-run ran `npm run build`, `npm run assert:build-public`, and `npm run audit:client`.
- `node --test tests/react-admin-metadata-row-dirty.test.js tests/admin-section-guard.test.js tests/store-admin-route.test.js tests/react-admin-section-tabs.test.js tests/spelling-remote-actions.test.js tests/grammar-production-smoke.test.js tests/admin-visual-engine-diagnostics.test.js tests/ui-production-evidence-contract.test.js` - passed, 111/111 after the Spelling summary, Grammar smoke, Admin route, and Admin dirty-row route-guard fixes.
- `npm run deploy` - passed on 2026-05-01; final production deploy version `0bc250a8-1224-476c-a534-c383814527f8`.
- `npm run audit:production -- --skip-local --retries 30 --retry-delay-ms 5000` - passed for `https://ks2.eugnel.uk/` after deployment.

Known non-failing output:

- npm warns about unknown `playwright_skip_browser_download` / `playwright-skip-browser-download` config keys.
- React SSR emits the existing `LengthPicker` key-spread warning.
- Grammar negative-path tests log expected `Grammar command failed` messages while asserting child-safe error handling.

## Bundle And CSP

- Main bundle gzip: `230,865 / 232,000` bytes, measured by the final deploy client audit after the route and Spelling response fixes.
- Budget status: within the existing P3 ceiling; no re-baseline requested.
- CSP inline-style total: 246.
- CSP inventory status: `docs/hardening/csp-inline-style-inventory.md` and `scripts/inventory-inline-styles.mjs` agree; `POST_MIGRATION_TOTAL` is 246.
- CSP policy status: below the P4 cap of 254.

## Production Evidence

Production smoke evidence: production-smoke-proven for the P4 surfaces covered by the recorded smoke files.

Screenshot-pack evidence: screenshot-pack-proven only for committed screenshot files that are present in this repository. The current committed pack contains `01-home.png`; the other screenshot entries in `reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json` are marked `omitted` with durable non-claim reasons because their PNG files are not present in the lean source bundle.

Deployed smoke and screenshot evidence was captured on 2026-05-01 for `https://ks2.eugnel.uk`:

- Production deploy version: `0bc250a8-1224-476c-a534-c383814527f8`.
- Production bundle audit: passed for 1 HTML-referenced bundle, 6 transitive chunks, 19 direct paths, 5/5 security-header checks, and 15/15 cache-split checks.
- Bootstrap production smoke: `reports/ui-refactor/ui-refactor-p4-bootstrap-production-smoke-2026-05-01.json` (`ok: true`, deployed source commit `91dcbabd9b948a8b53c1231c692eb04ff2e8b4fa`, `dirtyTreeFlag: false`, finished `2026-05-01T22:45:04.100Z`).
- Grammar production smoke: `reports/ui-refactor/ui-refactor-p4-grammar-production-smoke-2026-05-01.json` (`ok: true`, release `grammar-qg-p14-2026-05-01`, deployed source commit `91dcbabd9b948a8b53c1231c692eb04ff2e8b4fa`, finished `2026-05-01T22:45:26.783Z`).
- Punctuation production smoke: `reports/ui-refactor/ui-refactor-p4-punctuation-production-smoke-2026-05-01.json` (`ok: true`, release `punctuation-qg-p11-2026-05-01`, deployed source commit `91dcbabd9b948a8b53c1231c692eb04ff2e8b4fa`, finished `2026-05-01T22:45:38.946Z`; `adminHubCoverage: false` because admin credentials are not part of that script).
- Visual production evidence manifest: `reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json`.
- Screenshot artifacts: Home is present under `output/playwright/ui-refactor-p4-production-2026-05-01/01-home.png`. Spelling setup/session/feedback/summary, Grammar setup/session/summary, Punctuation setup/session/summary, and Admin Visual Engine were named in the original manifest but are not present in this committed evidence pack, so P5 treats them as not proven from supplied artefacts.

Residual blockers:

- None for P4 production evidence after the follow-up fixes.
- This report cannot truthfully claim P5/P6 delivery. It closes P4 plus the production-evidence follow-up only.

## Non-Goals

- No Hero Coins, Hero Camp, Hero economy, or reward inflation.
- No new learning algorithms, marking logic, or content generation.
- No future-subject content work beyond preserving shared UI contracts.
- No admin write/publish workflow for visual assets; Admin Visual Engine remains diagnostic-only/read-only.
- No P5/P6 delivery claim without a named P5/P6 contract.

## Closure

P4 closes the Visual Engine v1 source implementation and production evidence pass. The production-evidence follow-up also closed the Admin Visual Engine direct-route issue, the Grammar smoke fixture drift, and the Spelling summary live-read-model issue found during validation.
