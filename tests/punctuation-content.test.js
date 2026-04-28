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

const P2_U3_PRIORITY_FIXED_TARGETS = Object.freeze({
  sentence_endings: 8,
  apostrophe_contractions: 8,
  comma_clarity: 8,
  semicolon_list: 8,
  hyphen: 8,
  dash_clause: 8,
});

const STABLE_PUNCTUATION_REWARD_UNIT_IDS = Object.freeze([
  'sentence-endings-core',
  'apostrophe-contractions-core',
  'apostrophe-possession-core',
  'speech-core',
  'list-commas-core',
  'fronted-adverbials-core',
  'comma-clarity-core',
  'semicolons-core',
  'dash-clauses-core',
  'hyphens-core',
  'parenthesis-core',
  'colons-core',
  'semicolon-lists-core',
  'bullet-points-core',
]);

const P2_U3_NEW_FIXED_ANCHOR_IDS = Object.freeze([
  'se_choose_direct_question',
  'se_insert_quiet_command',
  'se_fix_excited_statement',
  'se_transfer_where',
  'ac_choose_theyre_dont',
  'ac_insert_well_youre',
  'ac_transfer_dont_theyre',
  'cc_choose_before_cooking',
  'cc_insert_after_supper',
  'cc_fix_if_lost',
  'cc_transfer_after_the_match',
  'sl_choose_clubs',
  'sl_insert_helper_roles',
  'sl_fix_stalls',
  'sl_transfer_event_stalls',
  'hy_choose_small_business',
  'hy_insert_well_behaved',
  'hy_transfer_part_time_job',
  'dc_choose_lights_out',
  'dc_insert_alarm_rang',
  'dc_transfer_curtain_rose',
]);

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

test('published punctuation release includes the hidden full 14-skill Structure slice', () => {
  const indexes = createPunctuationContentIndexes();
  assert.deepEqual(indexes.publishedClusterIds, ['endmarks', 'apostrophe', 'speech', 'comma_flow', 'structure', 'boundary']);
  assert.deepEqual(indexes.publishedSkillIds, [
    'sentence_endings',
    'list_commas',
    'apostrophe_contractions',
    'apostrophe_possession',
    'speech',
    'fronted_adverbial',
    'parenthesis',
    'comma_clarity',
    'colon_list',
    'semicolon',
    'dash_clause',
    'semicolon_list',
    'bullet_points',
    'hyphen',
  ]);
  assert.equal(indexes.publishedRewardUnits.length, 14);
  assert.equal(PUNCTUATION_CONTENT_MANIFEST.fullSkillCount, 14);
  // Phase 2 scope copy is honest about mode breadth rather than claiming
  // "all 14 KS2 punctuation skills" as complete mastery. The 14-skill
  // progression claim survives, but is framed alongside the practice modes
  // the behavioural smoke matrix proves.
  assert.match(PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy, /14-skill KS2 progression/);
  assert.match(PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy, /Smart Review/);
});

test('P2 U3 priority fixed anchors meet target depth without new reward units', () => {
  const indexes = createPunctuationContentIndexes();

  for (const [skillId, expected] of Object.entries(P2_U3_PRIORITY_FIXED_TARGETS)) {
    const fixedItems = (indexes.itemsBySkill.get(skillId) || [])
      .filter((item) => item.source === 'fixed');
    assert.equal(fixedItems.length, expected, `${skillId} fixed anchor count`);
  }

  assert.deepEqual(
    indexes.publishedRewardUnits.map((unit) => unit.rewardUnitId),
    STABLE_PUNCTUATION_REWARD_UNIT_IDS,
  );
});

