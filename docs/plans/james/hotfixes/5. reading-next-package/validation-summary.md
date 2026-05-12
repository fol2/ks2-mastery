# Reading Stretch Challenge and Interface Hardening Validation Summary

## Verdict

Production deployed and verified on `https://ks2.eugnel.uk`.

The patch adds a `Stretch challenge` mode for high-attainment Reading practice, keeps Reading v5 content totals unchanged, preserves answer-safe browser metadata, and hardens the setup path so stale focus or difficulty filters cannot narrow stretch sessions below the contract size.

The production rollout also required a startup-limit fix outside Reading: Punctuation P20 runtime bank generation now stays behind lazy frozen exports so the Worker no longer expands the 15072-item bank during module startup.

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
- `validation/final-npm-test.log`: 111480 tests, 111468 passed, 0 failed, 12 skipped.
- `validation/final-npm-run-check.log`: Wrangler deploy dry-run completed after build, public asset assertion and client bundle audit.

Each final evidence command has a paired `.status.json` file where applicable.

## Production Evidence

- `validation/production-deploy-startup-limit-failure-2026-05-12.log`: first real `npm run deploy` failed with Cloudflare Error 10021 because script startup exceeded the CPU limit.
- `validation/production-deploy-startup-limit-failure-2026-05-12.status.json`: machine-readable failure and resolution record.
- `validation/final-production-deploy.log`: real `npm run deploy` succeeded after the lazy Punctuation startup fix.
- `validation/final-production-deploy.status.json`: deployed Worker version `da755d6a-c120-432a-97ee-74e2c5458dce`, startup time 192 ms, and production bundle audit pass.
- `validation/final-production-reading-smoke.json`: live Reading API smoke passed against Reading content version 5 and commit `168005ec4c17749920c4ca0ae8a4effc5e69aee2`.
- `validation/final-production-reading-landing-smoke.json`: live Reading landing smoke passed on desktop and mobile viewports with no page, console, request or HTTP failures.
- `validation/final-production-reading-landing-screenshots/`: current production landing and session screenshots from the smoke run.
- `validation/final-production-reading-stretch-smoke.json`: live stretch smoke passed with stale setup filters (`difficulty=1`, `focusSkillId=P1`), six delayed-feedback questions, a long/high-difficulty passage, no punctuation-only items, and no pre-mark feedback leak.

## Superseded Evidence

The original lean-environment limitation logs are retained as source-package history only. They are superseded by the dependency-complete final evidence above, including the now-passing `tests/reading-session-interface.test.js` run.

The worktree setup evidence is `validation/final-npm-install-ignore-scripts.*`; the earlier hook-error install attempt is not part of the final evidence set.
