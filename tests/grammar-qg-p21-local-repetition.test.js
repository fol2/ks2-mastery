import test from 'node:test';
import assert from 'node:assert/strict';

import { auditGrammarP21LocalRepetition } from '../scripts/audit-grammar-qg-p21-local-repetition.mjs';
import { GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW } from '../worker/src/subjects/grammar/selection.js';

test('Grammar QG P21 local learner simulation avoids exact prompt/variant repeats in focused practice', () => {
  const audit = auditGrammarP21LocalRepetition({
    focus: ['relative_clauses', 'standard_english', 'apostrophes_possession', 'hyphen_ambiguity'],
    mode: ['smart', 'trouble'],
    steps: 40,
    seedBase: 91221,
  });

  assert.equal(GRAMMAR_RECENT_VARIANT_REPEAT_WINDOW, 40);
  assert.equal(audit.status, 'pass', JSON.stringify(audit.violations, null, 2));
  assert.equal(audit.summary.violationCount, 0);
  assert.equal(audit.summary.warningCount, 0, JSON.stringify(audit.warnings, null, 2));
  assert.ok(audit.summary.minUniquePrompts >= 40, `minUniquePrompts=${audit.summary.minUniquePrompts}`);
  assert.ok(audit.summary.minUniqueVariants >= 30, `minUniqueVariants=${audit.summary.minUniqueVariants}`);
  assert.ok(audit.summary.minUniqueTemplates >= 20, `minUniqueTemplates=${audit.summary.minUniqueTemplates}`);
});