test('P2 U3 new free-text fixed anchors have deterministic marking contracts', () => {
  const indexes = createPunctuationContentIndexes();

  for (const itemId of P2_U3_NEW_FIXED_ANCHOR_IDS) {
    const item = indexes.itemById.get(itemId);
    assert.ok(item, `${itemId} should exist`);
    assert.equal(item.source, 'fixed', `${itemId} should be a fixed authored anchor`);
    assert.ok(Array.isArray(item.misconceptionTags) && item.misconceptionTags.length > 0, `${itemId} should tag likely misconceptions`);
    assert.ok(Array.isArray(item.readiness) && item.readiness.includes('negative_test'), `${itemId} should include negative-test readiness`);

    if (item.mode !== 'choose') {
      assert.ok(
        item.validator || item.rubric || (Array.isArray(item.accepted) && item.accepted.includes(item.model)),
        `${itemId} should have validator, rubric, or exact-answer coverage`,
      );
    }
  }
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
    items: PUNCTUATION_CONTENT_MANIFEST.items.filter((item) => ![
      'sp_transfer_question',
      'sp_fa_transfer_at_last_speech',
      'pg_fronted_speech',
      'pg_parenthesis_speech',
    ].includes(item.id)),
  };
  assert.equal(validatePunctuationManifest(missingTransfer).ok, false);
  assert.match(validatePunctuationManifest(missingTransfer).errors.join('\n'), /Published skill speech is missing readiness row constrained_transfer/);

  const missingEvidence = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    rewardUnits: PUNCTUATION_CONTENT_MANIFEST.rewardUnits.map((unit) => (
      unit.rewardUnitId === 'speech-core'
        ? { ...unit, evidenceItemIds: [...unit.evidenceItemIds, 'sp_missing_transfer_evidence'] }
        : unit
    )),
  };
  assert.equal(validatePunctuationManifest(missingEvidence).ok, false);
  assert.match(validatePunctuationManifest(missingEvidence).errors.join('\n'), /Reward unit speech-core lists missing evidence item sp_missing_transfer_evidence/);

  const hiddenTransferRequirement = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.map((item) => (
      item.id === 'sp_fa_transfer_at_last_speech'
        ? { ...item, prompt: "Write one sentence that begins with 'At last' and includes direct speech." }
        : item
    )),
  };
  assert.equal(validatePunctuationManifest(hiddenTransferRequirement).ok, false);
  assert.match(validatePunctuationManifest(hiddenTransferRequirement).errors.join('\n'), /Transfer item sp_fa_transfer_at_last_speech hides validator requirement Noah shouted/);

  const hiddenSpeechTerminal = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.map((item) => (
      item.id === 'sp_fa_transfer_at_last_speech'
        ? { ...item, prompt: 'Write one sentence using this exact opening, reporting clause and spoken words: At last / Noah shouted / we made it.' }
        : item
    )),
  };
  assert.equal(validatePunctuationManifest(hiddenSpeechTerminal).ok, false);
  assert.match(validatePunctuationManifest(hiddenSpeechTerminal).errors.join('\n'), /Transfer item sp_fa_transfer_at_last_speech hides validator requirement we made it!/);

  const hiddenPunctuationRequirement = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: PUNCTUATION_CONTENT_MANIFEST.items.map((item) => {
      if (item.id === 'hy_transfer_man_eating_shark') {
        return { ...item, prompt: "Write one sentence that includes this exact phrase: man eating shark." };
      }
      if (item.id === 'ac_transfer_contractions') {
        return { ...item, prompt: 'Write one sentence that includes both cant and were.' };
      }
      return item;
    }),
  };
  assert.equal(validatePunctuationManifest(hiddenPunctuationRequirement).ok, false);
  assert.match(validatePunctuationManifest(hiddenPunctuationRequirement).errors.join('\n'), /Transfer item hy_transfer_man_eating_shark hides validator requirement man-eating shark/);
  assert.match(validatePunctuationManifest(hiddenPunctuationRequirement).errors.join('\n'), /Transfer item ac_transfer_contractions hides validator requirement can't/);
});

test('published skills meet the content-readiness matrix', () => {
  for (const skillId of [
    'sentence_endings',
    'list_commas',
    'apostrophe_contractions',
    'apostrophe_possession',
    'speech',
    'fronted_adverbial',
    'parenthesis',
    'comma_clarity',
    'colon_list',
    'semicolon',
    'dash_clause',
    'semicolon_list',
    'bullet_points',
    'hyphen',
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

// Phase 4 U7 — content-rule forbidden-term sweep.
//
// `shared/punctuation/content.js`'s top-level `rule` fields are edit-safe
// (not consumed by the marking engine — the oracle replay validates
// marking + generator output, not skill metadata strings). R8 requires
// every `rule` string to read in child register. This sweep iterates the
// published skill manifest and asserts each `rule` contains zero adult
// grammar terms that R8 calls out: `fronted adverbial`, `main clause`,
// `complete clause`, `subordinate` (and its `subordinate clause`
// family). A leak here indicates either (a) an author regressed a rule
// back to adult register, or (b) a new skill landed without running
// through the U7 override audit.
const PUNCTUATION_RULE_FORBIDDEN_TERMS = Object.freeze([
  'fronted adverbial',
  'main clause',
  'complete clause',
  'subordinate',
]);

test('U7: every skill `rule` string in shared content reads in child register', async () => {
  // Import lazily so a manifest error above (which test(...) order would
  // skip) still emits as a dedicated failure here.
  const { PUNCTUATION_SKILLS } = await import('../shared/punctuation/content.js');
  for (const skill of PUNCTUATION_SKILLS) {
    const rule = typeof skill.rule === 'string' ? skill.rule : '';
    for (const term of PUNCTUATION_RULE_FORBIDDEN_TERMS) {
      assert.equal(
        rule.toLowerCase().includes(term),
        false,
        `${skill.id}.rule contains forbidden adult term "${term}": ${JSON.stringify(rule)}`,
      );
    }
  }
});
