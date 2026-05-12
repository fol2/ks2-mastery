# Reading Stretch Challenge and Interface Hardening Validation Summary

## Verdict

Ready for production deployment after the Reading-only follow-on patch is merged.

The patch adds a `Stretch challenge` mode for high-attainment Reading practice, keeps Reading v5 content totals unchanged, preserves answer-safe browser metadata, and hardens the setup path so stale focus or difficulty filters cannot narrow stretch sessions below the contract size.

## What Changed

- Adds `stretch` to Reading server metadata and browser-safe mode metadata.
- Adds a learner-facing `Stretch challenge` option under More Reading practice.
- Adds Worker selection logic for stretch practice:
  - long or high-difficulty passages;
  - six questions;
  - delayed feedback;
  - no punctuation-only questions;
  - weighted toward open, evidence, match, order, comparison, structure and inference work;
  - type and skill variety before filling remaining slots.
- Clears focus and difficulty filters when stretch mode is selected, both in browser preference normalisation and Worker preference normalisation.
- Disables the Reading focus and Difficulty selects while stretch mode is selected.
- Adds mode-specific UI copy: `Mark challenge`.
- Adds static regression guards for duplicate hero-card `data-text-tone` attributes.

## Reading Counts Unchanged

```json
{
  "version": 5,
  "passageCount": 210,
  "questionCount": 2072,
  "paperCount": 75,
  "genres": {
    "fiction": 71,
    "non-fiction": 71,
    "poetry": 68
  },
  "longPassageCount": 166
}
```

## Final Local Evidence

- `validation/final-npm-install-ignore-scripts.log`: dependency-complete install pass for this worktree, using `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --ignore-scripts`.
- `validation/final-focused-reading-contract-tests.log`: 45 tests passed, 0 failed.
- `validation/final-reading-session-interface.log`: 14 tests passed, 0 failed.
- `validation/final-worker-reading-runtime.log`: 28 tests passed, 0 failed.
- `validation/final-reading-content-quality-audit.json`: official Reading content audit passed with 0 failures and 0 advisories.
- `validation/final-stretch-mode-probe.json`: stretch is present in server and browser metadata, with 182 eligible passages and 1474 eligible questions; filtered payload samples also keep six-question delayed-feedback sessions.
- `validation/final-npm-test.log`: 111471 tests, 111459 passed, 0 failed, 12 skipped.
- `validation/final-npm-run-check.log`: Wrangler deploy dry-run completed after build, public asset assertion and client bundle audit.

Each final evidence command has a paired `.status.json` file where applicable.

## Superseded Evidence

The original lean-environment limitation logs are retained as source-package history only. They are superseded by the dependency-complete final evidence above, including the now-passing `tests/reading-session-interface.test.js` run.

The worktree setup evidence is `validation/final-npm-install-ignore-scripts.*`; the earlier hook-error install attempt is not part of the final evidence set.
