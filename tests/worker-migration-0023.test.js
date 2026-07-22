import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const MIGRATION_FILENAME = '0023_bounded_gameplay_state.sql';

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function migrationSql(filename = MIGRATION_FILENAME) {
  return fs.readFileSync(path.join(rootDir(), 'worker', 'migrations', filename), 'utf8');
}

function recoverySql(filename) {
  return fs.readFileSync(path.join(rootDir(), 'worker', 'recovery', filename), 'utf8');
}

function createPreMigrationDatabase() {
  const db = new SqliteD1Database();
  const migrationsDir = path.join(rootDir(), 'worker', 'migrations');
  for (const filename of fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name < MIGRATION_FILENAME)
    .sort()) {
    db.db.exec(migrationSql(filename));
  }
  db.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, created_at, updated_at, repo_revision
    ) VALUES ('adult-a', 'adult@example.test', 'Adult', 'parent', 1, 1, 0)
  `).run();
  db.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    ) VALUES ('learner-a', 'Learner', 'Y5', '#123456', '', 15, 1, 1, 0)
  `).run();
  return db;
}

test('migration 0023 preserves item history while removing it from gameplay documents', () => {
  const db = createPreMigrationDatabase();
  try {
    const spellingData = {
      prefs: { mode: 'smart' },
      progress: {
        alpha: { stage: 4, attempts: 8, correct: 7, wrong: 1, dueDay: 1 },
        retired: { stage: 2, attempts: 5, correct: 3, wrong: 2, dueDay: 2 },
      },
      guardian: { retired: { reviewLevel: 2, nextDueDay: 4 } },
      pattern: { wobbling: { alpha: { count: 2 } } },
    };
    const grammarData = {
      mastery: {
        concepts: { nouns: { attempts: 2 } },
        items: {
          'template-a:1': { attempts: 2, correct: 2 },
          'template-b:2': { attempts: 1, correct: 0 },
        },
      },
    };
    const grammarUi = {
      phase: 'dashboard',
      mastery: {
        items: {
          'template-a:1': { attempts: 99, correct: 0 },
          'template-ui-only:3': { attempts: 3, correct: 2 },
        },
      },
    };
    const preCutoverEffectiveGrammarMastery = grammarUi.mastery || grammarData.mastery;
    assert.deepEqual(
      preCutoverEffectiveGrammarMastery.items['template-a:1'],
      grammarUi.mastery.items['template-a:1'],
      'the pre-cutover Grammar engine gives ui_json mastery authority over divergent data_json',
    );
    const readingData = {
      prefs: { mode: 'smart' },
      questions: {
        'question-a': { attempts: 4, correct: 3 },
        'retired-question': { attempts: 7, correct: 5 },
      },
    };
    const punctuationData = {
      prefs: { mode: 'weak' },
      progress: {
        items: {
          'punctuation-a': {
            attempts: 4,
            correct: 4,
            incorrect: 0,
            streak: 4,
            lapses: 0,
            firstCorrectAt: 1,
            lastCorrectAt: 8 * 86_400_000,
            dueAt: 9 * 86_400_000,
          },
          'retired-punctuation': {
            attempts: 3,
            correct: 1,
            incorrect: 2,
            streak: 0,
            lapses: 2,
            dueAt: 1,
          },
        },
        facets: { 'sentence_endings::choose': { attempts: 1, correct: 1 } },
        rewardUnits: {},
        attempts: [{ itemId: 'punctuation-a', correct: true, ts: 10 }],
        sessionsCompleted: 1,
      },
    };

    const insert = db.db.prepare(`
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      ) VALUES ('learner-a', ?, ?, ?, 10, 'adult-a')
    `);
    insert.run('spelling', JSON.stringify({ phase: 'dashboard' }), JSON.stringify(spellingData));
    insert.run('grammar', JSON.stringify(grammarUi), JSON.stringify(grammarData));
    insert.run('reading', JSON.stringify({ phase: 'setup' }), JSON.stringify(readingData));
    insert.run('punctuation', JSON.stringify({ phase: 'setup' }), JSON.stringify(punctuationData));

    db.db.exec(migrationSql());

    const spellingRows = db.db.prepare(`
      SELECT slug, progress_json, guardian_json, pattern_json
      FROM spelling_item_state WHERE learner_id = 'learner-a' ORDER BY slug
    `).all();
    assert.deepEqual(spellingRows.map((row) => row.slug), ['alpha', 'retired']);
    assert.deepEqual(JSON.parse(spellingRows[0].progress_json), spellingData.progress.alpha);
    assert.deepEqual(JSON.parse(spellingRows[0].pattern_json), spellingData.pattern.wobbling.alpha);
    assert.deepEqual(JSON.parse(spellingRows[1].guardian_json), spellingData.guardian.retired);

    const spellingLearner = db.db.prepare(`
      SELECT data_json, stats_json FROM spelling_learner_state WHERE learner_id = 'learner-a'
    `).get();
    assert.deepEqual(JSON.parse(spellingLearner.data_json).prefs, { mode: 'smart' });
    assert.equal(Object.hasOwn(JSON.parse(spellingLearner.data_json), 'progress'), false);
    const spellingStats = JSON.parse(spellingLearner.stats_json);
    assert.equal(spellingStats.all.total, 2);
    assert.equal(
      Object.hasOwn(spellingStats, 'reviewScheduleV1'),
      false,
      'the one-off cutover must not copy a lifetime review schedule into hot state',
    );

    const grammarRows = db.db.prepare(`
      SELECT item_id, mastery_json FROM grammar_item_state
      WHERE learner_id = 'learner-a' ORDER BY item_id
    `).all();
    assert.deepEqual(grammarRows.map((row) => row.item_id), [
      'template-a:1',
      'template-b:2',
      'template-ui-only:3',
    ]);
    assert.deepEqual(JSON.parse(grammarRows[0].mastery_json), grammarUi.mastery.items['template-a:1'],
      'cutover preserves the Grammar engine\'s UI-first authority for a divergent generated item');
    assert.deepEqual(JSON.parse(grammarRows[1].mastery_json), grammarData.mastery.items['template-b:2'],
      'cutover retains data-only generated items');
    assert.deepEqual(JSON.parse(grammarRows[2].mastery_json), grammarUi.mastery.items['template-ui-only:3'],
      'cutover retains UI-only generated items');
    const grammarHot = db.db.prepare(`
      SELECT ui_json, data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
    `).get();
    assert.equal(JSON.parse(grammarHot.data_json).mastery.items, undefined);
    assert.equal(JSON.parse(grammarHot.ui_json).mastery.items, undefined);

    const readingRows = db.db.prepare(`
      SELECT question_id, mastery_json FROM reading_question_state
      WHERE learner_id = 'learner-a' ORDER BY question_id
    `).all();
    assert.deepEqual(readingRows.map((row) => row.question_id), ['question-a', 'retired-question']);
    const readingHot = db.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'reading'
    `).get();
    assert.equal(JSON.parse(readingHot.data_json).questions, undefined);

    const punctuationRows = db.db.prepare(`
      SELECT item_id, state_json FROM punctuation_item_state
      WHERE learner_id = 'learner-a' ORDER BY item_id
    `).all();
    assert.deepEqual(punctuationRows.map((row) => row.item_id), [
      'punctuation-a',
      'retired-punctuation',
    ]);
    assert.deepEqual(JSON.parse(punctuationRows[0].state_json), punctuationData.progress.items['punctuation-a']);
    const punctuationHot = db.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'punctuation'
    `).get();
    const boundedPunctuation = JSON.parse(punctuationHot.data_json);
    assert.equal(boundedPunctuation.progress.items, undefined);
    assert.equal(boundedPunctuation.progress.itemTotals.version, 1);
    assert.equal(boundedPunctuation.progress.itemTotals.tracked, 2);
    assert.equal(boundedPunctuation.progress.itemTotals.secure, 1);
    assert.equal(boundedPunctuation.progress.itemTotals.weak, 1);
    assert.deepEqual(boundedPunctuation.progress.starEvidence, {
      version: 1,
      releaseId: 'punctuation-qg-p24-15072-2026-05-13',
      secureItemIds: ['punctuation-a'],
    });

    const archived = db.db.prepare(`
      SELECT subject_id, data_json FROM bounded_gameplay_state_archive
      WHERE migration_id = '0023' AND learner_id = 'learner-a'
      ORDER BY subject_id
    `).all();
    assert.deepEqual(archived.map((row) => row.subject_id), ['grammar', 'punctuation', 'reading']);
    assert.deepEqual(
      JSON.parse(archived.find((row) => row.subject_id === 'punctuation').data_json),
      punctuationData,
      'the cold archive keeps the exact Punctuation rollback document',
    );

    assert.deepEqual(
      JSON.parse(db.db.prepare(`
        SELECT data_json FROM child_subject_state
        WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
      `).get().data_json),
      spellingData,
      'the spelling legacy row remains available as cold rollback data',
    );

    const cutoverProof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    assert.ok(cutoverProof.length > 0);
    for (const row of cutoverProof) {
      assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
    }

    const originalSpellingLearner = db.db.prepare(`
      SELECT ui_json, data_json, stats_json
      FROM spelling_learner_state WHERE learner_id = 'learner-a'
    `).get();
    for (const column of ['ui_json', 'data_json', 'stats_json']) {
      db.db.prepare(`
        UPDATE spelling_learner_state SET ${column} = '{}'
        WHERE learner_id = 'learner-a'
      `).run();
      const learnerCorruptionProof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
      const learnerMismatch = learnerCorruptionProof.find(
        (row) => row.check_name === 'spelling learner value mismatches',
      );
      assert.equal(learnerMismatch.actual, 1, `${column} corruption must be detected`);
      assert.equal(learnerMismatch.ok, 0, `${column} corruption must fail the release gate`);
      db.db.prepare(`
        UPDATE spelling_learner_state SET ${column} = ?
        WHERE learner_id = 'learner-a'
      `).run(originalSpellingLearner[column]);
    }

    db.db.prepare(`
      UPDATE grammar_item_state
      SET mastery_json = '{"attempts":999}'
      WHERE learner_id = 'learner-a' AND item_id = 'template-a:1'
    `).run();
    const corruptedProof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    const grammarMismatch = corruptedProof.find((row) => row.check_name === 'grammar value mismatches');
    assert.equal(grammarMismatch.actual, 1);
    assert.equal(grammarMismatch.ok, 0, 'the forward release gate must reject value-level corruption');
  } finally {
    db.close();
  }
});

