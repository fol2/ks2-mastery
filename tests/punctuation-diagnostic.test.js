import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationDiagnostic } from '../worker/src/subjects/punctuation/diagnostic.js';
import { normalisePunctuationDiagnostic } from '../src/platform/hubs/admin-punctuation-diagnostic-panel.js';
import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';
import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  DIRECT_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_GRAND_MONSTER_ID,
  PUNCTUATION_CLIENT_REWARD_UNITS,
} from '../src/subjects/punctuation/punctuation-manifest.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Forbidden-key scan (mirrors read-models.js contract)
// ---------------------------------------------------------------------------

const FORBIDDEN_READ_MODEL_KEYS = new Set([
  'accepted',
  'answers',
  'correctIndex',
  'rubric',
  'validator',
  'seed',
  'generator',
  'hiddenQueue',
  'unpublished',
  'rawGenerator',
  'queueItemIds',
  'responses',
  'acceptedAnswers',
  'answerBanks',
  'validators',
  'generatorSeeds',
  'hiddenQueues',
]);

function assertNoForbiddenReadModelKeys(value, path = 'diagnostic') {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenReadModelKeys(value[index], `${path}[${index}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_READ_MODEL_KEYS.has(key)) {
      throw new Error(`Diagnostic payload exposed forbidden key at ${path}.${key}`);
    }
    assertNoForbiddenReadModelKeys(child, `${path}.${key}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

function makeAttempt(overrides = {}) {
  return {
    ts: Date.UTC(2026, 3, 25, 10, 0, 0),
    itemId: 'test-item-01',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    correct: true,
    supportLevel: 0,
    supportKind: null,
    itemMode: 'choose',
    sessionMode: 'smart',
    testMode: null,
    ...overrides,
  };
}

function secureItemState(overrides = {}) {
  const now = Date.UTC(2026, 3, 25);
  return {
    attempts: 10,
    correct: 9,
    incorrect: 1,
    streak: 4,
    lapses: 0,
    dueAt: 0,
    firstCorrectAt: now - (14 * DAY_MS),
    lastCorrectAt: now,
    lastSeen: now,
    ...overrides,
  };
}

function secureFacetState(skillId, itemMode, overrides = {}) {
  const now = Date.UTC(2026, 3, 25);
  return {
    [`${skillId}::${itemMode}`]: {
      attempts: 10,
      correct: 9,
      streak: 4,
      lapses: 0,
      firstCorrectAt: now - (14 * DAY_MS),
      lastCorrectAt: now,
      ...overrides,
    },
  };
}

function securedRewardUnit(clusterId, rewardUnitId) {
  const key = masteryKey(clusterId, rewardUnitId);
  return {
    [key]: {
      masteryKey: key,
      releaseId: CURRENT_RELEASE_ID,
      clusterId,
      rewardUnitId,
      securedAt: Date.UTC(2026, 3, 24),
    },
  };
}

function freshProgress() {
  return {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
  };
}

// Build a seeded learner with some Pealark progress.
function seededPealarkProgress() {
  const now = Date.UTC(2026, 3, 25);
  const attempts = [];
  // Generate varied attempts for Pealark skills across multiple days.
  const pealarkSkills = [
    { skillId: 'sentence_endings', ruId: 'sentence-endings-core', clusterId: 'endmarks' },
    { skillId: 'speech', ruId: 'speech-core', clusterId: 'speech' },
    { skillId: 'semicolon', ruId: 'semicolons-core', clusterId: 'boundary' },
    { skillId: 'dash_clause', ruId: 'dash-clauses-core', clusterId: 'boundary' },
    { skillId: 'hyphen', ruId: 'hyphens-core', clusterId: 'boundary' },
  ];

  let itemCounter = 0;
  for (const skill of pealarkSkills) {
    for (let day = 0; day < 3; day++) {
      for (let i = 0; i < 5; i++) {
        itemCounter++;
        attempts.push(makeAttempt({
          ts: now - ((3 - day) * DAY_MS) + (i * 60000),
          itemId: `item-pealark-${itemCounter}`,
          skillIds: [skill.skillId],
          rewardUnitId: skill.ruId,
          correct: i < 4, // 80% accuracy
          itemMode: i % 2 === 0 ? 'choose' : 'fix',
        }));
      }
    }
  }

  // Items with memory state.
  const items = {};
  for (let i = 1; i <= itemCounter; i++) {
    items[`item-pealark-${i}`] = secureItemState({
      attempts: 3,
      correct: i % 5 === 0 ? 2 : 3,
      streak: i % 5 === 0 ? 1 : 3,
    });
  }

  // Facets — secure for endmarks and speech.
  const facets = {
    ...secureFacetState('sentence_endings', 'choose'),
    ...secureFacetState('sentence_endings', 'fix'),
    ...secureFacetState('speech', 'choose'),
    ...secureFacetState('speech', 'fix'),
    ...secureFacetState('semicolon', 'choose'),
    ...secureFacetState('dash_clause', 'choose'),
    ...secureFacetState('hyphen', 'choose'),
  };

  // Reward units — all 5 Pealark units secured.
  const rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core'),
    ...securedRewardUnit('speech', 'speech-core'),
    ...securedRewardUnit('boundary', 'semicolons-core'),
    ...securedRewardUnit('boundary', 'dash-clauses-core'),
    ...securedRewardUnit('boundary', 'hyphens-core'),
  };

  return { items, facets, rewardUnits, attempts };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('diagnostic reports correct Stars/highwater/delta for seeded learner', () => {
  const progress = seededPealarkProgress();
  const subjectState = { data: { progress } };
  const codexEntries = {
    pealark: { starHighWater: 42, maxStageEver: 2 },
    claspin: { starHighWater: 0, maxStageEver: 0 },
    curlune: { starHighWater: 0, maxStageEver: 0 },
    quoral: { starHighWater: 5, maxStageEver: 1 },
  };

  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {});

  // Pealark should have non-zero live stars.
  const pealark = diagnostic.monsters.pealark;
  assert.ok(pealark, 'Pealark entry must exist');
  assert.ok(pealark.liveStars > 0, `Pealark liveStars must be positive, got ${pealark.liveStars}`);
  assert.equal(pealark.starHighWater, 42);
  assert.equal(pealark.delta, pealark.liveStars - 42);
  assert.ok(pealark.stage >= 0 && pealark.stage <= 4, 'Stage must be 0-4');
  assert.equal(pealark.maxStageEver, 2);

  // Star breakdown should add up.
  const breakdownTotal = pealark.tryStars + pealark.practiceStars + pealark.secureStars + pealark.masteryStars;
  assert.equal(pealark.liveStars, breakdownTotal, 'Star breakdown must sum to liveStars');

  // Reward unit counts.
  assert.equal(pealark.rewardUnitsSecured, 5, 'All 5 Pealark units should be secured');
});

test('identifies "Mega blocked: insufficient breadth" for Curlune with 4/7 deep-secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const curluneSkills = [
    { skillId: 'list_commas', ruId: 'list-commas-core', clusterId: 'comma_flow' },
    { skillId: 'fronted_adverbial', ruId: 'fronted-adverbials-core', clusterId: 'comma_flow' },
    { skillId: 'comma_clarity', ruId: 'comma-clarity-core', clusterId: 'comma_flow' },
    { skillId: 'parenthesis', ruId: 'parenthesis-core', clusterId: 'structure' },
  ];

  // Build attempts and items for 4 skills.
  const attempts = [];
  const items = {};
  const facets = {};
  const rewardUnits = {};
  let itemCounter = 0;

  for (const skill of curluneSkills) {
    for (let day = 0; day < 3; day++) {
      for (let i = 0; i < 5; i++) {
        itemCounter++;
        attempts.push(makeAttempt({
          ts: now - ((3 - day) * DAY_MS) + (i * 60000),
          itemId: `item-curlune-${itemCounter}`,
          skillIds: [skill.skillId],
          rewardUnitId: skill.ruId,
          correct: true,
          itemMode: i % 2 === 0 ? 'choose' : 'fix',
        }));
      }
    }
    // Secure facets for each skill.
    Object.assign(facets, secureFacetState(skill.skillId, 'choose'));
    Object.assign(facets, secureFacetState(skill.skillId, 'fix'));
    // Secured reward unit.
    Object.assign(rewardUnits, securedRewardUnit(skill.clusterId, skill.ruId));
  }

  for (let i = 1; i <= itemCounter; i++) {
    items[`item-curlune-${i}`] = secureItemState();
  }

  const progress = { items, facets, rewardUnits, attempts };
  const subjectState = { data: { progress } };
  const codexEntries = { curlune: { starHighWater: 0, maxStageEver: 0 } };

  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {});
  const curlune = diagnostic.monsters.curlune;

  assert.ok(curlune, 'Curlune entry must exist');
  assert.equal(curlune.rewardUnitsSecured, 4);
  assert.equal(curlune.rewardUnitsDeepSecured, 4);

  // With only 4/7 deep-secured (need 5), Mega should be blocked.
  const hasBreadthReason = curlune.megaBlocked.some(
    (reason) => reason.includes('insufficient breadth'),
  );
  assert.ok(hasBreadthReason, `Expected 'insufficient breadth' in megaBlocked, got: ${JSON.stringify(curlune.megaBlocked)}`);
});

