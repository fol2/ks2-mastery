// Canonical client-safe Punctuation metadata manifest.
//
// LEAF MODULE — imports only from platform constants (monsters.js).
// Zero imports from read-model, star-projection, service-contract,
// or any other punctuation module. This breaks the circular dependency
// that previously forced inlined mirrors of skill/cluster/monster data
// across 4+ modules.
//
// All downstream punctuation modules re-export from here for backward
// compatibility.

import { MONSTERS_BY_SUBJECT } from '../../platform/game/monsters.js';

// ── Active monster roster ────────────────────────────────────────────

export const ACTIVE_PUNCTUATION_MONSTER_IDS = Object.freeze(
  Array.isArray(MONSTERS_BY_SUBJECT?.punctuation)
    ? [...MONSTERS_BY_SUBJECT.punctuation]
    : ['pealark', 'curlune', 'claspin', 'quoral'],
);

export const ACTIVE_PUNCTUATION_MONSTER_ID_SET = Object.freeze(
  new Set(ACTIVE_PUNCTUATION_MONSTER_IDS),
);

export const PUNCTUATION_GRAND_MONSTER_ID = 'quoral';

export const DIRECT_PUNCTUATION_MONSTER_IDS = Object.freeze(
  ACTIVE_PUNCTUATION_MONSTER_IDS.filter((id) => id !== PUNCTUATION_GRAND_MONSTER_ID),
);

// ── Cluster → monster mapping ────────────────────────────────────────

export const PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER = Object.freeze({
  endmarks: 'pealark',
  speech: 'pealark',
  boundary: 'pealark',
  apostrophe: 'claspin',
  comma_flow: 'curlune',
  structure: 'curlune',
});

export const PUNCTUATION_CLUSTER_IDS = Object.freeze(
  Object.keys(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER),
);

// ── Published skills (14) ────────────────────────────────────────────

export const PUNCTUATION_CLIENT_SKILLS = Object.freeze([
  { id: 'sentence_endings', name: 'Capital letters and sentence endings', clusterId: 'endmarks' },
  { id: 'list_commas', name: 'Commas in lists', clusterId: 'comma_flow' },
  { id: 'apostrophe_contractions', name: 'Apostrophes for contraction', clusterId: 'apostrophe' },
  { id: 'apostrophe_possession', name: 'Apostrophes for possession', clusterId: 'apostrophe' },
  { id: 'speech', name: 'Inverted commas and speech punctuation', clusterId: 'speech' },
  { id: 'fronted_adverbial', name: 'Commas after starter phrases', clusterId: 'comma_flow' },
  { id: 'parenthesis', name: 'Parenthesis with commas, brackets or dashes', clusterId: 'structure' },
  { id: 'comma_clarity', name: 'Commas for clarity', clusterId: 'comma_flow' },
  { id: 'colon_list', name: 'Colon before a list', clusterId: 'structure' },
  { id: 'semicolon', name: 'Semi-colons between related clauses', clusterId: 'boundary' },
  { id: 'dash_clause', name: 'Dashes between related clauses', clusterId: 'boundary' },
  { id: 'semicolon_list', name: 'Semi-colons within lists', clusterId: 'structure' },
  { id: 'bullet_points', name: 'Punctuation of bullet points', clusterId: 'structure' },
  { id: 'hyphen', name: 'Hyphens to avoid ambiguity', clusterId: 'boundary' },
]);

export const PUNCTUATION_CLIENT_SKILL_IDS = Object.freeze(
  PUNCTUATION_CLIENT_SKILLS.map((s) => s.id),
);

export const PUNCTUATION_CLIENT_SKILL_ID_SET = Object.freeze(
  new Set(PUNCTUATION_CLIENT_SKILL_IDS),
);

// ── Skill → cluster lookup ───────────────────────────────────────────

export const SKILL_TO_CLUSTER = Object.freeze(
  new Map(PUNCTUATION_CLIENT_SKILLS.map((s) => [s.id, s.clusterId])),
);

// ── Reward units (14) ────────────────────────────────────────────────

export const PUNCTUATION_CLIENT_REWARD_UNITS = Object.freeze([
  { clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core' },
  { clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core' },
  { clusterId: 'apostrophe', rewardUnitId: 'apostrophe-possession-core' },
  { clusterId: 'speech', rewardUnitId: 'speech-core' },
  { clusterId: 'comma_flow', rewardUnitId: 'list-commas-core' },
  { clusterId: 'comma_flow', rewardUnitId: 'fronted-adverbials-core' },
  { clusterId: 'comma_flow', rewardUnitId: 'comma-clarity-core' },
  { clusterId: 'boundary', rewardUnitId: 'semicolons-core' },
  { clusterId: 'boundary', rewardUnitId: 'dash-clauses-core' },
  { clusterId: 'boundary', rewardUnitId: 'hyphens-core' },
  { clusterId: 'structure', rewardUnitId: 'parenthesis-core' },
  { clusterId: 'structure', rewardUnitId: 'colons-core' },
  { clusterId: 'structure', rewardUnitId: 'semicolon-lists-core' },
  { clusterId: 'structure', rewardUnitId: 'bullet-points-core' },
]);

export const RU_TO_CLUSTERS = Object.freeze(
  new Map(PUNCTUATION_CLIENT_REWARD_UNITS.map((ru) => [
    ru.rewardUnitId,
    new Set([ru.clusterId]),
  ])),
);

// ── Derived: Claspin required skills ─────────────────────────────────

export const CLASPIN_REQUIRED_SKILLS = Object.freeze(
  Array.from(SKILL_TO_CLUSTER.entries())
    .filter(([, c]) => c === 'apostrophe')
    .map(([s]) => s),
);

// ── Reverse lookups ──────────────────────────────────────────────────

export const MONSTER_CLUSTERS = Object.freeze(
  (() => {
    const m = new Map();
    for (const [clusterId, monsterId] of Object.entries(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER)) {
      if (!m.has(monsterId)) m.set(monsterId, new Set());
      m.get(monsterId).add(clusterId);
    }
    return m;
  })(),
);

export const MONSTER_UNIT_COUNT = Object.freeze(
  (() => {
    const counts = {};
    for (const [, monsterId] of Object.entries(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER)) {
      const clusterSet = MONSTER_CLUSTERS.get(monsterId);
      if (!clusterSet) continue;
      let total = 0;
      for (const cId of clusterSet) {
        for (const ru of PUNCTUATION_CLIENT_REWARD_UNITS) {
          if (ru.clusterId === cId) total++;
        }
      }
      counts[monsterId] = total;
    }
    return counts;
  })(),
);

// ── Map filter IDs ───────────────────────────────────────────────────

export const PUNCTUATION_MAP_STATUS_FILTER_IDS = Object.freeze([
  'all', 'new', 'learning', 'due', 'weak', 'secure', 'unknown',
]);

export const PUNCTUATION_MAP_MONSTER_FILTER_IDS = Object.freeze([
  'all', 'pealark', 'claspin', 'curlune', 'quoral',
]);

export const PUNCTUATION_MAP_DETAIL_TAB_IDS = Object.freeze(['learn', 'practise']);
