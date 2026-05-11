# Reasoning Subject Live Completion Report

Date: 2026-05-11
Production origin: `https://ks2.eugnel.uk`
Implementation baseline commit: `ffcea7781ab9a65dc2f3b2b94ff9f2b1675b5463`
Reviewed runtime delivery commit: `fde9b7c14e1aff33dbb602e6c290a8d0294057e9`
Cloudflare version: `f639eadf-2573-4321-94ef-6ca5ecee8368`

## Scope

Implemented the Reasoning subject live package from `docs/plans/james/hotfixes/5. reasoning-subject-live-package` into the repository. The work stayed bounded to the package contract and directly related contract gaps needed for production readiness.

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
- The Cloudflare startup CPU blocker found during final deploy was fixed by lazy-loading Punctuation command handlers from the Worker subject runtime dispatch boundary. This keeps the generated Punctuation runtime manifest off the Worker startup path while preserving command dispatch semantics.
- A production browser UI smoke proves the deployed shared React route renders Reasoning setup and session UI without console, page, request, or HTTP failures.

## Verification

Local verification:

- `npm test -- tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/hero-providers.test.js tests/hero-launch-adapters.test.js tests/hero-eligibility.test.js tests/worker-subject-runtime.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/main-runtime.test.js tests/react-subject-contract.test.js tests/ui-visual-journey-ready-subjects.test.js tests/ui-subject-visual-adapter-contract.test.js tests/hero-pool-registry.test.js tests/subject-contract.test.js` - pass, 171 tests. Raw log: `validation/local/targeted-tests-review-fixes-2026-05-11.log`.
- `npm test` - pass, 109250 tests, 0 failures, 12 skipped after the review-fix rebase. Raw log: `validation/local/npm-test-review-fixes-2026-05-11.log`.
- `npm run build` - pass after review fixes. Raw log: `validation/local/build-review-fixes-2026-05-11.log`.
- `npm run check` - pass after review fixes. Raw log: `validation/local/check-review-fixes-2026-05-11.log`.
- `npm test -- tests/worker-subject-runtime.test.js tests/worker-punctuation-runtime.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js` - pass after the startup fix, 193 tests. Raw log: `validation/local/targeted-tests-startup-fix-2026-05-11.log`.
- `npm test` - pass after the startup fix, 109251 tests, 0 failures, 12 skipped. Raw log: `validation/local/npm-test-startup-fix-2026-05-11.log`.
- `npm run build` - pass after the startup fix. Raw log: `validation/local/build-startup-fix-2026-05-11.log`.
- `npm run check` - pass after the startup fix and latest-main rebase.
- Final successful pre-push hook ran `npm test` and passed with 109266 tests, 0 failures, and 12 skipped before pushing `fde9b7c14e1aff33dbb602e6c290a8d0294057e9` to `origin/main`.

Deployment verification:

- `npm run deploy` deployed through the OAuth-safe Wrangler wrapper from `fde9b7c14e1aff33dbb602e6c290a8d0294057e9`.
- Worker startup passed at `810 ms`.
- Cloudflare deployed version `f639eadf-2573-4321-94ef-6ca5ecee8368`.
- Production bundle audit passed for `https://ks2.eugnel.uk/`: 1 HTML-referenced bundle, 6 chunks scanned transitively, 19 direct paths, matrix demo check OK, security-header checks 5/5, cache-split checks 15/15.
- Raw deploy log: `validation/production/deploy-final-2026-05-11.log`.

Production evidence:

- API smoke: `validation/production/reasoning-production-smoke-2026-05-11.json`.
- UI smoke: `validation/production/reasoning-production-ui-smoke-2026-05-11.json`.
- Desktop setup screenshot: `validation/production/screenshots/reasoning-setup-1280x800.png`.
- Desktop session screenshot: `validation/production/screenshots/reasoning-session-1280x800.png`.
- Mobile setup screenshot: `validation/production/screenshots/reasoning-setup-390x844.png`.

The production API smoke creates a demo learner session, starts a live Reasoning SATs Single session, submits the locally derived correct answer, completes the session with full score, observes Reasoning domain events and Reasoning-only reward reactions, and confirms no server-only marker/evaluation fields leak into the read models. The final run passed against source commit `fde9b7c14e1aff33dbb602e6c290a8d0294057e9` at `2026-05-11T14:37:00.309Z`.

Hero read-model probing returns `hero_shadow_disabled` while production Hero flags are disabled. The smoke fails if Hero is available but Reasoning is absent from eligibility, so this is an explicit disabled-production state rather than an unverified Hero path.

The production UI smoke opens `https://ks2.eugnel.uk/demo` in Chromium, enters the Reasoning subject through the subject grid, validates the shared React setup route on desktop and mobile, starts a desktop Reasoning session, captures screenshots, and asserts zero page errors, console errors, request failures, and HTTP failures. The final run passed against source commit `fde9b7c14e1aff33dbb602e6c290a8d0294057e9` at `2026-05-11T14:37:20.684Z`.

## Independent Review

Code Reviewer status: green.

First-pass Code Reviewer blockers were:

- Hero production smoke recorded Reasoning eligibility without asserting it when the Hero read model was available.
- Reasoning support/practice-session timestamps used wall-clock `Date.now()` instead of the injected command clock.

Both blockers were fixed, covered by tests, and re-reviewed green.

Contract Auditor status: final evidence packet prepared for green re-check.

First-pass Contract Auditor blockers were:

- Report and evidence had pending language and were not committed to `origin/main`.
- Production UI evidence, screenshots, and browser failure checks were missing.
- Hero live evidence was ambiguous.
- Raw logs for the verification and deploy path were missing.

The final evidence packet resolves those blockers with committed local logs, a raw deploy log, refreshed production API/UI smoke evidence, screenshots, explicit Hero disabled-state handling, and a deployed runtime commit on `origin/main`.

## Sync Status

Before this evidence-only report update, local `HEAD` and `origin/main` both resolved to `fde9b7c14e1aff33dbb602e6c290a8d0294057e9`. The production runtime is deployed from that commit. This report and refreshed evidence are documentation/evidence-only changes and do not alter runtime behaviour.