test('reports Quoral grand stage from cross-monster evidence', () => {
  // Build a learner with secured units across all 3 direct monsters.
  const progress = seededPealarkProgress();

  // Add some Claspin and Curlune secured units.
  Object.assign(progress.rewardUnits, securedRewardUnit('apostrophe', 'apostrophe-contractions-core'));
  Object.assign(progress.rewardUnits, securedRewardUnit('apostrophe', 'apostrophe-possession-core'));
  Object.assign(progress.rewardUnits, securedRewardUnit('comma_flow', 'list-commas-core'));

  const subjectState = { data: { progress } };
  const codexEntries = {
    pealark: { starHighWater: 30, maxStageEver: 2 },
    claspin: { starHighWater: 10, maxStageEver: 1 },
    curlune: { starHighWater: 5, maxStageEver: 1 },
    quoral: { starHighWater: 10, maxStageEver: 1 },
  };

  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {});

  // Grand should have non-zero stars since we have evidence across 3 monsters.
  assert.ok(diagnostic.grand.grandStars >= 0, 'Grand stars must be non-negative');
  assert.ok(diagnostic.grand.grandStage >= 0 && diagnostic.grand.grandStage <= 4, 'Grand stage must be 0-4');
  assert.ok(diagnostic.grand.monstersWithSecured.length > 0, 'Should have at least one monster with secured units');
  assert.equal(diagnostic.grand.totalSecured, 8, 'Total secured should be 8 (5 Pealark + 2 Claspin + 1 Curlune)');
});

