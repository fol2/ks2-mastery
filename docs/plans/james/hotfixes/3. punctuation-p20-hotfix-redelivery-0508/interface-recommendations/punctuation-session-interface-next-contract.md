# Punctuation Session Interface Next Contract

## Current finding

The current question-session interface is not showing a blocking UI/input bug in the tested ZIP snapshot. Existing tests preserve the important frame:

- one primary answer action;
- blank text answers blocked;
- forged blank submits guarded;
- choice submit disabled until a choice is made;
- Skip remains available as a deliberate escape route;
- source text and answer boxes remain visually separate for combine/transfer-style work.

## Recommended next UI improvement

Do not introduce a new page, modal, or competing primary CTA. The safe next improvement is a small mode-specific instruction line inside the existing question card.

Examples:

- Choice: “Pick the sentence that uses the punctuation correctly.”
- Insert: “Type the missing punctuation only where it belongs.”
- Fix: “Rewrite the sentence with the punctuation fixed.”
- Combine: “Join the ideas into one clear sentence.”
- Paragraph: “Improve the punctuation across the whole passage.”
- Transfer: “Use the same punctuation skill in a new sentence.”

For disabled submit states, add an accessible hint rather than a new visible control:

- text item: “Type an answer before submitting.”
- choice item: “Choose an option before submitting.”

## Frame boundaries

Keep the existing practice frame intact:

- no extra modal;
- no second primary button;
- no reward/coin surface inside the question card;
- no auto-advance that hides feedback;
- no layout jump between item modes;
- no adult/debug metadata on the child surface.

## Acceptance criteria

- Existing `tests/punctuation-session-ui.test.js` and `tests/punctuation-session-input-hardening.test.js` remain green.
- New UI copy is mode-specific and short.
- Disabled submit state is understandable to keyboard/screen-reader users.
- The answer input stays in the same visual location across modes where possible.
