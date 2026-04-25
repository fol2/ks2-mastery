import test from 'node:test';
import assert from 'node:assert/strict';

import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionProgressLabel,
  spellingSessionSubmitLabel,
  spellingSessionVoiceNote,
} from '../src/subjects/spelling/session-ui.js';

// ----- Characterisation: pre-U5 behaviour for Smart / Trouble / SATs ---------

test('spellingSessionSubmitLabel: legacy labels unchanged', () => {
  assert.equal(spellingSessionSubmitLabel(null), 'Submit');
  assert.equal(spellingSessionSubmitLabel(undefined), 'Submit');
  assert.equal(spellingSessionSubmitLabel({ type: 'learning', phase: 'question' }), 'Submit');
  assert.equal(spellingSessionSubmitLabel({ type: 'learning', phase: 'retry' }), 'Try again');
  assert.equal(spellingSessionSubmitLabel({ type: 'learning', phase: 'correction' }), 'Lock it in');
  assert.equal(spellingSessionSubmitLabel({ type: 'test' }), 'Save and next');
  assert.equal(spellingSessionSubmitLabel({ type: 'learning' }, true), 'Saved');
});

test('spellingSessionInputPlaceholder: legacy placeholders unchanged', () => {
  assert.equal(spellingSessionInputPlaceholder(null), 'Type the spelling here');
  assert.equal(spellingSessionInputPlaceholder({ type: 'learning', phase: 'question' }), 'Type the spelling here');
  assert.equal(spellingSessionInputPlaceholder({ type: 'learning', phase: 'retry' }), 'Try once more from memory');
  assert.equal(spellingSessionInputPlaceholder({ type: 'learning', phase: 'correction' }), 'Type the correct spelling once');
  assert.equal(spellingSessionInputPlaceholder({ type: 'test' }), 'Type the spelling and move on');
});

test('spellingSessionContextNote: legacy notes unchanged', () => {
  assert.equal(spellingSessionContextNote(null), 'Family hidden during live recall.');
  assert.equal(spellingSessionContextNote({ type: 'learning' }), 'Family hidden during live recall.');
  assert.equal(
    spellingSessionContextNote({ type: 'test' }),
    'SATs mode uses audio only. Press Replay to hear the dictation again.',
  );
});

test('spellingSessionFooterNote: practice-only wording unchanged (U3 guard)', () => {
  const practice = spellingSessionFooterNote({ type: 'learning', practiceOnly: true });
  assert.match(practice, /Practice-only drill/);
  assert.match(practice, /do not change correct counts/);
});

test('spellingSessionProgressLabel: legacy progress labels unchanged', () => {
  assert.equal(spellingSessionProgressLabel(null), '');
  assert.equal(spellingSessionProgressLabel({ type: 'test' }), 'SATs one-shot');
  assert.equal(spellingSessionProgressLabel({ type: 'learning', practiceOnly: true }), 'Practice only');
  assert.equal(spellingSessionProgressLabel({ type: 'learning', phase: 'question' }), 'Phase: question');
});

test('spellingSessionInfoChips: legacy chip shapes unchanged', () => {
  assert.deepEqual(spellingSessionInfoChips(null), []);
  assert.deepEqual(
    spellingSessionInfoChips({ type: 'learning', currentCard: { word: { yearLabel: 'Y5-6' } } }),
    ['Y5-6'],
  );
  assert.deepEqual(
    spellingSessionInfoChips({ type: 'learning', practiceOnly: true, currentCard: { word: { yearLabel: 'Y3-4' } } }),
    ['Y3-4', 'Practice only'],
  );
  assert.deepEqual(
    spellingSessionInfoChips({ type: 'test', currentCard: { word: { yearLabel: 'Y5-6' } } }),
    ['Y5-6'],
  );
});

test('spellingSessionVoiceNote returns stable AI-dictation copy', () => {
  assert.equal(spellingSessionVoiceNote(), 'AI-generated dictation voice');
});

// ----- U5: Guardian info chip + Guardian context note -------------------------