test('fresh learner returns valid all-zero diagnostic', () => {
  const subjectState = { data: { progress: freshProgress() } };
  const codexEntries = {};

  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {});

  // All direct monsters should exist with zero values.
  for (const monsterId of DIRECT_PUNCTUATION_MONSTER_IDS) {
    const entry = diagnostic.monsters[monsterId];
    assert.ok(entry, `Monster ${monsterId} must exist`);
    assert.equal(entry.liveStars, 0, `${monsterId} liveStars should be 0`);
    assert.equal(entry.starHighWater, 0, `${monsterId} starHighWater should be 0`);
    assert.equal(entry.delta, 0, `${monsterId} delta should be 0`);
    assert.equal(entry.stage, 0, `${monsterId} stage should be 0`);
    assert.equal(entry.tryStars, 0, `${monsterId} tryStars should be 0`);
    assert.equal(entry.practiceStars, 0, `${monsterId} practiceStars should be 0`);
    assert.equal(entry.secureStars, 0, `${monsterId} secureStars should be 0`);
    assert.equal(entry.masteryStars, 0, `${monsterId} masteryStars should be 0`);
    assert.equal(entry.rewardUnitsTracked, 0);
    assert.equal(entry.rewardUnitsSecured, 0);
    assert.equal(entry.rewardUnitsDeepSecured, 0);
  }

  // Grand should be zero.
  assert.equal(diagnostic.grand.grandStars, 0);
  assert.equal(diagnostic.grand.grandStage, 0);
  assert.deepEqual(diagnostic.grand.monstersWithSecured, []);
  assert.equal(diagnostic.grand.totalSecured, 0);
  assert.equal(diagnostic.grand.totalDeepSecured, 0);

  // Latch state should show no divergence.
  for (const monsterId of ACTIVE_PUNCTUATION_MONSTER_IDS) {
    const latch = diagnostic.latchState[monsterId];
    assert.ok(latch, `Latch state for ${monsterId} must exist`);
    assert.equal(latch.latchLeadsLive, false);
    assert.equal(latch.liveLeadsLatch, false);
  }

  // Structural fields.
  assert.equal(diagnostic.subjectId, 'punctuation');
  assert.ok(diagnostic.generatedAt > 0);
  assert.ok(diagnostic.releaseId.length > 0);
  assert.equal(diagnostic.totalPublishedRewardUnits, PUNCTUATION_CLIENT_REWARD_UNITS.length);
});

