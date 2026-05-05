import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const SQL = "SELECT COUNT(*) AS hero_state_rows FROM child_game_state WHERE system_id='hero-mode';";

function createFakeNpx() {
  const dir = mkdtempSync(join(tmpdir(), 'hero-pa7-wrangler-'));
  const capturePath = join(dir, 'capture.json');
  const scriptPath = join(dir, 'fake-npx.mjs');

  writeFileSync(
    scriptPath,
    [
      "import { writeFileSync } from 'node:fs';",
      'writeFileSync(process.env.WRANGLER_FAKE_CAPTURE_PATH, JSON.stringify({',
      '  argv: process.argv.slice(2),',
      "  token: Object.hasOwn(process.env, 'CLOUDFLARE_API_TOKEN') ? process.env.CLOUDFLARE_API_TOKEN : null,",
      "  workersCi: process.env.WORKERS_CI || null,",
      '}));',
    ].join('\n'),
  );

  if (process.platform === 'win32') {
    writeFileSync(join(dir, 'npx.cmd'), `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
  } else {
    const npxPath = join(dir, 'npx');
    writeFileSync(npxPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`);
    chmodSync(npxPath, 0o755);
  }

  return {
    dir,
    capturePath,
    readCapture: () => JSON.parse(readFileSync(capturePath, 'utf8')),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function runWrapper(fake, extraEnv = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
    PATH: `${fake.dir}${delimiter}${process.env.PATH || ''}`,
    WRANGLER_FAKE_CAPTURE_PATH: fake.capturePath,
  };

  if (!('WORKERS_CI' in extraEnv)) {
    delete env.WORKERS_CI;
  }

  return spawnSync(
    process.execPath,
    [
      'scripts/wrangler-oauth.mjs',
      'd1',
      'execute',
      'ks2-mastery-db',
      '--remote',
      '--json',
      '--command',
      SQL,
    ],
    {
      cwd: ROOT,
      env,
      encoding: 'utf8',
    },
  );
}

describe('Hero Mode pA7 Wrangler OAuth wrapper', () => {
  it('preserves POSIX argv boundaries for D1 --command SQL and strips API tokens locally', () => {
    const fake = createFakeNpx();
    try {
      const result = runWrapper(fake, { CLOUDFLARE_API_TOKEN: 'must-not-leak' });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const capture = fake.readCapture();
      assert.equal(capture.token, null);
      assert.equal(capture.workersCi, null);
      assert.deepEqual(capture.argv.slice(0, 8), [
        'wrangler',
        'd1',
        'execute',
        'ks2-mastery-db',
        '--remote',
        '--json',
        '--command',
        process.platform === 'win32' ? 'SELECT' : SQL,
      ]);
      assert.equal(capture.argv.slice(7).join(' '), SQL);
    } finally {
      fake.cleanup();
    }
  });

  it('preserves the Cloudflare token only inside Workers CI builds', () => {
    const fake = createFakeNpx();
    try {
      const result = runWrapper(fake, {
        CLOUDFLARE_API_TOKEN: 'workers-build-token',
        WORKERS_CI: '1',
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(fake.readCapture().token, 'workers-build-token');
      assert.equal(fake.readCapture().workersCi, '1');
    } finally {
      fake.cleanup();
    }
  });
});
