import { build } from 'esbuild';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'src', 'bundles');

await mkdir(outputDir, { recursive: true });

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
  define: isTestBuild
    ? { 'process.env.NODE_ENV': '"test"' }
    : { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

await writeFile(
  path.join(outputDir, 'app.bundle.meta.json'),
  `${JSON.stringify(result.metafile, null, 2)}\n`,
);
