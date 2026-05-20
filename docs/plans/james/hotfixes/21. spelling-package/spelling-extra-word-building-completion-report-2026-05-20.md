# Spelling Extra Word-Building Completion Report - 2026-05-20

## Decision

`DONE - LIVE VERIFIED`

The requested word-building and suffix words have been added to the Spelling `Extra` pool and verified on production at `https://ks2.eugnel.uk`.

## Scope Completed

Added the following 19 words to the `Extra` pool:

`roughest`, `leadership`, `quietest`, `sponsorship`, `partnership`, `lightest`, `brightest`, `membership`, `ownership`, `hardship`, `championship`, `admission`, `aggression`, `compassion`, `confession`, `mission`, `permission`, `progression`, `procession`.

`admission` and `confession` previously existed in the secure-extension source path. They are now deliberately reclassified into `Extra` with secure provenance retained, and the import collision guard still blocks non-reclassified secure-source collisions.

## Implementation Summary

- Added list `extra-suffix-word-building-2026-05-20` to `content/spelling.seed.json`.
- Regenerated spelling content data so the published runtime is `spelling-r7`, version `7`.
- Updated spelling content tests to assert every requested word is `spellingPool: extra` and `coverageTier: enrichment-extra`.
- Preserved statutory-core and secure-extension semantics.
- Fixed the related Worker deploy-size blocker by keeping the generated Spelling seed compressed in the Worker bundle.
- Added Worker bundle audit coverage so the deploy bundle cannot re-import the public Spelling content data modules.
- Fixed the runtime-content cache path so large `account_subject_content.content_json` rows are only fetched after a metadata cache miss.

## Verification

- `npm test -- tests/worker-subject-runtime.test.js tests/bundle-audit.test.js`
  - `77` passed, `0` failed.
- `npm run check`
  - Passed.
  - Worker gzip upload size: `2510.29 KiB` during dry run.
- `npm test`
  - `111627` passed, `0` failed, `12` skipped.
- `npm run content:validate`
  - `ok: true`
  - Runtime word count: `1480`
  - Statutory core: `213`
  - Secure extension: `1215`
  - Enrichment Extra: `52`
  - Published release: `spelling-r7`, version `7`
- Pre-push hook reran `npm test`
  - `111627` passed, `0` failed, `12` skipped.

The six content-validation warnings are the existing below-threshold pattern warnings and are not new errors from this task.

## Review Closure

Final independent reviews used the rule that advisories are blockers:

- Code Reviewer: `PASS`
- Contract Auditor: `PASS - Concrete blockers: none`

## Deployment

- Content commit: `a65874d651205752505e796b0200f6ed789d3dae`
- Worker deploy-size hardening commit: `b7eab6e9c136dbd3fd6b88adffa507cd958e38b6`
- Deploy command: `npm run deploy`
- Cloudflare Worker version: `d8876a07-dfb9-424b-951f-98912e5e4a51`
- Production `/api/version` after deployment:
  - `buildHash: b7eab6e`
  - `source: git.rev-parse`
- Production bundle audit:
  - Passed for `https://ks2.eugnel.uk/`
  - `1` HTML-referenced bundle, `6` chunks scanned transitively
  - Security headers: `5/5`
  - Cache-split checks: `15/15`

The deploy used the repository package script and the OAuth-safe Wrangler wrapper, not raw `wrangler`.

## Live Evidence

- `validation/spelling-extra-word-building-production-evidence-2026-05-20.json`
  - Origin: `https://ks2.eugnel.uk`
  - Live build hash: `b7eab6e`
  - Flow: `/api/version`, `/api/demo/session`, `/api/bootstrap`, `/api/subjects/spelling/word-bank?year=extra`
  - Requested words matched: `19/19`
  - Extra total: `52`
  - Extra filtered rows: `52`
  - Every requested row is `spellingPool: extra`, `coverageTier: enrichment-extra`, `year: extra`

- `validation/spelling-extra-word-bank-production-browser-smoke-2026-05-20.json`
  - Origin: `https://ks2.eugnel.uk`
  - Live build hash: `b7eab6e`
  - Browser: headless Chromium, desktop viewport `1366x900`
  - Flow: `/demo`, open Spelling, select Extra pool, open Word Bank
  - Word Bank visible: `true`
  - Console errors: `0`
  - Page errors: `0`
  - Screenshot: `validation/spelling-extra-word-bank-production-browser-smoke-2026-05-20.png`

## Sync Status

At deployment proof time, local `main`, `origin/main`, and production `/api/version` agreed on the deployed code commit `b7eab6e9c136dbd3fd6b88adffa507cd958e38b6`.
