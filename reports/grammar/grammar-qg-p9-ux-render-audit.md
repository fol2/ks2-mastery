# Grammar QG P9 U8 — UX Render Audit Report

Generated: 2026-04-29

## 1. Input Family Coverage

| Input Type | Tested | Render Contract |
|---|---|---|
| `single_choice` | Yes | options[] with value+label; rendered as radio buttons; no answer leak |
| `checkbox_list` | Yes | options[] with value+label; rendered as checkboxes |
| `table_choice` | Yes | columns[] + rows[] with key+label; row-specific options; ariaLabel |
| `textarea` | Yes | label + placeholder present; multiline; no answer leak |
| `multi` | Yes | fields[] with key+label+kind; options per field when applicable |
| `text` | Yes | label + placeholder present; single-line |

All 6 input families have production templates in the corpus and pass render-level structural validation.

## 2. Accessibility Features Verified

| Feature | Status | Notes |
|---|---|---|
| `focusCue` implies `screenReaderPromptText` | Enforced | If a question has visual cue data, the screen reader equivalent is always present |
| `table_choice` row `ariaLabel` | Enforced | Heterogeneous transfer templates (U4) provide ariaLabel on every row |
| Label/key associations | Enforced | All 6 input families tested for non-empty labels on every option/field |
| `readAloudText` for cue templates | Enforced | TTS-safe text includes the focus word context |
| `promptParts` structured rendering | Enforced | No dangerouslySetInnerHTML required for underlined/bold cues |

## 3. iOS Smart Punctuation Handling

| Character | Unicode | Normalised To | Status |
|---|---|---|---|
| Left double quote | U+201C | `"` (U+0022) | Normalised in `markByAnswerSpec` |
| Right double quote | U+201D | `"` (U+0022) | Normalised in `markByAnswerSpec` |
| Left single quote | U+2018 | `'` (U+0027) | Normalised in `markByAnswerSpec` |
| Right single quote / smart apostrophe | U+2019 | `'` (U+0027) | Normalised in `markByAnswerSpec` |
| En-dash | U+2013 | `-` (U+002D) | Normalised in `markByAnswerSpec` |
| Em-dash | U+2014 | `-` (U+002D) | Normalised in `markByAnswerSpec` |

The `normaliseSmartPunctuation()` helper in `answer-spec.js` is applied to all constructed-response marking paths. Templates particularly affected:
- `speech_punctuation` concept (direct speech with quotes and apostrophes)
- `apostrophes_possession` concept (possessive apostrophes)

Tested scenarios:
- Smart apostrophe in typed answer does not cause false negative
- Curly double quotes in direct speech answer accepted as correct
- En-dash/em-dash in hyphenated answers resolved correctly

## 4. Prompt Cue Coverage

| Cue Type | Templates | Verified |
|---|---|---|
| `underline` (focusCue) | `word_class_underlined_choice` + others | Yes — promptParts includes underline part matching focusCue.targetText |
| Backwards compat (no cue) | All non-cue templates | Yes — promptText present, no promptParts/focusCue |
| `screenReaderPromptText` | All focusCue templates | Yes — always includes "Target word:" prefix |

## 5. Table-Choice Mobile Handling

- Row-specific options (U4 heterogeneous tables) reduce visual clutter on mobile by showing only relevant choices per row
- `ariaLabel` on rows supports VoiceOver tap-and-read on iOS
- Global columns preserved for homogeneous tables (no per-row filtering needed)
- Tested with 15 seeds per template for robustness

## 6. Known Limitations

| Area | Limitation | Mitigation |
|---|---|---|
| Full screen-reader testing | Requires manual VoiceOver/NVDA verification | Structural ariaLabel + screenReaderPromptText enforced by tests |
| Visual regression | No pixel-level DOM rendering tests | Structural inputSpec shape validated; visual QA is manual |
| Keyboard navigation | Not tested at unit level | Structural key/label pairing ensures DOM semantics are correct |
| Right-to-left text | Not applicable to KS2 English | N/A |

## 7. Test Summary

| Test File | Tests Added (U8) | Total |
|---|---|---|
| `tests/grammar-qg-p9-learner-surface.test.js` | 38 new tests | 64 |
| `tests/grammar-qg-p9-table-choice-contract.test.js` | 0 (unchanged) | 395 |
| `tests/grammar-qg-p8-ux-support.test.js` | 0 (unchanged) | 601 |

Production-code change: `worker/src/subjects/grammar/answer-spec.js` — added `normaliseSmartPunctuation()` export and integrated into `markByAnswerSpec` response processing. Zero breaking changes to existing marking behaviour (all 2518 P8 oracle tests pass).