test('latch-leads-live shows correctly after lapse', () => {
  // A learner whose starHighWater is higher than current live stars
  // (e.g. after a lapse that reduced live projection).
  const progress = freshProgress();
  // Minimal attempts — just enough for a few try stars.
  progress.attempts = [
    makeAttempt({ itemId: 'item-1', correct: true }),
    makeAttempt({ itemId: 'item-2', correct: true }),
  ];

  const subjectState = { data: { progress } };
  const codexEntries = {
    pealark: { starHighWater: 50, maxStageEver: 3 },
  };

  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {});

  const pealark = diagnostic.monsters.pealark;
  assert.ok(pealark.liveStars < 50, `Live stars (${pealark.liveStars}) should be less than starHighWater (50)`);
  assert.equal(pealark.starHighWater, 50);
  assert.ok(pealark.delta < 0, 'Delta should be negative when latch leads live');

  // Latch state.
  assert.equal(diagnostic.latchState.pealark.latchLeadsLive, true, 'latchLeadsLive should be true');
  assert.equal(diagnostic.latchState.pealark.liveLeadsLatch, false, 'liveLeadsLatch should be false');
});

test('forbidden-key scan passes on diagnostic payload', () => {
  // Seeded learner with real progress.
  const progress = seededPealarkProgress();
  const subjectState = { data: { progress } };
  const codexEntries = {
    pealark: { starHighWater: 42, maxStageEver: 2 },
    claspin: {},
    curlune: {},
    quoral: { starHighWater: 5 },
  };

  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {
    perKind: {
      'card-opened': { accepted: 10, dropped: 2, deduped: 1, rateLimited: 0, lastEventAt: Date.now() },
      'session-started': { accepted: 5, dropped: 0, deduped: 0, rateLimited: 0, lastEventAt: Date.now() },
    },
  });

  // The recursive scan must not throw.
  assert.doesNotThrow(
    () => assertNoForbiddenReadModelKeys(diagnostic),
    'Diagnostic payload must not contain forbidden keys',
  );
});

