// Phase E / U16 coverage: `scripts/build-client.mjs` resolves the current
// git SHA via `git rev-parse --short HEAD`, rejects dirty trees + missing
// `.git` fallbacks, and injects the result as a JSON string constant
// (`__BUILD_HASH__`) into the esbuild client bundle so the runtime can
// stamp every error-capture POST with the release it shipped from.
//
// The tests exercise the `resolveBuildHash` helper directly (via dynamic
// import with `KS2_SKIP_CLIENT_BUILD=1` to avoid running the heavy esbuild
// bundler in CI) and simulate the three control paths:
//   - clean tree -> helper returns the SHA in `/^[a-f0-9]{6,40}$/`
//   - dirty tree -> helper returns null (no stamp)
//   - git unavailable (`.git` missing OR `execSync` throws) -> helper returns null
//
// `execSync` is stubbed rather than shelling out so the test does not
// depend on the host's actual git state and runs on CI shallow clones.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U16

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { redactClientErrorEvent } from '../src/platform/ops/error-capture.js';

process.env.KS2_SKIP_CLIENT_BUILD = '1';

test('U16 — redactClientErrorEvent produces the allowlist shape the ingest route reads', () => {
  const redacted = redactClientErrorEvent({
    errorKind: 'TypeError',
    message: 'x is undefined',
    stack: 'at foo (bar.js:1)',
    routeName: '/dashboard',
    userAgent: 'Mozilla/5.0',
    timestamp: 1_700_000_000_000,
  });
  assert.equal(redacted.errorKind, 'TypeError');
  assert.equal(redacted.messageFirstLine, 'x is undefined');
  assert.equal(redacted.firstFrame, 'at foo (bar.js:1)');
  // release is NOT added by redactClientErrorEvent itself — it is added by
  // captureClientError at enqueue time, reading the esbuild-injected
  // __BUILD_HASH__ constant. redactClientErrorEvent stays the pure-
  // allowlist function the Worker can re-run defensively.
  assert.equal(redacted.release, undefined);
});

// Phase E Imp-3: the real `resolveBuildHash` now takes an injectable
// `execSync` so the tests below exercise it directly rather than a
// mirrored stub. A regression in the production regex / ordering will
// now fail these tests — the old mirror helper silently drifted.
function stubbedExecSync({ revParseOutput, statusOutput, throwOnRevParse = false, throwOnStatus = false } = {}) {
  return (command) => {
    if (command.startsWith('git rev-parse')) {
      if (throwOnRevParse) throw new Error('simulated execSync failure (.git missing)');
      return revParseOutput ?? '';
    }
    if (command.startsWith('git status')) {
      if (throwOnStatus) throw new Error('simulated execSync failure (status)');
      return statusOutput ?? '';
    }
    throw new Error(`unexpected command: ${command}`);
  };
}

test('U16 — resolveBuildHash returns a SHA when git rev-parse succeeds + tree is clean', async () => {
  const { resolveBuildHash } = await import('../scripts/build-client.mjs');
  const result = resolveBuildHash({
    execSync: stubbedExecSync({ revParseOutput: 'abc1234\n', statusOutput: '' }),
  });
  assert.equal(result, 'abc1234');
});

test('U16 — resolveBuildHash returns null when the tree is dirty', async () => {
  const { resolveBuildHash } = await import('../scripts/build-client.mjs');
  const result = resolveBuildHash({
    execSync: stubbedExecSync({ revParseOutput: 'abc1234\n', statusOutput: ' M src/main.js\n' }),
  });
  assert.equal(result, null);
});

test('U16 — resolveBuildHash returns null when execSync throws (missing .git / CI shallow)', async () => {
  const { resolveBuildHash } = await import('../scripts/build-client.mjs');
  const result = resolveBuildHash({ execSync: stubbedExecSync({ throwOnRevParse: true }) });
  assert.equal(result, null);
});

