import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveGrammarConfidence,
  GRAMMAR_CONFIDENCE_LABELS,
} from '../shared/grammar/confidence.js';

test('U6: GRAMMAR_CONFIDENCE_LABELS lists all five labels', () => {
  assert.deepEqual(GRAMMAR_CONFIDENCE_LABELS.slice().sort(), [
    'building',
    'consolidating',
    'emerging',
    'needs-repair',
    'secure',
  ]);
});

test('U6: emerging — new concept with thin evidence (<=2 attempts)', () => {
  assert.equal(deriveGrammarConfidence({
    status: 'new', attempts: 0, strength: 0.25, correctStreak: 0, intervalDays: 0, recentMisses: 0,
  }), 'emerging');
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 1, strength: 0.35, correctStreak: 1, intervalDays: 0, recentMisses: 0,
  }), 'emerging');
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 2, strength: 0.4, correctStreak: 1, intervalDays: 0, recentMisses: 0,
  }), 'emerging');
});

test('U6: needs-repair — weak status OR 2+ recent misses', () => {
  assert.equal(deriveGrammarConfidence({
    status: 'weak', attempts: 8, strength: 0.3, correctStreak: 0, intervalDays: 0, recentMisses: 0,
  }), 'needs-repair');
  // Even with high strength, 2+ recent misses triggers needs-repair
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 10, strength: 0.7, correctStreak: 0, intervalDays: 0, recentMisses: 2,
  }), 'needs-repair');
});

test('U6: secure — strength >= 0.82, streak >= 3, intervalDays >= 7', () => {
  assert.equal(deriveGrammarConfidence({
    status: 'secured', attempts: 10, strength: 0.95, correctStreak: 5, intervalDays: 10, recentMisses: 0,
  }), 'secure');
  assert.equal(deriveGrammarConfidence({
    status: 'secured', attempts: 9, strength: 0.82, correctStreak: 3, intervalDays: 7, recentMisses: 0,
  }), 'secure', 'boundary conditions met');
});

test('U6: consolidating — strength + streak secured but intervalDays < 7 (heavy same-week practice)', () => {
  // The canonical case from the plan: attempts=100, correctStreak=10, strength=0.95, intervalDays=3
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 100, strength: 0.95, correctStreak: 10, intervalDays: 3, recentMisses: 0,
  }), 'consolidating');
  // Also triggers just below the 7-day gate
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 20, strength: 0.9, correctStreak: 4, intervalDays: 6.9, recentMisses: 0,
  }), 'consolidating');
});

test('U6: building — everything else (moderate strength, evidence building up)', () => {
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 4, strength: 0.55, correctStreak: 1, intervalDays: 1, recentMisses: 0,
  }), 'building');
  assert.equal(deriveGrammarConfidence({
    status: 'learning', attempts: 6, strength: 0.7, correctStreak: 2, intervalDays: 3, recentMisses: 0,
  }), 'building');
});

test('U6: precedence — emerging beats needs-repair when attempts <= 2', () => {
  // If a concept has only 2 attempts both wrong, attempts<=2 rule runs first
  // so the label is 'emerging' not 'needs-repair' — thin evidence is the
  // more informative signal for a learner with so few attempts.
  assert.equal(deriveGrammarConfidence({
    status: 'weak', attempts: 2, strength: 0.15, correctStreak: 0, intervalDays: 0, recentMisses: 2,
  }), 'emerging');
});

test('U6: precedence — needs-repair beats secure when 2+ recent misses present', () => {
  // A concept that once met secure thresholds but has recent-miss signal
  // should surface as needs-repair so the learner is nudged back to it.
  assert.equal(deriveGrammarConfidence({
    status: 'secured', attempts: 20, strength: 0.9, correctStreak: 4, intervalDays: 10, recentMisses: 2,
  }), 'needs-repair');
});

test('U6: malformed inputs fall back to emerging without throwing', () => {
  assert.doesNotThrow(() => deriveGrammarConfidence(null));
  assert.doesNotThrow(() => deriveGrammarConfidence({}));
  assert.doesNotThrow(() => deriveGrammarConfidence(undefined));
  assert.equal(deriveGrammarConfidence(null), 'emerging');
  assert.equal(deriveGrammarConfidence({}), 'emerging');
  assert.equal(deriveGrammarConfidence({ attempts: 'garbage', strength: NaN }), 'emerging');
});
