import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const MIGRATION_FILENAME = '0023_bounded_gameplay_state.sql';
const VERIFIER_FILENAME = '0023_verify_legacy_gameplay_state.sql';
const MATERIALISER_FILENAME = '0023_materialise_legacy_gameplay_state.sql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSql(directory, filename) {
  return fs.readFileSync(path.join(root, 'worker', directory, filename), 'utf8');
}

function createRollbackFixture() {
  const db = new SqliteD1Database();
  const migrationsDir = path.join(root, 'worker', 'migrations');
  for (const filename of fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_FILENAME)
    .sort()) {
    db.db.exec(readSql('migrations', filename));
  }

  db.db.exec(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, created_at, updated_at, repo_revision
    ) VALUES
      ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', 1, 1, 0),
      ('adult-b', 'adult-b@example.test', 'Adult B', 'parent', 1, 1, 0);

    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES
      ('learner-a', 'Learner A', 'Y5', '#123456', '', 15, 1, 1, 0),
      ('learner-b', 'Learner B', 'Y6', '#654321', '', 15, 1, 1, 0);
  `);

  const insert = db.db.prepare(`
    INSERT INTO child_subject_state (
      learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [index, learnerId] of ['learner-a', 'learner-b'].entries()) {
    const ordinal = index + 1;
    const accountId = `adult-${index === 0 ? 'a' : 'b'}`;
    insert.run(
      learnerId,
      'spelling',
      JSON.stringify({ phase: `spelling-${ordinal}` }),
      JSON.stringify({
        prefs: { mode: `mode-${ordinal}` },
        achievements: {
          [`badge-${ordinal}`]: { unlockedAt: ordinal },
          '_progress:guardian:days': { days: [ordinal] },
        },
        progress: { shared: { attempts: ordinal, correct: ordinal, stage: ordinal } },
        guardian: { shared: { reviewLevel: ordinal } },
        pattern: { wobbling: { shared: { count: ordinal } } },
      }),
      10 + ordinal,
      accountId,
    );
    insert.run(
      learnerId,
      'grammar',
      JSON.stringify({ phase: `grammar-${ordinal}` }),
      JSON.stringify({ mastery: { items: { shared: { attempts: ordinal, correct: ordinal } } } }),
      10 + ordinal,
      accountId,
    );
    insert.run(
      learnerId,
      'reading',
      JSON.stringify({ phase: `reading-${ordinal}` }),
      JSON.stringify({ questions: { shared: { attempts: ordinal, correct: ordinal } } }),
      10 + ordinal,
      accountId,
    );
    insert.run(
      learnerId,
      'punctuation',
      JSON.stringify({ phase: `punctuation-${ordinal}` }),
      JSON.stringify({
        progress: {
          items: { shared: { attempts: ordinal, correct: ordinal, streak: ordinal } },
          facets: {},
          rewardUnits: {},
          attempts: [],
          sessionsCompleted: 0,
        },
      }),
      10 + ordinal,
      accountId,
    );
  }

  db.db.exec(readSql('migrations', MIGRATION_FILENAME));
  db.db.exec(readSql('recovery', MATERIALISER_FILENAME));
  return db;
}

function proof(db) {
  return db.db.prepare(readSql('recovery', VERIFIER_FILENAME)).all();
}

function assertAllChecksPass(db) {
  const rows = proof(db);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
  }
}

function assertCheckFails(db, checkName) {
  const row = proof(db).find((candidate) => candidate.check_name === checkName);
  assert.ok(row, `missing verifier check: ${checkName}`);
  assert.equal(row.ok, 0, `${checkName} must fail closed`);
  return row;
}

function withFixture(run) {
  const db = createRollbackFixture();
  try {
    run(db);
  } finally {
    db.close();
  }
}

const subjectItems = {
  spelling: {
    table: 'spelling_item_state',
    keyColumn: 'slug',
    valueColumn: 'progress_json',
    legacyPath: '$.progress.shared',
  },
  grammar: {
    table: 'grammar_item_state',
    keyColumn: 'item_id',
    valueColumn: 'mastery_json',
    legacyPath: '$.mastery.items.shared',
  },
  reading: {
    table: 'reading_question_state',
    keyColumn: 'question_id',
    valueColumn: 'mastery_json',
    legacyPath: '$.questions.shared',
  },
  punctuation: {
    table: 'punctuation_item_state',
    keyColumn: 'item_id',
    valueColumn: 'state_json',
    legacyPath: '$.progress.items.shared',
  },
};

test('0023 rollback verifier passes a complete materialised hand-off', () => {
  withFixture(assertAllChecksPass);
});

test('0023 rollback verifier rejects the wrong authority marker', () => {
  withFixture((db) => {
    db.db.prepare(`
      UPDATE bounded_gameplay_state_migrations SET state = 'ready' WHERE migration_id = '0023'
    `).run();
    const row = assertCheckFails(db, '0023 marker is legacy-authoritative');
    assert.equal(row.actual, 'ready');
  });
});