test('spellingSessionInfoChips: Guardian session appends a "Guardian" chip', () => {
  const session = {
    type: 'learning',
    mode: 'guardian',
    currentCard: { word: { yearLabel: 'Y5-6' } },
  };
  assert.deepEqual(spellingSessionInfoChips(session), ['Y5-6', 'Guardian']);
});

test('spellingSessionInfoChips: Guardian chip survives a missing yearLabel', () => {
  const session = {
    type: 'learning',
    mode: 'guardian',
    currentCard: { word: {} },
  };
  assert.deepEqual(spellingSessionInfoChips(session), ['Guardian']);
});

test('spellingSessionContextNote: Guardian-mode copy is clean-retrieval wording', () => {
  const note = spellingSessionContextNote({ type: 'learning', mode: 'guardian' });
  assert.equal(note, 'Spell the word from memory. One clean attempt.');
});

test('spellingSessionContextNote: Guardian mode must NOT leak SATs copy', () => {
  const note = spellingSessionContextNote({ type: 'learning', mode: 'guardian' });
  assert.doesNotMatch(note, /SATs/);
  assert.doesNotMatch(note, /audio only/);
});

// ----- U5: Boss session-ui strings (pre-U9 definition) ------------------------

test('spellingSessionInfoChips: Boss session appends a "Boss" chip, not "Guardian"', () => {
  const session = {
    type: 'test',
    mode: 'boss',
    currentCard: { word: { yearLabel: 'Y5-6' } },
  };
  const chips = spellingSessionInfoChips(session);
  assert.deepEqual(chips, ['Y5-6', 'Boss']);
  assert.equal(chips.includes('Guardian'), false, 'Boss chip must not co-render a Guardian chip');
});

test('spellingSessionContextNote: Boss mode returns Boss-specific copy, not SATs copy', () => {
  const note = spellingSessionContextNote({ type: 'test', mode: 'boss' });
  assert.doesNotMatch(note, /SATs/, 'Boss context must not leak SATs wording');
  assert.doesNotMatch(note, /audio only/);
  assert.match(note, /Mega/i, 'Boss copy grounds on "Mega words only" framing');
});

test('spellingSessionSubmitLabel: Boss session returns a Boss-specific label (not SATs "Save and next")', () => {
  const label = spellingSessionSubmitLabel({ type: 'test', mode: 'boss' }, false);
  assert.notEqual(label, 'Save and next', 'Boss must not borrow the SATs submit wording');
  assert.equal(typeof label, 'string');
  assert.ok(label.length > 0);
});

test('spellingSessionInputPlaceholder: Boss session returns Boss-specific placeholder (not SATs)', () => {
  const placeholder = spellingSessionInputPlaceholder({ type: 'test', mode: 'boss' });
  assert.notEqual(placeholder, 'Type the spelling and move on', 'Boss must not borrow the SATs placeholder');
  assert.equal(typeof placeholder, 'string');
  assert.ok(placeholder.length > 0);
});

test('spellingSessionProgressLabel: Boss session does NOT return SATs copy', () => {
  const label = spellingSessionProgressLabel({ type: 'test', mode: 'boss' });
  assert.notEqual(label, 'SATs one-shot', 'Boss must not borrow the SATs progress label');
  assert.equal(typeof label, 'string');
  assert.ok(label.length > 0);
});

// ----- U5: SATs remains byte-identical (parity guard) ------------------------

test('SATs Test session-ui helpers unchanged byte-for-byte after U5', () => {
  const sats = {
    type: 'test',
    currentCard: { word: { yearLabel: 'Y5-6' } },
  };
  assert.equal(spellingSessionSubmitLabel(sats), 'Save and next');
  assert.equal(spellingSessionInputPlaceholder(sats), 'Type the spelling and move on');
  assert.equal(spellingSessionContextNote(sats), 'SATs mode uses audio only. Press Replay to hear the dictation again.');
  assert.equal(spellingSessionProgressLabel(sats), 'SATs one-shot');
  assert.deepEqual(spellingSessionInfoChips(sats), ['Y5-6']);
});
