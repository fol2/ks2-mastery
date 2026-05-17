# Source Ledger

| Evidence layer | Item | Status | Notes |
|---|---|---:|---|
| ZIP | `ks2-mastery-lean-05161145.zip` | inspected | Primary supplied snapshot. SHA-256 `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`. |
| ZIP manifest | `LEAN_ZIP_MANIFEST.txt` | inspected | Lean review profile; copied 1544 files; omitted 3594 outside-profile files; assets/reports/output omitted. |
| ZIP local run | `npm run content:validate` | passed | Proves only local ZIP/patch snapshot. Runtime words 246, sentences 2213, warnings 6. |
| ZIP local run | patch dry-run/apply | passed | Proves patch applies to fresh ZIP extraction. |
| ZIP local run | Worker endpoint probe | not runnable here | Node 18 lacks `node:sqlite`; must run under Node 22. |
| Secure vocabulary source artifact | `secure-vocabulary-source-v1-input-artifact.zip` | approved for import/reviewer-pack generation | ZIP SHA-256 `cdf18f85c37f94274608193fe31dc0dd93b23e153b4e492ffd25fb9b924d889e`; source JSONL SHA-256 `ae39bfc5091525d602f158c18d254b57c498683f9ae81da4d2733f225862a42c`; approval decision `APPROVED_FOR_IMPORT_REVIEWER_PACK_ONLY`; reviewer `James`; timestamp `2026-05-17T12:15:41+01:00`. |
| Secure vocabulary audit | `validation/secure-vocabulary-approved-source/audit-report.json` | passed | Source approval hash matches exact JSONL hash; 1463 records; 1463 unique words; taxonomy counts: statutory-core 213, secure-extension 1217, enrichment-extra 33; zero audit issues. |
| Secure vocabulary import proof | `validation/secure-vocabulary-approved-source/import-plan.json` | check-mode only | Writes `false`; status `approved_for_import_reviewer_pack_only_not_applied`; proves the approved source can be mapped without mutating spelling content or production data. |
| Secure vocabulary reviewer pack | `validation/secure-vocabulary-approved-source/review-pack.json` | generated and verified | 1463 reviewer-pack words; `verification-report.json` reports `ok: true`, `issueCount: 0`, `checkedReviewPackWords: 1463`, `checkedAuditedSourceWords: 1463`. |
| Secure vocabulary release gate | `validation/secure-vocabulary-approved-source/release-gate-report.json` | passed | Direct `verify-spelling-secure-vocabulary-release.mjs` CLI run reports `ok: true`, `issueCount: 0`, and 1463 checked words on both sides. |
| Secure vocabulary release-readiness gate | `validation/secure-vocabulary-approved-source/release-readiness-report.json` | blocked as expected | `--release-ready` reports `ok: false`, `issueCount: 18256`, `metadataIssueCount: 0`, and `checkedSecureExtensionWords: 1217`; live promotion is blocked because the approval is reviewer-pack only and release-quality fields are missing from the audited source and review pack. |
| Approved-source targeted tests | `validation/secure-vocabulary-approved-source/targeted-tests.log` | passed | Original B3w log captured 5 tests. The release-readiness addendum reran `node --test tests/spelling-secure-vocabulary-source.test.js tests/secure-vocabulary-release-gates.test.js` after adding release-readiness coverage: 10 tests passed. |
| GitHub main | `fol2/ks2-mastery`, `worker/src/repository.js` | fetched | Blob SHA `a20215b8519c99fca4c05922ba1bc0c47c17108f`, matching ZIP local blob SHA. |
| Production | `https://ks2.eugnel.uk` | shell reachable only | Does not prove patch/expansion/live spelling journey. |
