import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarQGP20QualityHardeningAudit } from '../scripts/audit-grammar-qg-p20-quality-hardening.mjs';
import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

test('P20 quality-hardening audit passes a reviewer smoke window across all five phases', () => {
  const audit = buildGrammarQGP20QualityHardeningAudit({ seeds: [1, 2, 3], smartSeeds: [1, 2] });

  assert.equal(audit.passed, true);
  assert.deepEqual(audit.phaseStatus, {
    phase1AnswerAcceptance: true,
    phase2TemplateQuality: true,
    phase3PoolAuditAndQuarantine: true,
    phase4VarietyAndAntiRepetition: true,
    phase5ExpansionGate: true,
  });
  assert.equal(audit.summary.answerAcceptanceFailureCount, 0);
  assert.equal(audit.summary.fairnessFindingCount, 0);
  assert.equal(audit.summary.templateQualityFindingCount, 0);
  assert.equal(audit.summary.unsafeAutoMarkedOpenPromptCount, 0);
  assert.equal(audit.expansionGate.newLearnerFacingFamiliesAdded, 0);
  assert.ok(
    audit.summary.p20ClosedAutoMarkTemplateCount >= 20,
    'P20 should recover a meaningful set of deterministic closed Grammar items from manual-review-only',
  );
});

test('P20 metadata keeps recovered closed families visible for reviewers', () => {
  const recovered = GRAMMAR_TEMPLATE_METADATA.filter((template) => template.p20ClosedAutoMarkKind);
  assert.ok(recovered.length >= 20);
  assert.ok(recovered.every((template) => template.tags.includes('p20-closed-auto-mark')));
  assert.ok(recovered.every((template) => ['normalisedText', 'punctuationPattern'].includes(template.p20ClosedAutoMarkKind)));

  const question = createGrammarQuestion({ templateId: recovered[0].id, seed: 1 });
  assert.equal(question.answerSpec.p20ClosedAutoMark, true);
  assert.equal(question.answerSpec.conversionReason, 'p20-closed-deterministic-quality-recovery');
});

test('P20 does not hide learner-facing prompt defects behind HTML stripping', () => {
  const seeds = [1, 2, 3];
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (const seed of seeds) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;
      const serialised = serialiseGrammarQuestion(question);
      const learnerText = [
        serialised.promptText,
        ...(serialised.solutionLines || []),
        JSON.stringify(serialised.inputSpec || {}),
      ].join(' ');
      assert.doesNotMatch(learnerText, /\s+[.,!?;:]/, `${template.id}:${seed} has spacing before punctuation`);
      assert.doesNotMatch(
        learnerText,
        /\bClassify the grammar feature shown in this row:\s*[^.?!:]+\s+in:\s*/i,
        `${template.id}:${seed} exposes awkward table-row copy`,
      );
    }
  }
});

test('P20c generated source compaction preserves manual-review fairness flags', async () => {
  const module = await import('../scripts/generate-grammar-manual-expansion.mjs');
  assert.equal(typeof module.compactCaseForTest, 'function');

  const compacted = module.compactCaseForTest({
    caseId: 'flagged-case',
    sourcePack: 'test-pack',
    seedCase: 1,
    inputType: 'textarea',
    questionType: 'constructed',
    depthTier: 'transfer',
    promptText: 'Write a short paragraph using a relative clause.',
    manualReviewOnly: true,
    nonScored: true,
  });

  assert.equal(compacted.manualReviewOnly, true);
  assert.equal(compacted.nonScored, true);
});

test('P20c manual expansion freshness check tolerates Windows line endings', async () => {
  const module = await import('../scripts/generate-grammar-manual-expansion.mjs');
  assert.equal(typeof module.normaliseGeneratedSourceForCheck, 'function');

  assert.equal(
    module.normaliseGeneratedSourceForCheck('export const value = 1;\r\n'),
    'export const value = 1;\n',
  );
});

test('P20d apostrophes possession rewrite families do not share identical learner prompts', () => {
  const rewriteTemplateId = 'qg_p18_p15_apostrophes_possession_possessive_rewrite';
  const precisionTemplateId = 'qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite';
  for (let seed = 1; seed <= 30; seed += 1) {
    const rewritePrompt = serialiseGrammarQuestion(createGrammarQuestion({ templateId: rewriteTemplateId, seed })).promptText;
    const precisionPrompt = serialiseGrammarQuestion(createGrammarQuestion({ templateId: precisionTemplateId, seed })).promptText;
    assert.notEqual(
      precisionPrompt,
      rewritePrompt,
      `seed ${seed} must not repeat the same learner-facing possessive prompt across rewrite families`,
    );
  }
});

test('P20d learner-facing surfaces do not collide across Grammar templates in the release window', () => {
  const seen = new Map();
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      if (!question) continue;
      const serialised = serialiseGrammarQuestion(question);
      const prompt = String(serialised.promptText || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const inputType = serialised.inputSpec?.type || '';
      const key = `${inputType}\t${prompt}`;
      const previous = seen.get(key);
      if (previous && previous.templateId !== template.id) {
        assert.fail(
          `learner-facing surface repeats across templates: ${previous.templateId}:${previous.seed} and ${template.id}:${seed} -> ${serialised.promptText}`,
        );
      }
      if (!previous) seen.set(key, { templateId: template.id, seed });
    }
  }
});
