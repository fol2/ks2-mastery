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
  it('ships the active P21 release denominator and preserves P14 priority families', () => {
    const audit = buildGrammarQuestionGeneratorAudit({
      seeds: [1, 2, 3],
      deepSeeds: Array.from({ length: 30 }, (_, index) => index + 1),
    });

    assert.equal(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p21-2026-05-11');
    assert.equal(audit.templateCount, 546);
    // P21 adds 36 selected-response templates to the P20 denominator.
    assert.equal(audit.selectedResponseCount, 357);
    assert.equal(audit.constructedResponseCount, 189);
    assert.equal(audit.generatedTemplateCount, 520);
    assert.equal(audit.mixedTransferTemplateCount, 26);
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
    // P21 supersedes P20 with phase-prefixed artefacts; assertions
    // read the live artefact, not the frozen P18 snapshot.
    const inventory = readReport('grammar-qg-p21-render-inventory.json');
    const uniqueSurfaces = new Set(inventory.items.map(learnerVisibleSurface));
    const uniquePrompts = new Set(inventory.items.map((item) => item.promptText || ''));

    assert.equal(inventory.metadata.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(inventory.metadata.templateCount, 546);
    assert.equal(inventory.metadata.totalItems, 16380);
    assert.ok(uniqueSurfaces.size >= 7000, `unique surfaces: ${uniqueSurfaces.size}`);
    assert.ok(uniquePrompts.size >= 5000, `unique prompts: ${uniquePrompts.size}`);
  });

  it('expands the former low-diversity fixed banks below the P14 threshold', () => {
    const inventory = readReport('grammar-qg-p21-render-inventory.json');
    const fixedDiagnostics = new Set(GRAMMAR_FIXED_DIAGNOSTIC_TEMPLATE_IDS);
    const perTemplate = new Map();
    for (const item of inventory.items) {
      if (!perTemplate.has(item.templateId)) perTemplate.set(item.templateId, new Set());
      perTemplate.get(item.templateId).add(learnerVisibleSurface(item));
    }

    const lowDiversityFamilies = [...perTemplate.entries()]
      .filter(([, surfaces]) => surfaces.size <= 3)
      .map(([templateId, surfaces]) => ({ templateId, uniqueSurfaceCount: surfaces.size }));
    const underExpandedFamilies = [...perTemplate.entries()]
      .filter(([templateId]) => !templateId.startsWith('qg_p21_'))
      .filter(([, surfaces]) => surfaces.size < 10)
      .map(([templateId, surfaces]) => ({ templateId, uniqueSurfaceCount: surfaces.size }));
    const p21Families = [...perTemplate.entries()]
      .filter(([templateId]) => templateId.startsWith('qg_p21_'))
      .map(([templateId, surfaces]) => ({ templateId, uniqueSurfaceCount: surfaces.size }));

    assert.equal(fixedDiagnostics.size, 0);
    assert.ok(lowDiversityFamilies.length < 5, `low-diversity families: ${JSON.stringify(lowDiversityFamilies)}`);
    assert.deepEqual(underExpandedFamilies, []);
    assert.equal(p21Families.length, 36);
    assert.ok(
      p21Families.every((entry) => entry.uniqueSurfaceCount === 8),
      `P21 families must expose the contracted 8 curated cases: ${JSON.stringify(p21Families)}`,
    );

    assert.deepEqual(
      GRAMMAR_TEMPLATE_METADATA.filter((template) => template.fixedDiagnostic || template.schedulePriority === 'low').map((template) => template.id),
      [],
    );
  });

  it('keeps every P14 selected-response item to four distinct options', () => {
    const p14SelectedTemplates = GRAMMAR_TEMPLATE_METADATA.filter((template) =>
      template.tags.includes('qg-p14') && template.isSelectedResponse);

    // P19 Contract A.2: 4 P14 priority rewrites converted from constructed to
    // selected-response. Net: 24 (original) + 4 (converted) = 28.
    assert.equal(p14SelectedTemplates.length, 28);

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
    // P21 supersedes the P20 distractor audit; read the live P21 file.
    const audit = readReport('grammar-qg-p21-distractor-audit.json');
    const p14SurfaceCueItems = (audit.results || [])
      .filter((item) => item.templateId?.startsWith('qg_p14_'))
      .filter((item) => item.correctOptionSurfaceCue?.likelySurfaceCue)
      .map((item) => `${item.templateId}:${item.seed}`);

    assert.deepEqual(p14SurfaceCueItems, []);
  });

  it('covers every P14 distractor review flag with quality-register adult decisions', () => {
    // P21 supersedes P20 with its own manifest pointing at live P21 artefacts.
    const manifest = readReport('grammar-qg-p21-certification-manifest.json');
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
