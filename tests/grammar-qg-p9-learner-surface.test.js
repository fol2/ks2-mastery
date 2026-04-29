/**
 * Grammar QG P9 — Learner-visible Prompt Cue Contract
 *
 * Structural checks proving that templates with visual-cue language
 * (underlined, bold, sentence below) produce structured prompt metadata
 * for safe client-side rendering without dangerouslySetInnerHTML.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGrammarQuestion,
  serialiseGrammarQuestion,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateQuestion(templateId, seed = 1) {
  return createGrammarQuestion({ templateId, seed });
}

function serialiseQuestion(templateId, seed = 1) {
  const q = generateQuestion(templateId, seed);
  return q ? serialiseGrammarQuestion(q) : null;
}

// ---------------------------------------------------------------------------
// 1. word_class_underlined_choice has focusCue with type 'underline'
// ---------------------------------------------------------------------------

describe('P9 prompt cue: word_class_underlined_choice', () => {
  it('question has focusCue with type underline', () => {
    const q = generateQuestion('word_class_underlined_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'underline');
    assert.ok(q.focusCue.text.length > 0, 'focusCue.text must be non-empty');
  });

  it('question has promptParts array', () => {
    const q = generateQuestion('word_class_underlined_choice', 2);
    assert.ok(q, 'question must be generated');
    assert.ok(Array.isArray(q.promptParts), 'promptParts must be an array');
    assert.ok(q.promptParts.length > 0, 'promptParts must not be empty');
    // Must contain an underline part matching the focusCue word
    const underlinePart = q.promptParts.find(p => p.kind === 'underline');
    assert.ok(underlinePart, 'must have an underline part');
    assert.strictEqual(underlinePart.text, q.focusCue.text);
  });

  it('screenReaderPromptText mentions the target word', () => {
    const q = generateQuestion('word_class_underlined_choice', 3);
    assert.ok(q, 'question must be generated');
    assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must exist');
    assert.ok(
      q.screenReaderPromptText.includes(q.focusCue.text),
      `screenReaderPromptText must mention '${q.focusCue.text}'`
    );
    assert.ok(
      q.screenReaderPromptText.includes('Target word:'),
      'screenReaderPromptText must include "Target word:" prefix'
    );
  });

  it('readAloudText includes the cue context', () => {
    const q = generateQuestion('word_class_underlined_choice', 4);
    assert.ok(q, 'question must be generated');
    assert.ok(q.readAloudText, 'readAloudText must exist');
    assert.ok(
      q.readAloudText.includes(q.focusCue.text),
      'readAloudText must mention the underlined word'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Serialised question includes promptParts when present
// ---------------------------------------------------------------------------

describe('P9 prompt cue: serialisation includes structured fields', () => {
  it('serialised word_class_underlined_choice includes promptParts', () => {
    const s = serialiseQuestion('word_class_underlined_choice', 1);
    assert.ok(s, 'serialised question must exist');
    assert.ok(Array.isArray(s.promptParts), 'promptParts must be in serialised output');
    assert.ok(s.focusCue, 'focusCue must be in serialised output');
    assert.strictEqual(s.focusCue.type, 'underline');
    assert.ok(s.screenReaderPromptText, 'screenReaderPromptText must be in serialised output');
    assert.ok(s.readAloudText, 'readAloudText must be in serialised output');
  });

  it('serialised question still has promptText (backwards compat)', () => {
    const s = serialiseQuestion('word_class_underlined_choice', 2);
    assert.ok(s, 'serialised question must exist');
    assert.ok(s.promptText, 'promptText must still be present');
    assert.ok(s.promptText.length > 0, 'promptText must be non-empty');
  });

  it('contentReleaseId reflects P9', () => {
    const s = serialiseQuestion('word_class_underlined_choice', 1);
    assert.ok(s, 'serialised question must exist');
    assert.strictEqual(s.contentReleaseId, 'grammar-qg-p9-2026-04-29');
    assert.strictEqual(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p9-2026-04-29');
  });
});

// ---------------------------------------------------------------------------
// 3. Questions WITHOUT visual cues still have promptText, no promptParts
// ---------------------------------------------------------------------------

describe('P9 prompt cue: backwards compat for non-cue templates', () => {
  // Find a template that does NOT use underlined/bold/sentence-below in its prompt
  const nonCueTemplate = GRAMMAR_TEMPLATE_METADATA.find(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    return q && !q.promptParts;
  });

  it('non-cue template exists in corpus', () => {
    assert.ok(nonCueTemplate, 'at least one template must lack promptParts');
  });

  it('non-cue template has promptText in serialised output', () => {
    if (!nonCueTemplate) return;
    const s = serialiseQuestion(nonCueTemplate.id, 1);
    assert.ok(s, 'serialised question must exist');
    assert.ok(s.promptText, 'promptText must still be present');
    assert.strictEqual(s.promptParts, undefined, 'promptParts must be absent');
    assert.strictEqual(s.focusCue, undefined, 'focusCue must be absent');
  });
});

// ---------------------------------------------------------------------------
// 4. Prompt containing "underlined" has corresponding focusCue or promptParts
// ---------------------------------------------------------------------------

describe('P9 prompt cue: all "underlined" prompts get enriched', () => {
  const underlinedTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    if (!q) return false;
    const plain = String(q.stemHtml || '');
    return /underlined/i.test(plain);
  });

  it('at least word_class_underlined_choice is in the set', () => {
    const ids = underlinedTemplates.map(t => t.id);
    assert.ok(ids.includes('word_class_underlined_choice'));
  });

  for (const template of underlinedTemplates) {
    it(`${template.id} has focusCue or promptParts when "underlined" in stemHtml`, () => {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      assert.ok(q, 'question must be generated');
      const hasCue = q.focusCue || q.promptParts;
      assert.ok(hasCue, `Template ${template.id} mentions "underlined" but lacks prompt cue data`);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Serialised question does NOT leak answerSpec
// ---------------------------------------------------------------------------

describe('P9 prompt cue: no answer leaks in serialised output', () => {
  const BANNED_KEYS = ['evaluate', 'golden', 'nearMiss', 'accepted', 'answerSpec', 'correct'];

  for (const template of GRAMMAR_TEMPLATE_METADATA.slice(0, 10)) {
    it(`${template.id}: serialised output has no answer-leaking keys`, () => {
      const s = serialiseQuestion(template.id, 1);
      if (!s) return; // skip templates that fail to generate
      for (const banned of BANNED_KEYS) {
        assert.ok(
          !(banned in s),
          `serialised output contains banned key '${banned}'`
        );
      }
      // Also check promptParts / focusCue don't contain answer data
      if (s.promptParts) {
        for (const part of s.promptParts) {
          assert.ok(
            !('correct' in part) && !('golden' in part),
            'promptParts must not contain answer data'
          );
        }
      }
      if (s.focusCue) {
        assert.ok(
          !('correct' in s.focusCue) && !('golden' in s.focusCue),
          'focusCue must not contain answer data'
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6. screenReaderPromptText mentions target word when focusCue exists
// ---------------------------------------------------------------------------

describe('P9 prompt cue: screenReaderPromptText mentions target', () => {
  const cueTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    return q && q.focusCue;
  });

  it('at least one template has focusCue', () => {
    assert.ok(cueTemplates.length > 0, 'no templates produced focusCue');
  });

  for (const template of cueTemplates) {
    it(`${template.id}: screenReaderPromptText mentions focusCue.text`, () => {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must exist');
      assert.ok(
        q.screenReaderPromptText.includes(q.focusCue.text),
        `screenReaderPromptText must mention '${q.focusCue.text}'`
      );
    });
  }
});