test('migration 0023 keeps hot Spelling state constant-sized for fat item and achievement history', () => {
  const db = createPreMigrationDatabase();
  try {
    const progress = {};
    const achievements = {
      '_progress:guardian:days': { days: [] },
      '_progress:recovery:slugs': { slugs: [] },
      '_progress:pattern:completions': {
        completions: {
          'suffix-tion': [],
          'retired-pattern': [{ id: 'retired' }],
        },
      },
    };
    for (let index = 0; index < 10_000; index += 1) {
      progress[`retired-${index}`] = {
        stage: index % 5,
        attempts: 1,
        correct: index % 2,
        wrong: (index + 1) % 2,
        dueDay: index,
      };
      achievements['_progress:guardian:days'].days.push(index);
      achievements['_progress:recovery:slugs'].slugs.push(`recovered-${index}`);
      achievements['_progress:pattern:completions'].completions['suffix-tion'].push({
        sessionId: `pattern-${index}`,
        completedAt: index,
      });
      achievements[`achievement:spelling:boss:clean-sweep:learner-a:${index}`] = {
        unlockedAt: index,
      };
    }
    db.db.prepare(`
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      ) VALUES ('learner-a', 'spelling', '{}', ?, 10, 'adult-a')
    `).run(JSON.stringify({ prefs: { mode: 'smart' }, progress, achievements }));

    db.db.exec(migrationSql());

    const learner = db.db.prepare(`
      SELECT stats_json, length(stats_json) AS stats_bytes
      FROM spelling_learner_state WHERE learner_id = 'learner-a'
    `).get();
    assert.ok(learner.stats_bytes < 4096, `hot stats should stay bounded, got ${learner.stats_bytes} bytes`);
    assert.equal(Object.hasOwn(JSON.parse(learner.stats_json), 'reviewScheduleV1'), false);
    assert.equal(db.db.prepare(`
      SELECT COUNT(*) AS count FROM spelling_item_state WHERE learner_id = 'learner-a'
    `).get().count, 10_000, 'all lifetime rows remain durable in the cold item table');

    const achievementRows = db.db.prepare(`
      SELECT achievement_id, record_json
      FROM spelling_achievement_state
      WHERE learner_id = 'learner-a'
    `).all();
    assert.equal(achievementRows.length, 10_003,
      'all 10,000 unlocks plus three evaluator records remain row-addressed');
    assert.equal(achievementRows.filter((row) => row.achievement_id.startsWith(
      'achievement:spelling:boss:clean-sweep:',
    )).length, 10_000, 'Boss unlock history is never trimmed');
    const recentBossPlan = db.db.prepare(`
      EXPLAIN QUERY PLAN
      SELECT achievement_id, record_json
      FROM spelling_achievement_state
      WHERE learner_id = 'learner-a'
        AND substr(achievement_id, 1, length('achievement:spelling:boss:clean-sweep:learner-a:'))
          = 'achievement:spelling:boss:clean-sweep:learner-a:'
      ORDER BY updated_at DESC, achievement_id DESC
      LIMIT 8
    `).all();
    assert.match(
      recentBossPlan.map((row) => row.detail).join('\n'),
      /idx_spelling_achievement_state_recent/,
      'the fixed recent-Boss projection must use the learner/time index, not scan lifetime unlocks',
    );
    const achievementMap = Object.fromEntries(achievementRows.map((row) => [
      row.achievement_id,
      JSON.parse(row.record_json),
    ]));
    assert.equal(achievementMap['_progress:guardian:days'].days.length, 7);
    assert.equal(achievementMap['_progress:recovery:slugs'].slugs.length, 10);
    assert.deepEqual(
      achievementMap['_progress:pattern:completions'].completions['suffix-tion']
        .map((entry) => entry.sessionId),
      ['pattern-9997', 'pattern-9998', 'pattern-9999'],
    );
    assert.equal(
      achievementMap['_progress:pattern:completions'].completions['retired-pattern'],
      undefined,
      'retired pattern evaluator state cannot expand the command projection',
    );

    const cutoverProof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    for (const row of cutoverProof) {
      assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
    }
    db.db.prepare(`
      UPDATE spelling_achievement_state
      SET record_json = '{"days":[9999,123456]}'
      WHERE learner_id = 'learner-a'
        AND achievement_id = '_progress:guardian:days'
    `).run();
    const corrupted = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    const semanticGate = corrupted.find(
      (row) => row.check_name === 'spelling progress achievement violations',
    );
    assert.ok(semanticGate?.actual > 0);
    assert.equal(semanticGate?.ok, 0, 'cutover rejects a bounded projection not derived from legacy evidence');

    db.db.prepare(`
      UPDATE spelling_achievement_state SET record_json = ?
      WHERE learner_id = 'learner-a'
        AND achievement_id = '_progress:guardian:days'
    `).run(JSON.stringify(achievementMap['_progress:guardian:days']));
    const proofStartedAt = performance.now();
    db.db.exec(recoverySql('0023_materialise_legacy_gameplay_state.sql'));
    const rollbackProof = db.db.prepare(recoverySql('0023_verify_legacy_gameplay_state.sql')).all();
    for (const row of rollbackProof) {
      assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
    }
    db.db.exec(migrationSql());
    const reforwardProof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    for (const row of reforwardProof) {
      assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
    }
    const proofDurationMs = performance.now() - proofStartedAt;
    assert.ok(proofDurationMs < 5_000,
      `10,000-row rollback and re-forward proof should stay set-wise; took ${proofDurationMs}ms`);
  } finally {
    db.close();
  }
});

