# Contract Current-State Audit - 2026-05-17

## Objective

Execute `docs/plans/james/hotfixes/21. spelling-package/contract/spelling-secure-vocabulary-expansion-contract.md` from an isolated worktree, using the finite secure-vocabulary source artefact in this folder where applicable. Do not claim live completion unless the change is deployed to `https://ks2.eugnel.uk`, hard-refresh verified, and both required independent review passes return the exact contract PASS line.

## Repository state and commit scope

- Worktree: `D:\Coding\ks2-mastery\.worktrees\spelling-package-b3w-completion`
- Branch: `codex/spelling-package-b3w-completion`
- Baseline: `10b0f4b2e112f2cb354b5dac11997b9cdf2ecc26` (`origin/main`)
- Audited implementation head: `b008b723588dd3a81d225ce0034f617dc03e0946` (`Add secure vocabulary release readiness gate`)
- First current-state audit evidence commit: `2d416bdc11552ea147551c7435475ee5a647ee0e` (`Record spelling contract current-state audit`)
- `origin/main`: `10b0f4b2e112f2cb354b5dac11997b9cdf2ecc26`
- Rebase status: `git rebase origin/main` reported the branch is up to date.
- Worktree status at this audit: clean.
- Note: the moving branch head must be verified with `git rev-parse HEAD origin/codex/spelling-package-b3w-completion origin/main` when this evidence is consumed. This file records the audited implementation commit and the first evidence commit instead of treating the branch head as immutable.

## Source artefact boundary

- Source artefact: `docs/plans/james/hotfixes/21. spelling-package/secure-vocabulary-source-v1-input-artifact.zip`
- Source artefact SHA-256: `cdf18f85c37f94274608193fe31dc0dd93b23e153b4e492ffd25fb9b924d889e`
- ZIP source list: `source/secure-vocabulary-source-v1.jsonl`
- ZIP source list SHA-256: `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`
- Records: `1463`
- Unique words: `1463`
- Current statutory-core records: `213`
- Current extra records: `33`
- Secure-extension candidate records: `1217`
- Original ZIP approval decision: `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`
- Current pipeline approval decision: `APPROVED_FOR_SECURE_EXTENSION_IMPORT`
- Reviewer: `James`
- Review timestamp: `2026-05-17T12:15:41+01:00`

The ZIP's `contract/LOCAL_AGENT_STOP_LOOP_CONTRACT.md` is now in scope. It explicitly stops the old B3w source-list search loop: the source list exists and is approved for import/reviewer-pack generation against the exact JSONL hash. It also explicitly forbids live secure-extension promotion unless the approval decision is `APPROVED_FOR_SECURE_EXTENSION_IMPORT` and release, CI, deployment, and production evidence exist.

## Prompt-to-artifact checklist

| Requirement | Evidence inspected | Current status |
|---|---|---|
| Work in an isolated worktree because other agents are working | Current path is under `.worktrees/spelling-package-b3w-completion`; `docs/contract_goal.md` repeats this requirement. | Met |
| Rebase against current main before continuing | `git fetch origin main`; `git rebase origin/main` returned "Current branch ... is up to date." | Met |
| Source-list discovery must not loop | Repo contains `secure-vocabulary-source-v1-input-artifact.zip`; ZIP stop-loop contract says the exact source list exists and is authoritative for this slice. | Met |
| Verify source artefact identity | Local ZIP SHA-256 is `cdf18f85c37f94274608193fe31dc0dd93b23e153b4e492ffd25fb9b924d889e`; manifest names JSONL SHA `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`. | Met |
| Verify source schema/no duplicate words | `validation/secure-vocabulary-approved-source/audit-report.json` reports `ok: true`; ZIP `validation/source-sanity-check.txt` reports PASS, `duplicate_words=0`, `invalid_word_tokens=0`. | Met for source intake |
| Read approval decision | ZIP `approval/owner-approval-record.json` decision is `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`; James's later secure-import approval is captured in `evidence/secure-extension-import-approval-pipeline-record-2026-05-17.json`. | Met |
| Import according to approval decision | `validation/secure-vocabulary-approved-source/import-plan.json` is check-mode only, `writes: false`, status `approved_for_secure_extension_import_not_applied`. | Met for check-mode planning; no live import performed |
| Keep statutory/current-extra/candidate records distinct | Taxonomy backbone and import plan keep `current_statutory_core`, `current_extra`, and `secure_extension_candidate` separate. Runtime still reports `213` statutory-core, `0` secure-extension, `33` enrichment-extra. | Met locally |
| Generate reviewer-pack proof | `validation/secure-vocabulary-approved-source/review-pack.json` and `.md` exist; B3w metadata verifier reports `ok: true`, `issueCount: 0`, `checkedReviewPackWords: 1463`. | Met |
| Prevent reviewer-pack approval from being mistaken for live release approval | `scripts/verify-spelling-secure-vocabulary-release.mjs --release-ready` and `tests/secure-vocabulary-release-gates.test.js` add an explicit release-readiness gate. | Met |
| Task D release-quality fields for every secure-extension word | `release-gap-summary.md` reports zero missing accepted spellings, explanations, example sentences, UK spelling decision, pattern/morphology tags, family/root, and audio/TTS status on both audited source and review pack. Generated fallback fields are owner-approved, deterministic, and labelled as generated release-quality data. | Met for source/review-pack artefacts |
| Next-source input template for Task D blockers | `validation/secure-vocabulary-approved-source/release-input-template/` remains as a non-importing 1217-row CSV template for future source refreshes. It is no longer the current blocker. | Informational |
| Adult approval for live secure-extension promotion | Audited source and review pack now carry `APPROVED_FOR_SECURE_EXTENSION_IMPORT`; release gap summary shows `1217` adult-approved secure-import rows and `0` not-adult-approved rows. | Met for approval; no runtime import performed |
| Runtime import of secure-extension words | Current runtime still has `0` secure-extension words; import plan is check-mode only. | Not met |
| Content release manifest and migration semantics | No secure-extension content release, release manifest, audio manifest, or production migration evidence exists. | Not met |
| Scale/performance proof for expanded word count | `npm run check` and bundle audit pass for the current 246-word runtime, not a 1217-candidate secure-extension runtime. | Not met |
| Reviewer loop exact PASS lines | Follow-up Code Reviewer and Contract Auditor both confirmed the B3w source-list loop is closed for the narrow slice, but both refused the exact PASS line because the full contract still has blockers. | Not met |
| Production hard-refresh proof | No deployment or hard-refresh production proof exists for this branch/commit on `https://ks2.eugnel.uk`. | Not met |

