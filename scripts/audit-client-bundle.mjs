import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();

const DEFAULT_BUNDLE = 'src/bundles/app.bundle.js';
const DEFAULT_METAFILE = 'src/bundles/app.bundle.meta.json';
const DEFAULT_PUBLIC_DIR = 'dist/public';

const FORBIDDEN_MODULES = [
  { pattern: /^src\/subjects\/spelling\/data\//, reason: 'full spelling content dataset' },
  { pattern: /^src\/subjects\/spelling\/engine\//, reason: 'client-side spelling engine' },
  { pattern: /^src\/subjects\/spelling\/service\.js$/, reason: 'client-side spelling runtime service' },
  { pattern: /^src\/subjects\/spelling\/content\/(model|repository|service)\.js$/, reason: 'content-heavy client read/write builders' },
  { pattern: /^src\/subjects\/spelling\/data\/word-data\.js$/, reason: 'derived word dataset' },
  { pattern: /^shared\/punctuation\/(content|context-packs|generators|marking|scheduler|service)\.js$/, reason: 'server-side punctuation engine and content' },
  { pattern: /^worker\/src\/subjects\/punctuation\//, reason: 'server-side punctuation command runtime' },
  { pattern: /^src\/subjects\/punctuation\/(service|repository)\.js$/, reason: 'browser-side import of punctuation runtime service' },
  { pattern: /^worker\/src\/subjects\/grammar\//, reason: 'server-authoritative Grammar runtime, engine, content, and enrichment code' },
  { pattern: /^scripts\/extract-grammar-legacy-oracle\.mjs$/, reason: 'Grammar legacy oracle extraction helper' },
  { pattern: /^tests\/fixtures\/grammar-(legacy-oracle|functionality-completeness)\//, reason: 'Grammar donor or completeness fixtures' },
  { pattern: /^src\/platform\/core\/local-review-profile\.js$/, reason: 'local review runtime profile' },
  { pattern: /^src\/platform\/core\/repositories\/local\.js$/, reason: 'browser-local production repository' },
  { pattern: /^src\/platform\/hubs\/(admin|parent)-read-model\.js$/, reason: 'client-side hub read-model aggregation' },
];

const FORBIDDEN_TEXT = [
  { token: 'SEEDED_SPELLING_CONTENT_BUNDLE', reason: 'seeded spelling content bundle' },
  { token: 'SEEDED_SPELLING_PUBLISHED_SNAPSHOT', reason: 'seeded spelling published snapshot' },
  { token: 'Legacy vendor seed for Pass 11 content model', reason: 'raw spelling content seed' },
  { token: 'createLegacySpellingEngine', reason: 'legacy spelling engine factory' },
  { token: 'KS2_WORDS_ENRICHED', reason: 'legacy spelling word dataset' },
  { token: 'spelling-prompt-v1', reason: 'server prompt-token derivation' },
  { token: 'PUNCTUATION_CONTENT_MANIFEST', reason: 'punctuation content manifest' },
  { token: 'PUNCTUATION_CONTEXT_PACK_LIMITS', reason: 'punctuation AI context-pack compiler' },
  { token: 'createPunctuationContentIndexes', reason: 'punctuation content index builder' },
  { token: 'createPunctuationGeneratedItems', reason: 'punctuation generated item compiler' },
  { token: 'createPunctuationRuntimeManifest', reason: 'punctuation runtime manifest compiler' },
  { token: 'normalisePunctuationContextPack', reason: 'punctuation AI context-pack compiler' },
  { token: 'createPunctuationService', reason: 'punctuation runtime service factory' },
  { token: 'PunctuationServiceError', reason: 'punctuation runtime service error' },
  { token: 'punctuation-r1-endmarks-apostrophe-speech', reason: 'punctuation release content identifier' },
  { token: '/api/child-subject-state', reason: 'legacy broad subject-state write route' },
  { token: '/api/practice-sessions', reason: 'legacy broad practice-session write route' },
  { token: '/api/child-game-state', reason: 'legacy broad game-state write route' },
  { token: '/api/event-log', reason: 'legacy broad event-log write route' },
  { token: '/api/debug/reset', reason: 'legacy broad account reset route' },
  { token: 'OPENAI_API_KEY', reason: 'browser-side AI provider key flow' },
  { token: 'GEMINI_API_KEY', reason: 'browser-side AI provider key flow' },
  { token: 'ANTHROPIC_API_KEY', reason: 'browser-side AI provider key flow' },
  { token: 'PUNCTUATION_AI_CONTEXT_PACK_JSON', reason: 'browser-side Punctuation AI context-pack provider flow' },
  { token: 'PUNCTUATION_AI_CONTEXT_PACK_KEY', reason: 'browser-side Punctuation AI context-pack provider flow' },
  { token: 'generativelanguage.googleapis.com', reason: 'browser-side AI provider endpoint flow' },
  { token: 'api.openai.com/v1', reason: 'browser-side AI provider endpoint flow' },
  { token: '?local=1', reason: 'retired local runtime switch' },
  { token: 'data-home-mount', reason: 'retired legacy renderer mount' },
  { token: 'data-subject-mount', reason: 'retired legacy subject renderer mount' },
  { token: 'home.bundle.js', reason: 'retired home island bundle' },
  { token: 'createGrammarQuestion', reason: 'server-authoritative Grammar item generation' },
  { token: 'evaluateGrammarQuestion', reason: 'server-authoritative Grammar marking' },
  { token: 'GRAMMAR_TEMPLATES', reason: 'server-authoritative Grammar template dataset' },
  { token: 'correctResponse', reason: 'Grammar hidden answer oracle field' },
  { token: 'grammar-legacy-oracle', reason: 'Grammar legacy oracle fixture path' },
  { token: 'extract-grammar-legacy-oracle', reason: 'Grammar legacy oracle extraction helper' },
  // U9 (sys-hardening p1): named export from tests/helpers/fault-injection.mjs.
  // The fault-injection middleware is test-only; if a future import accidentally
  // drags the module into a shipped bundle, this token lands in the client
  // bundle and the audit fails. Security F-11 prompted explicit token
  // specification rather than relying on a path-based FORBIDDEN_MODULES rule.
  { token: '__ks2_injectFault_TESTS_ONLY__', reason: 'fault-injection middleware must never ship in the production client bundle (U9)' },
  // U8 (capacity release gates + telemetry): multi-tab coordination
  // counters live on `globalThis.__ks2_capacityMeta__` in dev/test
  // builds only. The identifier is gated by
  // `process.env.NODE_ENV !== 'production'` in `src/platform/core/
  // repositories/api.js` and `src/main.js`; esbuild's `define` block
  // inlines the string `"production"` at build time so the counter
  // object, its install side-effect, and the increment calls are
  // dead-code eliminated. If a future regression drops the guard and
  // the token leaks into the shipped bundle, this audit fails.
  { token: '__ks2_capacityMeta__', reason: 'multi-tab bootstrap coordination counters must never ship in the production client bundle (U8)' },
];

const REVIEW_ALLOWLIST = [
  {
    token: '/api/learners',
    reason: 'platform learner-profile mutation route; not a subject engine/runtime route',
  },
  {
    token: '/api/content/spelling',
    reason: 'operator content import/export endpoint; content datasets are fetched only on explicit admin action',
  },
  {
    token: '/api/admin/monster-visual-config',
    reason: 'admin-only monster visual draft/publish endpoint; production renderers receive only the published bootstrap payload',
  },
  {
    token: '/api/subjects/spelling/word-bank',
    reason: 'authorised server read model endpoint for Word Bank rows and detail',
  },
  {
    token: '/api/subjects/',
    reason: 'server-authoritative subject command boundary',
  },
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function normalisePath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, relativeDir = '') {
  if (!await exists(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolutePath, relativePath));
    } else {
      files.push(normalisePath(relativePath));
    }
  }
  return files;
}

function auditMetafile(metafile, failures) {
  const inputs = Object.keys(metafile?.inputs || {}).map(normalisePath);
  for (const input of inputs) {
    for (const rule of FORBIDDEN_MODULES) {
      if (rule.pattern.test(input)) {
        failures.push(`Forbidden production-client module (${rule.reason}): ${input}`);
      }
    }
  }
}

function auditText(label, text, failures) {
  for (const rule of FORBIDDEN_TEXT) {
    if (text.includes(rule.token)) {
      failures.push(`Forbidden production-client token in ${label} (${rule.reason}): ${rule.token}`);
    }
  }
}

function auditAllowlist(text, notes) {
  for (const entry of REVIEW_ALLOWLIST) {
    if (text.includes(entry.token)) {
      notes.push(`Allowlisted token present: ${entry.token} (${entry.reason})`);
    }
  }
}

function auditPublicFiles(files, failures) {
  for (const file of files) {
    if (file.startsWith('shared/')) {
      failures.push(`Public output exposes shared source: ${file}`);
    }
    if (file.startsWith('src/') && file !== 'src/bundles/app.bundle.js') {
      failures.push(`Public output exposes raw source under src/: ${file}`);
    }
    if (file.startsWith('worker/') || file.startsWith('tests/') || file.startsWith('docs/')) {
      failures.push(`Public output exposes non-public tree: ${file}`);
    }
    if (/src\/subjects\/spelling\/(data|engine|content)\//.test(file)) {
      failures.push(`Public output exposes spelling runtime/content source: ${file}`);
    }
    if (/src\/subjects\/punctuation\/(service|repository)\.js/.test(file) || file.startsWith('worker/src/subjects/punctuation/')) {
      failures.push(`Public output exposes punctuation runtime/content source: ${file}`);
    }
  }
}

export async function runClientBundleAudit({
  bundlePath = DEFAULT_BUNDLE,
  metafilePath = DEFAULT_METAFILE,
  publicDir = DEFAULT_PUBLIC_DIR,
} = {}) {
  const failures = [];
  const notes = [];
  const resolvedBundle = path.resolve(rootDir, bundlePath);
  const resolvedMetafile = path.resolve(rootDir, metafilePath);
  const bundle = await readFile(resolvedBundle, 'utf8');
  auditText(bundlePath, bundle, failures);
  auditAllowlist(bundle, notes);

  if (!await exists(resolvedMetafile)) {
    failures.push(`Missing esbuild metafile: ${metafilePath}`);
  } else {
    const metafile = JSON.parse(await readFile(resolvedMetafile, 'utf8'));
    auditMetafile(metafile, failures);
  }

  const files = await walk(path.resolve(rootDir, publicDir));
  auditPublicFiles(files, failures);

  return {
    ok: failures.length === 0,
    failures,
    notes,
    checked: {
      bundlePath,
      metafilePath,
      publicDir,
      publicFileCount: files.length,
    },
  };
}

// Cross-platform CLI detector. `pathToFileURL` normalises Windows argv
// backslashes to the same `file:///C:/...` form that `import.meta.url`
// produces, so a direct string comparison is safe across platforms.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runClientBundleAudit({
    bundlePath: argValue('--bundle', DEFAULT_BUNDLE),
    metafilePath: argValue('--metafile', DEFAULT_METAFILE),
    publicDir: argValue('--public-dir', DEFAULT_PUBLIC_DIR),
  });
  if (!result.ok) {
    console.error(result.failures.join('\n'));
    process.exit(1);
  }
  for (const note of result.notes) console.log(note);
  console.log(`Client bundle audit passed (${result.checked.publicFileCount} public files checked).`);
}