test('totals agree with starView from same progress data', () => {
  const progress = seededPealarkProgress();

  // Compute diagnostic.
  const subjectState = { data: { progress } };
  const codexEntries = {
    pealark: { starHighWater: 42, maxStageEver: 2 },
    claspin: {},
    curlune: {},
    quoral: { starHighWater: 5 },
  };
  const diagnostic = buildPunctuationDiagnostic(subjectState, codexEntries, {});

  // Compute the read model starView from the same progress.
  const readModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: { data: { progress } },
  });

  // Per-monster star totals must agree.
  for (const monsterId of DIRECT_PUNCTUATION_MONSTER_IDS) {
    const diagEntry = diagnostic.monsters[monsterId];
    const starEntry = readModel.starView.perMonster[monsterId];

    if (diagEntry && starEntry) {
      assert.equal(
        diagEntry.liveStars,
        starEntry.total,
        `${monsterId}: diagnostic liveStars (${diagEntry.liveStars}) must equal starView total (${starEntry.total})`,
      );
      assert.equal(
        diagEntry.tryStars,
        starEntry.tryStars,
        `${monsterId}: tryStars must agree`,
      );
      assert.equal(
        diagEntry.practiceStars,
        starEntry.practiceStars,
        `${monsterId}: practiceStars must agree`,
      );
      assert.equal(
        diagEntry.secureStars,
        starEntry.secureStars,
        `${monsterId}: secureStars must agree`,
      );
      assert.equal(
        diagEntry.masteryStars,
        starEntry.masteryStars,
        `${monsterId}: masteryStars must agree`,
      );
    }
  }

  // Grand stars must agree.
  assert.equal(
    diagnostic.grand.grandStars,
    readModel.starView.grand.grandStars,
    `Grand stars must agree: diagnostic=${diagnostic.grand.grandStars}, readModel=${readModel.starView.grand.grandStars}`,
  );
});

// ---------------------------------------------------------------------------
// Admin normaliser tests
// ---------------------------------------------------------------------------

test('normalisePunctuationDiagnostic produces valid shape from raw diagnostic', () => {
  const progress = seededPealarkProgress();
  const subjectState = { data: { progress } };
  const raw = buildPunctuationDiagnostic(subjectState, {
    pealark: { starHighWater: 42, maxStageEver: 2 },
  }, {});

  const normalised = normalisePunctuationDiagnostic(raw);

  assert.equal(normalised.subjectId, 'punctuation');
  assert.ok(normalised.generatedAt > 0);
  assert.ok(normalised.monsters.pealark);
  assert.equal(typeof normalised.monsters.pealark.liveStars, 'number');
  assert.equal(typeof normalised.monsters.pealark.starHighWater, 'number');
  assert.equal(typeof normalised.grand.grandStars, 'number');
  assert.ok(Array.isArray(normalised.activeMonsterIds));
  assert.ok(Array.isArray(normalised.directMonsterIds));
});

test('normalisePunctuationDiagnostic handles null/undefined input gracefully', () => {
  const normalised = normalisePunctuationDiagnostic(null);

  assert.equal(normalised.subjectId, 'punctuation');
  assert.equal(normalised.generatedAt, 0);
  assert.deepEqual(normalised.monsters, {});
  assert.equal(normalised.grand.grandStars, 0);
  assert.equal(normalised.grand.grandStage, 0);
  assert.deepEqual(normalised.latchState, {});
  assert.equal(normalised.sessionContext.sessionId, null);
  assert.deepEqual(normalised.telemetrySummary, {});
  assert.deepEqual(normalised.activeMonsterIds, []);
  assert.deepEqual(normalised.directMonsterIds, []);
});

test('normalisePunctuationDiagnostic coerces malformed values defensively', () => {
  const normalised = normalisePunctuationDiagnostic({
    subjectId: 123,           // wrong type
    generatedAt: 'not-a-number',
    monsters: {
      pealark: {
        liveStars: 'forty-five',
        starHighWater: null,
        delta: undefined,
        megaBlocked: 'not-an-array',
      },
    },
    grand: {
      grandStars: -5,
      monstersWithSecured: 'not-array',
    },
    latchState: {
      pealark: {
        latchLeadsLive: 'yes',  // not boolean
      },
    },
    sessionContext: {
      sessionId: 42, // not string
    },
  });

  assert.equal(normalised.subjectId, 'punctuation');
  assert.equal(normalised.generatedAt, 0);
  assert.equal(normalised.monsters.pealark.liveStars, 0);
  assert.equal(normalised.monsters.pealark.starHighWater, 0);
  assert.equal(normalised.monsters.pealark.delta, 0);
  assert.deepEqual(normalised.monsters.pealark.megaBlocked, []);
  assert.equal(normalised.grand.grandStars, 0);
  assert.deepEqual(normalised.grand.monstersWithSecured, []);
  assert.equal(normalised.latchState.pealark.latchLeadsLive, false);
  assert.equal(normalised.sessionContext.sessionId, null);
});
