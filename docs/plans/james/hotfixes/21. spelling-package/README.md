# Spelling Secure Vocabulary Expansion Handoff Package

This package is for a local Codex agent working on the KS2 Mastery webapp.

It contains:

- `secure-vocabulary-source-v1-input-artifact.zip` - the pinned secure-vocabulary source list, approved by James for import/reviewer-pack generation only.
- `contract/spelling-secure-vocabulary-expansion-contract.md` — the execution contract.
- `patches/001-spelling-expansion-cache-and-admin-signal.patch` — narrow patch for two adjacent spelling expansion risks.
- `validation-summary.md` — source-boundary summary, findings, validation results, blockers, and advisories.
- `limitations.md` — what was not proven.
- `evidence/` — source ledger and extracted orientation evidence.
- `validation/` — patch dry-run/apply logs, content validation output, static grep, and Node runtime limitation log.
- `validation/secure-vocabulary-approved-source/` - approved-source audit, check-mode import plan, reviewer pack, audited source, and B3w verification evidence.
- `validation/task-b-local-patch-equivalence-2026-05-17.md` - local Node 22 evidence that the cache-key and admin signal patch-equivalent fixes are implemented and verified in the worktree.
- `validation/taxonomy-backbone-local-verification-2026-05-17.md` - local verification for the statutory-core / secure-extension / enrichment-extra taxonomy backbone.
- `validation/secure-vocabulary-release-readiness-gate-2026-05-17.md` - explicit evidence that the current approved source passes B3w metadata reconciliation but is blocked from live secure-extension promotion.
- `validation/secure-vocabulary-approved-source/release-gap-summary.md` - grouped blocker counts for the current source artefact's secure-extension release gaps.
- `validation/secure-vocabulary-approved-source/release-input-template/` - non-importing CSV template for filling the secure-extension release-quality fields needed by a future approved source artefact.
- `validation/contract-current-state-audit-2026-05-17.md` - current HEAD audit showing the B3w source-list loop is closed while live secure-extension promotion remains blocked.
- `validation/current-head-completion-audit-2026-05-17.md` - latest moving-branch completion audit, mapping the active goal and contract gates to concrete evidence, the reviewer-found Word Bank Guardian-chip fix, and remaining blockers.
- `validation/reviewer-loop-current-head-2026-05-17.md` - latest independent Code Reviewer and Contract Auditor rerun for `9cc389568c2fc10b9d1d52d12d247bca1e4a7580`; both returned `NOT PASS` for full-contract blockers, while confirming the stale-evidence and Guardian-chip findings are closed.

The patch, taxonomy backbone, and release-readiness gate are not the full thousands-word expansion. They are safe preparatory work for large spelling content releases.
