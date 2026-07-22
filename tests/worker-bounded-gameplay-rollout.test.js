import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWorkerRepository } from '../worker/src/repository.js';
import { createWorkerApp } from '../worker/src/app.js';
import { SqliteD1Database } from './helpers/sqlite-d1.js';

const MIGRATION_FILENAME = '0023_bounded_gameplay_state.sql';
const NOW = Date.UTC(2026, 0, 1);

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function readMigration(filename) {
  return fs.readFileSync(path.join(rootDir(), 'worker', 'migrations', filename), 'utf8');
}

function createDatabaseBefore0023() {
  const DB = new SqliteD1Database();
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  for (const filename of fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_FILENAME)
    .sort()) {
    DB.db.exec(readMigration(filename));
  }
  DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision
    ) VALUES ('adult-a', 'adult@example.test', 'Adult', 'parent', NULL, ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES ('learner-a', 'Learner', 'Y5', '#123456', 'sats', 15, ?, ?, 0)
  `).run(NOW, NOW);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    ) VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(NOW, NOW);
  DB.db.prepare(`
    UPDATE adult_accounts SET selected_learner_id = 'learner-a' WHERE id = 'adult-a'
  `).run();
  return DB;
}

function subjectData(DB, subjectId) {
  const row = DB.db.prepare(`
    SELECT data_json FROM child_subject_state
    WHERE learner_id = 'learner-a' AND subject_id = ?
  `).get(subjectId);
  return row ? JSON.parse(row.data_json) : null;
}

async function writeLegacyCompatibleFixtures(repository) {
  await repository.persistSubjectRuntime('adult-a', 'learner-a', 'spelling', {
    state: { phase: 'dashboard' },
    data: {
      prefs: { mode: 'smart' },
      progress: { possess: { stage: 2, attempts: 3, correct: 2, wrong: 1, dueDay: 2 } },
    },
    spellingGameplay: { previousData: {}, stats: {}, resetAllItems: false },
  });
  await repository.persistSubjectRuntime('adult-a', 'learner-a', 'grammar', {
    state: { phase: 'dashboard', mastery: { items: { 'grammar-a': { attempts: 1 } } } },
    data: { mastery: { items: { 'grammar-a': { attempts: 1 } } } },
    grammarGameplay: { previousData: {}, resetAllItems: false },
  });
  await repository.persistSubjectRuntime('adult-a', 'learner-a', 'reading', {
    state: { phase: 'dashboard' },
    data: { questions: { 'reading-a': { attempts: 1, correct: 1 } } },
    readingGameplay: { previousData: {}, resetAllQuestions: false },
  });
  await repository.persistSubjectRuntime('adult-a', 'learner-a', 'punctuation', {
    state: { phase: 'dashboard' },
    data: {
      progress: {
        items: { 'punctuation-a': { attempts: 1, correct: 1, streak: 1 } },
        facets: {},
        rewardUnits: {},
        attempts: [],
        sessionsCompleted: 0,
      },
    },
    punctuationGameplay: { previousData: {}, resetAllItems: false },
  });
}

async function postSubjectCommand(app, DB, subjectId, body) {
  const response = await app.fetch(new Request(`https://repo.test/api/subjects/${subjectId}/command`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify(body),
  }), {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    PUNCTUATION_SUBJECT_ENABLED: 'true',
  }, { waitUntil() {} });
  const payload = await response.json();
  assert.equal(response.status, 200, `${subjectId}: ${JSON.stringify(payload)}`);
  return payload;
}

test('new Worker preserves legacy authority before the 0023 readiness gate', async () => {
  const DB = createDatabaseBefore0023();
  const repository = createWorkerRepository({ env: { DB }, now: () => NOW });
  try {
    await writeLegacyCompatibleFixtures(repository);

    assert.equal(subjectData(DB, 'spelling').progress.possess.attempts, 3);
    assert.equal(subjectData(DB, 'grammar').mastery.items['grammar-a'].attempts, 1);
    assert.equal(subjectData(DB, 'reading').questions['reading-a'].correct, 1);
    assert.equal(subjectData(DB, 'punctuation').progress.items['punctuation-a'].correct, 1);

    const bootstrap = await repository.bootstrapV2Get('adult-a', {
      publicReadModels: true,
      preferredLearnerId: 'learner-a',
    });
    assert.ok(bootstrap.subjectStates['learner-a::spelling']);

    const hero = await repository.readHeroSubjectReadModels('learner-a', {
      accountId: 'adult-a',
      now: NOW,
    });
    assert.ok(hero.spelling);
  } finally {
    DB.close();
  }
});

