import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

// Regression guard for scripts/preflight-test.mjs. The preflight only buys
// anything if a future cleanup pass cannot silently swap `console.error` +
// `process.exit(1)` for `throw` (which would re-bury the message inside a
// stacktrace) or drop the exit-1 (which would let `npm test` continue into
// the cryptic ERR_MODULE_NOT_FOUND the preflight was meant to replace).
// These tests lock in the observable contract: exit code 1, expected
// stderr line, and a sane no-op when node_modules *is* present.
//
// We spawn the preflight in a temp cwd so the test does not depend on the
// ambient worktree state (node_modules here is always installed when the
// suite runs, so an in-place invocation would never exercise the missing
// branch).

const SCRIPT = path.resolve('scripts/preflight-test.mjs');

function spawnInCwd(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, stdio: 'pipe' });
}

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test('preflight exits 1 with actionable stderr when node_modules is absent', () => {
  const cwd = makeTempDir('preflight-missing-');
  try {
    const result = spawnInCwd(cwd);
    assert.equal(result.status, 1, 'preflight must exit 1 when a required package is missing');
    const stderr = result.stderr.toString();
    assert.match(stderr, /Missing node_modules/, 'stderr should name the failure mode');
    assert.match(stderr, /npm install/, 'stderr should tell the reader how to fix it');
    assert.match(stderr, /worktree/, 'stderr should explain why (git worktrees)');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('preflight exits 0 when all required packages are present', () => {
  const cwd = makeTempDir('preflight-present-');
  try {
    // Mirror the shape the preflight probes: node_modules/<pkg>/package.json.
    for (const pkg of ['react', 'esbuild']) {
      const pkgDir = path.join(cwd, 'node_modules', pkg);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(path.join(pkgDir, 'package.json'), '{"name":"' + pkg + '"}');
    }
    const result = spawnInCwd(cwd);
    assert.equal(result.status, 0, 'preflight must exit 0 when every required package resolves');
    assert.equal(result.stderr.toString(), '', 'preflight must stay silent on the happy path');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
