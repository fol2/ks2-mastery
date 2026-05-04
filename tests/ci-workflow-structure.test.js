/**
 * Structural assertions for the unified CI workflow.
 * Ensures ci.yml maintains the required contract shape.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ciPath = resolve(__dirname, '..', '.github', 'workflows', 'ci.yml');
const ciContent = readFileSync(ciPath, 'utf8');

describe('ci.yml structural contract', () => {
  it('contains the exact job name "Node Tests (gate)" for branch protection', () => {
    assert.ok(
      ciContent.includes('name: "Node Tests (gate)"'),
      'ci.yml must contain name: "Node Tests (gate)" to preserve branch protection'
    );
  });

  it('contains a test execution step', () => {
    assert.ok(
      ciContent.includes('run-node-tests.mjs') || ciContent.includes('npm test'),
      'ci.yml must include a test execution step (run-node-tests.mjs or npm test)'
    );
  });

  it('contains concurrency with cancel-in-progress', () => {
    assert.ok(
      ciContent.includes('concurrency:'),
      'ci.yml must define a concurrency group'
    );
    assert.ok(
      ciContent.includes('cancel-in-progress: true'),
      'ci.yml must set cancel-in-progress: true'
    );
  });

  it('contains a timeout-minutes setting', () => {
    assert.ok(
      ciContent.includes('timeout-minutes:'),
      'ci.yml must set timeout-minutes'
    );
  });
});
