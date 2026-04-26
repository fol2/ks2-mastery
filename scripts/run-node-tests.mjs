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
//  - When the user supplies a positional file path (e.g.
//    `npm test -- tests/smoke.test.js`), DO NOT append the auto-discovered
//    file list: the user is asking for a specific target, and prepending
//    ~100 other files turns a targeted debug run into the whole suite.
//    A positional arg is anything that does not start with `-` (flags)
//    and therefore cannot be a `node --test` option value. When this
//    heuristic mis-fires — e.g. someone passes a raw literal that is
//    neither a flag nor a file — node --test still rejects it cleanly.
//  - Non-zero exit propagates.
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
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

/**
 * Detect whether the user passed any positional argument (non-flag).
 * node --test treats bare words either as test files or spec filters;
 * when the caller hands us any positional, we trust them and skip
 * auto-discovery. Flags (`--reporter`, `-t`) and their explicit values
 * (`--reporter=spec`) pass through untouched.
 */
export function hasUserPositional(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== 'string' || token.length === 0) continue;
    if (token.startsWith('-')) continue;
    // Flag values: `--reporter spec` → when the previous token is a known
    // value-bearing flag without `=`, skip this token as its value. We
    // keep this narrow to avoid over-matching; positional paths that
    // live alongside flags are flagged by their lack of leading `-`.
    const prev = index > 0 ? argv[index - 1] : '';
    if (typeof prev === 'string' && FLAGS_WITH_VALUE.has(prev)) continue;
    return true;
  }
  return false;
}

// `node --test` flags that accept a detached value (`--flag value`). When
// any of these appears immediately before a non-flag token, we treat the
// token as its value rather than a positional test path. Extend this
// list if a new value-bearing flag ever gets used via `npm test --`.
const FLAGS_WITH_VALUE = new Set([
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-concurrency',
  '--test-timeout',
  '--reporter',
  '--grep',
  '-t',
  '-g',
]);

export async function buildSpawnArgs(argv, discover = resolveTestFiles) {
  if (hasUserPositional(argv)) {
    // User-supplied positional path: honour it exactly and do not tack
    // on auto-discovered files. See the `hasUserPositional` comment.
    return ['--test', ...argv];
  }
  const files = await discover();
  if (!files.length) {
    throw new Error('run-node-tests: no test files discovered under tests/ or scripts/.');
  }
  return ['--test', ...argv, ...files];
}

// CLI entrypoint. Skip execution when imported by tests.
const isDirectInvocation = (() => {
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  let nodeArgs;
  try {
    nodeArgs = await buildSpawnArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err?.message || err);
    process.exit(1);
  }
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
}
