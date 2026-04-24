import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  createPunctuationContentIndexes,
  createPunctuationMasteryKey,
  PUNCTUATION_CLUSTERS,
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
  punctuationSkillReadiness,
  validatePunctuationManifest,
} from '../shared/punctuation/content.js';

test('punctuation manifest exposes 14 atomic skills and one cluster owner per skill', () => {
  const result = validatePunctuationManifest();
  assert.equal(result.ok, true, result.errors.join('\n'));

  const indexes = createPunctuationContentIndexes();
  assert.equal(indexes.skills.length, 14);

  for (const skill of indexes.skills) {
    const owners = PUNCTUATION_CLUSTERS.filter((cluster) => cluster.skillIds.includes(skill.id));
    assert.equal(owners.length, 1, `${skill.id} should have one cluster owner`);
    assert.equal(owners[0].id, skill.clusterId);
  }
});

test('published punctuation release includes the hidden Comma / Flow expansion slice', () => {
  const indexes = createPunctuationContentIndexes();
  assert.deepEqual(indexes.publishedClusterIds, ['endmarks', 'apostrophe', 'speech', 'comma_flow']);
  assert.deepEqual(indexes.publishedSkillIds, [
    'sentence_endings',
    'list_commas',
    'apostrophe_contractions',
    'apostrophe_possession',
    'speech',
    'fronted_adverbial',
    'comma_clarity',
  ]);
  assert.equal(indexes.publishedRewardUnits.length, 7);
  assert.equal(PUNCTUATION_CONTENT_MANIFEST.fullSkillCount, 14);
  assert.match(PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy, /Structure and boundary punctuation remain planned/);
});

test('published reward mastery keys are release-scoped and stable when generator families expand', () => {
  const indexes = createPunctuationContentIndexes();
  const keysBefore = indexes.publishedRewardUnits.map((unit) => unit.masteryKey);
  assert.equal(keysBefore.every((key) => key.startsWith(`punctuation:${PUNCTUATION_RELEASE_ID}:`)), true);

  const expanded = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: [
      ...PUNCTUATION_CONTENT_MANIFEST.generatorFamilies,
      {
        id: 'gen_speech_insert_more',
        skillId: 'speech',
        rewardUnitId: 'speech-core',
        published: true,
        mode: 'insert',
        deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
      },
    ],
  };
  const expandedKeys = createPunctuationContentIndexes(expanded).publishedRewardUnits.map((unit) => unit.masteryKey);
  assert.deepEqual(expandedKeys, keysBefore);
});

test('manifest validation rejects duplicate reward mastery keys and missing readiness rows', () => {
  const duplicateKey = createPunctuationMasteryKey({
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
  });
  const duplicated = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    rewardUnits: [
      ...PUNCTUATION_CONTENT_MANIFEST.rewardUnits,
      {
        releaseId: PUNCTUATION_CONTENT_MANIFEST.releaseId,
        clusterId: 'speech',
        rewardUnitId: 'speech-core-copy',
        skillIds: ['speech'],
        published: true,
        evidenceItemIds: ['sp_insert_question'],
        generatorFamilyIds: [],
        masteryKey: duplicateKey,
      },
    ],
  };
  assert.equal(validatePunctuationManifest(duplicated).ok, false);
  assert.match(validatePunctuationManifest(duplicated).errors.join('\n'), /Duplicate reward mastery key/);

  const missingTransfer = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.filter((item) => item.id !== 'sp_transfer_question'),
  };
  assert.equal(validatePunctuationManifest(missingTransfer).ok, false);
  assert.match(validatePunctuationManifest(missingTransfer).errors.join('\n'), /Published skill speech is missing readiness row constrained_transfer/);
});

test('published skills meet the content-readiness matrix', () => {
  for (const skillId of [
    'sentence_endings',
    'list_commas',
    'apostrophe_contractions',
    'apostrophe_possession',
    'speech',
    'fronted_adverbial',
    'comma_clarity',
  ]) {
    const readiness = punctuationSkillReadiness(skillId);
    assert.equal(readiness.complete, true, `${skillId} readiness should be complete`);
    assert.deepEqual(readiness.rows, [
      'constrained_transfer',
      'insertion',
      'misconception',
      'negative_test',
      'proofreading',
      'retrieve_discriminate',
    ]);
  }
});

test('candidate punctuation monster assets exist', async () => {
  for (const monsterId of ['pealark', 'claspin', 'quoral', 'curlune', 'colisk', 'hyphang', 'carillon']) {
    await access(path.join(process.cwd(), 'assets', 'monsters', monsterId, 'b1', `${monsterId}-b1-0.320.webp`));
    await access(path.join(process.cwd(), 'assets', 'monsters', monsterId, 'b2', `${monsterId}-b2-4.1280.webp`));
  }
});
