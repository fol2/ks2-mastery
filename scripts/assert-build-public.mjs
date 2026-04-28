import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assertCacheSplitRules, assertHeadersBlockIsFresh } from './lib/headers-drift.mjs';
import { PRACTICE_SEO_PAGES, canonicalPracticePageUrl } from './lib/seo-practice-pages.mjs';
import { IDENTITY_SEO_PAGES, canonicalIdentityPageUrl } from './lib/seo-identity-pages.mjs';
import { crawlerPolicyFailures } from './lib/seo-crawler-policy.mjs';

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

function assertContainsAll(label, value, expectedTokens) {
  for (const token of expectedTokens) {
    if (!value.includes(token)) {
      throw new Error(`${label} must include: ${token}`);
    }
  }
}

function sitemapLocs(xml) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/giu), (match) => match[1]);
}

function assertExactSitemapLocs(label, xml, expectedLocs) {
  const actual = sitemapLocs(xml);
  const expected = new Set(expectedLocs);
  const actualSet = new Set(actual);
  const duplicates = actual.filter((loc, index) => actual.indexOf(loc) !== index);
  const missing = expectedLocs.filter((loc) => !actualSet.has(loc));
  const unexpected = actual.filter((loc) => !expected.has(loc));
  if (
    actual.length !== expectedLocs.length
    || actualSet.size !== actual.length
    || missing.length
    || unexpected.length
  ) {
    throw new Error(`${label} must contain exactly ${expectedLocs.join(', ')}. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}. Duplicates: ${duplicates.join(', ') || 'none'}.`);
  }
}

const PUBLIC_SEO_PAGE_FORBIDDEN_TEXT = Object.freeze([
  'SEEDED_SPELLING_CONTENT_BUNDLE',
  'SEEDED_SPELLING_PUBLISHED_SNAPSHOT',
  'Legacy vendor seed for Pass 11 content model',
  'createLegacySpellingEngine',
  'KS2_WORDS_ENRICHED',
  'spelling-prompt-v1',
  'PUNCTUATION_CONTENT_MANIFEST',
  'PUNCTUATION_CONTEXT_PACK_LIMITS',
  'createPunctuationContentIndexes',
  'createPunctuationGeneratedItems',
  'createPunctuationRuntimeManifest',
  'normalisePunctuationContextPack',
  'createPunctuationService',
  'PunctuationServiceError',
  'punctuation-r1-endmarks-apostrophe-speech',
  '/api/child-subject-state',
  '/api/practice-sessions',
  '/api/child-game-state',
  '/api/event-log',
  '/api/debug/reset',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PUNCTUATION_AI_CONTEXT_PACK_JSON',
  'PUNCTUATION_AI_CONTEXT_PACK_KEY',
  'generativelanguage.googleapis.com',
  'api.openai.com/v1',
  '?local=1',
  'data-home-mount',
  'data-subject-mount',
  'home.bundle.js',
  '__ks2_injectFault_TESTS_ONLY__',
  '__ks2_capacityMeta__',
]);

function assertNoPublicSeoForbiddenText(label, html) {
  for (const token of PUBLIC_SEO_PAGE_FORBIDDEN_TEXT) {
    if (html.includes(token)) {
      throw new Error(`${label} includes forbidden public SEO token: ${token}`);
    }
  }
}

function jsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    const attributes = String(match[1] || '');
    if (!/\btype=["']application\/ld\+json["']/i.test(attributes)) {
      match = pattern.exec(html);
      continue;
    }
    try {
      blocks.push(JSON.parse(match[2]));
    } catch (error) {
      throw new Error(`Public index.html contains invalid JSON-LD: ${error?.message || error}`);
    }
    match = pattern.exec(html);
  }
  return blocks;
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
await mustExist('llms.txt');
await mustExist('manifest.webmanifest');
await mustExist('robots.txt');
await mustExist('sitemap.xml');
for (const page of PRACTICE_SEO_PAGES) {
  await mustExist(`${page.slug}/index.html`);
}
for (const page of IDENTITY_SEO_PAGES) {
  await mustExist(`${page.slug}/index.html`);
}
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
// U7 (sys-hardening p1): `.csp-theme-hash` is a build-time artefact
// written by `scripts/build-public.mjs` so operators (and future drift
// audits) can inspect the CSP inline-script hash that shipped without
// having to parse _headers.
const allowed = new Set([
  '_headers',
  'favicon.ico',
  'index.html',
  'llms.txt',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  ...PRACTICE_SEO_PAGES.map((page) => page.slug),
  ...IDENTITY_SEO_PAGES.map((page) => page.slug),
  'styles',
  'src',
  'assets',
  '.csp-theme-hash',
]);
const unexpected = topLevel.filter((entry) => !allowed.has(entry));
if (unexpected.length) {
  throw new Error(`Unexpected top-level public entries: ${unexpected.join(', ')}`);
}

const unsafeFiles = (await walk()).filter((file) => path.basename(file) === '.DS_Store');
if (unsafeFiles.length) {
  throw new Error(`Unexpected macOS metadata in public output: ${unsafeFiles.join(', ')}`);
}

