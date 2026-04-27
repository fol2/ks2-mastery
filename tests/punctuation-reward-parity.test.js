// tests/punctuation-reward-parity.test.js
//
// Phase 5 U9: Star-count parity proof across all five consumer surfaces.
//
// Seeds a progress state with known evidence, builds the read-model and
// dashboard model, and asserts that every entry point into star data
// produces identical values. Two scenarios: fresh learner (all zeros)
// and seeded evidence (non-zero).
//
// The five surfaces:
//   1. read-model starView.perMonster[monsterId].total
//   2. read-model starView.grand.grandStars
//   3. dashboard model activeMonsters[i].totalStars
//   4. dashboard model quoral entry totalStars
//   5. read-model progressSnapshot.securedRewardUnits (corrected, from U1)
//
// Negative assertions:
//   - No child-facing component renders "Stage X of 4"
//   - No child-facing component renders "XP"
//   - Reserved monsters (colisk, hyphang, carillon) never appear in
//     rendered output of any punctuation scene component

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';
import { buildPunctuationDashboardModel } from '../src/subjects/punctuation/components/punctuation-view-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

function freshSubjectState() {
  return {
    data: {
      progress: {
        items: {},
        facets: {},
        rewardUnits: {},
        attempts: [],
        sessionsCompleted: 0,
      },
    },
    updatedAt: 1,
  };
}

function secureItemState(now) {
  return {
    attempts: 10, correct: 9, incorrect: 1, streak: 4, lapses: 0,
    dueAt: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now, lastSeen: now,
  };
}

function securedRewardUnit(clusterId, rewardUnitId, now) {
  const key = masteryKey(clusterId, rewardUnitId);
  return {
    [key]: {
      masteryKey: key,
      releaseId: CURRENT_RELEASE_ID,
      clusterId,
      rewardUnitId,
      securedAt: now - 10_000,
    },
  };
}

/**
 * Build a seeded subject state with evidence across all 3 direct monsters.
 */
