---
title: Spelling Secure Vocabulary Pool Selector Hotfix
status: active
date: 2026-06-05
execution: code
origin: user report, 2026-06-05
---

# Spelling Secure Vocabulary Pool Selector Hotfix

## Problem Frame

The Spelling setup Pool control exposes Core, Years 3-4, Years 5-6, Secure vocabulary, and Extra. The Secure vocabulary option is long enough to collide with the shared round-length slider styling, so it is visually compressed and behaves as if it cannot be selected.

The behaviour contract is straightforward:

- each Pool option must be an independent radio-style choice
- choosing Secure vocabulary must save `yearFilter: "secure-extension"`
- Smart Review must start from the secure vocabulary word subset when that preference is active
- Core and Extra selection must keep working through the same preference path

## Scope

In scope:

- Make the Pool picker use a chip layout that can fit variable label lengths.
- Preserve the existing round-length segmented slider behaviour.
- Keep the existing `spelling-set-pref` command and `yearFilter` preference contract.
- Add tests for the React setup UI, remote preference sync, and Smart Review secure-vocabulary scoping.
- Deploy and smoke the production Spelling setup flow.

Out of scope:

- Changing spelling content, seed data, word metadata, or secure vocabulary eligibility.
- Changing Word Bank filters or facet counts beyond the already implemented Word Bank hotfix.
- Redesigning the full setup screen.

## Design Decisions

### D1. Split Pool Styling From Round-Length Styling

`LengthPicker` remains the shared control, but the Pool instance now carries a `pool-picker` class. The Pool picker hides the slider track and wraps variable-width options, while round length keeps the existing fixed-width slider presentation.

Rationale: the bug is local to a control variant. A broad setup refactor would increase risk without improving the preference contract.

### D2. Keep the Existing Preference Contract

The Secure vocabulary option continues to save `yearFilter: "secure-extension"` through `spelling-set-pref`, and remote saves still send only the changed preference.

Rationale: this keeps local and remote setup paths aligned and avoids introducing another spelling preference shape.

### D3. Test UI, Sync, and Engine Boundaries

The regression coverage checks:

- the Secure vocabulary Pool button renders with the correct action and selected state
- remote setup preferences accept and save `secure-extension`
- Smart Review scoped to `secure-extension` only draws secure vocabulary words

Rationale: the visible failure is UI-facing, but the fix must prove the selection survives through state sync and session creation.

## Verification Contract

- `node --test tests/render.test.js tests/react-spelling-surface.test.js tests/spelling-remote-actions.test.js tests/spelling-core.test.js`
- `npm test`
- `npm run check`
- `npm run deploy`
- Production UI smoke on `https://ks2.eugnel.uk`: open Spelling setup, choose Secure vocabulary in Pool, confirm it becomes the selected option, then verify Core and Extra remain selectable.
