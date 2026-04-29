/**
 * Golden accept/reject marking tests for all DSL-backed punctuation templates.
 *
 * Verifies that the marking engine (markPunctuationAnswer) agrees with the
 * expected accept/reject classifications declared in each DSL family's `tests` field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { expandDslTemplates } from '../shared/punctuation/template-dsl.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

import { apostropheContractionsDsl } from '../shared/punctuation/dsl-families/apostrophe-contractions-fix.js';
import { apostrophePossessionInsertDsl } from '../shared/punctuation/dsl-families/apostrophe-possession-insert.js';
import { apostropheMixParagraphDsl } from '../shared/punctuation/dsl-families/apostrophe-mix-paragraph.js';
import { commaClarityInsertDsl } from '../shared/punctuation/dsl-families/comma-clarity-insert.js';
import { dashClauseCombineDsl } from '../shared/punctuation/dsl-families/dash-clause-combine.js';
import { dashClauseFixDsl } from '../shared/punctuation/dsl-families/dash-clause-fix.js';
import { frontedSpeechParagraphDsl } from '../shared/punctuation/dsl-families/fronted-speech-paragraph.js';
import { hyphenInsertDsl } from '../shared/punctuation/dsl-families/hyphen-insert.js';
import { listCommasCombineDsl } from '../shared/punctuation/dsl-families/list-commas-combine.js';
import { listCommasInsertDsl } from '../shared/punctuation/dsl-families/list-commas-insert.js';
import { semicolonListFixDsl } from '../shared/punctuation/dsl-families/semicolon-list-fix.js';
import { sentenceEndingsInsertDsl } from '../shared/punctuation/dsl-families/sentence-endings-insert.js';
import { speechInsertDsl } from '../shared/punctuation/dsl-families/speech-insert.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal item shape that the marking engine accepts.
 * Mirrors the shape produced by buildGeneratedItem in generators.js.
 */
function buildItemFromTemplate(template, mode) {
  const model = template.model || '';
  return {
    id: `golden_test_${template.templateId || 'unknown'}`,
    mode,
    model,
    accepted: [model, ...(Array.isArray(template.accepted) ? template.accepted : [])],
    ...(template.validator ? { validator: template.validator } : {}),
    ...(template.rubric ? { rubric: template.rubric } : {}),
    misconceptionTags: template.misconceptionTags || [],
    skillIds: template.skillIds || [],
    prompt: template.prompt || '',
    stem: template.stem || '',
  };
}

// ─── Family registry ──────────────────────────────────────────────────────────

const FAMILIES = [
  { name: 'apostrophe-contractions-fix', dsl: apostropheContractionsDsl, mode: 'fix' },
  { name: 'apostrophe-possession-insert', dsl: apostrophePossessionInsertDsl, mode: 'insert' },
  { name: 'apostrophe-mix-paragraph', dsl: apostropheMixParagraphDsl, mode: 'paragraph' },
  { name: 'comma-clarity-insert', dsl: commaClarityInsertDsl, mode: 'insert' },
  { name: 'dash-clause-combine', dsl: dashClauseCombineDsl, mode: 'combine' },
  { name: 'dash-clause-fix', dsl: dashClauseFixDsl, mode: 'fix' },
  { name: 'fronted-speech-paragraph', dsl: frontedSpeechParagraphDsl, mode: 'paragraph' },
  { name: 'hyphen-insert', dsl: hyphenInsertDsl, mode: 'insert' },
  { name: 'list-commas-combine', dsl: listCommasCombineDsl, mode: 'combine' },
  { name: 'list-commas-insert', dsl: listCommasInsertDsl, mode: 'insert' },
  { name: 'semicolon-list-fix', dsl: semicolonListFixDsl, mode: 'fix' },
  { name: 'sentence-endings-insert', dsl: sentenceEndingsInsertDsl, mode: 'insert' },
  { name: 'speech-insert', dsl: speechInsertDsl, mode: 'insert' },
];

