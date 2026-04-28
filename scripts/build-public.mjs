import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { computeInlineScriptHashes } from './compute-inline-script-hash.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'public');
const tmpDir = path.join(rootDir, 'dist', 'public.tmp');

// U7 (sys-hardening p1): file paths written at build time so the CSP
// string carries the exact hash of the inline theme script.
//
//  - `worker/src/generated-csp-hash.js` is consumed by
//    `worker/src/security-headers.js` to build the Content-Security-
//    Policy value at cold-start. It lives inside the Worker import
//    graph (NOT under `src/generated/`, which is excluded below) so
//    Wrangler bundles it.
//  - `dist/public/.csp-theme-hash` is a plain-text artefact used by
//    the drift audit and by operators checking which inline hashes shipped.
//  - `dist/public/_headers` carries the CSP line with the hash value
//    substituted into the `'sha256-BUILD_TIME_HASH'` placeholder.
const generatedCspHashPath = path.join(rootDir, 'worker', 'src', 'generated-csp-hash.js');
const publicCspHashArtefactPath = path.join(outputDir, '.csp-theme-hash');
const publicHeadersPath = path.join(outputDir, '_headers');
const appBundleScriptSrc = './src/bundles/app.bundle.js';

function shortContentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

const entries = [
  '_headers',
  'favicon.ico',
  'index.html',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'styles',
  'assets',
];

const filterPublicFiles = source => {
  const base = path.basename(source);
  const relative = path.relative(rootDir, source).split(path.sep).join('/');
  const retiredClientFiles = new Set([
    'src/bundles/home.bundle.js',
    'src/surfaces/home/index.jsx',
    'src/surfaces/home/TopNav.jsx',
  ]);

  if (base === '.DS_Store') {
    return false;
  }

  if (retiredClientFiles.has(relative)) {
    return false;
  }

  if (relative === 'src/generated' || relative.startsWith('src/generated/')) {
    return false;
  }

  const appIconPng = relative.startsWith('assets/app-icons/')
    && relative.endsWith('.png')
    && base !== 'app-icon-source.png';
  if (relative.startsWith('assets/') && relative.endsWith('.png') && !appIconPng) {
    return false;
  }

  return true;
};

// Wrap the public-mirror pipeline in try/catch + process.exit(1) for the
// same reason as build-bundles.mjs: under certain Windows + execFileSync
// stdio-ignore conditions, an unhandled async rejection from a chained
// step can settle after the entry's sync body finishes and let Node exit 0,
// hiding the failure from CI. The explicit guard keeps failures loud.
try {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  for (const entry of entries) {
    await cp(path.join(rootDir, entry), path.join(tmpDir, entry), {
      recursive: true,
      force: true,
      filter: filterPublicFiles,
    });
  }

  // SH2-U10: esbuild `splitting: true` emits `app.bundle.js` plus sibling
  // `.js` chunks (shared content-hashed chunks + lazy-entry chunks for
  // adult-only hubs). Copy every `.js` file under `src/bundles/` into the
  // public output so the Worker/ASSETS allowlist (prefix match on
  // `/src/bundles/*.js`) resolves all chunks. The metafile artefact
  // (`app.bundle.meta.json`) is intentionally excluded — it never ships.
  await mkdir(path.join(tmpDir, 'src', 'bundles'), { recursive: true });
  const bundlesSourceDir = path.join(rootDir, 'src', 'bundles');
  const bundleEntries = await readdir(bundlesSourceDir, { withFileTypes: true });
  for (const entry of bundleEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.js')) continue;
    await cp(
      path.join(bundlesSourceDir, entry.name),
      path.join(tmpDir, 'src', 'bundles', entry.name),
      { force: true },
    );
  }

  // Render-effect CSS lives next to its effect modules so visual + behaviour
  // stay co-located. Mirror it into the public styles directory so the
  // existing single-link pattern in index.html continues to work without a
  // new module-aware loader.
  await cp(
    path.join(rootDir, 'src', 'platform', 'game', 'render', 'effects', 'effects.css'),
    path.join(tmpDir, 'styles', 'effects.css'),
    { force: true },
  );

  // `app.bundle.js` has a stable filename because index.html is the only
  // entry point. Stamp the public HTML with the bundle content hash so a
  // no-store HTML refresh never reuses a browser-cached stale entry bundle
  // that points at retired lazy chunks.
  const appBundlePath = path.join(tmpDir, 'src', 'bundles', 'app.bundle.js');
  const appBundleBytes = await readFile(appBundlePath);
  const appBundleVersion = shortContentHash(appBundleBytes);
  const tmpIndexPath = path.join(tmpDir, 'index.html');
  const tmpIndexHtml = await readFile(tmpIndexPath, 'utf8');
  if (!tmpIndexHtml.includes(appBundleScriptSrc)) {
    throw new Error(`index.html must reference ${appBundleScriptSrc} before build-public can version it.`);
  }
  await writeFile(
    tmpIndexPath,
    tmpIndexHtml.replaceAll(appBundleScriptSrc, `${appBundleScriptSrc}?v=${appBundleVersion}`),
    'utf8',
  );

  await rm(outputDir, { recursive: true, force: true });
  await cp(tmpDir, outputDir, { recursive: true, force: true });
  await rm(tmpDir, { recursive: true, force: true });

  // U7/U2 SEO: compute the inline script SHA-256 values from the canonical
  // source (`index.html` at repo root). The public HTML rewrites only the
  // external module script URL, so the inline script hashes are unchanged.
  const sourceHtml = await readFile(path.join(rootDir, 'index.html'), 'utf8');
  const cspInlineScriptHashes = computeInlineScriptHashes(sourceHtml);
  const cspInlineScriptHashDirectives = cspInlineScriptHashes
    .map((hash) => `'${hash}'`)
    .join(' ');

  // Write the generated module that `worker/src/security-headers.js`
  // imports. Keep the module tiny so a broken build fails fast with a
  // single responsibility. The file IS committed (with a placeholder
  // value) so fresh clones can run `npm test` before the first build;
  // this step overwrites it with the real hash on every build.
  const generatedModule = [
    '// GENERATED BY scripts/build-public.mjs — do not edit by hand.',
    '// This file is committed so fresh clones can run `npm test` before',
    '// `npm run build` has produced a real hash. Build overwrites this.',
    '',
    `export const CSP_INLINE_SCRIPT_HASHES = Object.freeze(${JSON.stringify(cspInlineScriptHashes)});`,
    'export const CSP_INLINE_SCRIPT_HASH = CSP_INLINE_SCRIPT_HASHES[0];',
    '',
  ].join('\n');
  await writeFile(generatedCspHashPath, generatedModule, 'utf8');
  await writeFile(publicCspHashArtefactPath, `${cspInlineScriptHashes.join('\n')}\n`, 'utf8');

  // Substitute the placeholder token in `_headers`. Each public header block
  // carries the same placeholder in `script-src` and `script-src-elem`; every
  // occurrence is rewritten to the current inline-script hash directives.
  const headersContent = await readFile(publicHeadersPath, 'utf8');
  const substituted = headersContent.replaceAll("'sha256-BUILD_TIME_HASH'", cspInlineScriptHashDirectives);
  if (!cspInlineScriptHashes.every((hash) => substituted.includes(hash))) {
    throw new Error(
      '_headers must contain a \'sha256-BUILD_TIME_HASH\' placeholder for the CSP rollout (U7). '
      + 'Restore the placeholder or update scripts/build-public.mjs.',
    );
  }
  await writeFile(publicHeadersPath, substituted, 'utf8');
} catch (error) {
  console.error(error);
  process.exit(1);
}
