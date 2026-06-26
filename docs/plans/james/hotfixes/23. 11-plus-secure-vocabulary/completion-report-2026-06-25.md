# 11 Plus Secure Vocabulary Completion Report

Status on 2026-06-26: implementation, local verification, independent code review, code commit, and GitHub push are complete. Production deployment and live `ks2.eugnel.uk` verification remain blocked by missing Cloudflare non-interactive authentication in this Codex environment.

## Scope

- Added James's supplied 11+ vocabulary source ledger for 300 words and meanings.
- Imported the vocabulary into English Spelling Secure vocabulary without moving existing Extra vocabulary.
- Preserved statutory-core placement for the 20 existing statutory words while also counting them as Secure vocabulary membership.
- Fixed the related Word Bank remote-read path so Secure vocabulary, status, and search filters are sent to the Worker read model instead of relying on a stale local slice.
- Added stale-response and load-more guards so older Word Bank filter responses cannot overwrite the latest view.
- Kept the earlier content-operation snapshot storage fix that prevents large spelling release snapshots from exceeding the D1 inline row budget.

## Source Ledger

- Source text: `/Users/nelsonto/.codex/attachments/0c412cd5-cd3f-419a-baae-02eae8b8fe57/pasted-text.txt`
- Source text SHA-256: `a5e0e6117ee764c859504429707875f5b132697c84f47d56604cc22320952b75`
- Source words SHA-256: `a40f3e29cd899e2503e0ccd700dcd278c5272d7dc33b3f54c494a19b2ec7897d`
- Source JSON: `content/spelling-11-plus-secure-vocabulary-2026-06-25.json`
- Import manifest: `docs/plans/james/hotfixes/23. 11-plus-secure-vocabulary/validation/11-plus-secure-vocabulary-import-manifest.json`

The importer verifies the exact supplied date, attachment path, source text hash, parsed word ledger hash, source approval status, per-word approval status, safety status, UK spelling decision, accepted spelling, year band, family root, and morphology tags before import.

## Import Outcome

- Source words: 300
- New secure-extension words: 224
- New secure-extension sentence entries: 224
- New secure-extension lists: 15
- Existing words aligned: 76
- Existing secure-extension alignments: 56
- Existing statutory-core alignments: 20
- Enrichment-extra collisions: 0
- Published spelling release: `spelling-r9`
- Published version: 9
- Runtime words: 1704
- Runtime secure-extension coverage tier words: 1439
- Runtime Secure vocabulary membership: 1459
- Runtime 11+ source words counted as Secure vocabulary: 300
- Runtime statutory-core words: 213
- Runtime enrichment-extra words: 52

## Secure Vocabulary And Word Bank Outcome

- `isSecureVocabularyWord` now treats secure-extension words and James's 11+ source/tag/provenance words as Secure vocabulary members.
- The 20 statutory overlaps, including `mischievous`, remain `statutory-core` for KS2 parity and also return `secureVocabulary: true`.
- The legacy spelling engine Secure vocabulary pool now selects by Secure vocabulary membership, so setup rounds can draw all 300 supplied words.
- The Worker Word Bank read model now filters `year=secure-extension` by Secure vocabulary membership and exposes `secureVocabulary` on public rows.
- Word Bank category counts and labels use Secure vocabulary membership, so the Secure vocabulary section includes the 11+ statutory overlaps with their meanings.

## 503 Prevention

Two related failure paths are covered:

- The earlier content-operation snapshot codec writes Brotli-base64 snapshots when available and still reads legacy gzip-base64 snapshots. This keeps large spelling release snapshots below the D1 inline row threshold.
- The current Word Bank remote path now sends `year`, `status`, and `q` filters to `/api/subjects/spelling/word-bank`; ignores stale responses after filter changes; and disables load-more while a filter refresh is loading. This prevents old or wrong-filter Word Bank responses from reappearing after a transient subject command/read-model failure.

## Verification Evidence

- Targeted affected suites: `node --test tests/smoke.test.js tests/spelling-progression.test.js tests/spelling-content-api.test.js tests/spelling-content.test.js tests/spelling-remote-actions.test.js` passed, 107 pass, 0 fail.
- `npm run check` passed through the package script and `scripts/wrangler-oauth.mjs deploy --dry-run`; client bundle audit passed.
- Full `npm test` passed with `NODE_OPTIONS=--max-old-space-size=8192`.
- Pre-push `npm test` passed on 2026-06-26: 111951 tests, 111943 pass, 0 fail, 8 skipped.
- `git diff --check` and `git diff --cached --check` passed before the code commit.

## Reviewer Loop

- Code reviewer subagent `Descartes`: GREEN. It verified all 300 supplied 11+ words are covered as Secure vocabulary with meanings, the 20 statutory overlaps remain statutory-core while counting as Secure vocabulary, and the Word Bank remote race guards are covered.
- Contract auditor subagent `Volta`: initial BLOCKED on process evidence only: current fixes were not committed or pushed, this report was stale, and production deploy/live verification was not complete.
- Remediation: code commit `89b94679` was created and pushed to GitHub; this report was updated with the current evidence; deployment was re-attempted through the package script and remains blocked only by missing Cloudflare authentication.

## Deployment Evidence

- Deployment command attempted: `npm run deploy` through the package-script path.
- Build, Worker bundle, public asset assertion, and client bundle audit completed successfully during deploy.
- Cloudflare publish failed before production release because Wrangler reported that a non-interactive environment requires `CLOUDFLARE_API_TOKEN`.
- Environment check after failure found no `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, or `CLOUDFLARE_ACCOUNT_ID`.
- No raw Wrangler deploy, remote D1 command, or token-dependent workaround was used.
- Live `https://ks2.eugnel.uk` verification could not be completed because the new Worker build was not published.

Required unblock: log in Cloudflare Wrangler OAuth interactively on this machine, or run the existing package scripts in an authorised CI environment with the required Cloudflare credentials, then rerun `npm run deploy` and verify the logged-in production Word Bank.

## Git Evidence

- Branch: `codex/11-plus-secure-vocabulary`
- Source import commit: `c4e8d282 Add James's 11 plus secure vocabulary`
- Earlier report commit: `63678f2f docs: update 11 plus vocabulary completion report`
- Word Bank and Secure vocabulary membership fix commit: `89b94679 fix: include 11 plus words in secure vocabulary word bank`
- Push: `origin/codex/11-plus-secure-vocabulary` contains `89b94679`
