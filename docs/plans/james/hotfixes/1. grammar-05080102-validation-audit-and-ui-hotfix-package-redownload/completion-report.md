# Grammar 05080102 validation audit and UI hotfix completion report

Date: 2026-05-08

## Verdict

Complete for production deployment pending final independent contract-auditor closure after this report is committed.

The Grammar normal-session `End round` action now becomes unavailable when the runtime is read-only or when a command is pending. The change is intentionally limited to the contract scope: Grammar session UI and the UI action-engine contract test.

## Shipped change

- `src/subjects/grammar/components/GrammarSessionScene.jsx`
  - Changed the normal-session `End round` ghost button from `disabled={pending}` to `disabled={runtimeReadOnly || pending}`.
- `tests/ui-action-engine-contract.test.js`
  - Added a regression assertion that scopes to the single Button block dispatching `grammar-end-early`, then checks `variant`, `disabled`, and label stability.
- Package artefacts updated to match the shipped repo state:
  - `patches/001-grammar-session-readonly-end-round.patch`
  - `patched-files/tests/ui-action-engine-contract.test.js`

No Grammar content, answer marking, question generation, smart-practice selection, subject mastery, Stars, rewards, monsters, Hero Mode, worker command semantics, or other subjects were changed.

## Prompt-to-artifact checklist

| Requirement | Evidence |
| --- | --- |
| Complete all docs in `docs\plans\james\hotfixes\1. grammar-05080102-validation-audit-and-ui-hotfix-package-redownload` | Package README, contract, patch, patched-files, validation logs, production evidence, and this completion report are in the same folder. |
| Implement the contract fix, not a broader improvement | `src/subjects/grammar/components/GrammarSessionScene.jsx` changes only the normal-session `End round` disabled expression. |
| Lock the regression with tests | `validation/repo-ui-action-engine-contract-2026-05-08.log` shows `17/17 pass`; the assertion scopes to the `grammar-end-early` Button block. |
| Run Grammar target acceptance checks | `validation/repo-grammar-p20-targeted-tests-2026-05-08.log` shows `54/54 pass`. |
| Keep manual expansion and certification evidence valid | `validation/repo-manual-expansion-check-2026-05-08.log` and `validation/repo-certification-validator-2026-05-08.log` pass. |
| Re-run Grammar P20 quality and smart-practice smoke windows | `validation/repo-grammar-p20-quality-hardening-seeds-1-3-2026-05-08.log` and `validation/repo-grammar-smart-practice-seeds-1-3-2026-05-08.log` pass with zero failures/advisories. |
| Run repo-level verification before deployment | `validation/repo-npm-test-2026-05-08.log` shows `109183` tests, `109171` pass, `0` fail, `12` skipped; `validation/repo-npm-check-2026-05-08.log` shows Cloudflare dry-run deploy/build/client audit pass. |
| Independent code reviewer green | Code reviewer returned GREEN after the weak regex and patch trailing-whitespace blockers were fixed. |
| Deploy to production using package scripts | `validation/repo-deploy-2026-05-08.log` shows `npm run deploy`, Wrangler upload success, Worker version `30687105-8e70-4fcd-9663-142c2995bc16`, and production bundle audit pass for `https://ks2.eugnel.uk/`. |
| Verify production Grammar behaviour on `ks2.eugnel.uk` | `validation/production-grammar-smoke-2026-05-08.json` has `ok: true`, `environment: production`, `deployedUrl: https://ks2.eugnel.uk`, `releaseId: grammar-qg-p20-2026-05-05`, and `commitSha: fd35b91650445419cefeddcc8aceabc16abd109e`. |
| Verify this exact UI hotfix exists in the deployed bundle | `validation/production-ui-hotfix-bundle-assertion-2026-05-08.json` has `ok: true` and confirms the live `app.bundle.js` contains the `grammar-end-early` button with the minified `disabled:n||h` signal, where `n` is `runtimeReadOnly` and `h` is `pending` in the compiled component. |
| Sync local `main` with GitHub `main` | Source/evidence commit `fd35b91650445419cefeddcc8aceabc16abd109e` was pushed to `origin/main`; the final docs/evidence commit will be pushed after final contract-auditor closure is recorded. |

## Verification commands

```bash
node --test tests/ui-action-engine-contract.test.js
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
node scripts/generate-grammar-manual-expansion.mjs --check
node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p20-certification-manifest.json --expected-release=grammar-qg-p20-2026-05-05
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1..3 --smart-seeds=1..3
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..3
npm test
npm run check
npm run deploy
node scripts/grammar-production-smoke.mjs --json --evidence-origin=ks2.eugnel.uk --expected-release=grammar-qg-p20-2026-05-05 --out=docs\plans\james\hotfixes\1. grammar-05080102-validation-audit-and-ui-hotfix-package-redownload\validation\production-grammar-smoke-2026-05-08.json
node docs\plans\james\hotfixes\1. grammar-05080102-validation-audit-and-ui-hotfix-package-redownload\validation\assert-production-ui-hotfix-bundle.mjs
```

## Independent review status

- Code reviewer: GREEN.
- Contract auditor: pending final rerun after this completion report and production evidence are committed.
