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
  evaluateGrammarQuestion,
  serialiseGrammarQuestion,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import { normaliseSmartPunctuation } from '../worker/src/subjects/grammar/answer-spec.js';

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
    assert.ok(q.focusCue.targetText.length > 0, 'focusCue.targetText must be non-empty');
  });

  it('question has promptParts array', () => {
    const q = generateQuestion('word_class_underlined_choice', 2);
    assert.ok(q, 'question must be generated');
    assert.ok(Array.isArray(q.promptParts), 'promptParts must be an array');
    assert.ok(q.promptParts.length > 0, 'promptParts must not be empty');
    // Must contain an underline part matching the focusCue word
    const underlinePart = q.promptParts.find(p => p.kind === 'underline');
    assert.ok(underlinePart, 'must have an underline part');
    assert.strictEqual(underlinePart.text, q.focusCue.targetText);
  });

  it('screenReaderPromptText mentions the target word', () => {
    const q = generateQuestion('word_class_underlined_choice', 3);
    assert.ok(q, 'question must be generated');
    assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must exist');
    assert.ok(
      q.screenReaderPromptText.includes(q.focusCue.targetText),
      `screenReaderPromptText must mention '${q.focusCue.targetText}'`
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
      q.readAloudText.includes(q.focusCue.targetText),
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

  it('contentReleaseId matches current code export', () => {
    const s = serialiseQuestion('word_class_underlined_choice', 1);
    assert.ok(s, 'serialised question must exist');
    assert.strictEqual(s.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.match(GRAMMAR_CONTENT_RELEASE_ID, /^grammar-qg-p\d+-\d{4}-\d{2}-\d{2}$/);
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
    it(`${template.id}: screenReaderPromptText mentions focusCue.targetText`, () => {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      assert.ok(q.screenReaderPromptText, 'screenReaderPromptText must exist');
      assert.ok(
        q.screenReaderPromptText.includes(q.focusCue.targetText),
        `screenReaderPromptText must mention '${q.focusCue.targetText}'`
      );
    });
  }
});

// ===========================================================================
// P9 U8 — Render-level input family coverage
// ===========================================================================

// Helper: find a template producing a given inputSpec.type
function findTemplateForType(type) {
  return GRAMMAR_TEMPLATE_METADATA.find(t => {
    const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
    return q && q.inputSpec?.type === type;
  });
}

describe('P9 U8 render-level input family coverage', () => {
  // --- single_choice ---
  describe('single_choice: options rendered as radio buttons', () => {
    const template = findTemplateForType('single_choice');

    it('template exists for single_choice', () => {
      assert.ok(template, 'must have at least one single_choice template');
    });

    it('serialised output has options array with value+label pairs', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.type, 'single_choice');
      assert.ok(Array.isArray(s.inputSpec.options), 'options must be an array');
      assert.ok(s.inputSpec.options.length >= 2, 'must have at least 2 options');
      for (const opt of s.inputSpec.options) {
        assert.ok(typeof opt.label === 'string' && opt.label.length > 0, 'option.label must be non-empty');
        assert.ok(typeof opt.value === 'string' && opt.value.length > 0, 'option.value must be non-empty');
      }
    });

    it('no answer leak in serialised single_choice', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 2);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.correct, undefined);
      assert.strictEqual(s.inputSpec.golden, undefined);
      assert.strictEqual(s.inputSpec.answer, undefined);
    });
  });

  // --- checkbox_list ---
  describe('checkbox_list: options rendered as checkboxes', () => {
    const template = findTemplateForType('checkbox_list');

    it('template exists for checkbox_list', () => {
      assert.ok(template, 'must have at least one checkbox_list template');
    });

    it('serialised output has options array with labels', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.type, 'checkbox_list');
      assert.ok(Array.isArray(s.inputSpec.options), 'options must be an array');
      assert.ok(s.inputSpec.options.length >= 2, 'must have at least 2 checkbox options');
      for (const opt of s.inputSpec.options) {
        assert.ok(typeof opt.label === 'string' && opt.label.length > 0, 'option.label must be non-empty');
        assert.ok(typeof opt.value === 'string' && opt.value.length > 0, 'option.value must be non-empty');
      }
    });
  });

  // --- table_choice ---
  describe('table_choice: rows x columns rendered', () => {
    const template = findTemplateForType('table_choice');

    it('template exists for table_choice', () => {
      assert.ok(template, 'must have at least one table_choice template');
    });

    it('serialised output has columns and rows', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.type, 'table_choice');
      assert.ok(Array.isArray(s.inputSpec.columns), 'columns must be an array');
      assert.ok(s.inputSpec.columns.length >= 2, 'must have at least 2 columns');
      assert.ok(Array.isArray(s.inputSpec.rows), 'rows must be an array');
      assert.ok(s.inputSpec.rows.length >= 2, 'must have at least 2 rows');
    });

    it('rows have key and label (for rendering cells)', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      for (const row of s.inputSpec.rows) {
        assert.ok(typeof row.key === 'string' && row.key.length > 0, 'row.key required');
        assert.ok(typeof row.label === 'string' && row.label.length > 0, 'row.label required');
      }
    });

    it('row-specific options work when present', () => {
      // Use a heterogeneous template from U4
      const heteroTemplate = GRAMMAR_TEMPLATE_METADATA.find(t => {
        const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
        return q && q.inputSpec?.type === 'table_choice' &&
          q.inputSpec.rows?.some(r => Array.isArray(r.options) && r.options.length > 0);
      });
      if (!heteroTemplate) return;
      const q = generateQuestion(heteroTemplate.id, 1);
      const rowWithOpts = q.inputSpec.rows.find(r => Array.isArray(r.options));
      assert.ok(rowWithOpts, 'must find a row with per-row options');
      assert.ok(rowWithOpts.options.length > 0, 'row.options must be non-empty');
    });

    it('ariaLabel present on table_choice rows', () => {
      // Use the heterogeneous transfer templates which guarantee ariaLabel
      const heteroTemplate = GRAMMAR_TEMPLATE_METADATA.find(t => {
        const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
        return q && q.inputSpec?.type === 'table_choice' &&
          q.inputSpec.rows?.some(r => typeof r.ariaLabel === 'string');
      });
      if (!heteroTemplate) return;
      const q = generateQuestion(heteroTemplate.id, 1);
      for (const row of q.inputSpec.rows) {
        if (row.ariaLabel !== undefined) {
          assert.ok(
            typeof row.ariaLabel === 'string' && row.ariaLabel.length > 0,
            `row "${row.key}" ariaLabel must be non-empty when present`
          );
        }
      }
    });
  });

  // --- textarea ---
  describe('textarea: placeholder present, multiline', () => {
    const template = findTemplateForType('textarea');

    it('template exists for textarea', () => {
      assert.ok(template, 'must have at least one textarea template');
    });

    it('serialised output has placeholder', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.type, 'textarea');
      assert.ok(
        typeof s.inputSpec.placeholder === 'string' && s.inputSpec.placeholder.length > 0,
        'textarea must have a non-empty placeholder'
      );
      assert.ok(
        typeof s.inputSpec.label === 'string' && s.inputSpec.label.length > 0,
        'textarea must have a non-empty label'
      );
    });

    it('no answer leak in serialised textarea', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 2);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.correct, undefined);
      assert.strictEqual(s.inputSpec.golden, undefined);
      assert.strictEqual(s.inputSpec.accepted, undefined);
    });
  });

  // --- multi ---
  describe('multi: multiple fields rendered per spec', () => {
    const template = findTemplateForType('multi');

    it('template exists for multi', () => {
      assert.ok(template, 'must have at least one multi template');
    });

    it('serialised output has fields array with key+label+kind', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.type, 'multi');
      assert.ok(Array.isArray(s.inputSpec.fields), 'fields must be an array');
      assert.ok(s.inputSpec.fields.length >= 2, 'must have at least 2 fields');
      for (const field of s.inputSpec.fields) {
        assert.ok(typeof field.key === 'string' && field.key.length > 0, 'field.key required');
        assert.ok(typeof field.label === 'string' && field.label.length > 0, 'field.label required');
      }
    });

    it('fields have options or kind for rendering decision', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      for (const field of s.inputSpec.fields) {
        const hasOptions = Array.isArray(field.options) && field.options.length > 0;
        const hasKind = typeof field.kind === 'string' && field.kind.length > 0;
        assert.ok(
          hasOptions || hasKind,
          `field "${field.key}" must have options or kind for rendering`
        );
      }
    });
  });

  // --- text ---
  describe('text: single-line input rendered', () => {
    const template = findTemplateForType('text');

    it('template exists for text', () => {
      assert.ok(template, 'must have at least one text template');
    });

    it('serialised output has label and placeholder', () => {
      if (!template) return;
      const s = serialiseQuestion(template.id, 1);
      assert.ok(s, 'serialised question must exist');
      assert.strictEqual(s.inputSpec.type, 'text');
      assert.ok(
        typeof s.inputSpec.label === 'string' && s.inputSpec.label.length > 0,
        'text input must have a non-empty label'
      );
      assert.ok(
        typeof s.inputSpec.placeholder === 'string' && s.inputSpec.placeholder.length > 0,
        'text input must have a non-empty placeholder'
      );
    });
  });
});

