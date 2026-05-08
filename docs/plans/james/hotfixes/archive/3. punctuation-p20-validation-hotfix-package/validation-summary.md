# Punctuation P20 validation hotfix summary

## Source boundary

Primary local snapshot: uploaded lean ZIP at `/mnt/data/ks2-mastery-lean-05070029.zip`.

This rebuilt package is a local source/patch validation artefact. It does not independently certify a live production deployment; final deployment evidence must be supplied in the completion report for this folder.

## Bugs fixed

### 1. Real-service scheduler candidate window too small

Baseline P20 content has 440 published `choose` candidates. The default scheduler inspected only the first 32 candidates, which meant the live service did not fully use the P20 expanded pool unless a caller explicitly passed a larger window.

Baseline probe:

```json
{
  "chooseCount": 440,
  "inspectedCount": 32,
  "candidateCount": 440,
  "selectedItemId": "fx_ac_choose_isnt_wouldnt",
  "hasTextAnswerGuard": false,
  "hasSubmitHandlerGuard": false
}
```

Patched probe:

```json
{
  "chooseCount": 440,
  "inspectedCount": 440,
  "candidateCount": 440,
  "selectedItemId": "fx12_bullet_points_026",
  "explicitWindowInspectedCount": 7,
  "explicitWindowCandidateCount": 440,
  "hasTextAnswerGuard": true,
  "hasSubmitHandlerGuard": true
}
```

The patch makes the default candidate window full-pool while preserving explicit bounded windows for deterministic probes.

### 2. Text session could submit blank / whitespace-only answers

The baseline `TextItem` submit button stayed enabled for blank text answers and the form handler forwarded `typed` without a trimmed non-empty guard. The patch disables submit for blank/whitespace-only answers and also guards the submit handler against forged submits.

### 3. P20 generated family cluster metadata was inverted for two primary skills

The full-window scheduler surfaced an existing metadata defect in the P20 systematic generated family config:

- `parenthesis` items were assigned to the `boundary` cluster instead of `structure`;
- `semicolon` items were assigned to the `structure` cluster instead of `boundary`.

The patch corrects only those two cluster IDs. It does not change the P20 release ID, runtime item count, generated item count, fixed item count, item surfaces, item signatures, model answers, or generator templates.

## Files changed

- `shared/punctuation/scheduler.js`
- `shared/punctuation/p20-systematic-expansion-bank.js`
- `src/subjects/punctuation/components/PunctuationSessionScene.jsx`
- `tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js`
- `tests/punctuation-session-input-hardening.test.js`

## Validation run from a fresh patched ZIP extraction

- `git apply --check --ignore-whitespace`: PASS
- `git apply --ignore-whitespace`: PASS
- Focused Node tests: 24/24 PASS

Focused test command:

```bash
node --test   tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js   tests/punctuation-session-input-hardening.test.js   tests/punctuation-session-ui.test.js
```

The focused test log is in `validation/patched-focused-tests.log`.

## Current repo verification on 2026-05-07

These checks were run after applying the package to `D:\Coding\ks2-mastery` and expanding the contract to include the related cluster metadata fix:

- `node --test tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-session-ui.test.js`: PASS, 24/24 tests.
- `node --test tests/punctuation-scheduler.test.js tests/punctuation-qg-p20-expansion.test.js tests/punctuation-qg-p20-production-evidence.test.js`: PASS, 45/45 tests.
- `npm run verify:punctuation-qg:p20`: PASS, release `punctuation-qg-p20-15072-2026-05-04`, runtime/generated/fixed `15072/14560/512`, failing gates `none`.
- `npm test`: PASS, 109,175 tests, 109,163 passed, 0 failed, 12 skipped.
- `npm run check`: PASS, Wrangler dry-run deploy completed.

Production deployment and fresh live smoke are intentionally tracked outside this validation summary and must be recorded in the completion report.
