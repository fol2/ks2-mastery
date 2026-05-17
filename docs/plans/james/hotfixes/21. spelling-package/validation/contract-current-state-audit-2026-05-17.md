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
- Approval decision: `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`
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
| Read approval decision | ZIP `approval/owner-approval-record.json` decision is `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`; reviewer is James; source hash matches. | Met |
| Import according to approval decision | `validation/secure-vocabulary-approved-source/import-plan.json` is check-mode only, `writes: false`, status `approved_for_import_reviewer_pack_only_not_applied`. | Met for the allowed decision; no live import allowed |
| Keep statutory/current-extra/candidate records distinct | Taxonomy backbone and import plan keep `current_statutory_core`, `current_extra`, and `secure_extension_candidate` separate. Runtime still reports `213` statutory-core, `0` secure-extension, `33` enrichment-extra. | Met locally |
| Generate reviewer-pack proof | `validation/secure-vocabulary-approved-source/review-pack.json` and `.md` exist; B3w metadata verifier reports `ok: true`, `issueCount: 0`, `checkedReviewPackWords: 1463`. | Met |
| Prevent reviewer-pack approval from being mistaken for live release approval | `scripts/verify-spelling-secure-vocabulary-release.mjs --release-ready` and `tests/secure-vocabulary-release-gates.test.js` add an explicit release-readiness gate. | Met |
| Task D release-quality fields for every secure-extension word | `release-gap-summary.md` reports all `1217` secure-extension candidates are missing accepted spellings, explanations, example sentences, UK spelling decision, pattern/morphology tags, family/root, and audio/TTS status on both audited source and review pack. | Not met |
| Next-source input template for Task D blockers | `validation/secure-vocabulary-approved-source/release-input-template/` contains a non-importing 1217-row CSV template and manifest for filling release-quality fields and `APPROVED_FOR_SECURE_EXTENSION_IMPORT` decisions. | Prepared for next source input |
| Adult approval for live secure-extension promotion | Approval decision is `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`, not `APPROVED_FOR_SECURE_EXTENSION_IMPORT`. | Not met |
| Runtime import of secure-extension words | Current runtime still has `0` secure-extension words; import plan is check-mode only. | Not met |
| Content release manifest and migration semantics | No secure-extension content release, release manifest, audio manifest, or production migration evidence exists. | Not met |
| Scale/performance proof for expanded word count | `npm run check` and bundle audit pass for the current 246-word runtime, not a 1217-candidate secure-extension runtime. | Not met |
| Reviewer loop exact PASS lines | Follow-up Code Reviewer and Contract Auditor both confirmed the B3w source-list loop is closed for the narrow slice, but both refused the exact PASS line because the full contract still has blockers. | Not met |
| Production hard-refresh proof | No deployment or hard-refresh production proof exists for this branch/commit on `https://ks2.eugnel.uk`. | Not met |

## Release-readiness gate result

Current report: `validation/secure-vocabulary-approved-source/release-readiness-report.json`

- `ok`: `false`
- `issueCount`: `18256`
- `issuesStored`: `200`
- `issuesTruncated`: `true`
- `metadataIssueCount`: `0`
- `checkedReviewPackWords`: `1463`
- `checkedAuditedSourceWords`: `1463`
- `checkedSecureExtensionWords`: `1217`

The first stored issue is `secure_vocabulary_release_promotion_not_approved`: secure-extension promotion requires `APPROVED_FOR_SECURE_EXTENSION_IMPORT` on both audited source and review pack. The next issues show the same secure-extension words are not release-ready because they are not adult-approved for secure import and lack release-quality fields.

## Release gap summary

Current summary: `validation/secure-vocabulary-approved-source/release-gap-summary.md`

- Status: `RELEASE BLOCKED`
- Secure-extension words: `1217`
- Missing review-pack entries: `0`
- Adult-approved for secure import: `0`
- Not adult-approved for secure import: `1217`
- Advisory words: `12`
- Missing release fields on audited source: `1217` each for accepted spellings, explanations, example sentences, UK spelling decision, pattern/morphology tags, family/root, and audio/TTS status.
- Missing release fields on review pack: `1217` each for the same fields.

This proves the remaining blocker is not source-list discovery or reviewer-pack reconciliation. The finite blocker is release approval plus release-quality content for the candidate words.

## Release input template

Current template folder: `validation/secure-vocabulary-approved-source/release-input-template/`

- CSV rows: `1217`
- Advisory rows: `12`
- Source JSONL SHA-256: `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`
- Required approval decision: `APPROVED_FOR_SECURE_EXTENSION_IMPORT`
- Safety: the template is non-importing, does not grant approval, and writes no live content.

The template gives the next source owner a finite row-and-field target for closing the release blocker. It does not alter the current release status.

## Current completion decision

The B3w source-list loop is closed. The source list exists, the exact hash is pinned, James's approval is recorded for import/reviewer-pack generation, the reviewer pack reconciles with the audited source, and a release-readiness gate now blocks unsafe live promotion.

The full secure-vocabulary expansion contract is not complete. The current finite blocker is no longer "missing source list"; it is that the supplied source is approved only for import/reviewer-pack generation and lacks the release-quality content required for live secure-extension promotion.

## Reviewer loop result

The latest reviewer loop did not return the contract PASS line:

- Code Reviewer: not PASS. Findings were that the full contract is not complete and that this current-state evidence must avoid stale branch-head claims.
- Contract Auditor: not PASS. Findings were that the full contract is not complete, the ZIP approval forbids live promotion under the current decision, runtime secure-extension count is still zero, release/performance/audio/migration evidence is absent, reviewer PASS lines are absent, production proof is absent, and current-state evidence must avoid stale branch-head claims.

The stale branch-head evidence issue is addressed above by recording the audited implementation commit and current-state evidence commit separately, and by requiring a fresh `git rev-parse` check when this evidence is consumed. The remaining reviewer findings are full-contract blockers and cannot be closed without a release-approved source artefact and live production evidence.

## Required next approval or source input

To continue toward a live secure-extension import, the project needs a replacement or revised source artefact with:

- approval decision `APPROVED_FOR_SECURE_EXTENSION_IMPORT`;
- adult-approved per-word secure import status;
- accepted spellings and rejected variants where applicable;
- UK spelling decisions;
- explanations;
- KS2-suitable example sentences;
- pattern or morphology tags;
- family/root relations;
- safety or exclusion notes;
- audio/TTS status for dictation-required words.

Without that input, the correct finite status for the current branch is:

`IMPLEMENTED + LOCAL VERIFIED - PRODUCTION NOT PROVEN`

This status applies to the B3w source/taxonomy/release-readiness slice only, not to the full live secure-vocabulary expansion.
