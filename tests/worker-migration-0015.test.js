// U6+U8 (P7): Migration 0015 verification tests.
//
// Verify that migration SQL creates the expected tables and columns.
// These are structural/parse tests — they verify the SQL is well-formed
// and creates the correct schema elements.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  import.meta.dirname || '.',
  '../worker/migrations/0015_admin_console_p7_incidents.sql',
);

const migrationSql = readFileSync(migrationPath, 'utf-8');

describe('Migration 0015: admin_support_incidents schema', () => {
  it('creates admin_support_incidents table', () => {
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS admin_support_incidents/);
  });

  it('admin_support_incidents has correct status CHECK constraint', () => {
    assert.match(migrationSql, /CHECK\s*\(\s*status\s+IN\s*\('open',\s*'investigating',\s*'waiting_on_parent',\s*'resolved',\s*'ignored'\)\)/);
  });

  it('admin_support_incidents has row_version column', () => {
    assert.match(migrationSql, /row_version\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/);
  });

  it('admin_support_incidents has foreign key on account_id', () => {
    assert.match(migrationSql, /FOREIGN KEY\s*\(account_id\)\s*REFERENCES\s+adult_accounts\(id\)\s+ON DELETE SET NULL/);
  });

  it('creates idx_incidents_status_updated index', () => {
    assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_incidents_status_updated/);
    assert.match(migrationSql, /ON admin_support_incidents\(status,\s*updated_at\s+DESC\)/);
  });

  it('creates idx_incidents_account index', () => {
    assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_incidents_account/);
    assert.match(migrationSql, /ON admin_support_incidents\(account_id,\s*created_at\s+DESC\)/);
  });
});

describe('Migration 0015: admin_support_incident_notes schema', () => {
  it('creates admin_support_incident_notes table', () => {
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS admin_support_incident_notes/);
  });

  it('has CASCADE delete on incident_id FK', () => {
    assert.match(migrationSql, /incident_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+admin_support_incidents\(id\)\s+ON DELETE CASCADE/);
  });

  it('has audience CHECK constraint', () => {
    assert.match(migrationSql, /CHECK\s*\(\s*audience\s+IN\s*\('admin_only',\s*'ops_safe'\)\)/);
  });

  it('creates idx_incident_notes_incident index', () => {
    assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_incident_notes_incident/);
  });
});

describe('Migration 0015: admin_support_incident_links schema', () => {
  it('creates admin_support_incident_links table', () => {
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS admin_support_incident_links/);
  });

  it('has link_type CHECK constraint with all valid types', () => {
    assert.match(migrationSql, /link_type\s+TEXT\s+NOT\s+NULL/);
    assert.match(migrationSql, /'error_event'/);
    assert.match(migrationSql, /'error_fingerprint'/);
    assert.match(migrationSql, /'denial'/);
    assert.match(migrationSql, /'marketing_message'/);
    assert.match(migrationSql, /'account'/);
    assert.match(migrationSql, /'learner'/);
  });

  it('creates idx_incident_links_incident index', () => {
    assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_incident_links_incident/);
  });
});

describe('Migration 0015: U8 account lifecycle columns', () => {
  it('adds conversion_source column to account_ops_metadata', () => {
    assert.match(migrationSql, /ALTER TABLE account_ops_metadata ADD COLUMN conversion_source TEXT/);
  });

  it('adds cancelled_at column to account_ops_metadata', () => {
    assert.match(migrationSql, /ALTER TABLE account_ops_metadata ADD COLUMN cancelled_at INTEGER/);
  });

  it('adds cancellation_reason column to account_ops_metadata', () => {
    assert.match(migrationSql, /ALTER TABLE account_ops_metadata ADD COLUMN cancellation_reason TEXT/);
  });
});
