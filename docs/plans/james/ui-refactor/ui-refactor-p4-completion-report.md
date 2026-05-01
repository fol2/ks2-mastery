# UI Refactor P4 Completion Report

Date: 2026-05-01

Status: source and local build verification complete. Production visual correctness is not production-proven in this report because no deployed smoke or screenshot record was captured for `https://ks2.eugnel.uk`.

## Scope Boundary

- Source boundary: implemented and verified in local worktree `.worktrees/ui-refactor-p4` on branch `ui-refactor-p4`, based on `origin/main`.
- GitHub boundary: no PR was opened, merged, or deployed from this report.
- ZIP boundary: no ZIP snapshot was used as the source of truth after these edits; verification is from the local source checkout.
- Production boundary: no production deploy and no logged-in production UI smoke were performed during this P4 pass.

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
- `npm test` - passed, 16,294 pass / 0 fail / 6 skipped after adding the P4 production-evidence report guard.
- `npm run check` - passed. Wrangler dry-run ran `npm run build`, `npm run assert:build-public`, and `npm run audit:client`.

Known non-failing output:

- npm warns about unknown `playwright_skip_browser_download` / `playwright-skip-browser-download` config keys.
- React SSR emits the existing `LengthPicker` key-spread warning.
- Grammar negative-path tests log expected `Grammar command failed` messages while asserting child-safe error handling.

## Bundle And CSP

- Main bundle gzip: `230,216 / 232,000` bytes, measured by the final `npm run check` client audit.
- Budget status: within the existing P3 ceiling; no re-baseline requested.
- CSP inline-style total: 246.
- CSP inventory status: `docs/hardening/csp-inline-style-inventory.md` and `scripts/inventory-inline-styles.mjs` agree; `POST_MIGRATION_TOTAL` is 246.
- CSP policy status: below the P4 cap of 254.

## Production Evidence

Production evidence: not production-proven.

No deployed smoke or screenshot record was captured for Home, Spelling setup/session/summary, Grammar setup/session/summary, Punctuation setup/session/summary, or Admin Visual Engine on `https://ks2.eugnel.uk`.

This report therefore does not claim production visual correctness, deployed bundle behaviour, or logged-in production interaction health. The verified claim is local source, test, build, dry-run deploy, bundle-audit, and static contract correctness.

## Non-Goals

- No Hero Coins, Hero Camp, Hero economy, or reward inflation.
- No new learning algorithms, marking logic, or content generation.
- No future-subject content work beyond preserving shared UI contracts.
- No admin write/publish workflow for visual assets; Admin Visual Engine remains diagnostic-only/read-only.
- No production deployment, no PR merge, and no live production smoke in this pass.

## Closure

P4 closes the Visual Engine v1 source implementation locally, with the explicit caveat that production visual verification remains outstanding until a deployed smoke or screenshot pass is captured.
