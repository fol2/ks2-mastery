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

The patch and taxonomy backbone are not the full thousands-word expansion. They are safe preparatory work for large spelling content releases.
