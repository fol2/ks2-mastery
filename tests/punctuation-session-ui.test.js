// Phase 3 U1 — Punctuation session-ui pure-function assertions.
//
// These tests are the load-bearing assertion surface for the session-ui half
// of U1. Every export from `src/subjects/punctuation/session-ui.js` is
// exercised here with a happy path, an edge case, and (where relevant) an
// error-path assertion. No SSR render. No React. Every fixture is a plain
// object so the file runs fast on `node --test` alone.
//
// Integration: U3's Session scene calls these helpers once per render and
// threads the results down; U4's Feedback/Summary scenes consume
// `punctuationSessionHelpVisibility` for the GPS delayed-feedback contract.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  punctuationSessionHelpVisibility,
  punctuationSessionInputPlaceholder,
  punctuationSessionInputShape,
  punctuationSessionProgressLabel,
  punctuationSessionSubmitLabel,
} from '../src/subjects/punctuation/session-ui.js';

// ---------------------------------------------------------------------------
// punctuationSessionSubmitLabel (R5)
// ---------------------------------------------------------------------------

test('U1 session-ui: punctuationSessionSubmitLabel returns Save answer in GPS mode', () => {
  assert.equal(punctuationSessionSubmitLabel({ mode: 'gps' }), 'Save answer');
});

test('U1 session-ui: punctuationSessionSubmitLabel returns Check in every other mode', () => {
  assert.equal(punctuationSessionSubmitLabel({ mode: 'smart' }), 'Check');
  assert.equal(punctuationSessionSubmitLabel({ mode: 'weak' }), 'Check');
  assert.equal(punctuationSessionSubmitLabel({ mode: 'guided' }), 'Check');
  // Cluster focus modes still dispatch via the enum — they stay as "Check".
  assert.equal(punctuationSessionSubmitLabel({ mode: 'speech' }), 'Check');
  assert.equal(punctuationSessionSubmitLabel({ mode: 'endmarks' }), 'Check');
});

test('U1 session-ui: punctuationSessionSubmitLabel defaults to Check on null/invalid session', () => {
  assert.equal(punctuationSessionSubmitLabel(null), 'Check');
  assert.equal(punctuationSessionSubmitLabel(undefined), 'Check');
  assert.equal(punctuationSessionSubmitLabel({}), 'Check');
});

// ---------------------------------------------------------------------------
// punctuationSessionInputShape (R6) — per-item-type input branch.
// ---------------------------------------------------------------------------

test('U1 session-ui: punctuationSessionInputShape returns stem-prefill for insert/fix/paragraph', () => {
  assert.deepEqual(punctuationSessionInputShape('insert'), { prefill: 'stem' });
  assert.deepEqual(punctuationSessionInputShape('fix'), { prefill: 'stem' });
  assert.deepEqual(punctuationSessionInputShape('paragraph'), { prefill: 'stem' });
});

test('U1 session-ui: punctuationSessionInputShape returns blank+source for combine/transfer', () => {
  assert.deepEqual(
    punctuationSessionInputShape('combine'),
    { prefill: 'blank', showSource: true },
  );
  assert.deepEqual(
    punctuationSessionInputShape('transfer'),
    { prefill: 'blank', showSource: true },
  );
});

test('U1 session-ui: punctuationSessionInputShape returns none for choose (radio) mode', () => {
  assert.deepEqual(punctuationSessionInputShape('choose'), { prefill: 'none' });
});

test('U1 session-ui: punctuationSessionInputShape returns none on empty/unknown mode (safe default)', () => {
  // Safe default — a rogue payload must NOT accidentally prefill the input
  // with source material for a mode the scene does not recognise.
  assert.deepEqual(punctuationSessionInputShape(''), { prefill: 'none' });
  assert.deepEqual(punctuationSessionInputShape(null), { prefill: 'none' });
  assert.deepEqual(punctuationSessionInputShape('mystery-mode'), { prefill: 'none' });
});

// ---------------------------------------------------------------------------
// punctuationSessionProgressLabel (R5 header)
// ---------------------------------------------------------------------------

test('U1 session-ui: punctuationSessionProgressLabel renders Question X of N on a standard round', () => {
  assert.equal(
    punctuationSessionProgressLabel({ length: 8, answeredCount: 2 }),
    'Question 3 of 8',
  );
  assert.equal(
    punctuationSessionProgressLabel({ length: 4, answeredCount: 0 }),
    'Question 1 of 4',
  );
});

test('U1 session-ui: punctuationSessionProgressLabel clamps answered past length to total', () => {
  // Edge case — if answeredCount equals length (final question answered), the
  // label still reads within [1, length].
  assert.equal(
    punctuationSessionProgressLabel({ length: 4, answeredCount: 4 }),
    'Question 4 of 4',
  );
  assert.equal(
    punctuationSessionProgressLabel({ length: 4, answeredCount: 99 }),
    'Question 4 of 4',
  );
});

