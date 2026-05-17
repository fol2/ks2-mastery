# Arithmetic hardening execution evidence — 2026-05-16

## Status

Final execution status: `DONE — LIVE VERIFIED`.

Production origin: `https://ks2.eugnel.uk`.

Final deployed Cloudflare Version ID: `34cdc3d4-9cbe-4862-931c-ecfddf7b3c17`.

Worktree: `D:\Coding\ks2-mastery\.worktrees\arithmetic-hardening-handoff-20260516`.

Target branch/ref: `codex/arithmetic-hardening-handoff-20260516` from `origin/main`.

Target start commit: `c8527251c0772c92af20f0b18bec3fc572ff3b75`.

Final upstream sync commit before commit/push: `07c0151b222e8815f3a3396d85e5c2a93fb711fd`.

Runtime: Node `v22.15.1`, npm `11.6.2`, `.nvmrc` `22`.

## Source Boundary

The handoff package is ZIP-authoritative and notes drift between the uploaded ZIP and GitHub `main`. Current `origin/main` still contained the vulnerable Arithmetic logic, but the patch intent applied cleanly to the target source with `git apply --check`.

The Windows environment did not provide a `patch` executable, so the target dry-run equivalent was:

- `git apply --check --verbose docs\plans\james\hotfixes\24. arithmetic-hardening-handoff\patches\001-arithmetic-question-acceptance-and-due-review-hardening.patch`
- Evidence: `validation\target-origin-main-git-apply-check-2026-05-16.log`

Patch application:

- `git apply --verbose docs\plans\james\hotfixes\24. arithmetic-hardening-handoff\patches\001-arithmetic-question-acceptance-and-due-review-hardening.patch`
- Evidence: `validation\target-origin-main-git-apply-2026-05-16.log`

Manual adaptation beyond the package patch:

- `worker/src/hero/launch-adapters/arithmetic.js` now maps Arithmetic Hero `due-review` envelopes to `goal: 'due'`, so Hero-launched due-review uses the hardened due-review goal.
- `tests/worker-arithmetic-runtime.test.js` adds regression coverage for Arithmetic monster IDs, non-Arithmetic Codex state preservation, and Hero due-review launch payloads.

## Files Changed

- `shared/arithmetic/content.js`
- `worker/src/subjects/arithmetic/engine.js`
- `worker/src/hero/launch-adapters/arithmetic.js`
- `tests/worker-arithmetic-runtime.test.js`
- `docs/plans/james/hotfixes/24. arithmetic-hardening-handoff/**` evidence package

No unrelated reward, Stars, Hero Mode surface, monster roster, subject progression, auth, routing, production config, D1 migration, or deployment configuration changes were introduced.

## Verification Commands

Environment and setup:

- `node --version`: `v22.15.1`
- `npm --version`: `11.6.2`
- `Get-Content .nvmrc`: `22`
- `node scripts/worktree-setup.mjs`: attempted setup; package files differed from the primary checkout, so it selected install fallback.
- `npm install`: exit `0`; simple-git-hooks could not install hooks in the linked worktree `.git` file, but npm completed with 0 vulnerabilities.

Targeted validation:

- `node --test tests/worker-arithmetic-runtime.test.js`: rerun pass, 20/20.
- `node --test tests/arithmetic-stem-renderer.test.js tests/arithmetic-renderer-css.test.js`: rerun pass, 11/11.
- `node audit-arithmetic-question-acceptance.mjs` from repo root: pass, 180,000 generated cases, 0 correct rejected, 0 digit-spaced accepted, 0 zero expanded terms.
- `node probe-due-review.mjs` from repo root: pass, due skill targeted, wrong due answer stayed active, no-due fallback completed after 10 questions.
- Connectivity evidence: `validation\target-origin-main-connectivity-2026-05-16.json` confirms Arithmetic monster IDs exist, reward events are Arithmetic-only, non-Arithmetic Codex entries stayed unchanged, and Hero due-review launches `goal: 'due'`.

Full validation:

- `npm test`: exit `0`.
- `npm run check`: exit `0`; Wrangler dry-run, custom build, public assertion, and client bundle audit passed.
- `git diff --check`: exit `0`.

Post-fast-forward validation against latest `origin/main` at validation time (`7fe8f4bc0bcc737eb5619cfdaf15a540b8caaea1`), followed by a clean rebase over `07c0151b222e8815f3a3396d85e5c2a93fb711fd`:

