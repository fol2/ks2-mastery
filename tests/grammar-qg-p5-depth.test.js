import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

// Target: all 12 families that P5 expanded
const P5_EXPANDED_FAMILIES = [
  'qg_active_passive_choice',
  'qg_formality_classify_table',
  'qg_pronoun_referent_identify',
  'proc_hyphen_ambiguity_choice',
  'proc3_hyphen_fix_meaning',
  'proc3_parenthesis_commas_fix',
  'proc2_formality_choice',
  'proc_colon_list_fix',
  'proc_dash_boundary_fix',
  'proc2_modal_choice',
  'proc3_word_class_contrast_choice',
  'proc_semicolon_choice',
];

describe('Grammar QG P5 deep-seed expansion', () => {
  for (const familyId of P5_EXPANDED_FAMILIES) {
    it(`${familyId} has at least 8 unique prompts over seeds 1..30`, () => {
      const templates = GRAMMAR_TEMPLATE_METADATA.filter(
        (t) => t.generatorFamilyId === familyId || t.id === familyId,
      );
      assert.ok(templates.length > 0, `No template found for family ${familyId}`);
      const signatures = new Set();
      for (const template of templates) {
        for (let seed = 1; seed <= 30; seed++) {
          const q = createGrammarQuestion({ templateId: template.id, seed });
          signatures.add(grammarQuestionVariantSignature(q));
        }
      }
      assert.ok(
        signatures.size >= 8,
        `${familyId} has only ${signatures.size} unique prompts over 30 seeds (need 8+)`,
      );
    });
  }

  it('default-window (seeds 1,2,3) repeated variants remain zero', () => {
    // Check that no generated template repeats across seeds 1,2,3
    for (const template of GRAMMAR_TEMPLATE_METADATA.filter(t => t.generative)) {
      const sigs = new Set();
      for (let seed = 1; seed <= 3; seed++) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        const sig = grammarQuestionVariantSignature(q);
        sigs.add(sig);
      }
      assert.strictEqual(
        sigs.size, 3,
        `${template.id} has repeated variants in default window (${sigs.size}/3 unique)`,
      );
    }
  });

  it('cross-template signature collisions remain zero', () => {
    const seen = new Map();
    for (const template of GRAMMAR_TEMPLATE_METADATA.filter(t => t.generative)) {
      for (let seed = 1; seed <= 3; seed++) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        const sig = grammarQuestionVariantSignature(q);
        const prev = seen.get(sig);
        if (prev && prev !== template.id) {
          assert.fail(`Collision: ${template.id}:${seed} and ${prev} share signature ${sig}`);
        }
        seen.set(sig, template.id);
      }
    }
  });

  it('expanded families have qg-p5 tag', () => {
    for (const familyId of P5_EXPANDED_FAMILIES) {
      const templates = GRAMMAR_TEMPLATE_METADATA.filter(
        (t) => t.generatorFamilyId === familyId || t.id === familyId,
      );
      for (const t of templates) {
        assert.ok(
          (t.tags || []).includes('qg-p5'),
          `${t.id} (family ${familyId}) should have qg-p5 tag`,
        );
      }
    }
  });
});
