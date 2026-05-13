# Punctuation 05131039 completion report

## Scope

Contract source: `docs/plans/james/hotfixes/12. punctuation-05131039-validation-audit-hotfix-package/contract/punctuation-05131039-proper-noun-capitalisation-quality-gate-contract.md`

Worktree: `D:\Coding\ks2-mastery\.worktrees\punctuation-05131039-validation-audit-hotfix`

Implemented fix:

- P20 sentence-ending generated model and accepted answers now capitalise proper names while preserving lowercase learner stems for capital-letter repair tasks.
- P20 fronted-adverbial generated clauses now use capitalised proper names after the comma.
- The new proper-noun audit covers systematic actors plus fixed pupil, place, country, city, and weekday tokens.
- `properNounCapitalisationQuality` and `properNounCapitalisationFindings` are part of the P20 expansion audit and validator.
- The release ID is `punctuation-qg-p23-15072-2026-05-13`.

## Scope rationale

The shared `shared/punctuation/proper-noun-tokens.js` registry is included as a fixing requirement, not a broad improvement. The contract requires model and accepted answers to capitalise proper names and the audit rule explicitly covers "other fixed proper names"; an actor-only pattern would leave fixed content names and places such as `York`, `England`, `Paris`, `France`, and weekday names outside the quality gate. That would allow the same defect class to recur outside the two generated actor families. The registry keeps the fix bounded to the existing Punctuation content vocabulary and feeds only the audit/test boundary.

## Verification

Local gates:

```text
node --test tests/punctuation-proper-noun-capitalisation-quality.test.js
PASS 6/6

npm run verify:punctuation-qg:p20-expansion
PASS 24/24

targeted runtime/UI/scheduler/marking suite
PASS 71/71

npm test
PASS 111507/111519, 0 failed, 12 skipped

npm run check
PASS
```

Patch package gates:

```text
git apply --check: PASS
git apply --cached --check: PASS
git apply: PASS
fresh patch proper-noun test: PASS 6/6
fresh patch P20 expansion: PASS 24/24
```

Production gates:

```text
npm run deploy
PASS

production-smoked package commit verified on production
96ed1daacb400bef3ce15f3ca787b22b79a4d16c

Post-smoke package-only commits update evidence text and checksums only; they do not change Punctuation runtime code.

production smoke
PASS: https://ks2.eugnel.uk, production, punctuation-qg-p23-15072-2026-05-13, 15072 runtime items

npm run verify:punctuation-qg:p20-live
PASS 4/4

npm run verify:punctuation-qg:p20
PASS 24/24 expansion + 4/4 live
```

## Evidence files

- `reports/punctuation/punctuation-qg-p20-production-smoke.json`
- `reports/punctuation/punctuation-qg-p20-expansion-audit.json`
- `reports/punctuation/punctuation-qg-p20-heavy-play-simulation.json`
- `reports/punctuation/punctuation-qg-p20-review-register.json`
- `reports/punctuation/punctuation-qg-p20-negative-vector-register.json`
- `docs/plans/james/hotfixes/12. punctuation-05131039-validation-audit-hotfix-package/validation/patched-production-smoke.json`
- `docs/plans/james/hotfixes/12. punctuation-05131039-validation-audit-hotfix-package/validation/patched-full-p20-live-boundary.log`
- `docs/plans/james/hotfixes/12. punctuation-05131039-validation-audit-hotfix-package/validation/patched-p20-live.log`
- `docs/plans/james/hotfixes/12. punctuation-05131039-validation-audit-hotfix-package/validation/fresh-patch-p20-expansion.log`
- `docs/plans/james/hotfixes/12. punctuation-05131039-validation-audit-hotfix-package/validation/patched-negative-vector-register.json`

## Reviewer closure

Independent reviewer closure is complete:

- Code reviewer final re-check: GREEN, no blockers or advisories.
- Contract auditor final re-check: GREEN, no blockers or advisories after the final closure text update.

Prior blocked review rounds were resolved by regenerating the patch artefact from the actual landed fix, refreshing fresh patch apply/test evidence, documenting the fixing-only proper-noun registry scope, separating production-smoked runtime evidence from package-only evidence commits, updating the final `npm test` count, and confirming `HEAD == origin/main`.
