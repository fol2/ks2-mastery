/**
 * CI Shard Coverage — meta-tests verifying that:
 *  1. File discovery produces > 600 entries (completeness canary)
 *  2. --test-shard flag passes through to the node args array
 *  3. The workflow YAML contains the structural fan-in gate
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSpawnArgs } from '../scripts/run-node-tests.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('CI shard coverage', () => {
  it('file discovery completeness — finds > 600 test files and passes shard flag', async () => {
    const args = await buildSpawnArgs(['--test-shard=1/10']);
    // The shard flag must appear in the returned args
    assert.ok(
      args.includes('--test-shard=1/10'),
      'Expected --test-shard=1/10 in spawned args',
    );
    // File list is everything after --test and the shard flag
    const fileEntries = args.filter((a) => !a.startsWith('--'));
    assert.ok(
      fileEntries.length > 600,
      `Expected > 600 discovered test files, got ${fileEntries.length}`,
    );
  });

  it('shard flag passthrough — --test-shard is the second element', async () => {
    const args = await buildSpawnArgs(['--test-shard=5/10']);
    assert.equal(args[0], '--test', 'First element must be --test');
    assert.equal(args[1], '--test-shard=5/10', 'Second element must be --test-shard=5/10');
  });

  it('fan-in gate structural assertion — workflow YAML contains gate job', () => {
    const yamlPath = path.join(rootDir, '.github', 'workflows', 'node-test.yml');
    const yaml = readFileSync(yamlPath, 'utf8');

    assert.ok(
      yaml.includes('name: "Node Tests (gate)"'),
      'Workflow must contain fan-in gate job name',
    );
    assert.ok(
      yaml.includes('needs: [test, wrangler-check]'),
      'Gate job must depend on test and wrangler-check',
    );
    assert.ok(
      yaml.includes('if: always()'),
      'Gate job must run unconditionally (if: always())',
    );
    assert.ok(
      yaml.includes('needs.test.result') && yaml.includes('failure'),
      'Gate job must check needs.test.result for failure',
    );
  });
});