// ─── Main test ────────────────────────────────────────────────────────────────

test('golden marking tests: all DSL families pass accept cases and fail reject cases', () => {
  let totalTemplatesTested = 0;
  let totalAcceptPassed = 0;
  let totalRejectPassed = 0;
  const failures = [];

  for (const { name, dsl, mode } of FAMILIES) {
    const templates = expandDslTemplates(dsl);
    let familyTemplatesTested = 0;

    for (const template of templates) {
      const tests = template.tests;
      if (!tests) continue;

      const acceptCases = Array.isArray(tests.accept) ? tests.accept : [];
      const rejectCases = Array.isArray(tests.reject) ? tests.reject : [];
      const totalCases = acceptCases.length + rejectCases.length;

      if (totalCases < 4) {
        failures.push(`[${name}] template "${template.templateId || template.stem?.slice(0, 30)}" has only ${totalCases} test cases (minimum 4)`);
        continue;
      }

      const item = buildItemFromTemplate(template, mode);
      familyTemplatesTested += 1;

      // Test accept cases
      for (const typed of acceptCases) {
        const result = markPunctuationAnswer({ item, answer: { typed } });
        if (result.correct) {
          totalAcceptPassed += 1;
        } else {
          failures.push(
            `[${name}] ACCEPT failed: "${typed}" was rejected.\n` +
            `  Item stem: "${item.stem}"\n` +
            `  Expected model: "${item.model}"\n` +
            `  Tags: ${JSON.stringify(result.misconceptionTags)}`,
          );
        }
      }

      // Test reject cases
      for (const typed of rejectCases) {
        const result = markPunctuationAnswer({ item, answer: { typed } });
        if (!result.correct) {
          totalRejectPassed += 1;
        } else {
          failures.push(
            `[${name}] REJECT failed: "${typed}" was accepted but should have been rejected.\n` +
            `  Item stem: "${item.stem}"\n` +
            `  Expected model: "${item.model}"`,
          );
        }
      }
    }

    // Guard: each family must have at least 1 template with tests
    assert.ok(
      familyTemplatesTested >= 1,
      `Family "${name}" has no templates with valid test cases`,
    );
    totalTemplatesTested += familyTemplatesTested;
  }

  // Report summary
  const summary = `${totalTemplatesTested} templates tested, ${totalAcceptPassed} accept cases passed, ${totalRejectPassed} reject cases passed`;

  if (failures.length > 0) {
    assert.fail(
      `Golden marking tests failed (${failures.length} failures):\n\n${failures.join('\n\n')}\n\nSummary: ${summary}`,
    );
  }

  // Final sanity: we must have tested a meaningful number
  assert.ok(totalTemplatesTested >= 7 * 8, `Expected at least 56 templates tested, got ${totalTemplatesTested}`);
  assert.ok(totalAcceptPassed >= totalTemplatesTested, `Expected at least ${totalTemplatesTested} accept passes, got ${totalAcceptPassed}`);
  assert.ok(totalRejectPassed >= totalTemplatesTested, `Expected at least ${totalTemplatesTested} reject passes, got ${totalRejectPassed}`);

  // Log success summary
  console.log(`  GOLDEN MARKING: ${summary}`);
});

// ─── Vacuous truth guard ──────────────────────────────────────────────────────

test('vacuous truth guard: every DSL family has templates with at least 4 test cases each', () => {
  for (const { name, dsl } of FAMILIES) {
    const templates = expandDslTemplates(dsl);
    const withTests = templates.filter((t) => {
      const tests = t.tests;
      if (!tests) return false;
      const total = (Array.isArray(tests.accept) ? tests.accept.length : 0)
        + (Array.isArray(tests.reject) ? tests.reject.length : 0);
      return total >= 4;
    });

    assert.ok(
      withTests.length >= 1,
      `Family "${name}": expected at least 1 template with >= 4 test cases, found ${withTests.length}`,
    );
  }
});
