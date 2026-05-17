# Taxonomy Backbone Local Verification - 2026-05-17

## Scope

This evidence records the local implementation of the Spelling secure-vocabulary taxonomy backbone.

The backbone separates spelling coverage into:

- `statutory-core`
- `secure-extension`
- `enrichment-extra`

It does not import, publish, or deploy the 1217 secure-extension candidate records from the approved source artifact.

## Implementation

The implementation adds a shared taxonomy helper in `src/subjects/spelling/content/taxonomy.js` and wires the tier through content normalisation, generated data, service contracts, read models, Worker read models, analytics pools, Word Bank filters, Pattern Quest eligibility, Guardian eligibility, post-mastery debug counts, admin summaries, and spelling tests.

Approved-source tier aliases are accepted at the runtime boundary:

- `current_statutory_core` -> `statutory-core`
- `secure_extension_candidate` -> `secure-extension`
- `current_extra` -> `enrichment-extra`

## Current Published Runtime Counts

`npm run content:validate` on the local worktree reported:

- Runtime words: `246`
- Runtime sentences: `2213`
- Statutory-core words: `213`
- Secure-extension words: `0`
- Enrichment-extra words: `33`
- Errors: `0`
- Existing pattern warnings: `6`

The zero secure-extension runtime count is intentional for this slice. Source approval remains import/reviewer-pack only, not live secure-extension promotion.

## Validation

Commands run locally:

- `node --test tests\spelling-content.test.js`
  - Result: pass
  - Tests: `16`
  - Failures: `0`
- `npm run content:validate`
  - Result: pass
  - `ok: true`
  - Runtime words: `246`
  - Runtime sentences: `2213`
  - Coverage tier counts: `213` statutory-core, `0` secure-extension, `33` enrichment-extra
  - Errors: `0`
  - Existing pattern warnings: `6`
- `npm run audit:client`
  - Result: pass
  - Main bundle gzip: `210823 / 232000` bytes
- `npm run check`
  - Result: pass, exit `0`
  - Wrangler emitted a sandbox log-file `EPERM` warning, then completed the build, public asset assertion, client bundle audit, and deploy dry-run.
- `npm test`
  - Result: pass
  - Tests: `111615`
  - Passed: `111603`
  - Failed: `0`
  - Skipped: `12`
  - Duration: `124933.1047ms`

## Loop Assessment

The previous B3w loop was caused by an approved adult-reviewed source boundary being absent or not connected to a runtime-safe taxonomy. That loop now has an exit:

- The source artifact is pinned by hash and approved by James for import/reviewer-pack generation.
- The local release gate verifies the reviewer pack and audited source.
- The runtime now has a canonical taxonomy seam for future secure-extension import.
- Secure-extension candidates cannot accidentally inflate statutory-core Mega, Guardian, Pattern Quest, or admin counts.

Remaining work is not the same loop. It is the next production slice: explicit secure-extension import approval, generated learner-facing content, release metadata, CI, deployment, and production evidence.
