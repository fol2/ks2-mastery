import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

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

await mustExist('index.html');
await mustExist('_headers');
await mustExist('styles/app.css');
await mustExist('src/bundles/app.bundle.js');
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

const topLevel = await readdir(publicDir);
const allowed = new Set(['_headers', 'index.html', 'styles', 'src', 'assets']);
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

const rawAssetPngs = (await walk()).filter((file) => file.startsWith('assets/') && file.endsWith('.png'));
if (rawAssetPngs.length) {
  throw new Error(`Raw asset PNG files must not be copied into public output: ${rawAssetPngs.join(', ')}`);
}

const indexHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');
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
  'createPunctuationService',
  'PunctuationServiceError',
  'punctuation-r1-endmarks-apostrophe-speech',
]) {
  if (appBundle.includes(token)) {
    throw new Error(`React app bundle must not include retired legacy client token: ${token}`);
  }
}
