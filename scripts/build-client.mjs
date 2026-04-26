import { build } from 'esbuild';
import path from 'node:path';
import { execSync as nodeExecSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'src', 'bundles');

// SH2-U10 reviewer-follow-up (BLOCKER-2): defence-in-depth guard for
// `cleanOutputDir()`. The unconditional `rm -rf` below would be catastrophic
// if `outputDir` ever resolved to the repo root or a sibling, so we assert
// the resolved path ends in `src/bundles` (Unix or Windows separator) under
// the supplied root. The guard accepts any caller-supplied `rootDir` so
// tests can stage a tmpdir/src/bundles fixture and verify the clean step
// without running esbuild. Refusals surface a pointed error instead of a
// silent widening of the blast radius.
const EXPECTED_OUTPUT_RELATIVE = path.join('src', 'bundles');
export function assertOutputDirIsBundlesSubtree(dir, rootDirArg = rootDir) {
  const resolved = path.resolve(dir);
  const expected = path.resolve(rootDirArg, EXPECTED_OUTPUT_RELATIVE);
  if (resolved !== expected) {
    throw new Error(
      `cleanOutputDir safety guard: expected ${expected} but got ${resolved}. `
      + 'Refusing to rm -rf outside src/bundles/.',
    );
  }
}

// SH2-U10 reviewer-follow-up (BLOCKER-2): exported clean-before-build helper
// so tests can exercise the `rm -rf` + `mkdir` sequence without running the
// heavy esbuild pass. `rootDirArg` defaults to the module-level `rootDir`
// captured at import time; tests supply a tmpdir so the stage-stale-then-
// clean scenario is fully isolated.
export async function cleanOutputDir(dir = outputDir, rootDirArg = rootDir) {
  assertOutputDirIsBundlesSubtree(dir, rootDirArg);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

// U16: derive `__BUILD_HASH__` from `git rev-parse --short HEAD` so the client
// bundle can stamp every error-capture POST with the release it shipped from.
// The Worker stores this on `ops_error_events.first_seen_release` /
// `last_seen_release` and U17 compares it against `resolved_in_release` to
// decide whether an event on a resolved fingerprint should auto-reopen.
//
// Policy: the stamp is null-unless-clean so dirty-tree dev builds and CI
// shallow clones never pollute production telemetry. Concretely:
//   - `.git` missing / git not installed -> null (CI edge)
//   - `git status --porcelain` reports any dirty line -> null (dev edge)
//   - `git rev-parse` returns a non-hex 6-40 char value (defence-in-depth) -> null
// Auto-reopen (U17) short-circuits on NULL release per its condition-3 check,
// so a null stamp simply means "don't trigger reopens against this event".
//
// The regex here matches the server-side `/^[a-f0-9]{6,40}$/` tightened per
// Phase B adversarial review — no case-insensitive flag, no dots/dashes/
// underscores, lowercase hex only.
//
// Phase E Imp-3: `execSync` is accepted as an injected dependency so tests
// can exercise the three control paths against this exact function rather
// than a mirrored stub. The test used to duplicate the logic in
// `tests/helpers/build-hash-resolver.js`, which drifted silently if the
// production helper's regex / ordering changed. The production default is
// `nodeExecSync`; tests pass a stub that returns canned output or throws.
function resolveBuildHash({ execSync = nodeExecSync } = {}) {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{6,40}$/.test(hash)) return null;
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return dirty ? null : hash;
  } catch {
    return null;
  }
}

