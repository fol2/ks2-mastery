# Arithmetic Mixed-Number Render Engine Completion Report

Status: implementation verified locally after the expanded render-engine scope; independent reviewer and contract auditor are green; pending final production deployment evidence.

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

- Targeted Arithmetic render/runtime tests: `validation/current-2026-05-13/targeted-arithmetic-render-engine-tests-2026-05-13.log` (27 tests, 27 pass).
- Full local gate `npm test`: `validation/current-2026-05-13/npm-test-2026-05-13.log` (111,560 tests, 111,548 pass, 0 failures, 12 skipped).
- Full local gate `npm run check`: `validation/current-2026-05-13/npm-run-check-2026-05-13.log` (Wrangler dry-run, client bundle audit pass).
- Local rendered smoke: `validation/current-2026-05-13/local-arithmetic-render-engine-smoke-2026-05-13.json` (`2 and 3/5 + 3 and 3/5 =`, answer `6 1/5`, full equation accessibility label and hidden visual token children verified; column addition `question.visual` also verified with number/operator tokens and preserved underline row).
- Desktop screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-desktop-2026-05-13.png`
- Mobile screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-mobile-2026-05-13.png`
- Formal visual desktop screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-visual-desktop-2026-05-13.png`
- Formal visual mobile screenshot: `validation/current-2026-05-13/local-arithmetic-render-engine-visual-mobile-2026-05-13.png`

## Reviewer Status

- Code reviewer: GREEN after accessibility, stale-evidence, hyphenated-prose and `question.visual` blockers were fixed. Targeted suite rerun by reviewer: 27/27 pass; `git diff --check` pass.
- Contract auditor: GREEN after stale evidence, missing report and `question.visual` blockers were fixed. Targeted suite rerun by auditor: 27/27 pass.

## Remaining Release Tasks

- Commit and push to GitHub main.
- Deploy through the project package script.
- Run production Arithmetic smoke and browser-render proof on `https://ks2.eugnel.uk`.
- Sync the local main checkout to the latest `origin/main`.
