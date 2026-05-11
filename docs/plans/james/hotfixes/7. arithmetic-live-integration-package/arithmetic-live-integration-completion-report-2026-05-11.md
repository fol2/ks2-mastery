# Arithmetic live integration completion report

## Scope

- Source package: `docs/plans/james/hotfixes/7. arithmetic-live-integration-package`
- Production URL: `https://ks2.eugnel.uk`
- Runtime commit: `0671d54d` (`Implement arithmetic live integration`)
- Cloudflare production version: `534fc767-2b70-4065-b98f-db17d12eb004`
- Production smoke evidence: `docs/plans/james/hotfixes/7. arithmetic-live-integration-package/arithmetic-production-smoke-2026-05-11.json`

## Contract closure

- Arithmetic is a live registered subject, not a placeholder module.
- The original package snapshot said Reasoning remained the only locked placeholder. That line is superseded by the latest-main rebase context: Reasoning is already live, `HERO_READY_SUBJECT_IDS` includes Reasoning and Arithmetic, and `HERO_LOCKED_SUBJECT_IDS` is empty. The Arithmetic closure preserves that current production truth rather than reverting Reasoning.
- The content model exposes 24 skills, 30 templates, and 90 reward units across the contract strand totals: 12 number facts and place value, 39 written operations and inverses, 30 decimals and fractions, and 9 percentages and mixed arithmetic.
- Worker-owned generation and marking are implemented behind the subject command boundary; browser read models receive redacted public question identifiers and no deterministic answer oracle fields before marking.
- Active write commands require fresh session and question identifiers; stale submissions, stale continue commands, stale end-session commands, duplicate submissions, and untrusted preference keys are rejected or ignored without mutating learner state.
- True Test Mode delays marking feedback until finish-test and returns a paper summary only after the test is finished.
- Hero provider, Hero launch adapter, subject route, admin diagnostics, reward projection, monster roster, mastery summaries, local controller wiring, and production command routing include Arithmetic while preserving Reasoning live integration from the latest main branch.

## Verification

- `node --test tests/admin-visual-engine-diagnostics.test.js tests/hero-launch-adapters.test.js tests/react-subject-contract.test.js tests/hero-providers.test.js tests/hero-eligibility.test.js tests/ui-subject-visual-adapter-contract.test.js tests/worker-arithmetic-runtime.test.js tests/arithmetic-placeholder-boundary.test.js`: passed, 97 tests.
- `cmd.exe /c npm test`: passed after rebase, 109,253 pass, 0 fail, 12 skipped. The skipped rows are the existing Windows `rg` drift-guard skips.
- Pre-push `npm test`: passed, 109,253 pass, 0 fail, 12 skipped.
- `cmd.exe /c npm run check`: passed, including Wrangler dry-run, build, public asset assertion, and client bundle audit.
- `cmd.exe /c npm run deploy`: passed and deployed Cloudflare version `534fc767-2b70-4065-b98f-db17d12eb004`; production bundle audit passed for `https://ks2.eugnel.uk/`.
- `cmd.exe /c npm run smoke:production:arithmetic -- --out "docs/plans/james/hotfixes/7. arithmetic-live-integration-package/arithmetic-production-smoke-2026-05-11.json"`: passed against `https://ks2.eugnel.uk`.

## Production smoke result

The production smoke created a demo learner, started Arithmetic Smart Review, confirmed the public read model redacts pre-mark answer data, submitted an intentionally wrong answer, observed server marking and solution feedback after marking, started True Test Mode, confirmed delayed feedback before finish-test, finished a short 12-question paper with a 14-mark maximum, and proved stale question writes leave the learner revision unchanged.

Key smoke fields:

- `ok`: `true`
- `contentReleaseId`: `arithmetic-ks2-worker-v1-2026-05-11`
- `templateCount`: `30`
- `skillCount`: `24`
- `rewardUnitCount`: `90`
- `trueTestMode.summaryMaxScore`: `14`
- `staleWriteGuard.changed`: `false`
- `staleWriteGuard.revisionUnchanged`: `true`

## Independent review

Initial independent Code Reviewer and Contract Auditor re-review found no remaining runtime blocker after the production smoke. Their closure blockers were that this evidence/report package was still untracked, the report still said review was pending, and the original Reasoning placeholder line needed an explicit rebase supersession note. This tracked revision resolves those package blockers and is being submitted for final green review before closure.
