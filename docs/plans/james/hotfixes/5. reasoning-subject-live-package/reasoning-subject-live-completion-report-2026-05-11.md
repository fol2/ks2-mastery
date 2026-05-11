# Reasoning Subject Live Completion Report

Date: 2026-05-11
Production origin: `https://ks2.eugnel.uk`
Implementation baseline commit: `ffcea7781ab9a65dc2f3b2b94ff9f2b1675b5463`
Final delivery commit: pending final evidence commit
Cloudflare version: pending final redeploy after review fixes

## Scope

Implemented the Reasoning subject live package from `docs/plans/james/hotfixes/5. reasoning-subject-live-package` into the repository, keeping the fix bounded to the contract and directly related contract gaps.

The delivered subject is registered as a ready subject, renders through the shared React subject route, dispatches Worker-owned Reasoning commands, uses the promoted `reasoning-poc-promoted-2026-05-11` content release, projects Reasoning-owned monster rewards, and exposes Hero Mode provider and launch-adapter support without turning Hero Mode into a second mastery engine.

## Contract Closure

- Reasoning is registered as available and routes through `ReasoningPracticeSurface`.
- Worker runtime dispatches Reasoning `start-session`, `submit-answer`, support, navigation, marking, preferences, ending, and reset commands.
- The content bank contains 110 deterministic SATs-friendly templates across 17 skills and 20 misconception tags.
- Browser read models are generated from safe metadata and are checked for marker/evaluation leakage.
- Reasoning reward projection updates Reasoning-owned monsters and the Reasoning grand monster only.
- Hero Mode eligibility and launch adapters include Reasoning task envelopes while preserving Worker-owned mastery.
- Arithmetic remains unavailable in the visual adapter contract.
- The stale package checksum was corrected to the repository-normalised patch hash.
- Code review blockers were fixed by asserting Reasoning Hero eligibility whenever the Hero read model is available, and by using the injected command clock for Reasoning support timestamps and practice-session records.
- A production browser UI smoke was added to prove the deployed shared React route renders Reasoning setup and session UI without console, page, request, or HTTP failures.

## Verification

Local verification:

- `npm test -- tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/hero-providers.test.js tests/hero-launch-adapters.test.js tests/hero-eligibility.test.js tests/worker-subject-runtime.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/main-runtime.test.js tests/react-subject-contract.test.js tests/ui-visual-journey-ready-subjects.test.js tests/ui-subject-visual-adapter-contract.test.js tests/hero-pool-registry.test.js tests/subject-contract.test.js` — pass, 171 tests. Raw log: `validation/local/targeted-tests-review-fixes-2026-05-11.log`.
- `npm test` — pass, 109250 tests, 0 failures, 12 skipped after rebase onto the latest `origin/main`. Raw log: `validation/local/npm-test-review-fixes-2026-05-11.log`.
- `npm run build` — pass. Raw log: `validation/local/build-review-fixes-2026-05-11.log`.
- `npm run check` — pass. Raw log: `validation/local/check-review-fixes-2026-05-11.log`.
- Pre-push hook `npm test` — to be rerun on final push.

Deployment verification:

- `git push origin HEAD:main` pushed `ffcea7781ab9a65dc2f3b2b94ff9f2b1675b5463` to `origin/main` before review fixes.
- `npm run deploy` deployed through the OAuth-safe Wrangler wrapper before review fixes.
- Production bundle audit passed for `https://ks2.eugnel.uk/` before review fixes.
- Final push, deploy, production API smoke, and production UI smoke are pending after review-fix commit.

Production evidence file:

- `docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/reasoning-production-smoke-2026-05-11.json`
- `docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/reasoning-production-ui-smoke-2026-05-11.json`
- `docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/screenshots/reasoning-setup-1280x800.png`
- `docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/screenshots/reasoning-session-1280x800.png`
- `docs/plans/james/hotfixes/5. reasoning-subject-live-package/validation/production/screenshots/reasoning-setup-390x844.png`

The production API smoke creates a demo learner session, starts a live Reasoning SATs Single session, submits the locally derived correct answer, completes the session with full score, observes Reasoning domain events and Reasoning-only reward reactions, and confirms no server-only marker/evaluation fields leak into the read models. Hero read-model probing returns `hero_shadow_disabled` while production Hero flags are disabled; the smoke now fails if Hero is available but Reasoning is absent from eligibility.

The production UI smoke opens `https://ks2.eugnel.uk/demo` in Chromium, enters the Reasoning subject through the subject grid, validates the shared React setup route on desktop and mobile, starts a desktop Reasoning session, captures screenshots, and asserts zero page errors, console errors, request failures, and HTTP failures.

## Independent Review

Status: code reviewer green; contract auditor final re-check pending after review-fix commit, final deploy, and refreshed production evidence.

First-pass blockers:

- Code Reviewer: Hero production smoke did not assert Reasoning eligibility when Hero read model was available.
- Code Reviewer: Reasoning support/practice-session timestamps used wall-clock `Date.now()` instead of the injected command clock.
- Contract Auditor: evidence/report files were not committed to `origin/main`, production UI evidence was missing, Hero live evidence was ambiguous, and raw verification logs were missing.

Fix status:

- Hero smoke assertion fixed and re-reviewed green by the Code Reviewer.
- Reasoning command-clock regression fixed, covered, and re-reviewed green by the Code Reviewer.
- Production UI smoke evidence added with screenshots and no browser failures.
- Raw local verification logs added.
- Final commit, deploy, production smoke refresh, and Contract Auditor green sign-off remain pending.

## Sync Status

At the implementation baseline deployment point, local `HEAD` and `origin/main` both resolved to `ffcea7781ab9a65dc2f3b2b94ff9f2b1675b5463`. Final sync will be rechecked after the review-fix evidence commit is pushed.
