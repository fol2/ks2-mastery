import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApostropheContractionGrammarEvidence } from '../scripts/audit-punctuation-qg-p20-expansion.mjs';
import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';

test('Punctuation apostrophe-contraction runtime avoids ungrammatical generated clauses', () => {
  const manifest = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });

  const evidence = buildApostropheContractionGrammarEvidence(manifest.items);

  assert.equal(evidence.ok, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.findingCount, 0);
});

test('P20 apostrophe-contraction audit rejects old believe/moved grammar regressions', () => {
  const evidence = buildApostropheContractionGrammarEvidence([{
    id: 'apostrophe-contraction-grammar-regression',
    generatorFamilyId: 'gen_p20_apostrophe_contractions_transfer',
    mode: 'transfer',
    skillIds: ['apostrophe_contractions'],
    stem: 'For the test bank, transfer the rule: Zara youre believe Ethan werent moved the torch.',
    model: 'Zara you\'re believe Ethan weren\'t moved the torch.',
  }]);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.findingCount, 2);
  assert.deepEqual(
    evidence.findings.map((finding) => finding.phrase),
    ['Zara you\'re believe', 'Ethan weren\'t moved the'],
  );
});

test('P20 apostrophe-contraction audit rejects documented negative-auxiliary believe regressions', () => {
  const evidence = buildApostropheContractionGrammarEvidence([{
    id: 'apostrophe-contraction-negative-auxiliary-regression',
    generatorFamilyId: 'gen_p20_apostrophe_contractions_transfer',
    mode: 'transfer',
    skillIds: ['apostrophe_contractions'],
    stem: 'For the test bank, transfer the rule: Theo arent believe Ivy havent moved the tablet.',
    model: 'Theo aren\'t believe Ivy haven\'t moved the tablet.',
  }]);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.findingCount, 2);
  assert.deepEqual(
    evidence.findings.map((finding) => finding.phrase),
    ['Theo aren\'t believe', 'Ivy haven\'t moved the'],
  );
});