// ===========================================================================
// P9 U8 — Accessibility contract tests
// ===========================================================================

describe('P9 U8 accessibility contract', () => {
  it('focusCue present implies screenReaderPromptText also present', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!q || !q.focusCue) continue;
      assert.ok(
        q.screenReaderPromptText,
        `Template "${template.id}" has focusCue but no screenReaderPromptText`
      );
      assert.ok(
        q.screenReaderPromptText.length > 0,
        `Template "${template.id}" screenReaderPromptText must be non-empty`
      );
    }
  });

  it('table_choice rows have ariaLabel when row.ariaLabel exists', () => {
    const tableTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t => {
      const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
      return q && q.inputSpec?.type === 'table_choice';
    });
    for (const template of tableTemplates) {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      for (const row of q.inputSpec.rows) {
        if (row.ariaLabel === undefined) continue;
        assert.ok(
          typeof row.ariaLabel === 'string' && row.ariaLabel.length > 0,
          `Template "${template.id}" row "${row.key}" ariaLabel must be non-empty string`
        );
      }
    }
  });

  it('all input families have proper label/key associations', () => {
    const TESTED_TYPES = new Set(['single_choice', 'checkbox_list', 'table_choice', 'multi', 'text', 'textarea']);
    const tested = new Set();

    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!q || !q.inputSpec) continue;
      const type = q.inputSpec.type;
      if (!TESTED_TYPES.has(type) || tested.has(type)) continue;
      tested.add(type);

      if (type === 'single_choice' || type === 'checkbox_list') {
        for (const opt of q.inputSpec.options || []) {
          assert.ok(
            (typeof opt.label === 'string' && opt.label.length > 0) ||
            (typeof opt.value === 'string' && opt.value.length > 0),
            `${type} option must have non-empty label or value`
          );
        }
      } else if (type === 'table_choice') {
        for (const row of q.inputSpec.rows || []) {
          assert.ok(typeof row.key === 'string' && row.key.length > 0, 'table row must have key');
          assert.ok(typeof row.label === 'string' && row.label.length > 0, 'table row must have label');
        }
      } else if (type === 'multi') {
        for (const field of q.inputSpec.fields || []) {
          assert.ok(typeof field.key === 'string' && field.key.length > 0, 'multi field must have key');
          assert.ok(typeof field.label === 'string' && field.label.length > 0, 'multi field must have label');
        }
      } else if (type === 'text' || type === 'textarea') {
        assert.ok(
          typeof q.inputSpec.label === 'string' && q.inputSpec.label.length > 0,
          `${type} must have non-empty label`
        );
      }
    }

    // Verify all 6 types were found and tested
    for (const expected of TESTED_TYPES) {
      assert.ok(tested.has(expected), `Input type "${expected}" must be testable in corpus`);
    }
  });
});