test('real subject commands remain operational before 0023 exists', async () => {
  const DB = createDatabaseBefore0023();
  const app = createWorkerApp({ now: () => NOW });
  try {
    const commands = [
      ['spelling', { mode: 'smart', roundLength: 1 }],
      ['grammar', { mode: 'smart', roundLength: 1, seed: 10 }],
      ['reading', { mode: 'guided', viewMode: 'one' }],
      ['punctuation', { mode: 'endmarks', roundLength: '1' }],
    ];
    let revision = 0;
    for (const [subjectId, payload] of commands) {
      const result = await postSubjectCommand(app, DB, subjectId, {
        command: 'start-session',
        learnerId: 'learner-a',
        requestId: `pre-0023-${subjectId}`,
        expectedLearnerRevision: revision,
        payload,
      });
      revision = result.mutation.appliedRevision;
      assert.ok(subjectData(DB, subjectId), `${subjectId} should persist to the legacy row`);
    }
    assert.equal(revision, 4);
  } finally {
    DB.close();
  }
});

test('table existence without the 0023 ready marker does not cut authority over early', async () => {
  const DB = createDatabaseBefore0023();
  const repository = createWorkerRepository({ env: { DB }, now: () => NOW });
  try {
    await writeLegacyCompatibleFixtures(repository);
    const sql = readMigration(MIGRATION_FILENAME);
    const readinessInsert = sql.indexOf('-- All bounded rows and Punctuation aggregates now exist.');
    assert.ok(readinessInsert > 0);
    DB.db.exec(sql.slice(0, readinessInsert));

    const legacy = await repository.readSubjectRuntime('adult-a', 'learner-a', 'grammar');
    const working = await repository.readGrammarGameplayWorkingSet(
      'adult-a',
      'learner-a',
      ['grammar-a'],
      { subjectRecord: legacy.subjectRecord },
    );
    assert.equal(working.data.mastery.items['grammar-a'].attempts, 1);

    await repository.persistSubjectRuntime('adult-a', 'learner-a', 'grammar', {
      state: {
        ...working.ui,
        mastery: { ...working.ui.mastery, items: { 'grammar-a': { attempts: 2 } } },
      },
      data: {
        ...working.data,
        mastery: { ...working.data.mastery, items: { 'grammar-a': { attempts: 2 } } },
      },
      grammarGameplay: { previousData: working.data, resetAllItems: false },
    });
    assert.equal(subjectData(DB, 'grammar').mastery.items['grammar-a'].attempts, 2);

    DB.db.exec(sql);
    assert.equal(
      DB.db.prepare(`
        SELECT state FROM bounded_gameplay_state_migrations WHERE migration_id = '0023'
      `).get().state,
      'ready',
    );
    assert.equal(subjectData(DB, 'grammar').mastery.items, undefined);
    assert.equal(
      JSON.parse(DB.db.prepare(`
        SELECT mastery_json FROM grammar_item_state
        WHERE learner_id = 'learner-a' AND item_id = 'grammar-a'
      `).get().mastery_json).attempts,
      2,
    );
  } finally {
    DB.close();
  }
});

