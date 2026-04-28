import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const surfacePath = path.join(rootDir, 'src/surfaces/hubs/AdminHubSurface.jsx');

test('AdminHubSurface calls all shell-level hooks before loading and access guards', async () => {
  const source = await readFile(surfacePath, 'utf8');
  const componentStart = source.indexOf('export function AdminHubSurface');
  assert.notEqual(componentStart, -1, 'AdminHubSurface export should exist');

  const componentSource = source.slice(componentStart);
  const sectionActionsMemo = componentSource.indexOf('const sectionActions = React.useMemo');
  const loadingGuard = componentSource.indexOf('if (loadingRemote)');
  const errorGuard = componentSource.indexOf("if (!model && hubState.status === 'error')");
  const accessGuard = componentSource.indexOf('if (!model?.permissions?.canViewAdminHub)');
  const sectionProps = componentSource.indexOf('const sectionProps = {');

  assert.notEqual(sectionActionsMemo, -1, 'sectionActions memo should be present');
  assert.notEqual(loadingGuard, -1, 'loading guard should be present');
  assert.notEqual(errorGuard, -1, 'error guard should be present');
  assert.notEqual(accessGuard, -1, 'access guard should be present');
  assert.notEqual(sectionProps, -1, 'sectionProps should be present');

  assert.ok(
    sectionActionsMemo < loadingGuard,
    'sectionActions useMemo must run before the remote-loading guard to preserve hook order',
  );
  assert.ok(sectionActionsMemo < errorGuard, 'sectionActions useMemo must run before the error guard');
  assert.ok(sectionActionsMemo < accessGuard, 'sectionActions useMemo must run before the access guard');
  assert.ok(sectionActionsMemo < sectionProps, 'sectionActions memo should still feed sectionProps');
});