// U8 (capacity release gates + telemetry): when the caller opts in
// via `KS2_BUILD_MODE=test` the bundle is produced WITHOUT the
// `process.env.NODE_ENV = 'production'` define. That keeps the
// multi-tab coordination counters (`globalThis.__ks2_capacityMeta__`)
// alive in the Playwright-served bundle so the scene can read them.
// Production builds (no env var) keep the existing dead-code-elimination
// contract — see `src/platform/core/repositories/api.js`. The bundle
// audit (`scripts/audit-client-bundle.mjs`) still runs against the
// production bundle only, so the test-mode variant does not relax any
// shipped-bundle invariants.
export async function runBuildClient({ buildHash } = {}) {
  // SH2-U10 reviewer-follow-up (BLOCKER-2): clean the outdir BEFORE esbuild
  // writes new chunks. Esbuild does not clean `outdir` before emitting, and
  // `chunkNames: '[name]-[hash]'` produces a different filename per build
  // — so a stale chunk from a prior build (e.g.
  // `AdminHubSurface-AAAA.js`) can linger under `src/bundles/` and be
  // blanket-copied into `dist/public/` by `scripts/build-public.mjs`
  // alongside the current build's `AdminHubSurface-BBBB.js`. The stale
  // file is NOT in the new build's metafile, so the local audit
  // (`scripts/audit-client-bundle.mjs`) walks only the current build's
  // chunks and misses the stale file — which then ships to production
  // unscrubbed for forbidden tokens. Pre-split builds were safe because
  // a single `outfile` overwrite replaced `app.bundle.js`; splitting
  // broke that invariant. The safety guard inside `cleanOutputDir`
  // keeps the `rm -rf` scoped to the intended subtree.
  await cleanOutputDir();
  const resolvedHash = buildHash !== undefined ? buildHash : resolveBuildHash();
  const mode = String(process.env.KS2_BUILD_MODE || 'production').toLowerCase();
  const isTestBuild = mode === 'test';

  // SH2-U10: esbuild code-splitting is enabled so adult-only surfaces
  // (Admin Hub, Parent Hub, Monster Visual Config panel — already
  // reachable via `React.lazy()`) are emitted as sibling `.js` chunks
  // under `src/bundles/` instead of baked into `app.bundle.js`. First-
  // paint learner routes only download `app.bundle.js`; the adult
  // chunks load on demand when the matching route is navigated.
  //
  // `splitting: true` requires `format: 'esm'` (already in place) and
  // uses `outdir` instead of `outfile`. `entryNames: 'app.bundle'`
  // keeps the entry name stable at `app.bundle.js` so the Worker
  // allowlist, `_headers` `/src/bundles/` cache rules, and the
  // `index.html` `<script type="module" src="./src/bundles/app.bundle.js">`
  // reference continue to resolve to the same filename. Chunk names
  // (`chunkNames: '[name]-[hash]'`) give each split chunk a content-
  // hashed filename so the immutable cache in
  // `worker/src/security-headers.js::isImmutableBundlePath` is safe
  // across redeploys.
  //
  // F-01 (same-PR atomicity): `worker/src/app.js::publicSourceAssetResponse`
  // is updated in the same commit to match `/src/bundles/*.js` by prefix,
  // not just `/src/bundles/app.bundle.js` exactly. Without that change
  // every split chunk would 404 in production.
  const result = await build({
    entryPoints: [path.join(rootDir, 'src/app/entry.jsx')],
    outdir: outputDir,
    entryNames: 'app.bundle',
    chunkNames: '[name]-[hash]',
    bundle: true,
    format: 'esm',
    splitting: true,
    target: ['es2022'],
    jsx: 'automatic',
    jsxImportSource: 'react',
    loader: { '.js': 'jsx' },
    minify: true,
    sourcemap: false,
    metafile: true,
    define: {
      // U8 test-mode preserves the capacity-meta counters by skipping
      // the `"production"` DCE signal; U16 `__BUILD_HASH__` stamping
      // applies unconditionally so test bundles still satisfy the
      // runtime `typeof __BUILD_HASH__ === 'string'` guard.
      'process.env.NODE_ENV': isTestBuild ? '"test"' : '"production"',
      // JSON.stringify gives us either `"abcdef0"` or `null` — the client
      // guards with `typeof __BUILD_HASH__ === 'string'`.
      __BUILD_HASH__: JSON.stringify(resolvedHash),
    },
    logLevel: 'info',
  });

  await writeFile(
    path.join(outputDir, 'app.bundle.meta.json'),
    `${JSON.stringify(result.metafile, null, 2)}\n`,
  );

  return { buildHash: resolvedHash };
}

// Side-effect run preserves the historical contract that build-bundles.mjs
// and `node scripts/build-client.mjs` both trigger a build. Tests that only
// need the `resolveBuildHash` logic (or a dry build) import the named
// exports and skip the top-level invocation by setting
// `process.env.KS2_SKIP_CLIENT_BUILD=1`. The env-var short-circuit avoids a
// heavy esbuild run in test processes that import the module purely for its
// helpers.
if (!process.env.KS2_SKIP_CLIENT_BUILD) {
  await runBuildClient();
}

export { resolveBuildHash };