test('ready marker plus a missing split table fails closed without writing legacy state', async () => {
  const cases = [
    ['spelling', 'spelling_learner_state', { mode: 'smart', roundLength: 1 }],
    ['grammar', 'grammar_item_state', { mode: 'smart', roundLength: 1, seed: 10 }],
    ['reading', 'reading_question_state', { mode: 'guided', viewMode: 'one' }],
    ['punctuation', 'punctuation_item_state', { mode: 'endmarks', roundLength: '1' }],
  ];

  for (const [subjectId, tableName, payload] of cases) {
    const DB = createDatabaseBefore0023();
    const app = createWorkerApp({ now: () => NOW });
    try {
      DB.db.exec(readMigration(MIGRATION_FILENAME));
      DB.db.exec(`DROP TABLE ${tableName}`);
      const response = await app.fetch(new Request(`https://repo.test/api/subjects/${subjectId}/command`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://repo.test',
          'x-ks2-dev-account-id': 'adult-a',
        },
        body: JSON.stringify({
          command: 'start-session',
          learnerId: 'learner-a',
          requestId: `missing-split-${subjectId}`,
          expectedLearnerRevision: 0,
          payload,
        }),
      }), {
        DB,
        AUTH_MODE: 'development-stub',
        ENVIRONMENT: 'test',
        PUNCTUATION_SUBJECT_ENABLED: 'true',
      }, { waitUntil() {} });
      const responseBody = await response.json();
      assert.equal(response.status, 503, `${subjectId}: ${JSON.stringify(responseBody)}`);
      assert.equal(responseBody.code, 'bounded_gameplay_state_unavailable', subjectId);
      assert.equal(responseBody.retryable, true, subjectId);
      assert.equal(DB.db.prepare(`
        SELECT state_revision FROM learner_profiles WHERE id = 'learner-a'
      `).get().state_revision, 0, `${subjectId} must not bump learner authority`);
      assert.equal(DB.db.prepare(`
        SELECT COUNT(*) AS count FROM mutation_receipts
        WHERE request_id = ?
      `).get(`missing-split-${subjectId}`).count, 0, `${subjectId} must not write a receipt`);
    } finally {
      DB.close();
    }
  }
});

test('a missing Spelling learner row does not add work or failures to other subject commands', async () => {
  const DB = createDatabaseBefore0023();
  const app = createWorkerApp({ now: () => NOW });
  try {
    DB.db.exec(readMigration(MIGRATION_FILENAME));
    DB.db.prepare(`
      DELETE FROM spelling_learner_state WHERE learner_id = 'learner-a'
    `).run();

    const commands = [
      ['grammar', { mode: 'smart', roundLength: 1, seed: 10 }],
      ['reading', { mode: 'guided', viewMode: 'one' }],
      ['punctuation', { mode: 'endmarks', roundLength: '1' }],
    ];
    let revision = 0;
    for (const [subjectId, payload] of commands) {
      const result = await postSubjectCommand(app, DB, subjectId, {
        command: 'start-session',
        learnerId: 'learner-a',
        requestId: `missing-spelling-parent-${subjectId}`,
        expectedLearnerRevision: revision,
        payload,
      });
      revision = result.mutation.appliedRevision;
    }
    assert.equal(revision, 3);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_learner_state
      WHERE learner_id = 'learner-a'
    `).get().count, 0, 'non-Spelling commands never inspect or repair Spelling authority');
  } finally {
    DB.close();
  }
});

test('bounded subject clears and learner reset preserve the compact Spelling parent invariant', async () => {
  const DB = createDatabaseBefore0023();
  DB.db.exec(readMigration(MIGRATION_FILENAME));
  const repository = createWorkerRepository({ env: { DB }, now: () => NOW });
  const assertEmptySpellingParent = () => {
    const row = DB.db.prepare(`
      SELECT ui_json, data_json, stats_json
      FROM spelling_learner_state
      WHERE learner_id = 'learner-a'
    `).get();
    assert.ok(row, 'reset keeps the compact parent authority row');
    assert.equal(JSON.parse(row.ui_json), null);
    assert.deepEqual(JSON.parse(row.data_json), { prefs: {} });
    assert.deepEqual(Object.keys(JSON.parse(row.stats_json)).sort(), [
      'all',
      'core',
      'extra',
      'secureExtension',
      'y34',
      'y56',
    ]);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_item_state
      WHERE learner_id = 'learner-a'
    `).get().count, 0);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_achievement_state
      WHERE learner_id = 'learner-a'
    `).get().count, 0);
  };

  try {
    await writeLegacyCompatibleFixtures(repository);
    const spellingClear = await repository.clearSubjectState(
      'adult-a',
      'learner-a',
      'spelling',
      { requestId: 'bounded-clear-spelling', expectedLearnerRevision: 0 },
    );
    assert.equal(spellingClear.cleared, true);
    assertEmptySpellingParent();
    await repository.readSubjectRuntime('adult-a', 'learner-a', 'spelling');

    await writeLegacyCompatibleFixtures(repository);
    const allSubjectsClear = await repository.clearSubjectState(
      'adult-a',
      'learner-a',
      null,
      { requestId: 'bounded-clear-all', expectedLearnerRevision: 1 },
    );
    assert.equal(allSubjectsClear.cleared, true);
    assertEmptySpellingParent();
    await repository.readSubjectRuntime('adult-a', 'learner-a', 'spelling');

    await writeLegacyCompatibleFixtures(repository);
    const reset = await repository.resetLearnerRuntime('adult-a', 'learner-a', {
      requestId: 'bounded-reset-runtime',
      expectedLearnerRevision: 2,
    });
    assert.equal(reset.reset, true);
    assertEmptySpellingParent();
    const bootstrap = await repository.bootstrapV2Get('adult-a', {
      publicReadModels: true,
      preferredLearnerId: 'learner-a',
    });
    assert.ok(bootstrap.subjectStates['learner-a::spelling']);
  } finally {
    DB.close();
  }
});

test('bounded clear and reset integrity preflights are zero-write before learner CAS', async () => {
  const cases = [
    ['spelling-clear', (repository, requestId) => repository.clearSubjectState(
      'adult-a', 'learner-a', 'spelling', { requestId, expectedLearnerRevision: 0 },
    )],
    ['all-subjects-clear', (repository, requestId) => repository.clearSubjectState(
      'adult-a', 'learner-a', null, { requestId, expectedLearnerRevision: 0 },
    )],
    ['runtime-reset', (repository, requestId) => repository.resetLearnerRuntime(
      'adult-a', 'learner-a', { requestId, expectedLearnerRevision: 0 },
    )],
  ];

  for (const [name, mutate] of cases) {
    const DB = createDatabaseBefore0023();
    DB.db.exec(readMigration(MIGRATION_FILENAME));
    const repository = createWorkerRepository({ env: { DB }, now: () => NOW });
    try {
      await writeLegacyCompatibleFixtures(repository);
      DB.db.prepare(`
        DELETE FROM spelling_learner_state WHERE learner_id = 'learner-a'
      `).run();
      const tableCounts = () => Object.fromEntries([
        'child_subject_state',
        'spelling_item_state',
        'spelling_achievement_state',
        'grammar_item_state',
        'reading_question_state',
        'punctuation_item_state',
        'practice_sessions',
        'child_game_state',
        'event_log',
      ].map((tableName) => [
        tableName,
        DB.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE learner_id = 'learner-a'`).get().count,
      ]));
      const before = tableCounts();
      const requestId = `missing-parent-${name}`;

      await assert.rejects(
        mutate(repository, requestId),
        error => error?.status === 503
          && error?.extra?.code === 'bounded_gameplay_state_unavailable',
        name,
      );
      assert.equal(DB.db.prepare(`
        SELECT state_revision FROM learner_profiles WHERE id = 'learner-a'
      `).get().state_revision, 0, `${name}: preflight must not consume the CAS revision`);
      assert.deepEqual(tableCounts(), before, `${name}: no learner data may be cleared`);
      assert.equal(DB.db.prepare(`
        SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id = ?
      `).get(requestId).count, 0, `${name}: a failed preflight must not write a receipt`);
    } finally {
      DB.close();
    }
  }
});

