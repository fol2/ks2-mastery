/**
 * Grammar QG P11 U2 — Semantic Target-Sentence Extraction
 *
 * Validates that the semantic resolver correctly identifies the target sentence
 * from paragraph blocks, replacing the broken "first <strong> wins" heuristic
 * that would pick grammar labels like "adverbs" or "subject" instead of the
 * actual sentence.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateQuestion(templateId, seed = 1) {
  return createGrammarQuestion({ templateId, seed });
}

// ---------------------------------------------------------------------------
// 1. identify_words_in_sentence: targetText must be the real sentence
// ---------------------------------------------------------------------------

describe('P11 U2: identify_words_in_sentence — focusCue.targetText is a real sentence', () => {
  it('seed 1: targetText is a real sentence, NOT "adverbs" or similar label', () => {
    const q = generateQuestion('identify_words_in_sentence', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    // Must NOT be a grammar label
    assert.ok(
      !/^(adverbs?|determiners?|pronouns?|conjunctions?|nouns?|verbs?|adjectives?)$/i.test(q.focusCue.targetText),
      `targetText must not be a grammar label, got "${q.focusCue.targetText}"`
    );
    // Must be a real sentence (16+ chars with whitespace)
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be >= 16 chars (a real sentence), got ${q.focusCue.targetText.length} chars: "${q.focusCue.targetText}"`
    );
    assert.ok(
      /\s/.test(q.focusCue.targetText),
      `targetText must contain whitespace (multi-word sentence), got "${q.focusCue.targetText}"`
    );
  });

  it('seed 7: target sentence contains real content (e.g. a name or action)', () => {
    const q = generateQuestion('identify_words_in_sentence', 7);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence, got "${q.focusCue.targetText}"`
    );
    assert.ok(
      /\s/.test(q.focusCue.targetText),
      `targetText must contain whitespace, got "${q.focusCue.targetText}"`
    );
    // Must not be a grammar label
    assert.ok(
      !/^(adverbs?|determiners?|pronouns?|conjunctions?|nouns?|verbs?|adjectives?)$/i.test(q.focusCue.targetText),
      `targetText must not be a grammar label, got "${q.focusCue.targetText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. subject_object_choice: targetText must be a real sentence
// ---------------------------------------------------------------------------

describe('P11 U2: subject_object_choice — focusCue.targetText is a real sentence', () => {
  it('seed 1: targetText is a real sentence, NOT "object" or "subject"', () => {
    const q = generateQuestion('subject_object_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    assert.ok(
      !/^(subject|object)$/i.test(q.focusCue.targetText),
      `targetText must not be "subject" or "object", got "${q.focusCue.targetText}"`
    );
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence (>= 16 chars), got "${q.focusCue.targetText}"`
    );
  });

  it('seed 2: targetText is a real sentence', () => {
    const q = generateQuestion('subject_object_choice', 2);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    assert.ok(
      !/^(subject|object)$/i.test(q.focusCue.targetText),
      `targetText must not be "subject" or "object", got "${q.focusCue.targetText}"`
    );
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence, got "${q.focusCue.targetText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 3. subordinate_clause_choice: target sentence is present and spoken
// ---------------------------------------------------------------------------

describe('P11 U2: subordinate_clause_choice — target sentence is present', () => {
  it('seed 1: focusCue.targetText is a real sentence and readAloudText mentions it', () => {
    const q = generateQuestion('subordinate_clause_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence, got "${q.focusCue.targetText}"`
    );
    // readAloudText must include the target sentence
    assert.ok(q.readAloudText, 'readAloudText must be present');
    assert.ok(
      q.readAloudText.includes(q.focusCue.targetText),
      `readAloudText must include the target sentence "${q.focusCue.targetText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. proc_semicolon_choice: target sentence contains ___
// ---------------------------------------------------------------------------

describe('P11 U2: proc_semicolon_choice — target sentence contains gap marker', () => {
  it('seed 1: targetText contains "___"', () => {
    const q = generateQuestion('proc_semicolon_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'target-sentence');
    assert.ok(
      q.focusCue.targetText.includes('___'),
      `targetText must contain "___" gap marker, got "${q.focusCue.targetText}"`
    );
    assert.ok(
      q.focusCue.targetText.length >= 16,
      `targetText must be a real sentence, got "${q.focusCue.targetText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases: isSentenceCueCandidate filtering
// ---------------------------------------------------------------------------

describe('P11 U2: isSentenceCueCandidate — edge case filtering', () => {
  // We test via the generated questions that bad values are rejected

  it('rejects grammar labels: "adverbs" cannot appear as targetText', () => {
    // Generate several seeds to ensure no regression
    for (let seed = 1; seed <= 10; seed++) {
      const q = generateQuestion('identify_words_in_sentence', seed);
      if (q.focusCue) {
        assert.ok(
          !/^(adverbs?|determiners?|pronouns?|conjunctions?|nouns?|verbs?|adjectives?)$/i.test(q.focusCue.targetText),
          `seed ${seed}: targetText must not be a grammar label, got "${q.focusCue.targetText}"`
        );
      }
    }
  });

  it('rejects text shorter than 16 characters', () => {
    // subject_object_choice uses "subject" or "object" in first <strong>
    // which are both < 16 chars — the resolver must skip them
    for (let seed = 1; seed <= 5; seed++) {
      const q = generateQuestion('subject_object_choice', seed);
      if (q.focusCue) {
        assert.ok(
          q.focusCue.targetText.length >= 16,
          `seed ${seed}: targetText must be >= 16 chars, got ${q.focusCue.targetText.length}: "${q.focusCue.targetText}"`
        );
      }
    }
  });

  it('accepts 16+ char text with whitespace and punctuation', () => {
    // subordinate_clause_choice always has a real sentence with punctuation
    for (let seed = 1; seed <= 5; seed++) {
      const q = generateQuestion('subordinate_clause_choice', seed);
      assert.ok(q.focusCue, `seed ${seed}: focusCue must be present`);
      const t = q.focusCue.targetText;
      assert.ok(t.length >= 16, `seed ${seed}: must be >= 16 chars`);
      assert.ok(/\s/.test(t), `seed ${seed}: must contain whitespace`);
      assert.ok(/[.!?]/.test(t) || t.includes('___'), `seed ${seed}: must contain punctuation or gap`);
    }
  });
});
