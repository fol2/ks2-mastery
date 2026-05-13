import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProperNounCapitalisationEvidence } from '../scripts/audit-punctuation-qg-p20-expansion.mjs';
import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import { PUNCTUATION_P20_PROPER_NAME_TOKENS } from '../shared/punctuation/p20-systematic-expansion-bank.js';
import { PUNCTUATION_PROPER_NOUN_CAPITALISATION_TOKENS } from '../shared/punctuation/proper-noun-tokens.js';

test('Punctuation runtime model answers capitalise proper names', () => {
  const runtime = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });

  const evidence = buildProperNounCapitalisationEvidence(runtime.items);

  assert.equal(evidence.ok, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.findingCount, 0);
});

test('P20 proper-noun audit rejects lowercase names in model answers and accepted answers', () => {
  const evidence = buildProperNounCapitalisationEvidence([{
    id: 'proper-noun-regression',
    generatorFamilyId: 'gen_p20_sentence_endings_transfer',
    mode: 'transfer',
    skillIds: ['sentence_endings'],
    stem: 'where did maya put the map',
    model: 'Where did maya put the map?',
    accepted: ['Where did maya put the map?'],
  }]);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.findingCount, 2);
  assert.deepEqual(
    evidence.findings.map((finding) => `${finding.field}:${finding.phrase}`),
    ['model:maya', 'accepted[0]:maya'],
  );
});

test('P20 proper-noun audit covers every systematic actor token', () => {
  for (const name of PUNCTUATION_P20_PROPER_NAME_TOKENS) {
    const lowerName = name.toLowerCase();
    const evidence = buildProperNounCapitalisationEvidence([{
      id: `proper-noun-${lowerName}`,
      generatorFamilyId: 'gen_p20_sentence_endings_transfer',
      mode: 'transfer',
      skillIds: ['sentence_endings'],
      stem: `where did ${lowerName} put the map`,
      model: `Where did ${lowerName} put the map?`,
      accepted: [`Where did ${lowerName} put the map?`],
    }]);

    assert.equal(evidence.ok, false, `${name} was not covered by the proper-noun audit`);
    assert.equal(evidence.findingCount, 2);
  }
});

test('P20 proper-noun audit covers fixed place-name tokens', () => {
  const evidence = buildProperNounCapitalisationEvidence([{
    id: 'proper-noun-fixed-place-regression',
    generatorFamilyId: 'fixed-bank',
    mode: 'insert',
    skillIds: ['semicolon_list'],
    stem: 'We visited York, England Cardiff, Wales and Belfast, Northern Ireland.',
    model: 'We visited york, england; Cardiff, Wales; and Belfast, Northern Ireland.',
    accepted: ['We visited york, england; Cardiff, Wales; and Belfast, Northern Ireland.'],
  }]);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.findingCount, 4);
  assert.deepEqual(
    evidence.findings.map((finding) => `${finding.field}:${finding.phrase}`),
    ['model:york', 'model:england', 'accepted[0]:york', 'accepted[0]:england'],
  );
});

test('P20 proper-noun audit covers every registered proper-name token', () => {
  for (const name of PUNCTUATION_PROPER_NOUN_CAPITALISATION_TOKENS) {
    const lowerName = name.toLowerCase();
    const evidence = buildProperNounCapitalisationEvidence([{
      id: `proper-noun-${lowerName.replace(/\s+/g, '-')}`,
      generatorFamilyId: 'proper-noun-registry-fixture',
      mode: 'transfer',
      skillIds: ['semicolon_list'],
      stem: `Write a sentence using ${name}.`,
      model: `We visited ${lowerName}.`,
      accepted: [`We visited ${lowerName}.`],
    }]);

    assert.equal(evidence.ok, false, `${name} was not covered by the proper-noun audit`);
    assert.equal(evidence.findingCount, 2);
  }
});

test('P20 proper-noun audit allows lowercase names in learner stems for capital-letter repair tasks', () => {
  const evidence = buildProperNounCapitalisationEvidence([{
    id: 'proper-noun-stem-repair',
    generatorFamilyId: 'gen_p20_sentence_endings_transfer',
    mode: 'transfer',
    skillIds: ['sentence_endings'],
    stem: 'where did maya put the map',
    model: 'Where did Maya put the map?',
    accepted: ['Where did Maya put the map?'],
  }]);

  assert.equal(evidence.ok, true, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.findingCount, 0);
});