test('0023 rollback verifier rejects corrupted Spelling learner values and metadata', async (t) => {
  const faults = [
    {
      name: 'ui_json',
      check: 'spelling learner ui parity',
      sql: `UPDATE child_subject_state SET ui_json = '{"phase":"corrupted"}'
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'`,
    },
    {
      name: 'non-item data',
      check: 'spelling learner non-item data parity',
      sql: `UPDATE child_subject_state
        SET data_json = json_set(data_json, '$.prefs.mode', 'corrupted')
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'`,
    },
    {
      name: 'updated_at',
      check: 'spelling learner updated_at parity',
      sql: `UPDATE child_subject_state SET updated_at = updated_at + 1
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'`,
    },
    {
      name: 'updated_by_account_id',
      check: 'spelling learner updated_by_account_id parity',
      sql: `UPDATE child_subject_state SET updated_by_account_id = 'adult-b'
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'`,
    },
  ];

  for (const fault of faults) {
    await t.test(fault.name, () => withFixture((db) => {
      db.db.exec(fault.sql);
      assertCheckFails(db, fault.check);
    }));
  }
});

test('0023 rollback verifier rejects missing and extra Spelling learner rows', async (t) => {
  await t.test('split learner without legacy learner', () => withFixture((db) => {
    db.db.prepare(`
      DELETE FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
    `).run();
    assertCheckFails(db, 'spelling learner row parity');
  }));

  await t.test('legacy learner without split learner', () => withFixture((db) => {
    db.db.prepare(`DELETE FROM spelling_learner_state WHERE learner_id = 'learner-a'`).run();
    assertCheckFails(db, 'spelling learner row parity');
  }));
});

test('0023 rollback verifier enforces bidirectional item row and value parity per learner', async (t) => {
  for (const [subject, item] of Object.entries(subjectItems)) {
    await t.test(`${subject} split row missing`, () => withFixture((db) => {
      db.db.prepare(`
        DELETE FROM ${item.table} WHERE learner_id = 'learner-a' AND ${item.keyColumn} = 'shared'
      `).run();
      assertCheckFails(db, `${subject} item parity`);
    }));

    await t.test(`${subject} legacy row missing`, () => withFixture((db) => {
      db.db.prepare(`
        UPDATE child_subject_state SET data_json = json_remove(data_json, ?)
        WHERE learner_id = 'learner-a' AND subject_id = ?
      `).run(item.legacyPath, subject);
      assertCheckFails(db, `${subject} item parity`);
    }));

    await t.test(`${subject} value corrupted`, () => withFixture((db) => {
      db.db.prepare(`
        UPDATE ${item.table} SET ${item.valueColumn} = '{"attempts":999}'
        WHERE learner_id = 'learner-a' AND ${item.keyColumn} = 'shared'
      `).run();
      assertCheckFails(db, `${subject} item parity`);
    }));

    await t.test(`${subject} learner values swapped`, () => withFixture((db) => {
      const rows = db.db.prepare(`
        SELECT learner_id, ${item.valueColumn} AS value_json FROM ${item.table}
        WHERE ${item.keyColumn} = 'shared' ORDER BY learner_id
      `).all();
      db.db.prepare(`
        UPDATE ${item.table} SET ${item.valueColumn} = ?
        WHERE learner_id = 'learner-a' AND ${item.keyColumn} = 'shared'
      `).run(rows[1].value_json);
      db.db.prepare(`
        UPDATE ${item.table} SET ${item.valueColumn} = ?
        WHERE learner_id = 'learner-b' AND ${item.keyColumn} = 'shared'
      `).run(rows[0].value_json);
      const failed = assertCheckFails(db, `${subject} item parity`);
      assert.equal(failed.split_items, failed.legacy_items, 'global counts still match');
    }));
  }
});

test('0023 rollback verifier enforces exact achievement row and value parity', async (t) => {
  await t.test('split achievement missing', () => withFixture((db) => {
    db.db.prepare(`
      DELETE FROM spelling_achievement_state
      WHERE learner_id = 'learner-a' AND achievement_id = 'badge-1'
    `).run();
    assertCheckFails(db, 'spelling achievement parity');
  }));

  await t.test('legacy achievement missing', () => withFixture((db) => {
    db.db.prepare(`
      UPDATE child_subject_state
      SET data_json = json_remove(data_json, '$.achievements."badge-1"')
      WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
    `).run();
    assertCheckFails(db, 'spelling achievement parity');
  }));

  await t.test('achievement value corrupted', () => withFixture((db) => {
    db.db.prepare(`
      UPDATE spelling_achievement_state SET record_json = '{"unlockedAt":999}'
      WHERE learner_id = 'learner-a' AND achievement_id = 'badge-1'
    `).run();
    assertCheckFails(db, 'spelling achievement parity');
  }));

  await t.test('progress achievement corrupted', () => withFixture((db) => {
    db.db.prepare(`
      UPDATE spelling_achievement_state SET record_json = '{"days":[999]}'
      WHERE learner_id = 'learner-a'
        AND achievement_id = '_progress:guardian:days'
    `).run();
    assertCheckFails(db, 'spelling achievement parity');
  }));

  await t.test('learner achievement values swapped', () => withFixture((db) => {
    const rows = db.db.prepare(`
      SELECT learner_id, record_json FROM spelling_achievement_state
      WHERE achievement_id LIKE 'badge-%' ORDER BY learner_id
    `).all();
    db.db.prepare(`
      UPDATE spelling_achievement_state SET record_json = ?
      WHERE learner_id = 'learner-a' AND achievement_id = 'badge-1'
    `).run(rows[1].record_json);
    db.db.prepare(`
      UPDATE spelling_achievement_state SET record_json = ?
      WHERE learner_id = 'learner-b' AND achievement_id = 'badge-2'
    `).run(rows[0].record_json);
    const failed = assertCheckFails(db, 'spelling achievement parity');
    assert.equal(failed.split_items, failed.legacy_items, 'global counts still match');
  }));
});
