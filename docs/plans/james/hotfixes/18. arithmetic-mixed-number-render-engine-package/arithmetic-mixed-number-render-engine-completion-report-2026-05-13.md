# Arithmetic Mixed-Number Render Engine Completion Report

Status: completed. The expanded Arithmetic render-engine scope is implemented, locally verified, independently reviewed, deployed to production, and live-smoked on `https://ks2.eugnel.uk`.

## Root Cause

The screenshot question was mathematically correct: `5 3/8 - 1 1/8 = 4 1/4`.
The defect was in the Arithmetic UI display layer. Arithmetic stems, feedback, answer text and worked-solution lines were rendered as raw text, so a mixed number such as `1 1/8` could visually read like `11/8`.

The affected boundary was:

- `shared/arithmetic/content.js` generated valid arithmetic text such as `5 3/8 - 1 1/8 =`.
- `src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx` rendered those strings directly.
- Feedback fields such as `The answer is 4 1/4.` and `Answer: 4 1/4` used the same raw rendering path.

## Implemented Fix

Added an Arithmetic render engine that tokenises the full display text and renders equation tokens through a single UI path:

- Mixed numbers render as grouped whole-number plus stacked fraction UI.
- Standalone fractions render as stacked fractions.
- Whole numbers, decimal numbers, operators, equals signs and placeholders render as equation tokens.
- Hyphenated prose, including digit-word forms such as `2-digit`, is preserved as prose rather than read as a subtraction expression.
- The whole rendered expression exposes one readable `role="math"` accessible label.
- Visual child tokens are `aria-hidden` so screen readers do not double-read the expression.

The renderer is used for:

- Current Arithmetic question stems.
- Current Arithmetic formal visual equations, including column-layout `question.visual` rows.
- Immediate feedback text.
- `Answer:` feedback values.
- Worked-solution lines.
- Summary review questions.
- Summary formal visual equations.
- Summary learner answers.
- Summary feedback and solution lines.

Input boxes remain plain editable text, because they are the learner editing surface rather than display copy.

## Files Changed

- `src/subjects/arithmetic/stem-renderer.js`
- `src/subjects/arithmetic/components/ArithmeticQuestionStem.jsx`
- `src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx`
- `styles/app.css`
- `tests/arithmetic-stem-renderer.test.js`
- `tests/react-arithmetic-surface.test.js`

## Current Evidence

- Implementation commit: `62936ce083f52b282fae540df54637f919a8dd71`.
- Targeted Arithmetic render/runtime tests: `validation/current-2026-05-13/targeted-arithmetic-render-engine-tests-2026-05-13.log` (27 tests, 27 pass).
- Full local gate `npm test`: `validation/current-2026-05-13/npm-test-2026-05-13.log` (111,560 tests, 111,548 pass, 0 failures, 12 skipped).
- Full local gate `npm run check`: `validation/current-2026-05-13/npm-run-check-2026-05-13.log` (Wrangler dry-run, client bundle audit pass).
- Production deployment: `validation/current-2026-05-13/npm-run-deploy-2026-05-13.log` (`npm run deploy`, Cloudflare version `5de5f13b-e431-4b41-8a62-81adb71e03c9`, production bundle audit pass).
- Production Arithmetic API smoke: `validation/current-2026-05-13/production-arithmetic-render-engine-api-smoke-2026-05-13.json` and `validation/current-2026-05-13/production-arithmetic-render-engine-api-smoke-2026-05-13.log` (`ok: true`, production environment, demo learner, immediate practice, True Test mode and stale-write guard).
- Production rendered browser smoke: `validation/current-2026-05-13/production-arithmetic-render-engine-browser-smoke-2026-05-13.json` and `validation/current-2026-05-13/production-arithmetic-render-engine-browser-smoke-2026-05-13.log` (`ok: true`, Chromium, zero console/page/request/HTTP failures).
- Production mixed-number desktop screenshot: `validation/current-2026-05-13/production-arithmetic-render-engine-desktop-2026-05-13.png`
- Production mixed-number mobile screenshot: `validation/current-2026-05-13/production-arithmetic-render-engine-mobile-2026-05-13.png`
- Production formal visual desktop screenshot: `validation/current-2026-05-13/production-arithmetic-render-engine-visual-desktop-2026-05-13.png`
- Production formal visual mobile screenshot: `validation/current-2026-05-13/production-arithmetic-render-engine-visual-mobile-2026-05-13.png`
- Production browser smoke helper syntax check: `validation/current-2026-05-13/arithmetic-render-engine-production-browser-smoke-check-2026-05-13.log`
- Local rendered smoke: `validation/current-2026-05-13/local-arithmetic-render-engine-smoke-2026-05-13.json` (`2 and 3/5 + 3 and 3/5 =`, answer `6 1/5`, full equation accessibility label and hidden visual token children verified; column addition `question.visual` also verified with number/operator tokens and preserved underline row).
- Desktop screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-desktop-2026-05-13.png`
- Mobile screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-mobile-2026-05-13.png`
- Formal visual desktop screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-visual-desktop-2026-05-13.png`
- Formal visual mobile screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-visual-mobile-2026-05-13.png`

## Reviewer Status

- Code reviewer: GREEN after accessibility, stale-evidence, hyphenated-prose and `question.visual` blockers were fixed. Targeted suite rerun by reviewer: 27/27 pass; `git diff --check` pass.
- Contract auditor: GREEN after stale evidence, missing report and `question.visual` blockers were fixed. Targeted suite rerun by auditor: 27/27 pass.

## Release Closure

- Implementation was committed and pushed to GitHub main.
- Production was deployed through `npm run deploy`, preserving the repo's OAuth-safe Wrangler wrapper path.
- Live production API and browser-render smokes passed on `https://ks2.eugnel.uk`.
- Local main sync is recorded in the final handover after the evidence commit is pushed.