function seededSubjectState(now) {
  const state = freshSubjectState();
  const progress = state.data.progress;

  // Pealark: endmarks cluster
  for (let i = 0; i < 5; i++) {
    progress.attempts.push({
      ts: now - (i * 60_000),
      sessionId: 'parity-session',
      itemId: `se_item_${i}`,
      itemMode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  // Claspin: apostrophe cluster
  for (let i = 0; i < 3; i++) {
    progress.attempts.push({
      ts: now - (i * 60_000) - 300_000,
      sessionId: 'parity-session',
      itemId: `apos_item_${i}`,
      itemMode: 'choose',
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  // Curlune: comma_flow cluster
  for (let i = 0; i < 3; i++) {
    progress.attempts.push({
      ts: now - (i * 60_000) - 600_000,
      sessionId: 'parity-session',
      itemId: `lc_item_${i}`,
      itemMode: 'choose',
      skillIds: ['list_commas'],
      rewardUnitId: 'list-commas-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  // Secured reward units.
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core', now),
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core', now),
    ...securedRewardUnit('comma_flow', 'list-commas-core', now),
  };

  // Deep-secured facets.
  progress.facets = {
    'sentence_endings::choose': secureItemState(now),
    'apostrophe_contractions::choose': secureItemState(now),
    'list_commas::choose': secureItemState(now),
  };

  return state;
}

// ---------------------------------------------------------------------------
// Test 1: Fresh learner — all five surfaces produce zeros
// ---------------------------------------------------------------------------

test('parity: fresh learner — all five consumer surfaces produce zero star counts', () => {
  const now = Date.UTC(2026, 3, 25);
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => now,
  });

  // Surface 1: read-model starView.perMonster[monsterId].total
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(model.starView.perMonster[monsterId].total, 0,
      `Fresh learner: starView.perMonster.${monsterId}.total must be 0`);
  }

  // Surface 2: read-model starView.grand.grandStars
  assert.equal(model.starView.grand.grandStars, 0,
    'Fresh learner: starView.grand.grandStars must be 0');

  // Build the dashboard model from the same starView.
  const stats = {
    due: 0, weak: 0, securedRewardUnits: 0, accuracy: 0,
  };
  const learner = { prefs: { mode: 'smart' } };
  const dashboard = buildPunctuationDashboardModel(stats, learner, {}, model.starView);

  // Surface 3: dashboard activeMonsters[i].totalStars
  for (const monster of dashboard.activeMonsters) {
    if (monster.id === 'quoral') continue;
    assert.equal(monster.totalStars, 0,
      `Fresh learner: dashboard ${monster.id}.totalStars must be 0`);
  }

  // Surface 4: dashboard quoral entry totalStars
  const quoral = dashboard.activeMonsters.find((m) => m.id === 'quoral');
  assert.ok(quoral, 'Quoral must exist in activeMonsters');
  assert.equal(quoral.totalStars, 0,
    'Fresh learner: dashboard quoral.totalStars must be 0');

  // Surface 5: read-model progressSnapshot.securedRewardUnits
  assert.equal(model.progressSnapshot.securedRewardUnits, 0,
    'Fresh learner: progressSnapshot.securedRewardUnits must be 0');
});

// ---------------------------------------------------------------------------
// Test 2: Seeded evidence — five-surface parity (non-zero)
// ---------------------------------------------------------------------------

test('parity: seeded evidence — all five consumer surfaces produce consistent star counts', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = seededSubjectState(now);

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  // Surface 1: read-model starView.perMonster totals
  const pealarkStars = model.starView.perMonster.pealark.total;
  const claspinStars = model.starView.perMonster.claspin.total;
  const curluneStars = model.starView.perMonster.curlune.total;

  assert.ok(pealarkStars > 0, `Pealark stars must be > 0, got ${pealarkStars}`);
  assert.ok(claspinStars > 0, `Claspin stars must be > 0, got ${claspinStars}`);
  assert.ok(curluneStars > 0, `Curlune stars must be > 0, got ${curluneStars}`);

  // Surface 2: read-model starView.grand.grandStars
  const grandStars = model.starView.grand.grandStars;
  assert.ok(grandStars > 0, `grandStars must be > 0, got ${grandStars}`);

  // Build dashboard model with the SAME starView.
  const stats = {
    due: 0,
    weak: 0,
    securedRewardUnits: model.progressSnapshot.securedRewardUnits,
    accuracy: 0,
  };
  const learner = { prefs: { mode: 'smart' } };
  const dashboard = buildPunctuationDashboardModel(stats, learner, {}, model.starView);

  // Surface 3: dashboard activeMonsters[i].totalStars must match read-model
  const dashPealark = dashboard.activeMonsters.find((m) => m.id === 'pealark');
  const dashClaspin = dashboard.activeMonsters.find((m) => m.id === 'claspin');
  const dashCurlune = dashboard.activeMonsters.find((m) => m.id === 'curlune');

  assert.equal(dashPealark.totalStars, pealarkStars,
    `Dashboard pealark.totalStars (${dashPealark.totalStars}) must equal read-model (${pealarkStars})`);
  assert.equal(dashClaspin.totalStars, claspinStars,
    `Dashboard claspin.totalStars (${dashClaspin.totalStars}) must equal read-model (${claspinStars})`);
  assert.equal(dashCurlune.totalStars, curluneStars,
    `Dashboard curlune.totalStars (${dashCurlune.totalStars}) must equal read-model (${curluneStars})`);

  // Surface 4: dashboard quoral entry totalStars must match grand.grandStars
  const dashQuoral = dashboard.activeMonsters.find((m) => m.id === 'quoral');
  assert.ok(dashQuoral, 'Quoral must exist in dashboard activeMonsters');
  assert.equal(dashQuoral.totalStars, grandStars,
    `Dashboard quoral.totalStars (${dashQuoral.totalStars}) must equal read-model grandStars (${grandStars})`);

  // Surface 5: read-model progressSnapshot.securedRewardUnits
  assert.equal(model.progressSnapshot.securedRewardUnits, 3,
    'progressSnapshot.securedRewardUnits must equal 3 (the 3 seeded secured units)');
});

// ---------------------------------------------------------------------------
// Test 3: Idempotency — two builds produce identical parity
// ---------------------------------------------------------------------------

test('parity: two builds with identical input produce identical star values', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = seededSubjectState(now);

  const model1 = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  const model2 = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.deepStrictEqual(model1.starView, model2.starView,
    'Two builds with identical input must produce identical starView');
  assert.equal(model1.progressSnapshot.securedRewardUnits,
    model2.progressSnapshot.securedRewardUnits,
    'Two builds must produce identical securedRewardUnits');
});

// ---------------------------------------------------------------------------
// Negative assertions: grep tests
// ---------------------------------------------------------------------------

/**
 * Read all child-facing Punctuation scene components and return their
 * concatenated source text. These are the JSX files under
 * src/subjects/punctuation/components/ — the files that produce the
 * HTML that children see.
 */
function readChildFacingComponentSource() {
  const componentsDir = path.resolve(__dirname, '..', 'src', 'subjects', 'punctuation', 'components');
  const files = readdirSync(componentsDir).filter((f) => f.endsWith('.jsx'));
  let combined = '';
  for (const f of files) {
    combined += readFileSync(path.join(componentsDir, f), 'utf-8');
  }
  return combined;
}

test('negative: no child-facing component renders "Stage X of 4"', () => {
  const source = readChildFacingComponentSource();

  // We look for string literals / template expressions that would produce
  // "Stage N of 4" in the rendered output. Comments are excluded by
  // checking only JSX return expressions, but a simpler approach is to
  // check that no `Stage ${...} of 4` or `Stage N of 4` pattern exists
  // outside of comments.
  //
  // Strip single-line comments (//) and block comments (/* ... */) first.
  const stripped = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const stagePattern = /Stage\s+\d+\s+of\s+4/;
  assert.equal(stagePattern.test(stripped), false,
    'No child-facing component may render "Stage X of 4" — use star meters instead.');
});

test('negative: no child-facing component renders "XP" as a reward label', () => {
  const source = readChildFacingComponentSource();
  const stripped = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Look for XP used as a standalone token in JSX text or template literals.
  // This must NOT match inside variable names like maxXPos or exports.
  // Match: "XP", " XP ", ">XP<", `${n} XP`, etc.
  const xpPattern = /(?:^|[\s>"`'{(])XP(?:[\s<"`'}).,;:]|$)/m;
  assert.equal(xpPattern.test(stripped), false,
    'No child-facing component may render "XP" — use Stars instead.');
});

test('negative: reserved monsters (colisk, hyphang, carillon) never appear in rendered punctuation components', () => {
  const source = readChildFacingComponentSource();
  // Strip comments.
  const stripped = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    // Case-insensitive check for the reserved monster name appearing in
    // any non-comment code (string literal, JSX text, variable, etc.).
    const pattern = new RegExp(reserved, 'i');
    assert.equal(pattern.test(stripped), false,
      `Reserved monster "${reserved}" must not appear in rendered output of any punctuation scene component.`);
  }
});
