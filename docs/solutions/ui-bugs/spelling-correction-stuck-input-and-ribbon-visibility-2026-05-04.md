---
title: Spelling correction phase stuck input and ribbon visibility
date: 2026-05-04
category: ui-bugs
module: spelling
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - Correction phase input not clearing between wrong attempts — appears stuck
  - Ribbon feedback not showing learner's typed answer prominently on first wrong
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - spelling
  - react-input-key
  - correction-phase
  - feedback-ribbon
  - uncontrolled-input
---

# Spelling correction phase stuck input and ribbon visibility

## Problem

Two related bugs in the spelling session: (1) when a learner types wrong in the correction phase, the input field retains the previous value instead of clearing, making it appear "stuck"; (2) on first wrong answer, the ribbon feedback doesn't prominently show what the learner typed.

## Symptoms

- In correction phase, submitting a wrong answer leaves the old text in the input field
- The learner sees "Try again" but the input still contains their previous wrong attempt
- On first wrong answer (retry phase), the learner's typed word is buried in small sub-text rather than displayed prominently
- Learners get confused about what they actually typed vs what the correct answer is

## What Didn't Work

- Initial fix: incrementing `session.promptCount` in the correction-wrong path to change the React `inputKey`. This fixed the stuck input but inflated the "Prompts heard" summary stat (reviewers caught this as S2).
- Initial fix: showing `attemptedAnswer` in the Ribbon `word` slot with identical styling to correct answers. Reviewers flagged this as S1 — displaying a misspelling in the same prominent serif font as correct answers could reinforce the wrong spelling in a child's mind.

## Solution

**Fix 1: Dedicated `correctionAttempt` counter for input key**

```javascript
// shared/spelling/legacy-engine.js — correction phase wrong path
if (session.phase === "correction") {
  if (correct) {
    session.correctionAttempt = 0; // reset on success
    session.phase = "question";
    // ... advance logic
  }
  session.correctionAttempt = (session.correctionAttempt || 0) + 1;
  return { /* ... correction wrong feedback */ };
}
```

```javascript
// SpellingSessionScene.jsx — inputKey includes correctionAttempt
const inputKey = [
  session.id, session.currentSlug, session.phase,
  session.promptCount, session.correctionAttempt || 0,
  awaitingAdvance ? 'locked' : 'active',
].join(':');
```

**Fix 2: Visual distinction for attempted answers**

```jsx
// SpellingCommon.jsx — Ribbon accepts wordIsAttempt prop
export function Ribbon({ tone, icon, headline, word, sub, wordIsAttempt = false }) {
  return (
    <div className={`ribbon ${tone}`} role="status">
      {/* ... */}
      {word ? <span className={`word${wordIsAttempt ? ' is-attempt' : ''}`}>"{word}"</span> : null}
      {/* ... */}
    </div>
  );
}
```

```css
/* styles/app.css */
.spelling-in-session .ribbon-body .word.is-attempt {
  text-decoration: line-through;
  opacity: 0.75;
}
```

**Fix 3: Preserve instructional body text**

```javascript
// FeedbackSlot sub text preserves the engine's body message
const sub = ribbonWordIsAttempt
  ? (feedback.body ? `Your answer — ${feedback.body}` : 'Your answer')
  : feedbackSub(feedback);
```

## Why This Works

**Stuck input:** React uses `key` to determine component identity. Uncontrolled `<input>` elements retain their DOM value across re-renders unless the key changes (triggering a remount). The correction-wrong path didn't change any key component — `session.phase` stayed `'correction'`, `promptCount` wasn't incremented (it increments above the correction block). Adding `correctionAttempt` to the key ensures each wrong attempt produces a new key, remounting the input and clearing its value.

**Ribbon visibility:** The legacy engine deliberately omits `feedback.answer` in the retry phase (to not reveal the correct spelling). The `attemptedAnswer` was only in the `.sub` div (small text, line-clamped). Promoting it to the Ribbon `word` slot with a `.is-attempt` class (line-through + faded) shows it prominently while visually communicating "this is wrong" — preventing pedagogical confusion where a child might think their misspelling is the correct answer.

## Prevention

- When adding state-machine phases that loop (same phase in → same phase out), verify the React key includes a counter that changes per iteration. The `inputKey` pattern in this codebase requires at least one component to differ between renders for uncontrolled inputs to clear.
- When displaying user-provided text alongside authoritative text (correct answers), always add a visual distinction — never use identical styling for both.

## Related Issues

- PR #861 (squash-merged to main)
