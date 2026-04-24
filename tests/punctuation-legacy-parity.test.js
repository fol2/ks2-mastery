import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPunctuationLegacyParityReport,
  PUNCTUATION_LEGACY_PARITY_STATUSES,
} from '../shared/punctuation/legacy-parity.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(rootDir, 'tests/fixtures/punctuation-legacy-parity/legacy-baseline.json');
const legacyBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

test('punctuation legacy parity baseline preserves the 14 legacy skill ids', () => {
  const report = createPunctuationLegacyParityReport({ legacyBaseline });

  assert.deepEqual(report.missingSkillIds, []);
  assert.deepEqual(report.extraProductionSkillIds, []);
  assert.deepEqual(report.productionSkillIds, [
    'apostrophe_contractions',
    'apostrophe_possession',
    'bullet_points',
    'colon_list',
    'comma_clarity',
    'dash_clause',
    'fronted_adverbial',
    'hyphen',
    'list_commas',
    'parenthesis',
    'semicolon',
    'semicolon_list',
    'sentence_endings',
    'speech',
  ]);
});

test('punctuation legacy parity records shipped item modes and open mode gaps', () => {
  const report = createPunctuationLegacyParityReport({ legacyBaseline });

  assert.deepEqual(report.productionItemModes, ['choose', 'fix', 'insert', 'transfer']);
  for (const mode of ['choose', 'insert', 'fix', 'transfer']) {
    const row = report.rows.find((entry) => entry.section === 'itemModes' && entry.id === mode);
    assert.equal(row?.status, 'ported', `${mode} should be marked ported`);
    assert.equal(row?.present, true, `${mode} should exist in production item modes`);
  }

  for (const [id, ownerUnit] of [
    ['guided', 'U2'],
    ['weak', 'U3'],
    ['combine', 'U4'],
    ['paragraph', 'U5'],
    ['gps', 'U6'],
  ]) {
    const row = report.rows.find((entry) => entry.id === id);
    assert.equal(row?.status, 'planned', `${id} should remain planned`);
    assert.equal(row?.ownerUnit, ownerUnit, `${id} should be owned by ${ownerUnit}`);
  }
});

test('punctuation legacy parity rejects unsafe legacy authority instead of planning it', () => {
  const report = createPunctuationLegacyParityReport({ legacyBaseline });

  for (const id of [
    'browser_ai_settings',
    'no_browser_api_keys',
    'legacy_html_route',
    'legacy_localstorage_authority',
    'client_owned_marking',
  ]) {
    const row = report.rows.find((entry) => entry.id === id);
    assert.equal(row?.status, 'rejected', `${id} should be rejected`);
    assert.match(row?.ownerUnit || '', /^rejected:/);
  }
});

test('punctuation legacy parity rows all have valid status and ownership', () => {
  const report = createPunctuationLegacyParityReport({ legacyBaseline });

  assert.deepEqual(report.invalidStatusRows, []);
  assert.deepEqual(report.missingOwnerRows, []);
  assert.deepEqual(report.missingAssertedRows, []);
  assert.equal(report.rows.length > 0, true);

  const statuses = new Set(report.rows.map((row) => row.status));
  for (const status of PUNCTUATION_LEGACY_PARITY_STATUSES) {
    assert.equal(statuses.has(status), true, `Expected at least one ${status} row`);
  }
});
