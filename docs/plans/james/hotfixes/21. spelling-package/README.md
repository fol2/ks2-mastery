# Spelling Secure Vocabulary Expansion Handoff Package

This package is for a local Codex agent working on the KS2 Mastery webapp.

It contains:

- `secure-vocabulary-source-v1-input-artifact.zip` - the pinned secure-vocabulary source list; the original ZIP approval was import/reviewer-pack only, and the later owner approval is now ingested by the local approval pipeline record.
- `contract/spelling-secure-vocabulary-expansion-contract.md` — the execution contract.
- `patches/001-spelling-expansion-cache-and-admin-signal.patch` — narrow patch for two adjacent spelling expansion risks.
- `validation-summary.md` — source-boundary summary, findings, validation results, blockers, and advisories.
- `limitations.md` — what was not proven.
- `evidence/` — source ledger and extracted orientation evidence.
- `validation/` — patch dry-run/apply logs, content validation output, static grep, and Node runtime limitation log.
- `validation/secure-vocabulary-approved-source/` - approved-source audit, check-mode import plan, reviewer pack, audited source, and B3w verification evidence.
- `validation/task-b-local-patch-equivalence-2026-05-17.md` - local Node 22 evidence that the cache-key and admin signal patch-equivalent fixes are implemented and verified in the worktree.
- `validation/taxonomy-backbone-local-verification-2026-05-17.md` - local verification for the statutory-core / secure-extension / enrichment-extra taxonomy backbone.
- `validation/secure-vocabulary-release-readiness-gate-2026-05-17.md` - explicit evidence that the current approved source passes B3w metadata reconciliation and the source release-readiness gate.
- `validation/secure-vocabulary-approved-source/release-gap-summary.md` - grouped counts for the current source artefact's secure-extension release readiness; current missing release-quality field counts are zero.
- `validation/secure-vocabulary-approved-source/release-input-template/` - non-importing CSV template retained for future secure-extension source refreshes.
- `evidence/secure-extension-import-approval-record-2026-05-17.md` / `.json` and `evidence/secure-extension-import-approval-pipeline-record-2026-05-17.json` - James's post-review owner approval for secure-extension import and generated release-quality fallback fields for all 1217 pinned candidate rows, now ingested into the audited source/review pack.
- `validation/contract-current-state-audit-2026-05-17.md` - current HEAD audit showing the B3w source-list loop is closed while live secure-extension promotion remains blocked.
- `validation/current-head-completion-audit-2026-05-17.md` - latest moving-branch completion audit, mapping the active goal and contract gates to concrete evidence, the reviewer-found Word Bank Guardian-chip fix, and remaining blockers.
- `validation/reviewer-loop-current-head-2026-05-17.md` - latest independent Code Reviewer and Contract Auditor rerun for `9cc389568c2fc10b9d1d52d12d247bca1e4a7580`; both returned `NOT PASS` for full-contract blockers, while confirming the stale-evidence and Guardian-chip findings are closed.

The patch, taxonomy backbone, and release-readiness gate are not the full thousands-word expansion. They are safe preparatory work for large spelling content releases.