test('migration 0023 can be reapplied without duplicating or erasing item rows', () => {
  const db = createPreMigrationDatabase();
  try {
    db.db.prepare(`
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      ) VALUES ('learner-a', 'grammar', '{}', ?, 10, 'adult-a')
    `).run(JSON.stringify({ mastery: { items: { 'item-a': { attempts: 1 } } } }));
    const sql = migrationSql();
    db.db.exec(sql);
    db.db.exec(sql);
    const rows = db.db.prepare(`
      SELECT item_id, mastery_json FROM grammar_item_state WHERE learner_id = 'learner-a'
    `).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item_id, 'item-a');
    assert.deepEqual(JSON.parse(rows[0].mastery_json), { attempts: 1 });
  } finally {
    db.close();
  }
});

test('migration 0023 gives every existing and future learner a bounded Spelling authority row', () => {
  const db = createPreMigrationDatabase();
  try {
    const sql = migrationSql();
    db.db.exec(sql);

    const readState = (learnerId) => db.db.prepare(`
      SELECT ui_json, data_json, stats_json
      FROM spelling_learner_state
      WHERE learner_id = ?
    `).get(learnerId);
    const assertEmptyState = (learnerId) => {
      const state = readState(learnerId);
      assert.ok(state, `${learnerId} must have a bounded learner row`);
      assert.equal(JSON.parse(state.ui_json), null);
      assert.deepEqual(JSON.parse(state.data_json), {
        prefs: {},
        postMega: null,
        persistenceWarning: null,
      });
      assert.deepEqual(Object.keys(JSON.parse(state.stats_json)).sort(), [
        'all',
        'core',
        'extra',
        'secureExtension',
        'y34',
        'y56',
      ]);
    };

    assertEmptyState('learner-a');

    db.db.prepare(`
      INSERT INTO learner_profiles (
        id, name, year_group, avatar_color, goal, daily_minutes,
        created_at, updated_at, state_revision
      ) VALUES ('learner-after-cutover', 'New learner', 'Y5', '#123456', '', 15, 20, 20, 0)
    `).run();
    assertEmptyState('learner-after-cutover');

    db.db.prepare(`
      UPDATE bounded_gameplay_state_migrations
      SET state = 'legacy-authoritative'
      WHERE migration_id = '0023'
    `).run();
    db.db.prepare(`
      INSERT INTO learner_profiles (
        id, name, year_group, avatar_color, goal, daily_minutes,
        created_at, updated_at, state_revision
      ) VALUES ('learner-during-rollback', 'Rollback learner', 'Y5', '#123456', '', 15, 30, 30, 0)
    `).run();
    assert.equal(readState('learner-during-rollback'), undefined,
      'the split-state trigger stays dormant while legacy state is authoritative');

    db.db.exec(sql);
    assertEmptyState('learner-during-rollback');

    const proof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    for (const row of proof) {
      assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
    }
  } finally {
    db.close();
  }
});

