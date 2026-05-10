# Hero Mode Independent Review Closure - 2026-05-10

**Status:** pending final independent re-review
**Contract folder:** `docs/plans/james/hero-mode/A/`
**Production origin:** `https://ks2.eugnel.uk`
**Deployed code baseline:** `6dd02cdb73c60df5154b8018789c9cd33acb9ad5`
**Deployed Worker version:** `6b0ece44-9f85-44c7-aa12-3e6a96d8d2e0`

---

## Review Streams

| Stream | Reviewer | Current status | Notes |
|--------|----------|----------------|-------|
| Code review | Russell | Pending re-review | Initial blockers remediated: wrapper-safe D1 evidence, PII-safe boundary classification, and tracked evidence scope. |
| Contract audit | Carver | Pending re-review | Initial blockers remediated: current deployed enabled-path smoke, stale pA8 document supersession notes, secret reassertion evidence, and tracked completion evidence. |

---

## Remediation Evidence

| Reviewer concern | Closure evidence |
|------------------|------------------|
| D1 evidence bypassed the OAuth-safe wrapper | `scripts/wrangler-oauth.mjs` now prefers the local Wrangler JS entrypoint while preserving token stripping; `tests/hero-pA7-wrangler-oauth.test.js` verifies argv preservation and token handling. |
| Production row counts did not prove the James-only boundary | `hero-mode-production-counts-2026-05-10.json` classifies rows as one real account boundary with three learner state rows and two event learners. |
| Current deployed enabled Hero path was not replayed | `hero-mode-current-deploy-enabled-smoke-2026-05-10.json` passes read model, start-task, Worker-owned punctuation completion, claim, duplicate claim, Camp insufficient-coins, restore, hide, and cleanup. |
| Exact exposure values were not freshly proven | `hero-mode-current-deploy-enabled-smoke-2026-05-10.json` records reassertion of `HERO_INTERNAL_ACCOUNTS`, `HERO_EXTERNAL_ACCOUNTS=[]`, `HERO_EXCLUDED_ACCOUNTS=[]`, `HERO_EMERGENCY_DISABLED=false`, and `HERO_ROLLOUT_PERCENT=0` with PII-safe proofs. |
| Historical pA8 documents contradicted the current boundary | `hero-pA8-support-summary.md` and `hero-pA8-rollback-evidence.md` now carry 2026-05-10 supersession notes. |
| Evidence files were untracked | Closed: the closure package is tracked in git and pushed to `origin/main`; final sync is verified with `git status --short --branch` and `git rev-parse HEAD origin/main`. |

---

## Verification

- `node --test tests/app-controller.test.js tests/worker-auth.test.js tests/worker-hero-read-model.test.js tests/hero-pA4-external-cohort-resolver.test.js tests/hero-pA5-rollout-resolver.test.js tests/hero-pA7-wrangler-oauth.test.js`: pass, 111 tests, 0 failures.
- `npm test`: pass, 109191 total tests, 109179 passed, 0 failed, 12 skipped.
- `npm run check`: pass, Wrangler dry-run build, public build assertion, and client bundle audit passed.
- `node docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-smoke-2026-05-10.mjs`: pass on production.
- `node docs/plans/james/hero-mode/A/hero-mode-production-counts-2026-05-10.mjs`: pass, no demo/external Hero rows after cleanup.

---

## Final Reviewer Verdicts

Pending final re-review.
