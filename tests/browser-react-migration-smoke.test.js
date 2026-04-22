import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveBrowseBinary() {
  const candidates = [
    process.env.GSTACK_BROWSE,
    path.join(rootDir, '.claude/skills/gstack/browse/dist/browse'),
    path.join(process.env.HOME || '', '.claude/skills/gstack/browse/dist/browse'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function startServerProcess() {
  const child = spawn(process.execPath, ['./tests/helpers/browser-app-server.js', '--serve-only', '--port', '0'], {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out starting browser app server. ${stderr}`));
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdout.once('data', (chunk) => {
      clearTimeout(timeout);
      resolve(chunk.toString().trim());
    });
  });
  return {
    origin,
    close() {
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}

function browseChain(binary, commands, options = {}) {
  return execFileSync(binary, ['chain'], {
    cwd: rootDir,
    input: JSON.stringify(commands),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: options.timeout || 60_000,
  });
}

test('browser migration smoke covers the React app root and spelling interaction contract', {
  skip: process.env.KS2_BROWSER_SMOKE ? false : 'Set KS2_BROWSER_SMOKE=1 to run the gstack browser smoke.',
}, async () => {
  const binary = resolveBrowseBinary();
  assert.ok(binary, 'gstack browse binary is required for browser smoke');

  execFileSync(process.execPath, ['./scripts/build-bundles.mjs'], { cwd: rootDir, stdio: 'inherit' });
  execFileSync(process.execPath, ['./scripts/build-public.mjs'], { cwd: rootDir, stdio: 'inherit' });

  const server = await startServerProcess();
  try {
    const output = browseChain(binary, [
      ['viewport', '390x844'],
      ['goto', `${server.origin}/?local=1`],
      ['text'],
      ['html'],
      ['js', "document.querySelector('[data-action=\"open-subject\"][data-subject-id=\"spelling\"]')?.click(); 'opened spelling';"],
      ['text'],
      ['js', "document.querySelector('[data-action=\"spelling-start\"]')?.click(); 'started spelling';"],
      ['text'],
      ['is', 'focused', 'input[name="typed"]'],
      ['fill', 'input[name="typed"]', 'zzzz'],
      ['press', 'Enter'],
      ['text'],
      ['viewport', '768x1024'],
      ['text'],
      ['console', '--errors'],
    ]);

    assert.match(output, /Your subjects/);
    assert.doesNotMatch(output, /data-home-mount/);
    assert.match(output, /Round setup/);
    assert.match(output, /Spell the word you hear|Spell the dictated word/);
    assert.match(output, /true|focused/i);
    assert.match(output, /Try once more|Not quite|Saved/);
    assert.doesNotMatch(output, /\[console --errors\][\s\S]*(error|warning)/i);
  } finally {
    server.close();
  }
});