// SH2-U10: widen to admit every `.js` chunk under `src/bundles/`, not just
// `app.bundle.js`. Esbuild `splitting: true` emits the entry + shared +
// lazy-entry chunks (content-hashed filenames) all under the same folder;
// the allowlist must cover them without opening the gate for arbitrary
// raw source under `src/`.
const rawSourceFiles = (await walk()).filter((file) => {
  if (!file.startsWith('src/')) return false;
  const normalised = file.split(path.sep).join('/');
  if (normalised.startsWith('src/bundles/') && normalised.endsWith('.js')) return false;
  return true;
});
if (rawSourceFiles.length) {
  throw new Error(`Public output must only expose built app bundle chunks under src/: ${rawSourceFiles.join(', ')}`);
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
// U8 (sys-hardening p1): enforce the cache-split contract on the published
// `_headers`. A regression that removes `immutable` on hashed bundles, swaps
// the manifest rule to `no-store`, or drops the `/index.html` group fails
// the build rather than shipping the degraded cache policy.
assertCacheSplitRules(publishedHeadersContent);

const indexHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');
const appBundle = await readFile(path.join(publicDir, 'src/bundles/app.bundle.js'), 'utf8');
const llmsTxt = await readFile(path.join(publicDir, 'llms.txt'), 'utf8');
const robotsTxt = await readFile(path.join(publicDir, 'robots.txt'), 'utf8');
const sitemapXml = await readFile(path.join(publicDir, 'sitemap.xml'), 'utf8');
const practicePageHtml = new Map();
for (const page of PRACTICE_SEO_PAGES) {
  practicePageHtml.set(page.slug, await readFile(path.join(publicDir, page.slug, 'index.html'), 'utf8'));
}
const identityPageHtml = new Map();
for (const page of IDENTITY_SEO_PAGES) {
  identityPageHtml.set(page.slug, await readFile(path.join(publicDir, page.slug, 'index.html'), 'utf8'));
}
const cspHashArtefact = await readFile(path.join(publicDir, '.csp-theme-hash'), 'utf8');
const canonicalRoot = 'https://ks2.eugnel.uk/';
if (!indexHtml.includes('/manifest.webmanifest')) {
  throw new Error('Public index.html must link the web app manifest.');
}
if (!indexHtml.includes('/assets/app-icons/apple-touch-icon.png')) {
  throw new Error('Public index.html must link the Apple home-screen icon.');
}
const appBundleVersionMatch = indexHtml.match(/\.\/src\/bundles\/app\.bundle\.js\?v=([a-f0-9]{12})/);
if (!appBundleVersionMatch) {
  throw new Error('Public index.html must load the React app bundle with a content-hash query string.');
}
const expectedAppBundleVersion = createHash('sha256').update(appBundle).digest('hex').slice(0, 12);
if (appBundleVersionMatch[1] !== expectedAppBundleVersion) {
  throw new Error('Public index.html app.bundle.js version query does not match the bundle content hash.');
}
if (indexHtml.includes('home.bundle.js') || indexHtml.includes('src/main.js')) {
  throw new Error('Public index.html must not load legacy home islands or the raw source entry.');
}

assertContainsAll('Public index.html SEO identity', indexHtml, [
  '<title>KS2 Mastery | KS2 Spelling, Grammar and Punctuation Practice</title>',
  '<meta name="description"',
  `<link rel="canonical" href="${canonicalRoot}" />`,
  '<meta property="og:title"',
  '<meta property="og:description"',
  `<meta property="og:url" content="${canonicalRoot}" />`,
  '<meta name="twitter:card" content="summary" />',
  '<link rel="alternate" type="text/plain" href="/llms.txt"',
  'KS2 spelling, grammar and punctuation practice',
  'Spelling practice for KS2 word confidence',
  'Grammar practice for sentence-level accuracy',
  'Punctuation practice for clearer written English',
  'href="/ks2-spelling-practice/"',
  'href="/ks2-grammar-practice/"',
  'href="/ks2-punctuation-practice/"',
  'href="/about/"',
]);

const productIdentity = jsonLdBlocks(indexHtml).find((entry) => entry?.name === 'KS2 Mastery');
if (!productIdentity) {
  throw new Error('Public index.html must include JSON-LD product identity for KS2 Mastery.');
}
if (productIdentity.url !== canonicalRoot) {
  throw new Error(`Public JSON-LD product identity must use canonical URL ${canonicalRoot}.`);
}
assertContainsAll('Public JSON-LD product identity', JSON.stringify(productIdentity), [
  'KS2 spelling',
  'KS2 grammar',
  'KS2 punctuation',
  'Practice tool',
]);

const cspHashLines = cspHashArtefact.split(/\r?\n/u).filter(Boolean);
if (cspHashLines.length < 2 || !cspHashLines.every((line) => /^sha256-[A-Za-z0-9+/]+=*$/.test(line))) {
  throw new Error('Public .csp-theme-hash must list every intentional inline script hash, including JSON-LD.');
}

if (/<\/?html|<!doctype/i.test(robotsTxt)) {
  throw new Error('robots.txt must not be the SPA HTML fallback.');
}
assertContainsAll('robots.txt', robotsTxt, [
  'User-agent: *',
  'Disallow: /api/',
  'Disallow: /admin',
  'Disallow: /demo',
  'Allow: /',
  `Sitemap: ${canonicalRoot}sitemap.xml`,
]);
const crawlerFailures = crawlerPolicyFailures(robotsTxt, {
  userAgent: 'OAI-SearchBot',
  publicPaths: [
    '/',
    ...PRACTICE_SEO_PAGES.map((page) => `/${page.slug}/`),
    ...IDENTITY_SEO_PAGES.map((page) => `/${page.slug}/`),
  ],
  privatePaths: ['/api/', '/admin', '/demo'],
});
if (crawlerFailures.length) {
  throw new Error(crawlerFailures.join('\n'));
}

if (/<\/?html|<!doctype/i.test(sitemapXml)) {
  throw new Error('sitemap.xml must not be the SPA HTML fallback.');
}
assertContainsAll('sitemap.xml', sitemapXml, [
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `<loc>${canonicalRoot}</loc>`,
  ...PRACTICE_SEO_PAGES.map((page) => `<loc>${canonicalPracticePageUrl(page)}</loc>`),
  ...IDENTITY_SEO_PAGES.map((page) => `<loc>${canonicalIdentityPageUrl(page)}</loc>`),
]);
assertExactSitemapLocs('sitemap.xml', sitemapXml, [
  canonicalRoot,
  ...PRACTICE_SEO_PAGES.map((page) => canonicalPracticePageUrl(page)),
  ...IDENTITY_SEO_PAGES.map((page) => canonicalIdentityPageUrl(page)),
]);
if (sitemapXml.includes('llms.txt')) {
  throw new Error('sitemap.xml must not advertise llms.txt as a search-result page.');
}
for (const forbiddenPublicPath of ['/api/', '/admin', '/demo', '.html', 'localhost', '127.0.0.1']) {
  if (sitemapXml.includes(forbiddenPublicPath)) {
    throw new Error(`sitemap.xml must not advertise private or local path: ${forbiddenPublicPath}`);
  }
}

for (const page of PRACTICE_SEO_PAGES) {
  const html = practicePageHtml.get(page.slug);
  const canonicalUrl = canonicalPracticePageUrl(page);
  assertContainsAll(`Public ${page.slug} SEO page`, html, [
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<h1>${page.heading}</h1>`,
    page.intro,
    '/demo',
    'KS2 Mastery home',
  ]);
  for (const point of page.points) {
    if (!html.includes(point)) {
      throw new Error(`Public ${page.slug} SEO page must include practice point: ${point}`);
    }
  }
  for (const forbiddenToken of ['app.bundle.js', 'id="app"', 'application/ld+json', '<script']) {
    if (html.includes(forbiddenToken)) {
      throw new Error(`Public ${page.slug} SEO page must not include app-shell or inline-script token: ${forbiddenToken}`);
    }
  }
  if (!html.includes('href="/about/"')) {
    throw new Error(`Public ${page.slug} SEO page must link to the about page.`);
  }
  assertNoPublicSeoForbiddenText(`Public ${page.slug} SEO page`, html);
}

for (const page of IDENTITY_SEO_PAGES) {
  const html = identityPageHtml.get(page.slug);
  const canonicalUrl = canonicalIdentityPageUrl(page);
  assertContainsAll(`Public ${page.slug} SEO page`, html, [
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<h1>${page.heading}</h1>`,
    page.intro,
    'KS2 spelling, grammar and punctuation practice',
    'Learners can try a demo before signing in',
    'Signing in saves learner profiles and progress',
    'Private learner progress, admin tools and generated content stores are not public SEO content',
    'href="/ks2-spelling-practice/"',
    'href="/ks2-grammar-practice/"',
    'href="/ks2-punctuation-practice/"',
    'href="/demo"',
  ]);
  for (const forbiddenToken of ['app.bundle.js', 'id="app"', 'application/ld+json', '<script']) {
    if (html.includes(forbiddenToken)) {
      throw new Error(`Public ${page.slug} SEO page must not include app-shell or inline-script token: ${forbiddenToken}`);
    }
  }
  for (const overclaim of ['guaranteed', 'full curriculum', 'AI tutor', 'exam results']) {
    if (html.toLowerCase().includes(overclaim.toLowerCase())) {
      throw new Error(`Public ${page.slug} SEO page must not overclaim with token: ${overclaim}`);
    }
  }
  assertNoPublicSeoForbiddenText(`Public ${page.slug} SEO page`, html);
}

assertContainsAll('Public llms.txt', llmsTxt, [
  'KS2 Mastery',
  canonicalRoot,
  ...IDENTITY_SEO_PAGES.map((page) => canonicalIdentityPageUrl(page)),
  ...PRACTICE_SEO_PAGES.map((page) => canonicalPracticePageUrl(page)),
  'KS2 spelling',
  'KS2 grammar',
  'KS2 punctuation',
  'Private learner progress, account state, operator tools and generated content stores are not public SEO content',
]);
for (const forbiddenToken of [
  '/api/',
  '/admin',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'guaranteed',
  'full curriculum',
  'AI tutor',
  'exam results',
]) {
  if (llmsTxt.toLowerCase().includes(forbiddenToken.toLowerCase())) {
    throw new Error(`Public llms.txt must not include forbidden token: ${forbiddenToken}`);
  }
}
assertNoPublicSeoForbiddenText('Public llms.txt', llmsTxt);

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