## Release-readiness gate result

Current report: `validation/secure-vocabulary-approved-source/release-readiness-report.json`

- `ok`: `true`
- `issueCount`: `0`
- `issuesStored`: `0`
- `issuesTruncated`: `false`
- `metadataIssueCount`: `0`
- `checkedReviewPackWords`: `1463`
- `checkedAuditedSourceWords`: `1463`
- `checkedSecureExtensionWords`: `1217`

No issues are stored. Secure-extension promotion approval, adult-approved per-word status, and release-quality field coverage are present on the audited source and review pack.

## Release gap summary

Current summary: `validation/secure-vocabulary-approved-source/release-gap-summary.md`

- Status: `RELEASE READY`
- Secure-extension words: `1217`
- Missing review-pack entries: `0`
- Adult-approved for secure import: `1217`
- Not adult-approved for secure import: `0`
- Advisory words: `12`
- Missing release fields on audited source: `0` for accepted spellings, explanations, example sentences, UK spelling decision, pattern/morphology tags, family/root, and audio/TTS status.
- Missing release fields on review pack: `0` for the same fields.

This proves the remaining blocker is not source-list discovery, reviewer-pack reconciliation, secure-import approval, or release-quality field coverage. The finite blocker has moved to runtime content import, release metadata, CI/deployment, production hard-refresh proof, and exact reviewer PASS lines.

## Release input template

Current template folder: `validation/secure-vocabulary-approved-source/release-input-template/`

- CSV rows: `1217`
- Advisory rows: `12`
- Source JSONL SHA-256: `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`
- Required approval decision: `APPROVED_FOR_SECURE_EXTENSION_IMPORT` is now present in the generated artefacts.
- Safety: the template is non-importing, does not grant approval, and writes no live content.

The template remains useful for future source refreshes. It does not import runtime content.

## Current completion decision

The B3w source-list loop is closed. The source list exists, the exact hash is pinned, James's approval is recorded for import/reviewer-pack generation, the reviewer pack reconciles with the audited source, and a release-readiness gate now blocks unsafe live promotion.

The full secure-vocabulary expansion contract is not complete. The current finite blocker is no longer "missing source list", "missing secure-import approval", or "missing release-quality fields"; it is that the approved candidates have not been imported into runtime content, released, deployed, hard-refresh verified, and independently approved.

## Reviewer loop result

The latest reviewer loop did not return the contract PASS line:

- Code Reviewer: not PASS. Findings were that the full contract is not complete and that this current-state evidence must avoid stale branch-head claims.
- Contract Auditor: not PASS. Historical findings included that the full contract is not complete, the ZIP approval forbade live promotion under the then-current decision, runtime secure-extension count was still zero, release/performance/audio/migration evidence was absent, reviewer PASS lines were absent, production proof was absent, and current-state evidence needed to avoid stale branch-head claims. The approval finding is superseded by the ingested secure-import approval; the other full-contract blockers remain.

The stale branch-head evidence issue is addressed above by recording the audited implementation commit and current-state evidence commit separately, and by requiring a fresh `git rev-parse` check when this evidence is consumed. The remaining reviewer findings are full-contract blockers and cannot be closed without runtime import/release work and live production evidence.

## Required next implementation input

To continue toward a live secure-extension import, the project needs implementation and release evidence for:

- importing the approved 1217 secure-extension rows into runtime content;
- keeping statutory-core, secure-extension, and enrichment-extra semantics separate in all learner/adult flows;
- release metadata, migration semantics, and content count reconciliation;
- bundle, Worker, D1, and TTS performance proof;
- CI, deployment, production hard-refresh evidence, and exact reviewer PASS lines.

Without that input, the correct finite status for the current branch is:

`IMPLEMENTED + LOCAL VERIFIED - PRODUCTION NOT PROVEN`

This status applies to the B3w source/taxonomy/release-readiness slice only, not to the full live secure-vocabulary expansion.
