import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function isIgnored(repoPath) {
  const result = spawnSync('git', ['check-ignore', '-q', repoPath], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git check-ignore failed for ${repoPath} with status ${result.status}`);
}

test('P3 raw Worker/Tail captures stay ignored while redacted evidence remains tracked', () => {
  const rawPaths = [
    'reports/capacity/evidence/2026-04-30-p3-worker-log.jsonl',
    'reports/capacity/evidence/2026-04-30-p3-worker-tail.jsonl',
    'reports/capacity/evidence/2026-04-30-p3-pretty-tail.log',
    'reports/capacity/evidence/2026-04-30-p3-raw-tail.ndjson',
    'reports/capacity/evidence/2026-04-30-p3-tail-raw.txt',
    'reports/capacity/evidence/2026-04-30-p3-tail.jsonl',
  ];
  for (const rawPath of rawPaths) {
    assert.equal(isIgnored(rawPath), true, `${rawPath} should stay local-only`);
  }

  const redactedPaths = [
    'reports/capacity/evidence/2026-04-30-p3-t1-tail-correlation.json',
    'reports/capacity/evidence/2026-04-30-p3-t1-statement-map.json',
    'reports/capacity/evidence/2026-04-30-p3-t1-tail-classification.md',
  ];
  for (const redactedPath of redactedPaths) {
    assert.equal(isIgnored(redactedPath), false, `${redactedPath} should remain commit-eligible`);
  }
});