test('reset and Post-Mega seed remain deploy-order safe before 0023 exists', async () => {
  const DB = createDatabaseBefore0023();
  DB.db.prepare("UPDATE adult_accounts SET platform_role = 'admin' WHERE id = 'adult-a'").run();
  const repository = createWorkerRepository({ env: { DB }, now: () => NOW });
  try {
    const seeded = await repository.seedPostMegaLearnerState('adult-a', {
      learnerId: 'learner-a',
      shapeName: 'fresh-graduate',
      today: Math.floor(NOW / 86_400_000),
      mutation: { requestId: 'pre-0023-seed' },
    });
    assert.equal(seeded.postMegaSeed.shapeName, 'fresh-graduate');
    assert.equal(seeded.postMegaSeedMutation.appliedRevision, 1);
    assert.ok(subjectData(DB, 'spelling').progress);

    const reset = await repository.resetLearnerRuntime('adult-a', 'learner-a', {
      requestId: 'pre-0023-reset',
      expectedLearnerRevision: 1,
    });
    assert.equal(reset.reset, true);
    assert.equal(DB.db.prepare(`
      SELECT COUNT(*) AS count FROM child_subject_state WHERE learner_id = 'learner-a'
    `).get().count, 0);
  } finally {
    DB.close();
  }
});
