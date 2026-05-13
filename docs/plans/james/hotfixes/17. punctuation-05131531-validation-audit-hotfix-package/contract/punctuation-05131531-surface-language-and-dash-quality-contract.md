# Punctuation 05131531 Surface-Language and Dash-Quality Contract

## Source boundary

Primary authority for this review is the uploaded lean ZIP:

- `ks2-mastery-lean-05131531.zip`
- SHA-256: `e1f6c8a068734e7a0faf1d2f450b9f3d9df57532872bac5ec8b849faa3005298`

GitHub commit search was used only as supplementary context for recent Punctuation activity. Local command output in `validation/` proves behavior only for this extracted snapshot and the freshly patched extraction. Production remains a separate evidence layer.

## Patch name

`001-punctuation-05131531-surface-language-and-dash-quality-gate.patch`

## Scope

Punctuation subject only.

Files changed:

- `package.json`
- `scripts/audit-punctuation-qg-p20-expansion.mjs`
- `scripts/validate-punctuation-qg-p20-expansion-report.mjs`
- `shared/punctuation/manual-p12-quality-bank.js`
- `shared/punctuation/p20-systematic-expansion-bank.js`
- `src/subjects/punctuation/service-contract.js`
- `tests/punctuation-qg-p20-expansion-report-validator.test.js`
- `tests/punctuation-qg-p20-expansion.test.js`
- `tests/punctuation-surface-language-quality.test.js`

No reward, mastery, monster, Hero Mode, subject progression, or question-session UI changes are included.

## Defect fixed

The P23 runtime was locally clean for duplicate surfaces, hyphen compounds, apostrophe-contraction grammar, and proper-noun capitalisation, but still had learner-facing surface-language issues:

1. Accidental self-repetition in list and parenthesis surfaces.
   - Example: `Jude (focused and focused) updated the planning sheet.`
   - Example: `The covered walkway tray held keys, scripts and scripts.`

2. Dash-clause items displayed spaced hyphen-minus as dash punctuation.
   - Example: `Ethan opened the badge - the room fell silent - and read the note.`

This is not just style. In a Punctuation subject, the model surface must teach the intended punctuation clearly. Learners may still type a spaced hyphen as a keyboard fallback, but the displayed model should use real dash typography.

## Required behavior after patch

The patched runtime must satisfy all of the following:

- Runtime item count remains `15072`.
- Generated/fixed split remains `14560/512`.
- Unique learner-facing surfaces remain `15072`.
- Unique variant signatures remain `15072`.
- Duplicate learner-surface groups remain `0`.
- Hyphen quality findings remain `0`.
- Apostrophe-contraction grammar findings remain `0`.
- Proper-noun capitalisation findings remain `0`.
- Model self-marking failures remain `0`.
- New `dashTypographyFindings` counter must be `0`.
- New `redundantPhraseFindings` counter must be `0`.
- New `dashTypographyQuality` audit gate must pass.
- New `redundantPhraseQuality` audit gate must pass.
- Report validator must reject stale reports where either gate or counter fails.

## Release identity

Learner-facing generated content changes, so the release ID must bump:

```text
from: punctuation-qg-p23-15072-2026-05-13
to:   punctuation-qg-p24-15072-2026-05-13
```

Do not reuse P23 production evidence to certify P24.

## Acceptance commands

From a clean repository root after applying the patch:

```bash
git apply --check --ignore-whitespace patches/001-punctuation-05131531-surface-language-and-dash-quality-gate.patch
git apply --ignore-whitespace patches/001-punctuation-05131531-surface-language-and-dash-quality-gate.patch
npm run verify:punctuation-qg:p20-expansion
node --test tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-ui.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-view-model.test.js tests/punctuation-golden-marking.test.js
```

After deploy, regenerate production smoke for:

```text
punctuation-qg-p24-15072-2026-05-13
```

Then run:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```

## Production boundary

The lean ZIP has an invalid/empty `reports/punctuation/punctuation-qg-p20-production-smoke.json` placeholder. Local P20 expansion validation can pass, but live certification cannot pass until production smoke contains origin, environment, release ID, runtime count, deployment evidence, authenticated coverage, admin coverage, and dash-acceptance coverage for the new P24 release.