test('U16 — resolveBuildHash returns null when rev-parse output is not hex-shaped', async () => {
  const { resolveBuildHash } = await import('../scripts/build-client.mjs');
  // Simulate a bizarre rev-parse output (e.g. a tag name if someone reconfigured
  // the repo) — the stricter `/^[a-f0-9]{6,40}$/` regex kicks it out so a
  // non-SHA literal never reaches the bundle.
  const result = resolveBuildHash({
    execSync: stubbedExecSync({ revParseOutput: 'v5.2.0\n', statusOutput: '' }),
  });
  assert.equal(result, null);
});

test('U16 — resolveBuildHash returns null when rev-parse output is uppercase hex', async () => {
  const { resolveBuildHash } = await import('../scripts/build-client.mjs');
  // Defence-in-depth: `git rev-parse --short HEAD` emits lowercase by
  // default, but a patched git config could return uppercase. The regex
  // has no /i flag — uppercase is rejected so the stamped release always
  // satisfies the Worker's server-side guard.
  const result = resolveBuildHash({
    execSync: stubbedExecSync({ revParseOutput: 'ABC1234\n', statusOutput: '' }),
  });
  assert.equal(result, null);
});

test('U16 — resolveBuildHash returns null when rev-parse output is too short', async () => {
  const { resolveBuildHash } = await import('../scripts/build-client.mjs');
  const result = resolveBuildHash({
    execSync: stubbedExecSync({ revParseOutput: 'abc\n', statusOutput: '' }), // 3 chars < 6 minimum
  });
  assert.equal(result, null);
});

test('U16 — captureClientError includes release in the POST payload when __BUILD_HASH__ is defined', async () => {
  // Exercise the runtime-guarded release reader. `__BUILD_HASH__` is an
  // esbuild-injected constant — in test contexts (no bundler) we patch it
  // onto globalThis so the `typeof __BUILD_HASH__` check resolves to
  // `'string'`. The capture pipeline must include `release` on the
  // enqueued event.
  const { captureClientError, _resetErrorCaptureState, _peekErrorCaptureQueue } =
    await import('../src/platform/ops/error-capture.js');
  _resetErrorCaptureState();
  // eslint-disable-next-line no-undef
  globalThis.__BUILD_HASH__ = 'cafebab';
  try {
    const credentialFetch = async () => ({ ok: true, status: 200 });
    captureClientError({
      source: 'test',
      error: { name: 'TypeError', message: 'boom', stack: 'at x' },
      info: {},
      credentialFetch,
      timestamp: 1_700_000_000_000,
    });
    const queue = _peekErrorCaptureQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].release, 'cafebab');
  } finally {
    // eslint-disable-next-line no-undef
    delete globalThis.__BUILD_HASH__;
    _resetErrorCaptureState();
  }
});

test('U16 — captureClientError includes release: null when __BUILD_HASH__ is undefined', async () => {
  const { captureClientError, _resetErrorCaptureState, _peekErrorCaptureQueue } =
    await import('../src/platform/ops/error-capture.js');
  _resetErrorCaptureState();
  try {
    const credentialFetch = async () => ({ ok: true, status: 200 });
    captureClientError({
      source: 'test',
      error: { name: 'TypeError', message: 'boom', stack: 'at x' },
      info: {},
      credentialFetch,
      timestamp: 1_700_000_000_000,
    });
    const queue = _peekErrorCaptureQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].release, null);
  } finally {
    _resetErrorCaptureState();
  }
});

test('U16 — captureClientError forwards a non-SHA literal unchanged (Worker rejects with 400)', async () => {
  // Defence-in-depth: the client does NOT re-validate release shape before
  // enqueuing because the Worker's server-side regex is the authoritative
  // guard (tightened per Phase B adversarial review). If a broken esbuild
  // define somehow emitted a non-hex literal, the Worker rejects with
  // 400 validation_failed — the client path does not swallow or mutate.
  const { captureClientError, _resetErrorCaptureState, _peekErrorCaptureQueue } =
    await import('../src/platform/ops/error-capture.js');
  _resetErrorCaptureState();
  // eslint-disable-next-line no-undef
  globalThis.__BUILD_HASH__ = 'not-a-sha';
  try {
    const credentialFetch = async () => ({ ok: false, status: 400 });
    captureClientError({
      source: 'test',
      error: { name: 'TypeError', message: 'boom', stack: 'at x' },
      info: {},
      credentialFetch,
      timestamp: 1_700_000_000_000,
    });
    const queue = _peekErrorCaptureQueue();
    assert.equal(queue.length, 1);
    // Client forwards the literal unchanged — server is authoritative.
    assert.equal(queue[0].release, 'not-a-sha');
  } finally {
    // eslint-disable-next-line no-undef
    delete globalThis.__BUILD_HASH__;
    _resetErrorCaptureState();
  }
});