test('0023 recovery materialises current split authority for an old Worker rollback', () => {
  const db = createPreMigrationDatabase();
  try {
    const insert = db.db.prepare(`
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      ) VALUES ('learner-a', ?, '{}', ?, 10, 'adult-a')
    `);
    insert.run('spelling', JSON.stringify({
      prefs: { mode: 'smart' },
      progress: { alpha: { attempts: 1, correct: 1, stage: 1 } },
      guardian: {},
      pattern: { wobbling: {} },
    }));
    insert.run('grammar', JSON.stringify({
      mastery: { items: { 'grammar-a': { attempts: 1, correct: 1 } } },
    }));
    insert.run('reading', JSON.stringify({
      questions: { 'reading-a': { attempts: 1, correct: 1 } },
    }));
    insert.run('punctuation', JSON.stringify({
      progress: {
        items: { 'punctuation-a': { attempts: 1, correct: 1, streak: 1 } },
        facets: {}, rewardUnits: {}, attempts: [], sessionsCompleted: 0,
      },
    }));
    db.db.exec(migrationSql());

    db.db.prepare(`
      UPDATE spelling_learner_state
      SET data_json = ?, updated_at = 20
      WHERE learner_id = 'learner-a'
    `).run(JSON.stringify({ prefs: { mode: 'guardian' } }));
    db.db.prepare(`
      INSERT INTO spelling_achievement_state (
        learner_id, achievement_id, record_json, updated_at, updated_by_account_id
      ) VALUES ('learner-a', 'steadfast', ?, 20, 'adult-a')
    `).run(JSON.stringify({ unlockedAt: 20 }));
    db.db.prepare(`
      UPDATE spelling_item_state
      SET progress_json = ?, guardian_json = ?, pattern_json = ?, updated_at = 20
      WHERE learner_id = 'learner-a' AND slug = 'alpha'
    `).run(
      JSON.stringify({ attempts: 9, correct: 8, stage: 4 }),
      JSON.stringify({ reviewLevel: 2, nextDueDay: 99 }),
      JSON.stringify({ count: 3 }),
    );
    db.db.prepare(`
      INSERT INTO spelling_item_state (
        learner_id, slug, progress_json, guardian_json, pattern_json,
        updated_at, updated_by_account_id
      ) VALUES ('learner-a', 'after-cutover', ?, NULL, NULL, 20, 'adult-a')
    `).run(JSON.stringify({ attempts: 2, correct: 1, stage: 2 }));
    db.db.prepare(`
      UPDATE grammar_item_state SET mastery_json = ?
      WHERE learner_id = 'learner-a' AND item_id = 'grammar-a'
    `).run(JSON.stringify({ attempts: 7, correct: 6 }));
    db.db.prepare(`
      UPDATE reading_question_state SET mastery_json = ?
      WHERE learner_id = 'learner-a' AND question_id = 'reading-a'
    `).run(JSON.stringify({ attempts: 5, correct: 4 }));
    db.db.prepare(`
      UPDATE punctuation_item_state SET state_json = ?
      WHERE learner_id = 'learner-a' AND item_id = 'punctuation-a'
    `).run(JSON.stringify({ attempts: 6, correct: 5, streak: 2 }));

    const materialise = recoverySql('0023_materialise_legacy_gameplay_state.sql');
    db.db.exec(materialise);
    db.db.exec(materialise);

    const spelling = JSON.parse(db.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
    `).get().data_json);
    assert.deepEqual(spelling.prefs, { mode: 'guardian' });
    assert.deepEqual(spelling.achievements, { steadfast: { unlockedAt: 20 } });
    assert.equal(spelling.progress.alpha.attempts, 9);
    assert.equal(spelling.progress['after-cutover'].attempts, 2);
    assert.equal(spelling.guardian.alpha.reviewLevel, 2);
    assert.equal(spelling.pattern.wobbling.alpha.count, 3);

    assert.equal(JSON.parse(db.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
    `).get().data_json).mastery.items['grammar-a'].attempts, 7);
    assert.equal(JSON.parse(db.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'reading'
    `).get().data_json).questions['reading-a'].attempts, 5);
    assert.equal(JSON.parse(db.db.prepare(`
      SELECT data_json FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'punctuation'
    `).get().data_json).progress.items['punctuation-a'].attempts, 6);

    const proof = db.db.prepare(recoverySql('0023_verify_legacy_gameplay_state.sql')).all();
    for (const row of proof) {
      assert.equal(row.split_items, row.legacy_items, row.subject_id);
      assert.equal(row.mismatched_items, 0, row.subject_id);
    }
    assert.equal(db.db.prepare(`
      SELECT state FROM bounded_gameplay_state_migrations WHERE migration_id = '0023'
    `).get().state, 'legacy-authoritative');

    // Simulate writes by the rolled-back Worker, then replay the idempotent
    // cutover SQL directly. Every split authority must reflect the newer
    // legacy values before the marker becomes ready again.
    const oldWorkerSpelling = spelling;
    oldWorkerSpelling.progress.alpha.attempts = 99;
    db.db.prepare(`
      UPDATE child_subject_state SET data_json = ?, updated_at = 30
      WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
    `).run(JSON.stringify(oldWorkerSpelling));
    db.db.prepare(`
      UPDATE child_subject_state
      SET ui_json = json_set(ui_json, '$.mastery.items.grammar-a.attempts', 77), updated_at = 30
      WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
    `).run();
    db.db.prepare(`
      UPDATE child_subject_state
      SET data_json = json_set(data_json, '$.questions.reading-a.attempts', 55), updated_at = 30
      WHERE learner_id = 'learner-a' AND subject_id = 'reading'
    `).run();
    db.db.prepare(`
      UPDATE child_subject_state
      SET data_json = json_set(data_json, '$.progress.items.punctuation-a.attempts', 66), updated_at = 30
      WHERE learner_id = 'learner-a' AND subject_id = 'punctuation'
    `).run();

    db.db.exec(migrationSql());

    assert.equal(JSON.parse(db.db.prepare(`
      SELECT progress_json FROM spelling_item_state
      WHERE learner_id = 'learner-a' AND slug = 'alpha'
    `).get().progress_json).attempts, 99);
    assert.equal(JSON.parse(db.db.prepare(`
      SELECT mastery_json FROM grammar_item_state
      WHERE learner_id = 'learner-a' AND item_id = 'grammar-a'
    `).get().mastery_json).attempts, 77,
      're-forward preserves the rolled-back Grammar engine\'s divergent UI-first value');
    assert.equal(JSON.parse(db.db.prepare(`
      SELECT mastery_json FROM reading_question_state
      WHERE learner_id = 'learner-a' AND question_id = 'reading-a'
    `).get().mastery_json).attempts, 55);
    assert.equal(JSON.parse(db.db.prepare(`
      SELECT state_json FROM punctuation_item_state
      WHERE learner_id = 'learner-a' AND item_id = 'punctuation-a'
    `).get().state_json).attempts, 66);
    assert.equal(db.db.prepare(`
      SELECT state FROM bounded_gameplay_state_migrations WHERE migration_id = '0023'
    `).get().state, 'ready');
    const reforwardProof = db.db.prepare(recoverySql('0023_verify_cutover.sql')).all();
    for (const row of reforwardProof) {
      assert.equal(row.ok, 1, `${row.check_name}: expected ${row.expected}, got ${row.actual}`);
    }
  } finally {
    db.close();
  }
});
