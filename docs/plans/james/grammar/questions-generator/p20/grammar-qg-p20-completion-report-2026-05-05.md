# Grammar QG P20 Completion Report

Date: 2026-05-05
Release: `grammar-qg-p20-2026-05-05`
Production URL: `https://ks2.eugnel.uk`

## Summary

Grammar QG P20 has been implemented, verified, deployed to the production Cloudflare Worker, and smoke-tested against the live production URL. The release keeps the active runtime denominator at 510 templates and adds the P20 answer-spec hardening, prompt-quality recovery, fairness evidence, and smart-practice validation required by the P20 package.

## Deployment

- Source commit deployed: `d760fcaa38c257bb674cf3443a5d370e825bf595`
- Cloudflare Worker version: `68d84138-4eb5-4b7f-8983-8a54176f7170`
- Deployment command: `npm run deploy`
- Production bundle audit: passed after deployment
- Production smoke evidence: `reports/grammar/grammar-production-smoke-grammar-qg-p20-2026-05-05.json`

## Production Smoke Evidence

The production smoke test passed against `https://ks2.eugnel.uk` with:

- `ok: true`
- `releaseId: grammar-qg-p20-2026-05-05`
- `contentReleaseId: grammar-qg-p20-2026-05-05`
- `environment: production`
- `learnerFixtureType: demo-session`
- `normalRoundResult`, `miniTestResult`, `repairResult`, `cueAssertionResult`, `forbiddenKeyScanResult`, and `releaseIdAssertion` all passed
- Covered answer-spec families: `exact`, `multiField`, `punctuationPattern`, `manualReviewOnly`
- Smoke timestamp: `2026-05-05T17:16:58.955Z`

## Verification Evidence

- `npm test`: passed, 109080 passing, 0 failing, 12 skipped
- `npm run check`: passed, including Wrangler dry-run and client audit
- `npm run verify:grammar-qg-production-release`: passed
- P20 verifier: passed, including answer-spec tests and quality-hardening tests
- Open-response fairness audit: passed with 0 findings
- P20 quality-hardening audit: passed
- Full smart-practice audit: passed, 330 sessions, 0 failures, 0 advisories

## P20 Evidence Artefacts

- `reports/grammar/grammar-qg-p20-certification-manifest.json`
- `reports/grammar/grammar-qg-p20-content-quality.json`
- `reports/grammar/grammar-qg-p20-open-response-fairness.json`
- `reports/grammar/grammar-qg-p20-quality-hardening.json`
- `reports/grammar/grammar-qg-p20-smart-practice-full.json`
- `reports/grammar/grammar-qg-p20-smart-practice-full.md`
- `reports/grammar/grammar-production-smoke-grammar-qg-p20-2026-05-05.json`

## Prompt-To-Artifact Checklist

- Implement all tasks in the P20 all-phases package: covered by the P20 release content, answer-spec hardening, quality recovery, fairness audit, smart-practice audit, and generated certification artefacts.
- Deploy live production: completed via `npm run deploy`; Cloudflare Worker version `68d84138-4eb5-4b7f-8983-8a54176f7170`.
- Produce smoke evidence: completed in `reports/grammar/grammar-production-smoke-grammar-qg-p20-2026-05-05.json`.
- Keep release gate intact: `verify:grammar-qg-production-release` chains the historical release gates, manual expansion freshness, certification evidence validation, P20 verifier, and full smart-practice audit.
- Preserve English spelling parity: grammar selection parity passed with the refreshed intentional P20 snapshot.
- Document completion: this report records the shipped release, live deployment, verification, and production evidence.

## Independent Review Status

- Independent contract audit: GREEN. The auditor confirmed the P20 contract is satisfied, including deployment/live smoke, release chain, and smart-practice seed evidence.
- Independent code review: GREEN. The reviewer confirmed the final smart-practice evidence label blocker was fixed and found no remaining blocking issues.
