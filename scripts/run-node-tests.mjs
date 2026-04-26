// U5 (sys-hardening p1): drive `node --test` against the non-Playwright
// suite.
//
// Default `node --test` file discovery (no argument) crawls the repo and
// picks up anything matching `*.test.*`, `test-*`, or `*-test.*`. Our
// Playwright scenes under `tests/playwright/` use the `.playwright.test.mjs`
// suffix (as mandated by the plan) which also matches the default glob, so
// `npm test` (plain `node --test`) would try to load them and throw at the
// top-level `test.describe()` call.
//
// This helper walks `tests/` (plus `scripts/` to preserve the existing
// pretest coverage for `classroom-load-test.mjs` etc.), collects the node
// test files, and forwards the rest of the CLI args plus the explicit file
// list to `node --test`.
//
// Behaviour rules (keep in sync with AGENTS.md):
//  - Skip `tests/playwright/**` — those run under Playwright's runner.
//  - Preserve node --test's default flags (concurrency, reporter, etc) by
//    forwarding unknown args via `process.argv.slice(2)`.
//  - Non-zero exit propagates.
import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_TEST_RE = /^(?:test-.*|.*\.(?:test|spec)\.(?:c|m)?jsx?|.*-test\.(?:c|m)?jsx?)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-results']);
const SKIP_PATH_FRAGMENTS = [path.join('tests', 'playwright')];

async function walk(dir, collected) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, collected);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!NODE_TEST_RE.test(entry.name)) continue;
    const relative = path.relative(rootDir, full);
    if (SKIP_PATH_FRAGMENTS.some((fragment) => relative.includes(fragment))) continue;
    collected.push(full);
  }
  return collected;
}

async function resolveTestFiles() {
  const files = [];
  for (const top of ['tests', 'scripts']) {
    await walk(path.join(rootDir, top), files);
  }
  return files.sort();
}

const files = await resolveTestFiles();
if (!files.length) {
  console.error('run-node-tests: no test files discovered under tests/ or scripts/.');
  process.exit(1);
}

const nodeArgs = ['--test', ...process.argv.slice(2), ...files];
const child = spawn(process.execPath, nodeArgs, {
  cwd: rootDir,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
