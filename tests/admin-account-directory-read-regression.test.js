import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSource = readFileSync(path.join(rootDir, 'src/main.js'), 'utf8');

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `Missing end marker: ${endNeedle}`);
  return source.slice(start, end);
}

test('admin account directory read does not force a full hub reload', () => {
  const loadAdminAccounts = sliceBetween(
    mainSource,
    'async function loadAdminAccounts',
    'async function updateAdminAccountRole',
  );

  assert.equal(
    loadAdminAccounts.includes('invalidateAdultHubState('),
    false,
    'plain account directory reads must not invalidate adult hub bootstrap state',
  );
  assert.equal(
    loadAdminAccounts.includes('loadAdminHub({ force: true })'),
    false,
    'plain account directory reads must not duplicate Admin Hub cold-load reads',
  );
  assert.equal(
    loadAdminAccounts.includes('loadParentHub({ force: true })'),
    false,
    'plain account directory reads must not duplicate Parent Hub reads',
  );
});

test('admin account role writes still refresh adult hub state', () => {
  const updateAdminAccountRole = sliceBetween(
    mainSource,
    'async function updateAdminAccountRole',
    'function patchAdminHubMonsterVisualConfig',
  );

  assert.equal(
    updateAdminAccountRole.includes('invalidateAdultHubState(null, { rerender: false })'),
    true,
    'role writes must invalidate adult hub state so permissions refresh after mutation',
  );
  assert.equal(
    updateAdminAccountRole.includes('loadAdminHub({ force: true })'),
    true,
    'role writes must refresh Admin Hub when it is active',
  );
  assert.equal(
    updateAdminAccountRole.includes('loadParentHub({ force: true })'),
    true,
    'role writes must refresh Parent Hub when it is active',
  );
});
