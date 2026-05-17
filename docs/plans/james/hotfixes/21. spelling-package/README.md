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

The patch is not the full thousands-word expansion. It is a safe preparatory hardening patch for large spelling content releases.
