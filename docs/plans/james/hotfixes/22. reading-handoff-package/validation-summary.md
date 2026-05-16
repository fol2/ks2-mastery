# Reading validation summary

## Verdict

The uploaded Reading snapshot is substantially beyond a tiny PoC, but it is not production-grade yet for the stated priority: question quality and answer acceptance. The bank is large in raw numbers, but the acceptance layer still allowed important false positives and one malformed-answer crash before the patch.

The included patch is intentionally narrow. It does not claim to finish Reading. It fixes two high-confidence acceptance defects and adds regression tests. The local agent must still complete the wider reviewer loop, production smoke, and human-quality review gates in the contract.

## Baseline findings from the uploaded ZIP

`npm run audit:reading-content` passed on the uploaded ZIP snapshot and reported:

- release: `reading-poc-promoted-2026-05-05`
- version: `7`
- passages: `714`
- questions: `7112`
- papers: `243`
- failures: `[]`
- advisories: `[]`

Relevant baseline weakness: the existing audit did not probe adversarial answer acceptance deeply enough.

Adversarial negation probe against the unpatched ZIP:

- checked `3909` short/evidenceShort/open model-answer acceptance cases
- found `2775` cases where prefixing the accepted model answer with `not ` still received full marks
- sample affected rows included `red_tin_box:rtb_q3`, `city_swifts:sw_q1`, `city_swifts:sw_q5`, and `museum_after_closing:mac_q5`

Malformed multi-select probe against the unpatched ZIP:

- question: `tide_clock:tc_q6`
- `response.answer` as a string or plain object threw `(response.answer || []).map is not a function`
- this is not acceptable for a robust production marking endpoint; malformed learner payloads should be marked wrong or rejected cleanly, not crash the marking path

## Patch applied in this package

Patch file:

`patches/001-reading-answer-acceptance-hardening.patch`

Files changed:

- `worker/src/subjects/reading/engine.js`
- `tests/worker-reading-runtime.test.js`

Patch behaviour:

- Adds a leading global contradiction guard for Reading answer checks.
- Preserves existing accepted cases such as `not only ...`, explicit correction with nearby `but`, and source-affirmed negative evidence snippets such as `not a museum of dead things`.
- Applies the same guard to the evidence-overlap fallback, not only direct `checkMatches`.
- Treats malformed non-array `multiSelect` responses as an empty selection, producing a wrong result instead of throwing.
- Adds regression tests for long negated model-answer parrots and malformed multi-select answers.

## Fresh applied validation

Patch dry-run on a fresh ZIP extraction: pass.

Patch apply on a fresh ZIP extraction: pass.

Fresh patched targeted test:

`node --test tests/worker-reading-runtime.test.js`

Result: `30` tests, `30` pass, `0` fail.

Fresh patched Reading core tests:

`node --test tests/reading-content-contract.test.js tests/reading-phase5-next1000-contract.test.js tests/reading-phase6-scale-contract.test.js tests/reading-phase7-scale-contract.test.js tests/reading-subject-registry.test.js tests/worker-reading-runtime.test.js`

Result: `60` tests, `60` pass, `0` fail.

Fresh patched content audit:

`npm run audit:reading-content`

Result: pass.

Fresh patched adversarial negation probe:

- checked `3909` cases
- suspicious full-mark negated cases: `0`

Fresh patched malformed multi-select probe:

- string/object malformed answers no longer throw
- malformed answers produce `score: 0`, `correct: false`
- valid-but-partial array shape remains supported

## Local run limitation

`tests/reading-session-interface.test.js` could not be run in this lean ZIP environment because `node_modules` is absent and the test imports `esbuild`. `package.json` lists `esbuild`, but dependencies were not installed in the extracted ZIP. This is an environment/package limitation, not proof of a product failure. The local Codex agent must run it in a dependency-complete environment.

## Production status

Production is not proven. No authenticated Reading production journey was completed in this review. The local agent must run the production smoke scripts and a browser hard-refresh journey on `https://ks2.eugnel.uk` before using `DONE — LIVE VERIFIED`.

## Target checkout execution update

The package was applied to the GitHub/local target checkout on branch `codex/reading-handoff-package-20260516`, starting from `24ba39c05d34be365447763eacd8801995b2b2c2`.

Target checkout patch status:

- `git apply --check --verbose` passed for `patches/001-reading-answer-acceptance-hardening.patch`.
- The patch applied cleanly.
- A minimal follow-up adaptation preserved source-affirmed negative `keywordAny` phrases such as `not dead`, `not just scrap`, and `cannot always know`.

Target checkout validation:

- `npm run audit:reading-content`: pass.
- `npm run audit:reading-answer-acceptance`: pass.
- `node --test tests/worker-reading-runtime.test.js`: pass, `30` tests.
- Reading core suite: pass, `60` tests.
- `node --test tests/reading-session-interface.test.js`: pass, `14` tests.
- Wider focused runner for `reading|hero|reward|monster|subject runtime`: pass, `1635` tests.
- `npm test`: pass, `111595` tests, `0` failures.
- `npm run check`: pass.

Patched answer-acceptance audit:

- Canonical model-answer acceptance: `7112` checked, `0` failures.
- Negated model-answer full-mark acceptances: `0`.
- Evidence contradiction full-mark acceptances: `0`.
- Malformed payload throws: `0`.
- Source-affirmed negation candidates: `7` checked, passed.
- Pre-marking read-model leaks: `0`.

Production deployment and live evidence:

- Deployment command: `npm run deploy`.
- Deployed source commit: `7833139303bf04a6ec50a862b7950d22ffb7190a`.
- Cloudflare Worker version ID: `af00e7b0-8530-4e23-be38-6896984183e3`.
- Production bundle audit: pass for `https://ks2.eugnel.uk/`.
- `npm run smoke:production:reading`: pass. Artefact: `evidence/production-reading-smoke-2026-05-16.json`.
- `npm run smoke:production:reading-stretch`: pass. Artefact: `evidence/production-reading-stretch-smoke-2026-05-16.json`.
- `npm run smoke:production:reading-landing`: pass. Artefact: `evidence/production-reading-landing-smoke-2026-05-16.json`; screenshots in `evidence/production-reading-landing-screenshots-2026-05-16/`.
- Hard-refresh browser check: pass. Artefact: `evidence/production-reading-hard-refresh-2026-05-16.json`; screenshot: `evidence/production-reading-hard-refresh-2026-05-16.png`.
- Final production status: `DONE — LIVE VERIFIED`.