// SH2-U10 reviewer-follow-up (BLOCKER-2): `scripts/build-client.mjs` must
// clean `src/bundles/` BEFORE running esbuild. With `splitting: true` +
// `chunkNames: '[name]-[hash]'` the per-build chunk filenames change, so
// a stale chunk from a prior build would linger under `src/bundles/` and
// be blanket-copied by `scripts/build-public.mjs` into `dist/public/`
// alongside the current build's chunks — shipping un-audited JavaScript
// to production. The clean-before-build step below wipes the output dir
// first so only current-build outputs ever reach `dist/public/`. Tests
// drive `cleanOutputDir()` directly against a tmpdir so the scenario
// stays isolated from the real repo tree.
test('U10 — cleanOutputDir removes stale chunks from a prior build before the next build writes', async () => {
  const { cleanOutputDir } = await import('../scripts/build-client.mjs');
  const fakeRoot = await mkdtemp(path.join(tmpdir(), 'ks2-u10-clean-'));
  const fakeOutdir = path.join(fakeRoot, 'src', 'bundles');
  try {
    await mkdir(fakeOutdir, { recursive: true });
    // Stage a stale chunk as if emitted by a previous build. The filename
    // hash intentionally differs from anything the current build would
    // emit, which is exactly the scenario the clean step exists to solve.
    const staleChunk = path.join(fakeOutdir, 'AdminHubSurface-STALEAAAA.js');
    await writeFile(staleChunk, 'console.log("stale build artifact");\n');
    const staleMeta = path.join(fakeOutdir, 'app.bundle.meta.json');
    await writeFile(staleMeta, '{"old":"metafile"}\n');
    const before = await readdir(fakeOutdir);
    assert.ok(before.includes('AdminHubSurface-STALEAAAA.js'), 'pre-condition: stale file staged');
    assert.ok(before.includes('app.bundle.meta.json'), 'pre-condition: stale metafile staged');

    // Clean step wipes + recreates the outdir. `rootDirArg` threads a
    // synthetic root through the safety guard so the test never touches
    // the real `src/bundles/` tree.
    await cleanOutputDir(fakeOutdir, fakeRoot);

    const after = await readdir(fakeOutdir);
    assert.equal(after.length, 0, `outdir must be empty after clean; got: ${after.join(', ')}`);
  } finally {
    await rm(fakeRoot, { recursive: true, force: true });
  }
});

test('U10 — cleanOutputDir safety guard refuses to rm -rf outside src/bundles/', async () => {
  const { cleanOutputDir } = await import('../scripts/build-client.mjs');
  const fakeRoot = await mkdtemp(path.join(tmpdir(), 'ks2-u10-guard-'));
  try {
    // A hostile / buggy caller passes a path that is NOT `<root>/src/bundles`.
    // The guard must reject, NOT rm the hostile path.
    const hostilePath = path.join(fakeRoot, 'hostile-directory');
    await mkdir(hostilePath, { recursive: true });
    const canary = path.join(hostilePath, 'canary.txt');
    await writeFile(canary, 'must not be deleted\n');

    await assert.rejects(
      () => cleanOutputDir(hostilePath, fakeRoot),
      /Refusing to rm -rf outside src\/bundles\//,
    );

    // Canary must still exist — the guard rejected before rm ran.
    const contents = await readdir(hostilePath);
    assert.ok(contents.includes('canary.txt'), 'canary file must survive a rejected clean');
  } finally {
    await rm(fakeRoot, { recursive: true, force: true });
  }
});
