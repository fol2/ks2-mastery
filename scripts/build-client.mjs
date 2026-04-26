import { build } from 'esbuild';
import path from 'node:path';
import { execSync as nodeExecSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'src', 'bundles');

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
  await mkdir(outputDir, { recursive: true });
  const resolvedHash = buildHash !== undefined ? buildHash : resolveBuildHash();
  const mode = String(process.env.KS2_BUILD_MODE || 'production').toLowerCase();
  const isTestBuild = mode === 'test';

  const result = await build({
    entryPoints: [path.join(rootDir, 'src/app/entry.jsx')],
    outfile: path.join(outputDir, 'app.bundle.js'),
    bundle: true,
    format: 'esm',
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
