# Reading handoff execution evidence

## Source and environment

- Execution date: 2026-05-16.
- Target checkout: `D:\Coding\ks2-mastery\.worktrees\reading-handoff-package-20260516`.
- Branch: `codex/reading-handoff-package-20260516`.
- Starting source ref: GitHub/local `main` at `24ba39c05d34be365447763eacd8801995b2b2c2`.
- Patch root: repository root.
- Node: `v22.15.1`.
- npm: `11.6.2`.
- Worktree setup note: `node scripts/worktree-setup.mjs` could not create the Windows symlink because of local `EPERM`; `package.json` and `package-lock.json` matched the primary checkout, so `node_modules` was provided through a local junction for validation.

## Patch status

- `patch` was not available on this Windows shell, so the equivalent Git dry-run was used.
- `git apply --check --verbose docs\plans\james\hotfixes\22. reading-handoff-package\patches\001-reading-answer-acceptance-hardening.patch`: pass.
- `git apply --verbose docs\plans\james\hotfixes\22. reading-handoff-package\patches\001-reading-answer-acceptance-hardening.patch`: applied cleanly.
- After applying the package patch, the implementation was minimally adapted to keep source-affirmed negative `keywordAny` phrases accepted, for example `not dead`, `not just scrap`, and `cannot always know`, while still rejecting `not ${modelAnswer}` parrots.

## Before and after answer-acceptance probes

Baseline probe on the target checkout before the patch:

- Evidence: `target-baseline-reading-answer-acceptance-audit.json`.
- Content: version `7`, `714` passages, `7112` questions, `243` papers.
- Canonical model-answer failures: `0`.
- Negated model-answer probe: `3199` checked, `2774` suspicious full-mark acceptances.
- Representative baseline row IDs: `red_tin_box:rtb_q3`, `city_swifts:sw_q1`, `city_swifts:sw_q3`, `city_swifts:sw_q5`, `city_swifts:sw_q6`.
- Evidence contradiction probe: `710` checked, `1` suspicious full-mark acceptance.
- Malformed payload probe: `21` checked, `3` throws, all from `tide_clock:tc_q6` with `(response.answer || []).map is not a function`.
- Source-affirmed negation fixture: passed.
- Pre-marking read-model leak probe: `5` checked, `0` leaks.

Patched probe on the target checkout:

- Evidence: `target-patched-reading-answer-acceptance-audit.json`.
- Canonical model-answer failures: `0`.
- Negated model-answer probe: `3199` checked, `0` suspicious full-mark acceptances.
- Evidence contradiction probe: `710` checked, `0` suspicious full-mark acceptances.
- Malformed payload probe: `21` checked, `0` throws, `0` accepted full-mark malformed payloads.
- Source-affirmed negation probe: `7` checked, passed, `0` candidate failures.
- Pre-marking read-model leak probe: `5` checked, `0` leaks.
- Overall failures: `[]`.

## Local validation

- `node --version`: pass, `v22.15.1`.
- `npm --version`: pass, `11.6.2`.
- `npm run audit:reading-content`: pass. Evidence: `target-audit-reading-content-2026-05-16.out`; report: `reports/reading/reading-content-quality-audit.json`.
- `npm run audit:reading-answer-acceptance`: pass. Evidence: `target-audit-reading-answer-acceptance-2026-05-16.out`; report: `reports/reading/reading-answer-acceptance-audit.json`.
- `node --test tests\worker-reading-runtime.test.js`: pass, `30` tests, `30` pass, `0` fail. Evidence: `target-worker-reading-runtime-2026-05-16.out`.
- `node --test tests\reading-content-contract.test.js tests\reading-phase5-next1000-contract.test.js tests\reading-phase6-scale-contract.test.js tests\reading-phase7-scale-contract.test.js tests\reading-subject-registry.test.js tests\worker-reading-runtime.test.js`: pass, `60` tests, `60` pass, `0` fail. Evidence: `target-reading-core-suite-2026-05-16.out`.
- `node --test tests\reading-session-interface.test.js`: pass, `14` tests, `14` pass, `0` fail. Evidence: `target-reading-session-interface-2026-05-16.out`.
- `node .\scripts\run-node-tests.mjs "--test-name-pattern=reading|hero|reward|monster|subject runtime"`: pass, `1635` tests, `1635` pass, `0` fail.
- `npm test`: pass, `111595` tests, `111583` pass, `0` fail, `12` skipped.
- `npm run check`: pass. Evidence: `target-npm-run-check-2026-05-16.out`.

## Evidence cleanup

Large raw `npm test` logs were removed after their pass/fail summaries were recorded. Non-scope generated files from `npm run check` were restored, including generated build hashes, CSP hash, admin smoke latest output, grammar audit reports, and the monster asset manifest.

## Production status

Production deployment and live smoke were still pending when this local evidence file was first written. Do not claim `DONE — LIVE VERIFIED` until the production deploy and hard-refresh checks are recorded.
