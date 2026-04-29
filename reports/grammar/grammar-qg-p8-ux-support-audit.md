# Grammar QG P8 — UX / Input-Type Support Audit

| Field             | Value                        |
|-------------------|------------------------------|
| Date              | 2026-04-29                   |
| Content Release   | grammar-qg-p8-2026-04-29    |
| Templates Audited | 78                           |
| Audit Type        | Automated structural + manual gap analysis |

---

## 1. Input Type Coverage

All 6 input families are represented in the corpus:

| Input Type      | Templates | Description                                |
|-----------------|-----------|--------------------------------------------|
| single_choice   | 49        | Radio-button single answer selection       |
| textarea        | 17        | Free-text sentence rewrite / correction    |
| table_choice    | 5         | Categorisation grid (rows × columns)       |
| multi           | 3         | Multiple free-text fields (compound input) |
| checkbox_list   | 2         | Multi-select checkbox list                 |
| text            | 2         | Single-line text input                     |

Coverage is complete: every input type the front-end renderer supports is exercised by at least two templates.

---

## 2. Automated Structural Checks

All checks below are enforced by `tests/grammar-qg-p8-ux-support.test.js`:

| Check | Status | Description |
|-------|--------|-------------|
| Input family coverage | PASS | All 6 types present in corpus (seeds 1) |
| No answerSpec leak into inputSpec | PASS | Top-level and option-level keys verified clean (seeds 1-3) |
| table_choice row metadata | PASS | Every row has `key` + `label`; columns array non-empty |
| textarea placeholder text | PASS | Every textarea has a non-empty `placeholder` string |
| single_choice option labels | PASS | Every option carries a non-empty `label` or `value` |
| No hidden answer data in options | PASS | No `isAnswer`, `correct`, `golden` keys on option objects |

Seeds tested per template: 3 (giving 234 question instances across all checks).

---

## 3. Known Limitations (Manual Verification Required)

The following aspects cannot be verified by automated structural tests and require dedicated manual review:

### 3.1 Mobile Width Usability — table_choice

- Table grids with 4+ columns may overflow on narrow viewports (< 375px).
- Requires visual testing on iPhone SE and Android compact devices.
- Recommendation: Ensure horizontal scroll or responsive column stacking is implemented in the table renderer.

### 3.2 Keyboard-Only Navigation

- Tab order through single_choice radio groups and checkbox_list items.
- Focus ring visibility on all interactive elements.
- Requires interactive manual testing with Tab/Enter/Space.

### 3.3 Screen-Reader ARIA Labels

- Each input type must carry appropriate `role` and `aria-label` attributes at render time.
- textarea: label association; table_choice: grid role with row/column headers.
- Requires testing with VoiceOver (macOS/iOS) or NVDA (Windows).

### 3.4 Smart Punctuation Tolerance on Mobile

- iOS auto-replaces straight quotes with curly quotes and hyphens with em-dashes.
- textarea and text inputs accepting punctuation-sensitive answers must normalise input.
- Requires device testing on iOS Safari with Smart Punctuation enabled.

---

## 4. Recommendation

All automated structural checks pass. The corpus provides full coverage of all 6 input families with correct metadata for front-end rendering.

**Manual UX review is recommended for:**
1. Mobile table layout (table_choice on narrow viewports)
2. Keyboard and assistive technology accessibility
3. Smart punctuation normalisation on iOS devices

No blocking issues identified. Content is approved for UX certification.
