# Hero Mode Click-To-Coin Completion Report

Date: 2026-05-11

## Scope

Completed the Hero Mode click-to-coin contract for the deployed production flow on `https://ks2.eugnel.uk`. The fix is scoped to claim reconciliation, duplicate claim identity, stale read-model projection boundaries, and production evidence for the user-visible coin award after claiming a completed Hero task.

## Root Cause

The production claim command awarded the daily Hero Coins, but the browser could continue rendering from a stale Hero read model immediately after the claim. That left the completed Hero card without an authoritative coin award projection in the visible UI. Duplicate claim responses also lacked enough daily identity fields for the client to prove that an idempotent `already-completed` response belonged to the same quest/day.

## Fix Summary

- `src/main.js` now forces a Hero read-model refresh after a successful claim settles.
- `src/platform/hero/hero-ui-model.js` now projects the latest claim only when `questId`, `questFingerprint`, and `dateKey` strictly match the current read model.
- Completed read-model state now wins over stale claim snapshots, and economy-disabled read models cannot be made coin-visible by an old claim.
- `worker/src/app.js` now returns `dateKey`, `questFingerprint`, and `dailyStatus` on duplicate `already-completed` claim responses.
- Hero UI and E2E tests now cover fresh claim projection, duplicate idempotency, stale claim isolation, missing identity fields, completed read-model precedence, and duplicate response identity.
- The production smoke now records the click-to-coin evidence bundle for 2026-05-11 and verifies the claimed browser UI shows the awarded coins and final balance.

## Verification

- Targeted Hero suite: `node --test tests/hero-ui-progress-flow.test.js tests/hero-p4-economy-ui.test.js tests/hero-p4-economy-e2e.test.js tests/hero-claim-flow-e2e.test.js tests/hero-completion-flow-e2e.test.js tests/hero-p6-dashboard-wiring.test.js`
  - Result: 134 passed, 0 failed.
- Full test suite: `npm test`
  - Result before push: 109215 passed, 0 failed, 12 skipped.
  - Result in pre-push hook: 109215 passed, 0 failed, 12 skipped.
- Production dry-run check: `npm run check`
  - Result: passed.
- Production deploy: `npm run deploy`
  - Result: passed.
  - Cloudflare version: `91dc494e-3005-430a-bdf4-313921149b4a`.
  - Production bundle audit: passed for `https://ks2.eugnel.uk/`.
- Diff hygiene: `git diff --check`
  - Result: passed.

## Independent Review

- Code Reviewer: GREEN on commit `16ada4fc467eb52cd3368903ccd8318af9468aa2`; no blockers or advisories.
- Contract Auditor: GREEN on commit `16ada4fc467eb52cd3368903ccd8318af9468aa2`; no blockers or advisories.

## Production Evidence

Production smoke command:

```powershell
$env:HERO_SMOKE_OUT='docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-smoke-2026-05-11.json'
$env:HERO_SMOKE_SCREENSHOT_DIR='docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11'
node docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-smoke-2026-05-10.mjs
```

Result: `ok: true`.

Evidence files:

- `docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-smoke-2026-05-11.json`
- `docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11/mobile-home-hero-quest.png`
- `docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11/mobile-hero-camp-page.png`
- `docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11/mobile-subject-punctuation.png`
- `docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11/mobile-codex.png`
- `docs/plans/james/hero-mode/A/hero-mode-click-coin-e2e-screenshots-2026-05-11/mobile-home-hero-claim-coins.png`

Key production smoke assertions:

- Hero read model became visible for the temporary demo cohort.
- Hero task started and duplicate start remained idempotent.
- Punctuation subject session completed with six answered items.
- Hero claim returned `status: "claimed"`, `coinsAwarded: 100`, `dailyStatus: "completed"`, and `coinBalance: 100`.
- Duplicate claim returned `status: "already-completed"`, `coinsAwarded: 0`, and `dailyCoinsAlreadyAwarded: true`.
- Refreshed read model returned `dailyStatus: "completed"`, `coinsAwarded: 100`, and `coinBalance: 100`.
- Deployed browser UI rendered `100 Hero Coins added.` and `Balance: 100 Hero Coins.` after the claim.
- Browser smoke recorded no console errors, request failures, or HTTP failures.
- Hero commands did not mutate subject stars, mastery, or monsters.

