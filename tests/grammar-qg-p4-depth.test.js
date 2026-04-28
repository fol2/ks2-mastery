import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  grammarQuestionVariantSignature,
} from '../worker/src/subjects/grammar/content.js';

const EXPLANATION_FAMILIES = GRAMMAR_TEMPLATE_METADATA.filter(
  (t) => t.questionType === 'explain' && t.generative,
);

// Templates with declarative answerSpec (excludes older choiceResult-only templates)
const ANSWERSPEC_FAMILIES = EXPLANATION_FAMILIES.filter((t) => t.requiresAnswerSpec);

describe('Grammar QG P4 explanation case-bank depth', () => {
  for (const template of EXPLANATION_FAMILIES) {
    it(`${template.id} has at least 8 unique visible prompts over seeds 1..13`, () => {
      const signatures = new Set();
      for (let seed = 1; seed <= 13; seed++) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        signatures.add(grammarQuestionVariantSignature(q));
      }
      assert.ok(
        signatures.size >= 8,
        `${template.id} has only ${signatures.size} unique prompts over 13 seeds (need 8+)`,
      );
    });
  }

  it('option shuffling does not produce new variant signatures (case-bank templates)', () => {
    // Use a P3 template with a fixed case bank to verify wrapping behaviour
    const template = ANSWERSPEC_FAMILIES.find((t) => t.id.startsWith('qg_p3_'));
    assert.ok(template, 'Should find at least one qg_p3_ template');

    const q1 = createGrammarQuestion({ templateId: template.id, seed: 1 });
    const sig1 = grammarQuestionVariantSignature(q1);

    // Count unique sigs to determine case count, then wrap around
    const sigs = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      sigs.add(grammarQuestionVariantSignature(createGrammarQuestion({ templateId: template.id, seed })));
    }
    const caseCount = sigs.size;

    // Seed that wraps to same case index (seed % caseCount produces same remainder)
    const q2 = createGrammarQuestion({ templateId: template.id, seed: 1 + caseCount });
    const sig2 = grammarQuestionVariantSignature(q2);
    assert.strictEqual(sig1, sig2, 'Same case index should produce same signature regardless of option order');
  });

  it('answer spec kind remains exact for all answerSpec explanation templates', () => {
    for (const template of ANSWERSPEC_FAMILIES) {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      assert.strictEqual(q.answerSpec.kind, 'exact', `${template.id} answerSpec.kind`);
    }
  });

  it('each explanation item has exactly 4 options and 1 correct', () => {
    for (const template of ANSWERSPEC_FAMILIES) {
      for (let seed = 1; seed <= 5; seed++) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        assert.strictEqual(q.inputSpec.options.length, 4, `${template.id}:${seed} options count`);
        const correctCount = q.inputSpec.options.filter((o) => o.value === q.answerSpec.golden[0]).length;
        assert.strictEqual(correctCount, 1, `${template.id}:${seed} correct count`);
      }
    }
  });

  it('all explanation families produce distinct prompts, not just name substitutions', () => {
    for (const template of EXPLANATION_FAMILIES) {
      const promptsBySig = new Map();
      for (let seed = 1; seed <= 13; seed++) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        const sig = grammarQuestionVariantSignature(q);
        if (!promptsBySig.has(sig)) {
          promptsBySig.set(sig, q.stemHtml);
        }
      }
      // Each unique signature should have unique stemHtml
      const uniqueStems = new Set(promptsBySig.values());
      assert.strictEqual(
        uniqueStems.size,
        promptsBySig.size,
        `${template.id} should have distinct prompt HTML for each variant signature`,
      );
    }
  });
});

describe('Legacy repeat repair', () => {
  const REPAIRED_FAMILIES = [
    'proc_semicolon_choice',
    'proc_colon_list_fix',
    'proc_dash_boundary_fix',
    'proc_hyphen_ambiguity_choice',
    'proc2_modal_choice',
    'proc2_formality_choice',
    'proc3_clause_join_rewrite',
  ];

  for (const familyId of REPAIRED_FAMILIES) {
    it(`${familyId} produces 3 distinct signatures for seeds [1,2,3]`, () => {
      const template = GRAMMAR_TEMPLATE_METADATA.find(
        (t) => t.generatorFamilyId === familyId || t.id === familyId,
      );
      assert.ok(template, `Template not found for ${familyId}`);
      const sigs = new Set();
      for (const seed of [1, 2, 3]) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        sigs.add(grammarQuestionVariantSignature(q));
      }
      assert.strictEqual(sigs.size, 3, `${familyId} still repeats within seeds [1,2,3]`);
    });
  }

  it('repaired families still produce valid questions for seeds 1..10', () => {
    for (const familyId of REPAIRED_FAMILIES) {
      const template = GRAMMAR_TEMPLATE_METADATA.find(
        (t) => t.generatorFamilyId === familyId || t.id === familyId,
      );
      for (let seed = 1; seed <= 10; seed++) {
        const q = createGrammarQuestion({ templateId: template.id, seed });
        assert.ok(q.stemHtml, `${familyId} seed=${seed} missing stemHtml`);
        assert.ok(q.inputSpec, `${familyId} seed=${seed} missing inputSpec`);
        assert.ok(q.solutionLines.length > 0, `${familyId} seed=${seed} missing solutionLines`);
      }
    }
  });
});
