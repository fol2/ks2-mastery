import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SqliteD1Database } from './helpers/sqlite-d1.js';

const migration0020Path = resolve(
  import.meta.dirname || '.',
  '../worker/migrations/0020_content_operations_centre.sql',
);

const migration0021Path = resolve(
  import.meta.dirname || '.',
  '../worker/migrations/0021_content_operations_audio_jobs_ledger.sql',
);

const migration0020Sql = readFileSync(migration0020Path, 'utf-8');
const migration0021Sql = readFileSync(migration0021Path, 'utf-8');

function columns(db) {
  return db.db.prepare(`PRAGMA table_info(content_operation_audio_jobs)`).all()
    .map((row) => ({ name: row.name, notnull: row.notnull, dflt_value: row.dflt_value }));
}

function indexes(db) {
  return db.db.prepare(`PRAGMA index_list(content_operation_audio_jobs)`).all()
    .map((row) => row.name)
    .sort();
}

function insertLegacyAudioJob(db, jobId) {
  db.db.prepare(`
    INSERT INTO content_operation_audio_jobs (
      job_id,
      package_id,
      candidate_id,
      lane,
      entity_type,
      entity_id,
      voice_id,
      pace_id,
      model_id,
      profile_version,
      content_key,
      status,
      r2_key,
      error_json,
      requested_by_account_id,
      completed_at,
      created_at
    )
    VALUES (?, 'copkg-legacy', 'cocand-legacy', 'word', 'spelling.word', ?, 'Iapetus', 'natural',
      'gemini-2.5-flash-preview-tts', 'spelling-audio-profile-v1', ?, 'uploaded', ?, NULL,
      'admin-a', 1800000000000, 1800000000000)
  `).run(jobId, jobId, `content-key-${jobId}`, `spelling-audio/${jobId}.mp3`);
}

test('migration 0021 adds authoritative audio ledger columns and idempotency index', () => {
  const db = new SqliteD1Database();
  try {
    db.db.exec(migration0020Sql);
    insertLegacyAudioJob(db, 'audio-job-1');

    db.db.exec(migration0021Sql);

    const byName = new Map(columns(db).map((column) => [column.name, column]));
    assert.equal(byName.get('idempotency_key')?.notnull, 0);
    assert.equal(byName.get('source_kind')?.notnull, 0);
    assert.equal(byName.get('provenance_json')?.notnull, 0);
    assert.equal(byName.get('attempt_count')?.notnull, 1);
    assert.equal(byName.get('attempt_count')?.dflt_value, '0');
    assert.equal(byName.get('updated_at')?.notnull, 0);
    assert.ok(indexes(db).includes('idx_content_operation_audio_jobs_idempotency'));

    const legacy = db.db.prepare(`
      SELECT idempotency_key, source_kind, provenance_json, attempt_count, updated_at
      FROM content_operation_audio_jobs
      WHERE job_id = 'audio-job-1'
    `).get();
    assert.equal(legacy.idempotency_key, null);
    assert.equal(legacy.source_kind, null);
    assert.equal(legacy.provenance_json, null);
    assert.equal(legacy.attempt_count, 0);
    assert.equal(legacy.updated_at, null);

    insertLegacyAudioJob(db, 'audio-job-2');
    db.db.prepare(`
      UPDATE content_operation_audio_jobs
      SET idempotency_key = 'content-operation-audio|copkg-legacy|generate|word|profile|model|voice|natural|content'
      WHERE job_id = 'audio-job-1'
    `).run();
    assert.throws(() => {
      db.db.prepare(`
        UPDATE content_operation_audio_jobs
        SET idempotency_key = 'content-operation-audio|copkg-legacy|generate|word|profile|model|voice|natural|content'
        WHERE job_id = 'audio-job-2'
      `).run();
    }, /UNIQUE constraint failed/);
  } finally {
    db.close();
  }
});
