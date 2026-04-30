/**
 * Grammar QG P11 U3 — Cue-Kind Accessibility Copy
 *
 * Validates that:
 * - focusCue.targetKind is set correctly (noun-phrase, word, sentence, group, pair)
 * - screenReaderPromptText uses kind-appropriate phrasing
 * - readAloudText uses kind-appropriate phrasing
 * - No double punctuation (e.g. `..` or `!!`) at end of readAloudText
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateQuestion(templateId, seed = 1) {
  return createGrammarQuestion({ templateId, seed });
}

// ---------------------------------------------------------------------------
// 1. qg_p4_voice_roles_transfer: targetKind is 'noun-phrase'
// ---------------------------------------------------------------------------

describe('P11 U3: qg_p4_voice_roles_transfer — targetKind is noun-phrase', () => {
  it('seed 1: focusCue.targetKind is noun-phrase', () => {
    const q = generateQuestion('qg_p4_voice_roles_transfer', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.targetKind, 'noun-phrase');
  });

  it('seed 1: readAloudText says "The underlined noun phrase is:" (NOT "word")', () => {
    const q = generateQuestion('qg_p4_voice_roles_transfer', 1);
    assert.ok(q.readAloudText, 'readAloudText must be present');
    assert.match(
      q.readAloudText,
      /The underlined noun phrase is:/,
      `readAloudText must use noun-phrase phrasing, got: "${q.readAloudText}"`
    );
    assert.doesNotMatch(
      q.readAloudText,
      /The underlined word is:/,
      'readAloudText must NOT say "underlined word" for a noun phrase'
    );
  });

  it('seed 1: screenReaderPromptText says "The underlined noun phrase is:"', () => {
    const q = generateQuestion('qg_p4_voice_roles_transfer', 1);
    assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must be present');
    assert.match(
      q.screenReaderPromptText,
      /The underlined noun phrase is:/,
      `screenReaderPromptText must use noun-phrase phrasing, got: "${q.screenReaderPromptText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 2. word_class_underlined_choice: targetKind is 'word'
// ---------------------------------------------------------------------------

describe('P11 U3: word_class_underlined_choice — targetKind is word', () => {
  it('seed 1: focusCue.targetKind is word', () => {
    const q = generateQuestion('word_class_underlined_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.targetKind, 'word');
  });

  it('seed 1: readAloudText says "The underlined word is:"', () => {
    const q = generateQuestion('word_class_underlined_choice', 1);
    assert.ok(q.readAloudText, 'readAloudText must be present');
    assert.match(
      q.readAloudText,
      /The underlined word is:/,
      `readAloudText must use word phrasing, got: "${q.readAloudText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 3. identify_words_in_sentence: targetKind is 'sentence'
// ---------------------------------------------------------------------------

describe('P11 U3: identify_words_in_sentence — targetKind is sentence', () => {
  it('seed 1: focusCue.targetKind is sentence', () => {
    const q = generateQuestion('identify_words_in_sentence', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.targetKind, 'sentence');
  });

  it('seed 1: readAloudText says "The sentence is:" with single full stop (no "..")', () => {
    const q = generateQuestion('identify_words_in_sentence', 1);
    assert.ok(q.readAloudText, 'readAloudText must be present');
    assert.match(
      q.readAloudText,
      /The sentence is:/,
      `readAloudText must use sentence phrasing, got: "${q.readAloudText}"`
    );
    assert.doesNotMatch(
      q.readAloudText,
      /[.!?]{2,}$/,
      `readAloudText must not end with double punctuation, got: "${q.readAloudText}"`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Sentence ending in '!': no extra '.' appended
// ---------------------------------------------------------------------------

describe('P11 U3: conditional punctuation — no dot after exclamation', () => {
  // Test across seeds for identify_words_in_sentence to find one ending in ! or .
  for (let seed = 1; seed <= 20; seed++) {
    it(`seed ${seed}: readAloudText never ends with double punctuation`, () => {
      const q = generateQuestion('identify_words_in_sentence', seed);
      if (!q || !q.readAloudText) return; // skip if no readAloudText
      assert.doesNotMatch(
        q.readAloudText,
        /[.!?]{2,}$/,
        `readAloudText must not end with double punctuation, got: "${q.readAloudText}"`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 5. parenthesis_replace_choice / proc_semicolon_choice: no double punctuation
// ---------------------------------------------------------------------------

describe('P11 U3: parenthesis_replace_choice — no double punctuation', () => {
  for (let seed = 1; seed <= 5; seed++) {
    it(`seed ${seed}: readAloudText has no double punctuation`, () => {
      const q = generateQuestion('parenthesis_replace_choice', seed);
      if (!q || !q.readAloudText) return;
      assert.doesNotMatch(
        q.readAloudText,
        /[.!?]{2,}/,
        `readAloudText must not contain double punctuation, got: "${q.readAloudText}"`
      );
    });
  }
});

describe('P11 U3: proc_semicolon_choice — no double punctuation', () => {
  for (let seed = 1; seed <= 5; seed++) {
    it(`seed ${seed}: readAloudText has no double punctuation`, () => {
      const q = generateQuestion('proc_semicolon_choice', seed);
      if (!q || !q.readAloudText) return;
      assert.doesNotMatch(
        q.readAloudText,
        /[.!?]{2,}/,
        `readAloudText must not contain double punctuation, got: "${q.readAloudText}"`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Sweeping test: all 78 templates x seeds 1..5 — no double punctuation
// ---------------------------------------------------------------------------

describe('P11 U3: sweep all templates — no readAloudText ends with double punctuation', () => {
  const templates = GRAMMAR_TEMPLATE_METADATA;
  for (const tmpl of templates) {
    for (let seed = 1; seed <= 5; seed++) {
      it(`${tmpl.id} seed ${seed}: no double punctuation in readAloudText`, () => {
        const q = generateQuestion(tmpl.id, seed);
        if (!q || !q.readAloudText) return; // skip templates without readAloudText
        assert.doesNotMatch(
          q.readAloudText,
          /[.!?]{2,}$/,
          `readAloudText must not end with double punctuation for ${tmpl.id} seed ${seed}, got: "${q.readAloudText}"`
        );
      });
    }
  }
});
