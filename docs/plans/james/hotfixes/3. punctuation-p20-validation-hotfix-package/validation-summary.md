# Punctuation P20 validation hotfix summary

## Source boundary

Primary local snapshot: uploaded lean ZIP at `/mnt/data/ks2-mastery-lean-05070029.zip`.

This rebuilt package is a local source/patch validation artefact. It does not independently certify a live production deployment.

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

## Files changed

- `shared/punctuation/scheduler.js`
- `src/subjects/punctuation/components/PunctuationSessionScene.jsx`
- `tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js`
- `tests/punctuation-session-input-hardening.test.js`

## Validation run from a fresh patched ZIP extraction

- `git apply --check --ignore-whitespace`: PASS
- `git apply --ignore-whitespace`: PASS
- Focused Node tests: 22/22 PASS

Focused test command:

```bash
node --test   tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js   tests/punctuation-session-input-hardening.test.js   tests/punctuation-session-ui.test.js
```

The focused test log is in `validation/patched-focused-tests.log`.