test('U1 session-ui: punctuationSessionProgressLabel handles length=0 fallback', () => {
  // Fresh session before the queue is populated — renders a stable label.
  const label = punctuationSessionProgressLabel({ length: 0, answeredCount: 0 });
  assert.equal(label, 'Question 1');
  assert.ok(label.length > 0);
});

test('U1 session-ui: punctuationSessionProgressLabel null/invalid returns Question 1', () => {
  assert.equal(punctuationSessionProgressLabel(null), 'Question 1');
  assert.equal(punctuationSessionProgressLabel(undefined), 'Question 1');
  assert.equal(punctuationSessionProgressLabel([]), 'Question 1');
});

// ---------------------------------------------------------------------------
// punctuationSessionHelpVisibility — GPS delayed-feedback + guided teach box.
// ---------------------------------------------------------------------------

test('U1 session-ui: punctuationSessionHelpVisibility GPS hides feedback until summary', () => {
  // Active-item — no per-item feedback.
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'gps' }, 'active-item'),
    { showTeachBox: false, showFeedback: false },
  );
  // Feedback phase — still no feedback in GPS (learner never sees per-item).
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'gps' }, 'feedback'),
    { showTeachBox: false, showFeedback: false },
  );
  // Summary — feedback unlocks.
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'gps' }, 'summary'),
    { showTeachBox: false, showFeedback: true },
  );
});

test('U1 session-ui: punctuationSessionHelpVisibility guided shows teach box during active-item', () => {
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'guided' }, 'active-item'),
    { showTeachBox: true, showFeedback: false },
  );
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'guided' }, 'feedback'),
    { showTeachBox: true, showFeedback: true },
  );
});

test('U1 session-ui: punctuationSessionHelpVisibility smart/weak hide teach box, feedback follows phase', () => {
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'smart' }, 'active-item'),
    { showTeachBox: false, showFeedback: false },
  );
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'smart' }, 'feedback'),
    { showTeachBox: false, showFeedback: true },
  );
  assert.deepEqual(
    punctuationSessionHelpVisibility({ mode: 'weak' }, 'feedback'),
    { showTeachBox: false, showFeedback: true },
  );
});

test('U1 session-ui: punctuationSessionHelpVisibility null session is fully off', () => {
  // Defensive: a fresh dashboard render without a session must not bleed
  // help UI into the visible tree.
  assert.deepEqual(
    punctuationSessionHelpVisibility(null, 'active-item'),
    { showTeachBox: false, showFeedback: false },
  );
  assert.deepEqual(
    punctuationSessionHelpVisibility(undefined, 'feedback'),
    { showTeachBox: false, showFeedback: true },
  );
});

// ---------------------------------------------------------------------------
// punctuationSessionInputPlaceholder — child-friendly per-mode copy.
// ---------------------------------------------------------------------------

test('U1 session-ui: punctuationSessionInputPlaceholder maps every known mode to a child string', () => {
  assert.equal(punctuationSessionInputPlaceholder('insert'), 'Add the missing punctuation');
  assert.equal(punctuationSessionInputPlaceholder('fix'), 'Fix the punctuation');
  assert.equal(punctuationSessionInputPlaceholder('paragraph'), 'Repair the whole passage');
  assert.equal(punctuationSessionInputPlaceholder('combine'), 'Combine the parts into one sentence');
  assert.equal(punctuationSessionInputPlaceholder('transfer'), 'Write one accurate sentence');
  // choose — radio group doesn't use a placeholder.
  assert.equal(punctuationSessionInputPlaceholder('choose'), '');
});

test('U1 session-ui: punctuationSessionInputPlaceholder falls back to generic prompt on unknown mode', () => {
  assert.equal(punctuationSessionInputPlaceholder(''), 'Type your answer here');
  assert.equal(punctuationSessionInputPlaceholder(null), 'Type your answer here');
  assert.equal(punctuationSessionInputPlaceholder('mystery-mode'), 'Type your answer here');
});

// ---------------------------------------------------------------------------
// Pure-module safety: no React imports in the session-ui file.
// ---------------------------------------------------------------------------

test('U1 safety: session-ui.js does not import react', async () => {
  const fs = await import('node:fs');
  const url = await import('node:url');
  const path = url.fileURLToPath(
    new URL('../src/subjects/punctuation/session-ui.js', import.meta.url),
  );
  const source = fs.readFileSync(path, 'utf8');
  assert.equal(/from ['"]react['"]/i.test(source), false);
  assert.equal(/require\(['"]react['"]\)/i.test(source), false);
});