- `node --test tests/worker-arithmetic-runtime.test.js`: exit `0`.
- `node --test tests/arithmetic-stem-renderer.test.js tests/arithmetic-renderer-css.test.js`: exit `0`.
- `npm test`: exit `0`.
- `npm run check`: exit `0`; Wrangler dry-run, custom build, public assertion, and client bundle audit passed.

Production:

- `npm run deploy`: final rerun exit `0`; deployed Version ID `34cdc3d4-9cbe-4862-931c-ecfddf7b3c17`; production bundle audit passed.
- `node scripts/arithmetic-production-smoke.mjs --origin=https://ks2.eugnel.uk`: rerun exit `0`.
- Production hardening probe: rerun exit `0`; live `3 0 0` was rejected for expected `300`, and live `700` was accepted for expected `700`.
- Production due-work probe: exit `0`; after a demo-only D1 dueAt seed, the live due session opened on the missed retry stem and a wrong due answer stayed in `session` with `summary: null`.
- Browser hard refresh: final Playwright probe exit `0`, production `/arithmetic` hard reloaded with no console issues and no failed requests.

## Key Evidence Artefacts

- `validation\target-origin-main-worker-arithmetic-runtime-rerun-2026-05-16.log`
- `validation\target-origin-main-arithmetic-renderer-rerun-2026-05-16.log`
- `validation\target-origin-main-adversarial-audit-rerun-2026-05-16.json`
- `validation\target-origin-main-due-review-probe-rerun-2026-05-16.json`
- `validation\target-origin-main-connectivity-2026-05-16.json`
- `validation\target-origin-main-npm-test-2026-05-16.log`
- `validation\target-origin-main-npm-run-check-2026-05-16.log`
- `validation\target-origin-latest-worker-arithmetic-runtime-2026-05-16.log`
- `validation\target-origin-latest-arithmetic-renderer-2026-05-16.log`
- `validation\target-origin-latest-npm-test-2026-05-16.log`
- `validation\target-origin-latest-npm-run-check-2026-05-16.log`
- `validation\target-origin-main-npm-run-deploy-rerun-2026-05-16.log`
- `validation\production-arithmetic-smoke-rerun-2026-05-16.json`
- `validation\production-arithmetic-hardening-probe-rerun-2026-05-16.json`
- `validation\production-arithmetic-due-work-d1-seeded-probe-2026-05-16.json`
- `evidence\production-hard-refresh-arithmetic-final-2026-05-16.json`
- `evidence\production-hard-refresh-arithmetic-final-2026-05-16.png`

Superseded diagnostics are kept under `validation\superseded\`. They record an earlier stale/partial live deploy symptom and an over-strict delayed-probe assertion. The final production proof is the post-redeploy D1-seeded due-work probe listed above.

## Acceptance Mapping

- Numeric answer hardening: covered by runtime tests, 180,000-case audit, and production hardening probe.
- Valid comma and space grouping retained: covered by runtime tests.
- Malformed comma and digit-spaced answers rejected: covered by runtime tests, audit, and production hardening probe.
- Zero-remainder text preserved only where allowed: covered by runtime tests.
- Place-value zero expanded terms removed: covered by runtime tests, 180,000-case audit, and production hardening probe.
- Due work targeted first: covered by runtime tests, due-review probe, and production D1-seeded due-work probe.
- No-due due-review bounded fallback: covered by runtime tests, due-review probe, and production hardening probe.
- Wrong due-review answer does not complete due review: covered by runtime tests and production D1-seeded due-work probe.
- Worker-owned commands, stale guards, duplicate-submit guard, test-mode delay, blank submissions, read-model redaction: covered by worker runtime tests and production Arithmetic smoke.
- Reward/Codex/monster connectivity: covered by worker runtime tests and connectivity JSON evidence.
- Hero provider/launch adapter sanity: covered by worker runtime tests and connectivity JSON evidence.
- Production hard refresh: covered by final Playwright hard-refresh JSON and screenshot.

## Rollout Risk Note

The current 30-template / 90-reward-unit model is suitable for a hardened thin-slice live Arithmetic rollout and demo/internal validation. Broader public rollout should still monitor mastery evidence semantics, reward-unit inflation, and learner tuning over time. This hotfix deliberately does not redesign the Arithmetic mastery model or reward economy.

## Reviewer Outputs

- Code Reviewer: `PASS — no blockers, no advisories, findings=[]`
- Contract Auditor: `PASS — no blockers, no advisories, findings=[]`

Reviewer artefacts:

- `reviews\code-reviewer-2026-05-16.md`
- `reviews\contract-auditor-2026-05-16.md`
