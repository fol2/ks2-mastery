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
import { readdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getShardFiles } from './shard-shuffle.mjs';

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

export function resolveDefaultConcurrency({
  argv = process.argv.slice(2),
  env = process.env,
  platform = process.platform,
  available = availableParallelism(),
} = {}) {
  const explicit = argv.find((arg) => /^--test-concurrency=(?:true|false|\d+)$/i.test(arg));
  if (explicit) {
    const value = explicit.split('=')[1].toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Math.max(1, Number(value));
  }

  const detachedIndex = argv.indexOf('--test-concurrency');
  if (detachedIndex >= 0 && detachedIndex + 1 < argv.length) {
    const value = String(argv[detachedIndex + 1]).toLowerCase();
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return Math.max(1, Number(value));
  }

  const envValue = String(env.KS2_NODE_TEST_CONCURRENCY || '').trim().toLowerCase();
  if (envValue) {
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
    if (/^\d+$/.test(envValue)) return Math.max(1, Number(envValue));
  }

  if (platform === 'win32') {
    return Math.max(1, Math.min(4, Number(available) || 1));
  }

  return true;
}

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
  const userArgv = process.argv.slice(2);

  if (hasUserPositional(userArgv)) {
    // Targeted run — small enough for OS argv; use spawn as before.
    let nodeArgs;
    try {
      nodeArgs = await buildSpawnArgs(userArgv);
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
  } else {
    // Default `npm test` path — use node:test programmatic run() API so
    // that 630+ file paths stay in-process memory and never touch OS argv.
    // This avoids ENAMETOOLONG on Windows (32K CreateProcess limit).
    const { run } = await import('node:test');
    const { spec: SpecReporter } = await import('node:test/reporters');

    let files;
    try {
      files = await resolveTestFiles();
      if (!files.length) throw new Error('run-node-tests: no test files discovered under tests/ or scripts/.');
    } catch (err) {
      console.error(err?.message || err);
      process.exit(1);
    }

    // Parse relevant flags from argv
    const runOptions = { files, concurrency: resolveDefaultConcurrency({ argv: userArgv }) };
    let shardIndex = null;
    let shardTotal = null;

    for (const arg of userArgv) {
      const shardMatch = arg.match(/^--test-shard=(\d+)\/(\d+)$/);
      if (shardMatch) {
        shardIndex = Number(shardMatch[1]);
        shardTotal = Number(shardMatch[2]);
        continue;
      }
      const concurrencyMatch = arg.match(/^--test-concurrency=(\d+)$/);
      if (concurrencyMatch) {
        runOptions.concurrency = Number(concurrencyMatch[1]);
        continue;
      }
      const timeoutMatch = arg.match(/^--test-timeout=(\d+)$/);
      if (timeoutMatch) {
        runOptions.timeout = Number(timeoutMatch[1]);
        continue;
      }
      const namePatternMatch = arg.match(/^--test-name-pattern=(.+)$/);
      if (namePatternMatch) {
        runOptions.testNamePatterns = [namePatternMatch[1]];
        continue;
      }
    }

    // Also handle detached --test-name-pattern <value> form
    for (let i = 0; i < userArgv.length; i++) {
      if (userArgv[i] === '--test-name-pattern' && i + 1 < userArgv.length) {
        runOptions.testNamePatterns = [userArgv[i + 1]];
      }
    }

    // Apply seeded shuffle for shard distribution instead of Node's internal modulo
    if (shardIndex !== null && shardTotal !== null) {
      const filteredFiles = getShardFiles(files, shardIndex, shardTotal);
      runOptions.files = filteredFiles;
      console.log(`shard ${shardIndex}/${shardTotal}: ${filteredFiles.length} files (seed=ks2-shard-seed-2026)`);
    }

    const wallStart = Date.now();
    const fileTimings = {};
    const stream = run(runOptions);
    let failures = 0;

    stream.on('test:pass', (data) => {
      if (data?.file && data?.details?.duration_ms != null) {
        fileTimings[data.file] = (fileTimings[data.file] || 0) + data.details.duration_ms;
      }
    });
    stream.on('test:fail', (data) => {
      failures += 1;
      if (data?.file && data?.details?.duration_ms != null) {
        fileTimings[data.file] = (fileTimings[data.file] || 0) + data.details.duration_ms;
      }
    });

    // Pipe through spec reporter to stdout
    const reporter = new SpecReporter();
    stream.compose(reporter).pipe(process.stdout);

    stream.on('end', async () => {
      // Write shard timing artifact when running in shard mode
      if (shardIndex !== null && shardTotal !== null) {
        const wallMs = Date.now() - wallStart;
        const timingData = {
          shard: shardIndex,
          total: shardTotal,
          files: fileTimings,
          wallMs,
        };
        try {
          await writeFile(
            path.join(process.cwd(), `shard-${shardIndex}-timings.json`),
            JSON.stringify(timingData, null, 2)
          );
        } catch { /* non-fatal */ }
      }
      process.exitCode = failures > 0 ? 1 : 0;
    });
  }
}
