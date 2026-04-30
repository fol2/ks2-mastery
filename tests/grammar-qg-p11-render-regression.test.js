/**
 * Grammar QG P11 U5 — Render Regression Tests
 *
 * Pins specific template+seed combos that demonstrate each P10 bug class:
 * 1. target-sentence resolving to grammar labels instead of real sentences
 * 2. noun-phrase announced as "word" in read-aloud
 * 3. double terminal punctuation in read-aloud
 *
 * Also verifies the semantic audit itself passes programmatically.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

import { runSemanticAudit } from '../scripts/audit-grammar-prompt-cues-semantic.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateQuestion(templateId, seed = 1) {
  return createGrammarQuestion({ templateId, seed });
}

// ---------------------------------------------------------------------------
// 1. identify_words_in_sentence seed 1: visible prompt includes full sentence
// ---------------------------------------------------------------------------

describe('P11 U5 regression: identify_words_in_sentence seed 1 — full sentence in prompt', () => {
  it('visible prompt includes a full sentence (not a grammar label)', () => {
    const q = generateQuestion('identify_words_in_sentence', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    // The target text must be a real sentence
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText is a real sentence, not a grammar label. Got: "${q.focusCue.targetText}"`
    );
    assert.ok(
      /\s/.test(q.focusCue.targetText),
      `targetText contains whitespace (multi-word), got: "${q.focusCue.targetText}"`
    );
  });

  it('screen reader names the full sentence', () => {
    const q = generateQuestion('identify_words_in_sentence', 1);
    assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must be present');
    // Must include the target sentence
    assert.ok(
      q.screenReaderPromptText.includes(q.focusCue.targetText),
      `screenReaderPromptText must include the full sentence "${q.focusCue.targetText}"`
    );
    // Must NOT announce a bare grammar label as the sentence
    assert.doesNotMatch(
      q.screenReaderPromptText,
      /The sentence is:\s*(adverbs?|determiners?|pronouns?|conjunctions?|subject|object)\s*\.?$/i,
      'screenReaderPromptText must not announce a grammar label as the sentence'
    );
  });

  it('read aloud names the full sentence', () => {
    const q = generateQuestion('identify_words_in_sentence', 1);
    assert.ok(q.readAloudText, 'readAloudText must be present');
    assert.ok(
      q.readAloudText.includes(q.focusCue.targetText),
      `readAloudText must include the full sentence "${q.focusCue.targetText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. subject_object_choice seed 1/2: never use "subject"/"object" as targetText
// ---------------------------------------------------------------------------

describe('P11 U5 regression: subject_object_choice — never grammar labels as target', () => {
  it('seed 1: targetText is NOT "subject" or "object"', () => {
    const q = generateQuestion('subject_object_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.ok(
      !/^(subject|object)$/i.test(q.focusCue.targetText),
      `targetText must not be "subject" or "object", got "${q.focusCue.targetText}"`
    );
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence (>= 16 chars), got: "${q.focusCue.targetText}"`
    );
  });

  it('seed 2: targetText is NOT "subject" or "object"', () => {
    const q = generateQuestion('subject_object_choice', 2);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.ok(
      !/^(subject|object)$/i.test(q.focusCue.targetText),
      `targetText must not be "subject" or "object", got "${q.focusCue.targetText}"`
    );
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence, got: "${q.focusCue.targetText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 3. qg_p4_voice_roles_transfer seed 1: targetKind is noun-phrase, speaks "noun phrase"
// ---------------------------------------------------------------------------

describe('P11 U5 regression: qg_p4_voice_roles_transfer — noun-phrase spoken correctly', () => {
  it('seed 1: targetKind is noun-phrase', () => {
    const q = generateQuestion('qg_p4_voice_roles_transfer', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.targetKind, 'noun-phrase');
  });

  it('seed 1: readAloudText speaks "noun phrase" (NOT "word")', () => {
    const q = generateQuestion('qg_p4_voice_roles_transfer', 1);
    assert.ok(q.readAloudText, 'readAloudText must be present');
    assert.match(
      q.readAloudText,
      /noun phrase/i,
      `readAloudText must say "noun phrase", got: "${q.readAloudText}"`
    );
    assert.doesNotMatch(
      q.readAloudText,
      /\bunderlined\s+word\b/i,
      `readAloudText must NOT say "underlined word" for a noun-phrase target`
    );
  });

  it('seed 1: screenReaderPromptText speaks "noun phrase"', () => {
    const q = generateQuestion('qg_p4_voice_roles_transfer', 1);
    assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must be present');
    assert.match(
      q.screenReaderPromptText,
      /noun phrase/i,
      `screenReaderPromptText must say "noun phrase", got: "${q.screenReaderPromptText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. All sentence-target templates: read-aloud avoids duplicated terminal punctuation
// ---------------------------------------------------------------------------

describe('P11 U5 regression: sentence-target templates — no double punctuation', () => {
  const sentenceTargetTemplates = [
    'identify_words_in_sentence',
    'build_noun_phrase',
    'subordinate_clause_choice',
    'subject_object_choice',
    'parenthesis_replace_choice',
    'proc_semicolon_choice',
  ];

  for (const templateId of sentenceTargetTemplates) {
    for (let seed = 1; seed <= 5; seed++) {
      it(`${templateId} seed ${seed}: readAloudText has no duplicated terminal punctuation`, () => {
        const q = generateQuestion(templateId, seed);
        if (!q || !q.readAloudText) return;
        assert.doesNotMatch(
          q.readAloudText,
          /[.!?]{2,}$/,
          `readAloudText ends with double punctuation for ${templateId} seed ${seed}: "${q.readAloudText.slice(-40)}"`
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Sweeping assertion: all 78 templates x seeds 1..5, no double punctuation
// ---------------------------------------------------------------------------

describe('P11 U5 regression sweep: all 78 templates x seeds 1..5 — no double terminal punctuation', () => {
  for (const tmpl of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = 1; seed <= 5; seed++) {
      it(`${tmpl.id} seed ${seed}: readAloudText no double punctuation`, () => {
        const q = generateQuestion(tmpl.id, seed);
        if (!q || !q.readAloudText) return;
        assert.doesNotMatch(
          q.readAloudText,
          /[.!?]{2,}$/,
          `readAloudText must not end with double punctuation for ${tmpl.id} seed ${seed}, got: "${q.readAloudText.slice(-40)}"`
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. Semantic audit passes programmatically
// ---------------------------------------------------------------------------

describe('P11 U5: semantic audit passes with zero findings', () => {
  it('runSemanticAudit({seedStart: 1, seedEnd: 5}) returns passed: true', () => {
    const result = runSemanticAudit({ seedStart: 1, seedEnd: 5 });
    assert.strictEqual(result.passed, true, `Semantic audit must pass, got ${result.findings.length} findings`);
    assert.strictEqual(result.findings.length, 0, 'Must have zero findings');
    assert.ok(result.totalChecked > 0, 'Must have checked at least one question');
  });

  it('runSemanticAudit({seedStart: 1, seedEnd: 30}) returns passed: true', () => {
    const result = runSemanticAudit({ seedStart: 1, seedEnd: 30 });
    assert.strictEqual(result.passed, true, `Semantic audit must pass, got ${result.findings.length} findings`);
    assert.strictEqual(result.findings.length, 0, 'Must have zero findings');
  });
});
