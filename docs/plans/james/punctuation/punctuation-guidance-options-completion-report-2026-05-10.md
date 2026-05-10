# Punctuation Guidance Options Completion Report

Date: 2026-05-10
Subject: Punctuation
Production URL: https://ks2.eugnel.uk

## Scope

Added learner-controlled Setup options for Punctuation so learners can disable:

- Faded guidance.
- Non-scored banner.

The controls follow the existing Spelling tick/untick pattern and persist through the production subject command boundary.

## Implementation

- Added `showFadedGuidance` and `showNonScoredBanner` preferences with default `true`.
- Added Setup tick controls for both preferences.
- Added local and remote `punctuation-toggle-pref` handling.
- Added Worker command-boundary routing to persist the options through `save-prefs`.
- Hid the guided teach box when `showFadedGuidance` is `false`.
- Hid the GPS non-scored banner when `showNonScoredBanner` is `false`.
- Added Setup hero contrast variables and semantic grouping for the new controls.

## Evidence

- Full test gate: `npm test`
  - Result: 109204 tests, 109192 pass, 0 fail, 12 skipped.
- Build/deploy dry-run gate: `npm run check`
  - Result: passed.
- Deployment: `npm run deploy`
  - Result: passed.
  - Worker Version ID: `b49843e5-18d0-405c-8ffc-0f2d276af89f`.
  - Production bundle audit: passed for `https://ks2.eugnel.uk/`.
- Production toggle smoke: `node scripts/punctuation-guidance-options-production-smoke.mjs --commit-sha 6fa473bd2f02ffa4803c144ea3490a1c053e349b --worker-version-id b49843e5-18d0-405c-8ffc-0f2d276af89f`
  - Evidence: `reports/punctuation/punctuation-guidance-options-production-smoke-2026-05-10.json`.
  - Result: passed.
  - Confirmed both toggles reached `aria-pressed="false"`.
  - Confirmed GPS `data-gps-banner` stayed hidden.
  - Confirmed Guided `data-punctuation-session-teach` stayed hidden.
  - Confirmed console errors, request failures, and HTTP failures were empty.
- Baseline Punctuation production smoke:
  - Evidence: `reports/punctuation/punctuation-production-smoke-guidance-options-baseline-2026-05-10.json`.
  - Result: passed.

## Independent Review

- Code Reviewer: GREEN.
- Contract Auditor: GREEN.

## Release Status

Production deployment completed, live evidence passed, and both independent reviewers are GREEN.
