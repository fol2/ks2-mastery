import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_FORBIDDEN_VOCABULARY,
  HERO_INTENT_LABELS,
  HERO_SUBJECT_LABELS,
  HERO_INTENT_REASONS,
  HERO_UI_REASON_LABELS,
  HERO_CTA_TEXT,
  resolveChildLabel,
  resolveChildReason,
} from '../shared/hero/hero-copy.js';

// ── All 6 intents that P2 uses ─────────────────────────────────────────

const P2_INTENTS = [
  'weak-repair',
  'due-review',
  'retention-after-secure',
  'post-mega-maintenance',
  'breadth-maintenance',
  'fresh-exploration',
];

const P2_SUBJECTS = ['spelling', 'grammar', 'punctuation'];

// ── HERO_FORBIDDEN_VOCABULARY ──────────────────────────────────────────

test('HERO_FORBIDDEN_VOCABULARY is frozen', () => {
  assert.ok(Object.isFrozen(HERO_FORBIDDEN_VOCABULARY));
});

test('HERO_FORBIDDEN_VOCABULARY contains expected tokens', () => {
  const expected = ['coin', 'shop', 'deal', 'loot', 'streak', 'claim', 'reward', 'treasure', 'buy', 'earn'];
  for (const token of expected) {
    assert.ok(
      HERO_FORBIDDEN_VOCABULARY.includes(token),
      `HERO_FORBIDDEN_VOCABULARY must include "${token}"`,
    );
  }
});

test('HERO_FORBIDDEN_VOCABULARY contains multi-word tokens', () => {
  assert.ok(HERO_FORBIDDEN_VOCABULARY.includes('limited time'));
  assert.ok(HERO_FORBIDDEN_VOCABULARY.includes('daily deal'));
  assert.ok(HERO_FORBIDDEN_VOCABULARY.includes("don't miss out"));
});

// ── Zero economy vocabulary in all exported copy ───────────────────────

function scanForForbiddenVocab(text, label) {
  const lower = text.toLowerCase();
  for (const token of HERO_FORBIDDEN_VOCABULARY) {
    // Multi-word tokens use simple includes; single-word tokens use
    // word-boundary regex to avoid false positives (e.g. "earn" in "learnt").
    const tokenLower = token.toLowerCase();
    const found = tokenLower.includes(' ')
      ? lower.includes(tokenLower)
      : new RegExp(`\\b${tokenLower}\\b`).test(lower);
    assert.ok(
      !found,
      `${label} contains forbidden economy token "${token}" in text: "${text}"`,
    );
  }
}

test('HERO_INTENT_LABELS contain zero economy vocabulary', () => {
  for (const [intent, label] of Object.entries(HERO_INTENT_LABELS)) {
    scanForForbiddenVocab(label, `HERO_INTENT_LABELS['${intent}']`);
  }
});

test('HERO_SUBJECT_LABELS contain zero economy vocabulary', () => {
  for (const [subject, label] of Object.entries(HERO_SUBJECT_LABELS)) {
    scanForForbiddenVocab(label, `HERO_SUBJECT_LABELS['${subject}']`);
  }
});

test('HERO_INTENT_REASONS contain zero economy vocabulary', () => {
  for (const [intent, reason] of Object.entries(HERO_INTENT_REASONS)) {
    scanForForbiddenVocab(reason, `HERO_INTENT_REASONS['${intent}']`);
  }
});

test('HERO_UI_REASON_LABELS contain zero economy vocabulary', () => {
  for (const [reason, label] of Object.entries(HERO_UI_REASON_LABELS)) {
    scanForForbiddenVocab(label, `HERO_UI_REASON_LABELS['${reason}']`);
  }
});

test('HERO_CTA_TEXT contains zero economy vocabulary', () => {
  for (const [key, text] of Object.entries(HERO_CTA_TEXT)) {
    scanForForbiddenVocab(text, `HERO_CTA_TEXT['${key}']`);
  }
});

// ── Intent labels for all 6 intents ────────────────────────────────────

test('HERO_INTENT_LABELS has non-empty labels for all 6 P2 intents', () => {
  for (const intent of P2_INTENTS) {
    const label = HERO_INTENT_LABELS[intent];
    assert.equal(typeof label, 'string', `HERO_INTENT_LABELS['${intent}'] must be a string`);
    assert.ok(label.length > 0, `HERO_INTENT_LABELS['${intent}'] must be non-empty`);
  }
});

test('HERO_INTENT_REASONS has non-empty reasons for all 6 P2 intents', () => {
  for (const intent of P2_INTENTS) {
    const reason = HERO_INTENT_REASONS[intent];
    assert.equal(typeof reason, 'string', `HERO_INTENT_REASONS['${intent}'] must be a string`);
    assert.ok(reason.length > 0, `HERO_INTENT_REASONS['${intent}'] must be non-empty`);
  }
});

// ── Subject labels for all 3 ready subjects ────────────────────────────

test('HERO_SUBJECT_LABELS has non-empty labels for all 3 ready subjects', () => {
  for (const subject of P2_SUBJECTS) {
    const label = HERO_SUBJECT_LABELS[subject];
    assert.equal(typeof label, 'string', `HERO_SUBJECT_LABELS['${subject}'] must be a string`);
    assert.ok(label.length > 0, `HERO_SUBJECT_LABELS['${subject}'] must be non-empty`);
  }
});

// ── resolveChildLabel and resolveChildReason ───────────────────────────

test('resolveChildLabel returns non-empty string for all intent/subject combos', () => {
  for (const intent of P2_INTENTS) {
    for (const subject of P2_SUBJECTS) {
      const label = resolveChildLabel(intent, subject);
      assert.equal(typeof label, 'string');
      assert.ok(label.length > 0);
      scanForForbiddenVocab(label, `resolveChildLabel('${intent}', '${subject}')`);
    }
  }
});

test('resolveChildReason returns non-empty string for all intents', () => {
  for (const intent of P2_INTENTS) {
    const reason = resolveChildReason(intent);
    assert.equal(typeof reason, 'string');
    assert.ok(reason.length > 0);
    scanForForbiddenVocab(reason, `resolveChildReason('${intent}')`);
  }
});

test('resolveChildLabel handles unknown intent gracefully', () => {
  const label = resolveChildLabel('unknown-intent', 'spelling');
  assert.equal(typeof label, 'string');
  assert.ok(label.length > 0);
});

test('resolveChildReason handles unknown intent gracefully', () => {
  const reason = resolveChildReason('unknown-intent');
  assert.equal(typeof reason, 'string');
  assert.ok(reason.length > 0);
});

// ── Frozen exports ─────────────────────────────────────────────────────

test('all copy objects are frozen', () => {
  assert.ok(Object.isFrozen(HERO_INTENT_LABELS));
  assert.ok(Object.isFrozen(HERO_SUBJECT_LABELS));
  assert.ok(Object.isFrozen(HERO_INTENT_REASONS));
  assert.ok(Object.isFrozen(HERO_UI_REASON_LABELS));
  assert.ok(Object.isFrozen(HERO_CTA_TEXT));
});
