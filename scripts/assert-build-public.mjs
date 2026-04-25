import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertHeadersBlockIsFresh } from './lib/headers-drift.mjs';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'dist', 'public');

async function mustExist(relativePath) {
  await access(path.join(publicDir, relativePath));
}

async function mustNotExist(relativePath) {
  try {
    await access(path.join(publicDir, relativePath));
  } catch {
    return;
  }
  throw new Error(`Unexpected deploy artefact in public output: ${relativePath}`);
}

async function walk(relativeDir = '') {
  const absoluteDir = path.join(publicDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

async function currentMonsterAssetKeys() {
  const monsterRoot = path.join(rootDir, 'assets', 'monsters');
  const keys = new Map();
  for (const monsterEntry of await readdir(monsterRoot, { withFileTypes: true })) {
    if (!monsterEntry.isDirectory()) continue;
    for (const branchEntry of await readdir(path.join(monsterRoot, monsterEntry.name), { withFileTypes: true })) {
      if (!branchEntry.isDirectory()) continue;
      const branchDir = path.join(monsterRoot, monsterEntry.name, branchEntry.name);
      for (const file of await readdir(branchDir)) {
        const match = file.match(/^(.+)-(b[0-9]+)-([0-9]+)\.(320|640|1280)\.webp$/);
        if (!match) continue;
        const [, monsterId, branch, stage, size] = match;
        const key = `${monsterId}-${branch}-${stage}`;
        if (!keys.has(key)) keys.set(key, new Set());
        keys.get(key).add(Number(size));
      }
    }
  }
  return new Map(Array.from(keys.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

await mustExist('index.html');
await mustExist('manifest.webmanifest');
await mustExist('favicon.ico');
await mustExist('_headers');
await mustExist('styles/app.css');
await mustExist('src/bundles/app.bundle.js');
await mustExist('assets/app-icons/favicon-16.png');
await mustExist('assets/app-icons/favicon-32.png');
await mustExist('assets/app-icons/apple-touch-icon.png');
await mustExist('assets/app-icons/app-icon-192.png');
await mustExist('assets/app-icons/app-icon-512.png');
await mustExist('assets/app-icons/app-icon-maskable-512.png');
await mustNotExist('assets/app-icons/app-icon-source.png');
await mustExist('assets/monsters/inklet/b1/inklet-b1-0.320.webp');
await mustExist('assets/monsters/inklet/b1/inklet-b1-0.1280.webp');
await mustExist('worker/src/index.js').then(
  () => {
    throw new Error('Worker source must not be copied into public output.');
  },
  () => undefined,
);

for (const unsafePath of ['worker', 'tests', 'docs', 'legacy', 'shared', 'migration-plan.md']) {
  await mustNotExist(unsafePath);
}
await mustNotExist('src/generated');
await mustNotExist('src/bundles/home.bundle.js');
await mustNotExist('src/main.js');
await mustNotExist('src/subjects');
await mustNotExist('src/platform/ui/render.js');
await mustNotExist('src/surfaces/home/index.jsx');
await mustNotExist('src/surfaces/home/TopNav.jsx');

const manifestUrl = pathToFileURL(path.join(rootDir, 'src', 'platform', 'game', 'monster-asset-manifest.js')).href;
const { MONSTER_ASSET_MANIFEST } = await import(`${manifestUrl}?assert=${Date.now()}`);
const expectedMonsterAssets = await currentMonsterAssetKeys();
const manifestKeys = new Map(MONSTER_ASSET_MANIFEST.assets.map((asset) => [asset.key, asset.sizes]));
for (const [key, sizes] of expectedMonsterAssets) {
  const manifestSizes = manifestKeys.get(key) || [];
  if (Array.from(sizes).sort((left, right) => left - right).join(',') !== manifestSizes.join(',')) {
    throw new Error(`Monster visual manifest is stale for ${key}. Regenerate src/platform/game/monster-asset-manifest.js.`);
  }
}
if (manifestKeys.size !== expectedMonsterAssets.size) {
  throw new Error('Monster visual manifest contains entries that do not match assets/monsters.');
}

const topLevel = await readdir(publicDir);
const allowed = new Set(['_headers', 'favicon.ico', 'index.html', 'manifest.webmanifest', 'styles', 'src', 'assets']);
const unexpected = topLevel.filter((entry) => !allowed.has(entry));
if (unexpected.length) {
  throw new Error(`Unexpected top-level public entries: ${unexpected.join(', ')}`);
}

const unsafeFiles = (await walk()).filter((file) => path.basename(file) === '.DS_Store');
if (unsafeFiles.length) {
  throw new Error(`Unexpected macOS metadata in public output: ${unsafeFiles.join(', ')}`);
}

const rawSourceFiles = (await walk()).filter((file) => (
  file.startsWith('src/')
  && file !== 'src/bundles/app.bundle.js'
));
if (rawSourceFiles.length) {
  throw new Error(`Public output must only expose the built app bundle under src/: ${rawSourceFiles.join(', ')}`);
}

const rawAssetPngs = (await walk()).filter((file) => (
  file.startsWith('assets/')
  && file.endsWith('.png')
  && !file.startsWith('assets/app-icons/')
));
if (rawAssetPngs.length) {
  throw new Error(`Raw asset PNG files must not be copied into public output: ${rawAssetPngs.join(', ')}`);
}

// U6 (sys-hardening p1): assert that the published `_headers` carries the
// full security-header block. Prevents silent drift between the repo-root
// `_headers` (single source of truth) and `dist/public/_headers` that ships
// with the deploy artefact.
//
// The assertion lives in `scripts/lib/headers-drift.mjs` so the drift test
// (tests/security-headers.test.js) can call the pure function directly with
// drifted strings — execution-based verification rather than substring
// inspection of this file (review testing-gap-3).
const publishedHeadersContent = await readFile(path.join(publicDir, '_headers'), 'utf8');
assertHeadersBlockIsFresh(publishedHeadersContent);

const indexHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');
if (!indexHtml.includes('/manifest.webmanifest')) {
  throw new Error('Public index.html must link the web app manifest.');
}
if (!indexHtml.includes('/assets/app-icons/apple-touch-icon.png')) {
  throw new Error('Public index.html must link the Apple home-screen icon.');
}
if (!indexHtml.includes('./src/bundles/app.bundle.js')) {
  throw new Error('Public index.html must load the React app bundle.');
}
if (indexHtml.includes('home.bundle.js') || indexHtml.includes('src/main.js')) {
  throw new Error('Public index.html must not load legacy home islands or the raw source entry.');
}

const appBundle = await readFile(path.join(publicDir, 'src/bundles/app.bundle.js'), 'utf8');
for (const token of [
  '__ks2HomeSurface',
  '__ks2CodexSurface',
  '__ks2SubjectTopNavSurface',
  'data-home-mount',
  'data-subject-topnav-mount',
  'home.bundle.js',
  'SEEDED_SPELLING_CONTENT_BUNDLE',
  'Legacy vendor seed for Pass 11 content model',
  'PUNCTUATION_CONTENT_MANIFEST',
  'createPunctuationContentIndexes',
  'createPunctuationGeneratedItems',
  'createPunctuationRuntimeManifest',
  'createPunctuationService',
  'PunctuationServiceError',
  'punctuation-r1-endmarks-apostrophe-speech',
]) {
  if (appBundle.includes(token)) {
    throw new Error(`React app bundle must not include retired legacy client token: ${token}`);
  }
}