// ===========================================================================
// P9 U8 — iOS smart punctuation normalisation tests
// ===========================================================================

describe('P9 U8 iOS smart punctuation normalisation', () => {
  describe('normaliseSmartPunctuation utility', () => {
    it('curly left/right double quotes normalised to straight quotes', () => {
      assert.strictEqual(normaliseSmartPunctuation('“Hello”'), '"Hello"');
    });

    it('smart apostrophe (U+2019) normalised to ASCII apostrophe', () => {
      assert.strictEqual(normaliseSmartPunctuation('don’t'), "don't");
    });

    it('left single quote (U+2018) normalised to ASCII apostrophe', () => {
      assert.strictEqual(normaliseSmartPunctuation('‘tis the season'), "'tis the season");
    });

    it('en-dash normalised to hyphen', () => {
      assert.strictEqual(normaliseSmartPunctuation('pages 1–4'), 'pages 1-4');
    });

    it('em-dash normalised to hyphen', () => {
      assert.strictEqual(normaliseSmartPunctuation('wait—stop'), 'wait-stop');
    });

    it('mixed smart punctuation all normalised in one pass', () => {
      const input = '“She said, ‘don’t go’—now!”';
      const expected = '"She said, \'don\'t go\'-now!"';
      assert.strictEqual(normaliseSmartPunctuation(input), expected);
    });

    it('already-ASCII text passes through unchanged', () => {
      const text = "The cat's \"big\" jump was well-timed.";
      assert.strictEqual(normaliseSmartPunctuation(text), text);
    });
  });

  describe('evaluateGrammarQuestion tolerates iOS smart punctuation', () => {
    // Find a speech_punctuation template that uses acceptedSet/punctuationPattern
    const speechTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t =>
      t.skillIds?.includes('speech_punctuation')
    );

    it('speech_punctuation templates exist in corpus', () => {
      assert.ok(speechTemplates.length > 0, 'must have speech_punctuation templates');
    });

    it('smart apostrophe in typed answer does not cause false negative', () => {
      // Find a textarea/text template for speech_punctuation
      const speechTextTemplate = speechTemplates.find(t => {
        const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
        return q && (q.inputSpec?.type === 'textarea' || q.inputSpec?.type === 'text');
      });
      if (!speechTextTemplate) return; // skip if no typed speech template

      const q = createGrammarQuestion({ templateId: speechTextTemplate.id, seed: 1 });
      // Get the golden answer
      const golden = q.answerSpec?.golden?.[0];
      if (!golden || !golden.includes("'")) return; // skip if no apostrophe in answer

      // Replace ASCII apostrophe with iOS smart apostrophe
      const smartAnswer = golden.replace(/'/g, '’');
      const result = evaluateGrammarQuestion(q, { answer: smartAnswer });
      assert.ok(result, 'evaluation must not return null');
      assert.strictEqual(
        result.correct,
        true,
        `Smart apostrophe variant "${smartAnswer}" must be accepted as correct (golden: "${golden}")`
      );
    });

    // apostrophes_possession templates
    const apostropheTemplates = GRAMMAR_TEMPLATE_METADATA.filter(t =>
      t.skillIds?.includes('apostrophes_possession')
    );

    it('apostrophes_possession templates exist in corpus', () => {
      assert.ok(apostropheTemplates.length > 0, 'must have apostrophes_possession templates');
    });

    it('smart apostrophe in possession answer accepted', () => {
      const possTextTemplate = apostropheTemplates.find(t => {
        const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
        return q && (q.inputSpec?.type === 'textarea' || q.inputSpec?.type === 'text');
      });
      if (!possTextTemplate) return;

      const q = createGrammarQuestion({ templateId: possTextTemplate.id, seed: 1 });
      const golden = q.answerSpec?.golden?.[0];
      if (!golden || !golden.includes("'")) return;

      const smartAnswer = golden.replace(/'/g, '’');
      const result = evaluateGrammarQuestion(q, { answer: smartAnswer });
      assert.ok(result, 'evaluation must not return null');
      assert.strictEqual(
        result.correct,
        true,
        `Smart apostrophe possession "${smartAnswer}" must be accepted (golden: "${golden}")`
      );
    });

    it('curly double quotes in direct speech answer accepted', () => {
      const speechTextTemplate = speechTemplates.find(t => {
        const q = createGrammarQuestion({ templateId: t.id, seed: 1 });
        if (!q || q.inputSpec?.type !== 'textarea') return false;
        const golden = q.answerSpec?.golden?.[0] || '';
        return golden.includes('"');
      });
      if (!speechTextTemplate) return;

      const q = createGrammarQuestion({ templateId: speechTextTemplate.id, seed: 1 });
      const golden = q.answerSpec?.golden?.[0];
      if (!golden) return;

      // Replace straight quotes with curly
      const smartAnswer = golden
        .replace(/"([^"]*?)"/g, '“$1”');
      const result = evaluateGrammarQuestion(q, { answer: smartAnswer });
      assert.ok(result, 'evaluation must not return null');
      assert.strictEqual(
        result.correct,
        true,
        `Curly quotes variant must be accepted as correct`
      );
    });
  });
});
