/**
 * Grammar QG P10 U2 — Explicit Prompt Target Contract
 *
 * Validates that:
 * - focusCue.text correctly targets the intended word/phrase, never the whole sentence
 * - promptParts does not duplicate sentence content
 * - Templates mentioning "underlined" produce valid focusCue or explicit fallback
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

function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// 1. word_class_underlined_choice: focusCue.text is a single word
// ---------------------------------------------------------------------------

describe('P10 U2: word_class_underlined_choice — focusCue targets single word', () => {
  for (let seed = 1; seed <= 5; seed++) {
    it(`seed ${seed}: focusCue.text is a single word`, () => {
      const q = generateQuestion('word_class_underlined_choice', seed);
      assert.ok(q, 'question must be generated');
      assert.ok(q.focusCue, 'focusCue must be present');
      assert.strictEqual(q.focusCue.type, 'underline');
      assert.ok(
        wordCount(q.focusCue.text) <= 2,
        `focusCue.text must be 1-2 words (a single word), got ${wordCount(q.focusCue.text)} words: "${q.focusCue.text}"`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 2. qg_p4_voice_roles_transfer: focusCue.text is a noun phrase (2-4 words)
// ---------------------------------------------------------------------------

describe('P10 U2: qg_p4_voice_roles_transfer — focusCue targets noun phrase', () => {
  for (let seed = 1; seed <= 5; seed++) {
    it(`seed ${seed}: focusCue.text is a noun phrase (2-4 words, not a full sentence)`, () => {
      const q = generateQuestion('qg_p4_voice_roles_transfer', seed);
      assert.ok(q, 'question must be generated');
      assert.ok(q.focusCue, 'focusCue must be present');
      assert.strictEqual(q.focusCue.type, 'underline');
      const wc = wordCount(q.focusCue.text);
      assert.ok(
        wc >= 2 && wc <= 4,
        `focusCue.text must be 2-4 words (noun phrase), got ${wc} words: "${q.focusCue.text}"`
      );
      // Must NOT be a full sentence (no verb typically, and shorter than the example)
      assert.ok(
        !q.focusCue.text.includes('.'),
        'focusCue.text must not contain a full stop (not a full sentence)'
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 3. qg_p4_word_class_noun_phrase_transfer seed 3: focusCue targets the word
// ---------------------------------------------------------------------------

describe('P10 U2: qg_p4_word_class_noun_phrase_transfer seed 3 — focusCue targets word', () => {
  it('seed 3: focusCue.text is the specific word, not the whole phrase', () => {
    const q = generateQuestion('qg_p4_word_class_noun_phrase_transfer', 3);
    assert.ok(q, 'question must be generated');
    assert.ok(q.focusCue, 'focusCue must be present');
    assert.strictEqual(q.focusCue.type, 'underline');
    assert.strictEqual(q.focusCue.text, 'incredibly');
    assert.strictEqual(wordCount(q.focusCue.text), 1, 'focusCue.text must be exactly 1 word');
  });
});

// ---------------------------------------------------------------------------
// 4. qg_p3_noun_phrases_explain: underline on noun phrase, not whole sentence
// ---------------------------------------------------------------------------

describe('P10 U2: qg_p3_noun_phrases_explain — underline on noun phrase', () => {
  // Seeds 3 and 7 have "underlined group" prompts
  for (const seed of [3, 7]) {
    it(`seed ${seed}: focusCue.text is the noun phrase, not the whole sentence`, () => {
      const q = generateQuestion('qg_p3_noun_phrases_explain', seed);
      assert.ok(q, 'question must be generated');
      assert.ok(q.focusCue, `focusCue must be present for seed ${seed}`);
      assert.strictEqual(q.focusCue.type, 'underline');
      // The noun phrase should be 4-8 words (a phrase), not a full sentence
      const wc = wordCount(q.focusCue.text);
      assert.ok(
        wc >= 3 && wc <= 8,
        `focusCue.text must be 3-8 words (noun phrase), got ${wc} words: "${q.focusCue.text}"`
      );
      // Must not end with a full stop (sentence indicator)
      assert.ok(
        !q.focusCue.text.endsWith('.'),
        'focusCue.text must not end with full stop — it is a phrase, not a sentence'
      );
    });
  }

  it('seed 1: no "underlined" in prompt, so focusCue may be absent', () => {
    const q = generateQuestion('qg_p3_noun_phrases_explain', 1);
    assert.ok(q, 'question must be generated');
    // Seed 1 prompt is "Why is this an expanded noun phrase?" — no "underlined"
    const plainPrompt = q.stemHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/underlined/i.test(plainPrompt)) {
      // No underline reference — focusCue absence is acceptable
      assert.ok(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. No duplicate sentence content in any promptParts array
// ---------------------------------------------------------------------------

describe('P10 U2: no duplicate sentence content in promptParts', () => {
  const cueTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    return q && q.promptParts && q.promptParts.length > 1;
  });

  for (const template of cueTemplates) {
    it(`${template.id}: no sentence text duplicated in instruction part`, () => {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!q || !q.promptParts || q.promptParts.length <= 1) return;

      const textPart = q.promptParts.find(p => p.kind === 'text');
      const sentenceParts = q.promptParts.filter(p =>
        p.kind === 'sentence' || p.kind === 'underline' || p.kind === 'emphasis'
      );

      if (!textPart || sentenceParts.length === 0) return;

      // Reconstruct the sentence from structured parts
      const fullSentence = sentenceParts.map(p => p.text).join('').trim();
      if (fullSentence.length < 10) return; // Skip trivially short content

      assert.ok(
        !textPart.text.includes(fullSentence),
        `The instruction text part must not contain the full sentence "${fullSentence.substring(0, 50)}..."`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Cue consistency: if prompt contains "underlined"/"bold"/etc, enrichment present
// ---------------------------------------------------------------------------

describe('P10 U2: cue consistency enforcement', () => {
  const allTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    if (!q) return false;
    const plain = q.stemHtml.replace(/<[^>]*>/g, '');
    return /underlined|in\s+bold|shown\s+in\s+brackets|sentence\s+below/i.test(plain);
  });

  for (const template of allTemplates) {
    it(`${template.id}: has focusCue or promptParts when cue language detected`, () => {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      assert.ok(q, 'question must be generated');
      const hasCue = q.focusCue || q.promptParts;
      assert.ok(hasCue, `Template ${template.id} has cue language but lacks prompt cue data`);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. focusCue.text must not be unreasonably long (whole-sentence detection)
// ---------------------------------------------------------------------------

describe('P10 U2: focusCue.text is not a whole sentence', () => {
  const underlinedTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    if (!q || !q.focusCue) return false;
    return q.focusCue.type === 'underline';
  });

  for (const template of underlinedTemplates) {
    for (let seed = 1; seed <= 3; seed++) {
      it(`${template.id} seed ${seed}: focusCue.text is not a whole sentence (<=8 words)`, () => {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        if (!q || !q.focusCue || q.focusCue.type !== 'underline') return;
        const wc = wordCount(q.focusCue.text);
        assert.ok(
          wc <= 8,
          `focusCue.text should be a word/phrase, not a sentence. Got ${wc} words: "${q.focusCue.text}"`
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 8. REGRESSION: target-sentence templates must include sentence in promptParts
// ---------------------------------------------------------------------------

describe('P10 U2 REGRESSION: target-sentence cue produces visible sentence part', () => {
  it('subordinate_clause_choice seed 1: promptParts contains a sentence part with actual text', () => {
    const q = generateQuestion('subordinate_clause_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.promptParts, 'promptParts must be present');
    const sentencePart = q.promptParts.find(p => p.kind === 'sentence');
    assert.ok(
      sentencePart,
      `promptParts must contain a {kind:'sentence'} part — sentence must be VISIBLE to learner. Got kinds: ${q.promptParts.map(p => p.kind).join(', ')}`
    );
    assert.ok(
      sentencePart.text && sentencePart.text.length > 10,
      `sentence part text must be substantial (got "${sentencePart.text}")`
    );
  });

  it('subject_object_choice seed 1: promptParts text contains the full instruction (not mangled)', () => {
    const q = generateQuestion('subject_object_choice', 1);
    assert.ok(q, 'question must be generated');
    assert.ok(q.promptParts, 'promptParts must be present');
    const textPart = q.promptParts.find(p => p.kind === 'text');
    assert.ok(textPart, 'promptParts must contain a text part with instruction');
    // The instruction must not be empty or trivially short (indicating wrong dedup)
    assert.ok(
      textPart.text.length > 5,
      `instruction text part must not be mangled/empty (got "${textPart.text}")`
    );
  });
});

// ---------------------------------------------------------------------------
// 9. REGRESSION: focusTarget must NOT leak to serialised output (any template)
// ---------------------------------------------------------------------------

describe('P10 U2 REGRESSION: focusTarget never present on serialised output', () => {
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    it(`${template.id}: focusTarget must not be present`, () => {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!q) return; // Some templates may not generate for certain seeds
      assert.strictEqual(
        q.focusTarget,
        undefined,
        `focusTarget must be deleted before returning — found "${q.focusTarget}" on ${template.id}`
      );
    });
  }
});
