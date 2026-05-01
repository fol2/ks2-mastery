import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildGrammarQuestionGeneratorAudit } from '../scripts/audit-grammar-question-generator.mjs';
import {
  createGrammarQuestion,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_FIXED_DIAGNOSTIC_TEMPLATE_IDS,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import { buildGrammarPracticeQueue } from '../worker/src/subjects/grammar/selection.js';
import { validateDistractorReviewCoverage } from '../scripts/validate-grammar-qg-certification-evidence.mjs';

const REPORTS_DIR = path.resolve(import.meta.dirname, '..', 'reports', 'grammar');
const PRIORITY_CONCEPTS = Object.freeze([
  'standard_english',
  'adverbials',
  'subject_object',
  'clauses',
  'tense_aspect',
  'speech_punctuation',
  'noun_phrases',
  'parenthesis_commas',
]);

function readReport(filename) {
  return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, filename), 'utf8'));
}

function learnerVisibleSurface(item) {
  return JSON.stringify({
    promptText: item.promptText || '',
    inputType: item.inputType || '',
    visibleOptions: item.visibleOptions || null,
    rowSpecificOptions: item.rowSpecificOptions || null,
  });
}

describe('Grammar QG P14 depth and variety contract', () => {
  it('ships the active P14 release denominator and priority families', () => {
    const audit = buildGrammarQuestionGeneratorAudit({
      seeds: [1, 2, 3],
      deepSeeds: Array.from({ length: 30 }, (_, index) => index + 1),
    });

    assert.equal(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p14-2026-05-01');
    assert.equal(audit.templateCount, 110);
    assert.equal(audit.selectedResponseCount, 82);
    assert.equal(audit.constructedResponseCount, 28);
    assert.equal(audit.generatedTemplateCount, 84);
    assert.equal(audit.mixedTransferTemplateCount, 16);
    assert.equal(audit.lowDepthGeneratedTemplates.length, 0);

    for (const conceptId of PRIORITY_CONCEPTS) {
      const p14Templates = GRAMMAR_TEMPLATE_METADATA.filter((template) =>
        template.skillIds.includes(conceptId) && template.tags.includes('qg-p14'));
      assert.equal(p14Templates.length, 4, `${conceptId} must have four P14 depth families`);
      assert.ok(p14Templates.some((template) => template.tags.includes('misconception-choice')), conceptId);
      assert.ok(p14Templates.some((template) => template.tags.includes('constructed-response')), conceptId);
      assert.ok(p14Templates.some((template) => template.tags.includes('explanation')), conceptId);
      assert.ok(p14Templates.some((template) => template.tags.includes('mixed-transfer')), conceptId);
    }
  });

  it('meets the learner-visible surface and prompt growth thresholds', () => {
    const inventory = readReport('grammar-qg-p14-render-inventory.json');
    const uniqueSurfaces = new Set(inventory.items.map(learnerVisibleSurface));
    const uniquePrompts = new Set(inventory.items.map((item) => item.promptText || ''));

    assert.equal(inventory.metadata.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(inventory.metadata.templateCount, 110);
    assert.equal(inventory.metadata.totalItems, 3300);
    assert.ok(uniqueSurfaces.size >= 2000, `unique surfaces: ${uniqueSurfaces.size}`);
    assert.ok(uniquePrompts.size >= 1100, `unique prompts: ${uniquePrompts.size}`);
  });

  it('keeps only deliberate fixed diagnostics below ten surfaces', () => {
    const inventory = readReport('grammar-qg-p14-render-inventory.json');
    const fixedDiagnostics = new Set(GRAMMAR_FIXED_DIAGNOSTIC_TEMPLATE_IDS);
    const perTemplate = new Map();
    for (const item of inventory.items) {
      if (!perTemplate.has(item.templateId)) perTemplate.set(item.templateId, new Set());
      perTemplate.get(item.templateId).add(learnerVisibleSurface(item));
    }

    const unexpectedLowDiversity = [...perTemplate.entries()]
      .filter(([templateId, surfaces]) => surfaces.size < 10 && !fixedDiagnostics.has(templateId))
      .map(([templateId, surfaces]) => ({ templateId, uniqueSurfaceCount: surfaces.size }));

    assert.equal(fixedDiagnostics.size, 23);
    assert.deepEqual(unexpectedLowDiversity, []);

    for (const templateId of fixedDiagnostics) {
      const metadata = GRAMMAR_TEMPLATE_METADATA.find((template) => template.id === templateId);
      assert.equal(metadata?.fixedDiagnostic, true, templateId);
      assert.equal(metadata?.schedulePriority, 'low', templateId);
    }
  });

  it('keeps every P14 selected-response item to four distinct options', () => {
    const p14SelectedTemplates = GRAMMAR_TEMPLATE_METADATA.filter((template) =>
      template.tags.includes('qg-p14') && template.isSelectedResponse);

    assert.equal(p14SelectedTemplates.length, 24);

    for (const template of p14SelectedTemplates) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const question = createGrammarQuestion({ templateId: template.id, seed });
        const options = question?.inputSpec?.options || [];
        const values = options.map((option) => option.value);
        assert.equal(options.length, 4, `${template.id}:${seed} must expose exactly 4 options`);
        assert.equal(new Set(values).size, 4, `${template.id}:${seed} must expose 4 distinct option values`);
        assert.equal(values.filter((value) => question.answerSpec.golden.includes(value)).length, 1, `${template.id}:${seed} must expose exactly one golden option`);
      }
    }
  });

  it('uses real interrogative clauses for P14 speech mixed-transfer questions', () => {
    const templateId = 'qg_p14_speech_punctuation_mixed_transfer';
    const interrogativeStart = /^"(Should|Is|Where|Does|Did|Can)\b/;

    for (let seed = 1; seed <= 30; seed += 1) {
      const question = createGrammarQuestion({ templateId, seed });
      const [golden] = question.answerSpec.golden;
      assert.match(golden, interrogativeStart, `${templateId}:${seed} should start with a real question clause`);
      assert.match(golden, /\?" [A-Z][a-z]+ asked\.$/, `${templateId}:${seed} should keep the question mark inside the speech marks`);
    }
  });

  it('keeps P14 selected-response distractor options free of likely surface cues', () => {
    const audit = readReport('grammar-qg-p14-distractor-audit.json');
    const p14SurfaceCueItems = (audit.results || [])
      .filter((item) => item.templateId?.startsWith('qg_p14_'))
      .filter((item) => item.correctOptionSurfaceCue?.likelySurfaceCue)
      .map((item) => `${item.templateId}:${item.seed}`);

    assert.deepEqual(p14SurfaceCueItems, []);
  });

  it('covers every P14 distractor review flag with quality-register adult decisions', () => {
    const manifest = readReport('grammar-qg-p14-certification-manifest.json');
    const result = validateDistractorReviewCoverage(manifest, path.resolve(REPORTS_DIR, '..', '..'));

    assert.equal(result.pass, true, `Missing review decisions for: ${result.missing.join(', ')}`);
    assert.equal(result.missing.length, 0);
    assert.ok(result.covered.length >= 24, `Expected at least the P14 ambiguous templates to be covered, got ${result.covered.length}`);
  });

  it('does not repeat templates inside normal smart five-question sessions', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const queue = buildGrammarPracticeQueue({ mode: 'smart', size: 5, seed });
      const templateIds = queue.map((entry) => entry.templateId);
      assert.equal(
        new Set(templateIds).size,
        templateIds.length,
        `Duplicate template in seed ${seed}: ${templateIds.join(', ')}`,
      );
    }
  });
});
