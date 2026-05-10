# Punctuation Round-Length Setup Production Fix

Date: 2026-05-10
Owner: Codex
Scope: Punctuation Setup round-length selector, production command routing, related production browser noise, and live smoke evidence.

## Objective

Fix the Punctuation Setup page so learners can select 8-question and 12-question rounds in production, not only 4 and 6.

## Root Cause

The Setup UI already rendered the 4 / 6 / 8 / 12 `LengthPicker`, and the local Punctuation module handler accepted those values. Production uses the remote `punctuationSubjectCommandActions` map before falling back to the local module handler. That remote map did not include `punctuation-set-round-length`, so production clicks were claimed by neither the Worker save path nor the local persistence path. The selected value therefore stayed at the stored default of 6 in production.

## Fix

- Added a production command action for `punctuation-set-round-length`.
- Routed valid Setup-only values through Worker `save-prefs` as `{ prefs: { roundLength } }`.
- Reused the Setup narrow enum `['4', '6', '8', '12']`.
- Kept non-Setup phases and off-enum values from sending Worker writes.
- Added a reproducible production browser smoke script for desktop 8 and mobile 12.
- Fixed the related production browser 404 by exposing Hero Mode session flags and skipping `/api/hero/read-model` while `HERO_MODE_SHADOW_ENABLED=false`.
- Hardened the round-length browser smoke so console errors, request failures, and HTTP failures are blocking, and recorded the deployed Worker commit/version in the report.

## Verification

Local gates:

- `node --check scripts\punctuation-round-length-production-smoke.mjs`: pass.
- `node --test tests\app-controller.test.js tests\worker-auth.test.js tests\subject-command-actions.test.js --test-name-pattern "browser bootstrap builds remote repositories|production email registration creates|punctuation round-length"`: 40 tests, 0 failures.
- `npm test`: 109,191 tests, 0 failures, 12 skipped.
- Pre-push hook `npm test`: 109,191 tests, 0 failures, 12 skipped.
- `npm run check`: pass.

Production gates:

- `npm run deploy`: deployed `3b15de5950c9a1f8a7ec965f7e0f60ffe0e199bf`.
- Cloudflare Worker version: `c624fa92-2c5a-4d0a-abb8-50af5e222783`.
- Production bundle audit: pass for `https://ks2.eugnel.uk/`.
- `node scripts\punctuation-production-smoke.mjs --env production --out reports\punctuation\punctuation-production-smoke-round-length-fix-2026-05-10.json`: pass.
- `node scripts\punctuation-round-length-production-smoke.mjs --commit-sha 3b15de5950c9a1f8a7ec965f7e0f60ffe0e199bf --worker-version-id c624fa92-2c5a-4d0a-abb8-50af5e222783`: pass.

Evidence:

- `reports/punctuation/punctuation-production-smoke-round-length-fix-2026-05-10.json`
- `reports/punctuation/punctuation-round-length-production-smoke-2026-05-10.json`

The round-length browser smoke confirms:

- desktop 1024px selects 8, CTA carries `data-round-length="8"`, and the launched session renders `1 of 8`;
- mobile 390px selects 12, CTA carries `data-round-length="12"`, and the launched session renders `1 of 12`;
- both probes have empty `consoleErrors`, `requestFailures`, and `httpFailures` arrays;
- the report records Worker commit `3b15de5950c9a1f8a7ec965f7e0f60ffe0e199bf` and Worker version `c624fa92-2c5a-4d0a-abb8-50af5e222783`.

## Review Gate

All advisory feedback is treated as a blocker. The task is not closed until both reviewers return green:

- Code Reviewer: GREEN. No blockers or advisory items remain after reviewing the round-length command action, regression coverage, Hero read-model gating, strict browser smoke, and deployed-runtime evidence.
- Contract Auditor: GREEN. No blockers or advisory items remain after auditing tracked evidence, production binding, documentation consistency, and final `HEAD` / `origin/main` sync.
