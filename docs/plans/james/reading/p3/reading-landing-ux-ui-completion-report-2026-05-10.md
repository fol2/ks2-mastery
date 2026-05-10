# Reading landing UX/UI alignment completion report

Date: 2026-05-10
Status: production deployed and verified

## Scope delivered

- Aligned the Reading setup landing interface with the mature Spelling and Grammar subject setup shell.
- Reused the shared subject stage, theme scope, hero backdrop, welcome block, setup grid, side panel, companion panel, more-practice section and platform buttons.
- Kept Reading-specific session behaviour inside the existing Reading surface rather than introducing a bespoke app-shell route.
- Preserved Worker-owned command mutation for Reading setup preferences and start actions.
- Kept the Reading one-question and full-list session interface from the P3 contract intact.
- Added production smoke coverage for the Reading landing setup shell, desktop list-mode session transition, mobile layout, HTTP failures, request failures, console errors and page errors.
- Fixed contract-related resilience gaps found during review: game-state read failures no longer break setup render, pending selected mode cards keep selected accessibility state, and missing monster assets fall back to text rather than broken images.

## Implementation files

- `src/subjects/reading/components/ReadingPracticeSurface.jsx`
- `styles/app.css`
- `scripts/reading-landing-production-smoke.mjs`
- `tests/reading-session-interface.test.js`
- `package.json`

## Verification evidence

- Focused Reading landing and CSP gate: `node --test tests/reading-session-interface.test.js tests/csp-inline-style-budget.test.js`
  - Result: 20 tests passed, 0 failed.
- Full local gate: `npm test`
  - Result: 109214 tests, 109202 passed, 12 skipped, 0 failed.
- Production readiness gate: `npm run check`
  - Result: passed through the OAuth-safe Wrangler dry-run path, build-public assertion, client bundle audit and dry-run deployment checks.
- Pre-push gate: `git push origin HEAD:main`
  - Result: pre-push `npm test` reran and passed with 109214 tests, 109202 passed, 12 skipped, 0 failed.
- Deployment: `npm run deploy`
  - Result: deployed Worker version `3dcb32f6-3642-4a46-80c0-c7d173769c30`; production bundle audit passed for `https://ks2.eugnel.uk/`.
- Production smoke: `node scripts/reading-landing-production-smoke.mjs --origin=https://ks2.eugnel.uk --out=docs/plans/james/reading/p3/reading-landing-production-smoke-2026-05-10.json --screenshot-dir=docs/plans/james/reading/p3/reading-landing-production-screenshots-2026-05-10`
  - Result: passed against `https://ks2.eugnel.uk`.

## Production smoke artefacts

- `docs/plans/james/reading/p3/reading-landing-production-smoke-2026-05-10.json`
- `docs/plans/james/reading/p3/reading-landing-production-screenshots-2026-05-10/reading-landing-1280x800.png`
- `docs/plans/james/reading/p3/reading-landing-production-screenshots-2026-05-10/reading-session-1280x800.png`
- `docs/plans/james/reading/p3/reading-landing-production-screenshots-2026-05-10/reading-landing-390x844.png`

Smoke result summary:

- `ok`: true
- `smokeType`: `reading-landing-production`
- `origin`: `https://ks2.eugnel.uk`
- `commitSha`: `b3633947ddb1987b16415ce7466687285642697a`
- Desktop landing: shared setup grid, Reading setup main panel, Moonleaf Archive hero backdrop, three primary mode cards, four setup selects, companion panel and more-practice section verified.
- Desktop session transition: list view started successfully with active question list, question card and form.
- Mobile landing: shared setup grid and Reading setup content verified at 390 x 844 with no horizontal overflow.
- Browser failures: 0 page errors, 0 console errors, 0 request failures, 0 HTTP failures.

## Independent review closure

- Code reviewer: GREEN after all blockers and advisories were fixed.
- Contract auditor: implementation scope GREEN. Closure blockers were deployment, production smoke, evidence report and main checkout sync; this report records the completed closure evidence.

## Git and deployment status

- Runtime code commit: `b3633947ddb1987b16415ce7466687285642697a` (`Align Reading setup landing with subject shell`).
- Remote after runtime push: `origin/main` matched `b3633947ddb1987b16415ce7466687285642697a`.
- Production deployment: completed from runtime code commit via `npm run deploy`.
- Evidence payload: this report and the production smoke artefacts are included in the follow-up evidence commit on `origin/main`.
- Main checkout sync: `D:\Coding\ks2-mastery` is fast-forwarded after the evidence commit lands so local `HEAD` matches `origin/main`.
