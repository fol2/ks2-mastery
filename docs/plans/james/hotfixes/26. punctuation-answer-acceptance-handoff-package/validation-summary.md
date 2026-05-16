# Validation Summary — Punctuation Answer Acceptance Handoff

## Source identity

- Primary ZIP: `ks2-mastery-lean-05161311.zip`
- SHA-256: `e45296872ddb84c23f725d1a81eaf3aaf5fc55dde2f7d8ec38523023707f465d`
- ZIP integrity: `unzip -t` passed; no errors detected.
- Archive shape: rootless review snapshot; no `.git` metadata.
- Runtime: Node `v22.16.0`, npm `10.9.2`, `.nvmrc` = `22`.
- Manifest limitation: review profile omits `assets/**`, `reports/**`, `output/**`, and most docs; build/deploy checks that need real asset payloads cannot be fully certified from this lean ZIP alone.

## Local-run findings before patch

The existing P20 expansion suite passed locally, so the broad generator/repetition/depth gates were healthy in the ZIP snapshot. However, adversarial answer-acceptance probes found real false positives in learner-facing marking:

| Probe | Incorrect accepted answers before patch | Interpretation |
|---|---:|---|
| `duplicateTerminal` | 506 | Speech and paragraph answers with `??`, `..`, etc. could be accepted. |
| `noTerminal` | 102 | Some speech/reporting-after and paragraph answers missing final punctuation could be accepted. |
| `lowercaseStart` | 305 | Paragraph and bullet answers with lower-case starts could be accepted. |
| `appendExtra` | 18 | Open transfer answers could accept an appended extra word; left as advisory because transfer/free-writing tolerance needs a product decision. |

## Patch applied

Patch file: `patches/001-punctuation-answer-acceptance-hardening.patch`

Changed files:

- `shared/punctuation/marking.js`
- `tests/punctuation-marking.test.js`

Scope of patch:

- Direct speech: require exactly one terminal mark inside quoted speech; reject duplicated terminals.
- Direct speech reporting-after: require the reporting clause to end with exactly one full stop; reject missing or duplicated final full stop.
- Paragraph repair: require expected final terminal punctuation, reject duplicated terminal runs, and require expected initial capitalisation.
- Bullet repair: make the preserved bullet-list stem case-sensitive, so lower-case stem starts are not accepted where the model starts with a capital.
- Tests: add regression coverage for speech terminal duplication, reporting-after terminal omission/duplication, paragraph final punctuation, paragraph capitalisation, and bullet stem capitalisation.

## Patch validation

Patch application:

- `git apply --check patches/001-punctuation-answer-acceptance-hardening.patch`: PASS (`validation/patch-dry-run.log`)
- `git apply patches/001-punctuation-answer-acceptance-hardening.patch`: PASS on fresh extraction (`validation/patch-apply.log`)

Targeted tests:

- `node --test tests/punctuation-marking.test.js tests/punctuation-paragraph.test.js tests/punctuation-speech-oracle-hardening.test.js`: PASS, `51/51` (`validation/targeted-tests-patched.log`)
- Same targeted suite on a fresh apply-test extraction: PASS, `51/51` (`validation/targeted-tests-applytest.log`)

P20 expansion:

- `npm run verify:punctuation-qg:p20-expansion`: PASS, `31/31` tests (`validation/p20-expansion-patched.log`)
- Release reported locally: `punctuation-qg-p24-15072-2026-05-13`
- Runtime/generated/fixed: `15072/14560/512`
- Unique surfaces/signatures: `15072/15072`
- Generated families: `126`
- Failing gates: none.

Adversarial answer-acceptance probes after patch:

| Probe | Before patch | After patch | Apply-test after patch |
|---|---:|---:|---:|
| `duplicateTerminal` | 506 | 0 | 0 |
| `noTerminal` | 102 | 0 | 0 |
| `lowercaseStart` | 305 | 0 | 0 |
| `appendExtra` | 18 | 18 | 18 |

Adjacent reward/Stars/monster subset:

- `node --test tests/punctuation-rewards.test.js tests/punctuation-reward-parity.test.js tests/punctuation-star-projection.test.js tests/punctuation-star-view-parity.test.js tests/punctuation-monster-migration.test.js`: PASS, `130/130` (`validation/adjacent-reward-star-monster-subset-patched.log`)

Adjacent Hero UI tests:

- A broader Hero-backdrop UI group failed in this lean ZIP because `esbuild` was unavailable for `tests/helpers/punctuation-scene-render.js`; this is recorded in `validation/adjacent-hero-ui-tests-lean-esbuild-failure.log`. The failure is an environment/dependency limitation, not evidence that the patch changed Hero or monster behaviour.

## Production evidence status

`npm run verify:punctuation-qg:p20-live` failed because the expected production smoke evidence file is missing:

- Missing: `reports/punctuation/punctuation-qg-p20-production-smoke.json`
- Missing required live evidence fields include origin `https://ks2.eugnel.uk`, environment `production`, release ID, runtime item count, worker commit/version/deployment evidence, authenticated coverage, admin hub evidence, smart-six evidence, and dash-acceptance evidence.

Therefore the correct status is:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

It must not be called `DONE` until live production is verified after hard refresh on `https://ks2.eugnel.uk`.

## Review-pack advisory

`node scripts/review-punctuation-questions.mjs --json --out ...` produced a 15,072-item review pack, but item-level reviewer decisions are sparse:

- `approved`: 92
- `missing`: 14,980

The generated-family review register produced by the P20 expansion evidence is stronger for generated governance:

- review register status: PASS
- release ID: `punctuation-qg-p24-15072-2026-05-13`
- family decisions: 126 approved
- fixed-bank status: inherited-approved from P12-P14 governance

This means the local agent must not claim “every generated item was individually adult-reviewed” unless a separate item-level decision register exists. The defensible claim is family-level generated review plus fixed-bank inherited approval, subject to local-agent audit.

## Local limitations

- Production was not live-verified.
- Lean ZIP omits real asset payloads and reports by design; full build/deploy certification is outside this snapshot.
- `npm run check` failed because `assets/monsters` is omitted from the lean ZIP, which blocks the build’s monster visual manifest generation.
- Open transfer extra-word acceptance remains an advisory requiring a product/marking-policy decision before tightening, because strict extra-word rejection may over-constrain legitimate transfer/free-writing answers.
