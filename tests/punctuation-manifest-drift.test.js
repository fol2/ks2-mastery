import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_CLIENT_SKILLS,
  PUNCTUATION_CLIENT_SKILL_IDS,
  SKILL_TO_CLUSTER,
  RU_TO_CLUSTERS,
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER,
  CLASPIN_REQUIRED_SKILLS,
  PUNCTUATION_CLIENT_REWARD_UNITS,
  PUNCTUATION_CLUSTER_IDS,
  ACTIVE_PUNCTUATION_MONSTER_ID_SET,
  DIRECT_PUNCTUATION_MONSTER_IDS,
  MONSTER_CLUSTERS,
  MONSTER_UNIT_COUNT,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_DETAIL_TAB_IDS,
} from '../src/subjects/punctuation/punctuation-manifest.js';

// ---------------------------------------------------------------------------
// Manifest drift tests — pin the canonical constants so any accidental
// addition / removal fails loudly before landing.
// ---------------------------------------------------------------------------

test('PUNCTUATION_CLIENT_SKILLS has exactly 14 entries', () => {
  assert.equal(PUNCTUATION_CLIENT_SKILLS.length, 14);
});

test('PUNCTUATION_CLIENT_SKILL_IDS matches skill IDs from PUNCTUATION_CLIENT_SKILLS', () => {
  const idsFromSkills = PUNCTUATION_CLIENT_SKILLS.map((s) => s.id);
  assert.deepStrictEqual(PUNCTUATION_CLIENT_SKILL_IDS, idsFromSkills);
});

test('SKILL_TO_CLUSTER has entries for all 14 skill IDs', () => {
  assert.equal(SKILL_TO_CLUSTER.size, 14);
  for (const skillId of PUNCTUATION_CLIENT_SKILL_IDS) {
    assert.ok(
      SKILL_TO_CLUSTER.has(skillId),
      `SKILL_TO_CLUSTER missing entry for "${skillId}"`,
    );
  }
});

test('SKILL_TO_CLUSTER values match clusterId from PUNCTUATION_CLIENT_SKILLS', () => {
  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    assert.equal(
      SKILL_TO_CLUSTER.get(skill.id),
      skill.clusterId,
      `SKILL_TO_CLUSTER["${skill.id}"] should be "${skill.clusterId}"`,
    );
  }
});

test('RU_TO_CLUSTERS has 14 entries', () => {
  assert.equal(RU_TO_CLUSTERS.size, 14);
});

test('ACTIVE_PUNCTUATION_MONSTER_IDS has 4 entries (pealark, curlune, claspin, quoral)', () => {
  assert.equal(ACTIVE_PUNCTUATION_MONSTER_IDS.length, 4);
  assert.ok(ACTIVE_PUNCTUATION_MONSTER_IDS.includes('pealark'));
  assert.ok(ACTIVE_PUNCTUATION_MONSTER_IDS.includes('curlune'));
  assert.ok(ACTIVE_PUNCTUATION_MONSTER_IDS.includes('claspin'));
  assert.ok(ACTIVE_PUNCTUATION_MONSTER_IDS.includes('quoral'));
});

test('PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER maps all 6 cluster IDs', () => {
  const clusterIds = Object.keys(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER);
  assert.equal(clusterIds.length, 6);
  const expected = ['endmarks', 'speech', 'boundary', 'apostrophe', 'comma_flow', 'structure'];
  for (const id of expected) {
    assert.ok(
      clusterIds.includes(id),
      `PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER missing cluster "${id}"`,
    );
  }
});

test('CLASPIN_REQUIRED_SKILLS contains exactly the apostrophe-cluster skills', () => {
  const apostropheSkills = PUNCTUATION_CLIENT_SKILLS
    .filter((s) => s.clusterId === 'apostrophe')
    .map((s) => s.id);
  assert.deepStrictEqual(
    [...CLASPIN_REQUIRED_SKILLS].sort(),
    [...apostropheSkills].sort(),
  );
});

test('every clusterId in PUNCTUATION_CLIENT_SKILLS appears in PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER', () => {
  const validClusters = new Set(Object.keys(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER));
  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    assert.ok(
      validClusters.has(skill.clusterId),
      `skill "${skill.id}" has clusterId "${skill.clusterId}" not in PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER`,
    );
  }
});

test('PUNCTUATION_CLIENT_REWARD_UNITS has 14 entries', () => {
  assert.equal(PUNCTUATION_CLIENT_REWARD_UNITS.length, 14);
});

test('PUNCTUATION_CLUSTER_IDS matches the keys of PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER', () => {
  assert.deepStrictEqual(
    PUNCTUATION_CLUSTER_IDS,
    Object.keys(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER),
  );
});

test('ACTIVE_PUNCTUATION_MONSTER_ID_SET matches ACTIVE_PUNCTUATION_MONSTER_IDS', () => {
  assert.equal(ACTIVE_PUNCTUATION_MONSTER_ID_SET.size, ACTIVE_PUNCTUATION_MONSTER_IDS.length);
  for (const id of ACTIVE_PUNCTUATION_MONSTER_IDS) {
    assert.ok(ACTIVE_PUNCTUATION_MONSTER_ID_SET.has(id));
  }
});

test('DIRECT_PUNCTUATION_MONSTER_IDS excludes quoral', () => {
  assert.ok(!DIRECT_PUNCTUATION_MONSTER_IDS.includes('quoral'));
  assert.equal(DIRECT_PUNCTUATION_MONSTER_IDS.length, ACTIVE_PUNCTUATION_MONSTER_IDS.length - 1);
});

test('MONSTER_CLUSTERS covers all direct monsters', () => {
  for (const id of DIRECT_PUNCTUATION_MONSTER_IDS) {
    assert.ok(MONSTER_CLUSTERS.has(id), `MONSTER_CLUSTERS missing "${id}"`);
  }
});

test('MONSTER_UNIT_COUNT covers all direct monsters', () => {
  for (const id of DIRECT_PUNCTUATION_MONSTER_IDS) {
    assert.ok(
      typeof MONSTER_UNIT_COUNT[id] === 'number' && MONSTER_UNIT_COUNT[id] > 0,
      `MONSTER_UNIT_COUNT["${id}"] should be a positive number`,
    );
  }
});

test('map filter IDs are frozen arrays', () => {
  assert.ok(Object.isFrozen(PUNCTUATION_MAP_STATUS_FILTER_IDS));
  assert.ok(Object.isFrozen(PUNCTUATION_MAP_MONSTER_FILTER_IDS));
  assert.ok(Object.isFrozen(PUNCTUATION_MAP_DETAIL_TAB_IDS));
  assert.ok(PUNCTUATION_MAP_STATUS_FILTER_IDS.length > 0);
  assert.ok(PUNCTUATION_MAP_MONSTER_FILTER_IDS.length > 0);
  assert.ok(PUNCTUATION_MAP_DETAIL_TAB_IDS.length > 0);
});
