import { access, readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// SH2-U10 reviewer-follow-up (ADV-H1): `rootDir` is a default captured at
// module-load time so the CLI path behaves as before, but `runClientBundleAudit`
// accepts a caller-supplied `rootDir` override. This lets tests stage
// synthetic bundle fixtures inside an isolated `mkdtemp` tree rather than
// writing into the real `src/bundles/` tree — a crashed test no longer
// leaves stale `test-u10-fixture-*.js` files under the live build tree,
// and concurrent runs cannot collide on shared paths.
const DEFAULT_ROOT_DIR = process.cwd();

const DEFAULT_BUNDLE = 'src/bundles/app.bundle.js';
const DEFAULT_METAFILE = 'src/bundles/app.bundle.meta.json';
const DEFAULT_PUBLIC_DIR = 'dist/public';

// SH2-U10: byte-budget gate on the main-bundle gzip size. Baseline
// measured against the SH2-U10 first post-split build
// (`npm run build:bundles` on `feat/sh2-u10-bundle-hygiene`): gzip
// was 203,227 bytes vs the 253,181 bytes pre-split main bundle on
// `main`. That is a ~50 KB first-paint reduction — the adult-only
// Admin Hub + Parent Hub hubs now ship as lazy-loaded chunks.
// Budget was originally `baseline × 1.05 ≈ 213,390`, rounded up to
// 214,000. Node 24's zlib output for the current Hero P2 baseline sits
// just above that at ~214,020 bytes. Phase 7's Punctuation remote-summary
// safety and radio-focus accessibility fixes lift the Node 22 build to
// ~215.1 KB. Punctuation's Star-based display parity added a small
// first-paint utility footprint. Grammar's matching display-state parity
// adds another tiny cross-subject utility slice. The reward presentation
// queue, toast compatibility layers, Hero Mode P3 daily-progress shell,
// Grammar's bridge-ownership display gate, the Concordium Grand Star tier
// model, Hero Mode P5 Camp's child-facing spending surface, and the
// Grammar setup-aligned refactor (shared hero-bg + HeroBackdrop +
// useSetupHeroContrast platform engines + slide-button RoundLengthPicker
// + grammar-hero-bg view-model) keep Node 22/24 gzip output near 226.3 KB,
// so the committed ceiling is 227,000: still tight enough to catch an
// adult-surface re-import, without blocking on sub-kilobyte
// compression/runtime drift. Override via CLI
// `--main-bundle-budget-bytes` for experimentation. See
// `tests/bundle-byte-budget.test.js` for the committed baseline +
// rationale.
const DEFAULT_MAIN_BUNDLE_GZIP_BUDGET_BYTES = 227_000;

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
    // SH2-U10 (S-01): widen the allowlist so esbuild split chunks under
    // `src/bundles/` (e.g. `admin-hub.bundle.js`, `parent-hub.bundle.js`,
    // and content-hashed shared chunks like `chunk-ABCDEF12.js`) are
    // permitted alongside the main bundle. Any other `src/` path is still
    // a raw-source leak. The `.js` extension gate keeps the metafile
    // artefact (`app.bundle.meta.json`) out; it never ships to public.
    if (
      file.startsWith('src/')
      && !(file.startsWith('src/bundles/') && file.endsWith('.js'))
    ) {
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

// SH2-U10 (S-01): derive every `.js` output chunk under `src/bundles/`
// from the esbuild metafile. Splitting emits `app.bundle.js` plus shared
// chunks (content-hashed names) plus per-lazy-entry chunks; the
// forbidden-token scan must cover every one of them. Input keys in the
// metafile are the raw sources; `outputs` is the chunked output graph.
// We normalise to repo-relative `src/bundles/...` paths so callers can
// `readFile(path.resolve(rootDir, chunkPath))`.
function collectBundleChunkPaths(metafile) {
  const outputs = (metafile && metafile.outputs) || {};
  const chunks = [];
  for (const rawPath of Object.keys(outputs)) {
    const normalised = normalisePath(rawPath);
    if (!normalised.startsWith('src/bundles/')) continue;
    if (!normalised.endsWith('.js')) continue;
    chunks.push(normalised);
  }
  return chunks.sort();
}

export async function runClientBundleAudit({
  bundlePath = DEFAULT_BUNDLE,
  metafilePath = DEFAULT_METAFILE,
  publicDir = DEFAULT_PUBLIC_DIR,
  mainBundleGzipBudgetBytes = DEFAULT_MAIN_BUNDLE_GZIP_BUDGET_BYTES,
  // SH2-U10 reviewer-follow-up (ADV-H1): accept a caller-supplied rootDir
  // so tests can stage fixtures in an isolated mkdtemp tree. Defaults to
  // the process cwd captured at module load so the CLI path is unchanged.
  rootDir = DEFAULT_ROOT_DIR,
} = {}) {
  const failures = [];
  const notes = [];
  const resolvedBundle = path.resolve(rootDir, bundlePath);
  const resolvedMetafile = path.resolve(rootDir, metafilePath);
  const bundle = await readFile(resolvedBundle, 'utf8');
  auditText(bundlePath, bundle, failures);
  auditAllowlist(bundle, notes);

  // SH2-U10 (S-01): walk every `.js` chunk emitted under `src/bundles/`
  // from the esbuild metafile and run the forbidden-token scan against
  // each one. Splitting means a module can land in a shared chunk or a
  // lazy-entry chunk — not just `app.bundle.js` — so limiting the scan
  // to the caller-supplied `bundlePath` would silently let forbidden
  // tokens ship in a split chunk. `bundlePath` is still scanned above
  // so synthetic tests that pass only a bundle + metafile (without an
  // outputs graph) keep working.
  const scannedChunks = [bundlePath];
  if (await exists(resolvedMetafile)) {
    const metafile = JSON.parse(await readFile(resolvedMetafile, 'utf8'));
    auditMetafile(metafile, failures);

    const chunkPaths = collectBundleChunkPaths(metafile);
    for (const chunkPath of chunkPaths) {
      // Skip the explicit `bundlePath` — already scanned above. Normalise
      // both sides so a caller passing a repo-relative or absolute path
      // still dedupes cleanly.
      const normalisedCaller = normalisePath(bundlePath);
      if (chunkPath === normalisedCaller) continue;
      const resolvedChunk = path.resolve(rootDir, chunkPath);
      if (!await exists(resolvedChunk)) {
        // A metafile entry without a file on disk is a build bug; name
        // the chunk so operators can see which one is missing.
        failures.push(`Esbuild metafile lists chunk not present on disk: ${chunkPath}`);
        continue;
      }
      const chunkText = await readFile(resolvedChunk, 'utf8');
      auditText(chunkPath, chunkText, failures);
      scannedChunks.push(chunkPath);
    }
  } else {
    failures.push(`Missing esbuild metafile: ${metafilePath}`);
  }

  // SH2-U10 byte-budget gate on the main bundle gzip size. Threshold is
  // the measured baseline × ~1.05; if the critical-path graph regrows
  // (e.g. an adult-only module accidentally re-imported into a learner
  // surface) the gate fails with a `bundle-budget-exceeded` failure row
  // so CI blocks before the regression hits production. Chunks other
  // than `app.bundle.js` are intentionally excluded from the budget: the
  // goal is first-paint critical path, not total shipped bytes.
  const mainBundleGzipBytes = gzipSync(bundle).byteLength;
  if (
    Number.isFinite(mainBundleGzipBudgetBytes)
    && mainBundleGzipBudgetBytes > 0
    && mainBundleGzipBytes > mainBundleGzipBudgetBytes
  ) {
    failures.push(
      `bundle-budget-exceeded: ${bundlePath} gzip ${mainBundleGzipBytes} bytes exceeds budget ${mainBundleGzipBudgetBytes} bytes`,
    );
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
      scannedChunkCount: scannedChunks.length,
      scannedChunks,
      mainBundleGzipBytes,
      mainBundleGzipBudgetBytes,
    },
  };
}

// Cross-platform CLI detector. `pathToFileURL` normalises Windows argv
// backslashes to the same `file:///C:/...` form that `import.meta.url`
// produces, so a direct string comparison is safe across platforms.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const budgetArg = argValue('--main-bundle-budget-bytes', String(DEFAULT_MAIN_BUNDLE_GZIP_BUDGET_BYTES));
  const budgetNumeric = Number(budgetArg);
  const result = await runClientBundleAudit({
    bundlePath: argValue('--bundle', DEFAULT_BUNDLE),
    metafilePath: argValue('--metafile', DEFAULT_METAFILE),
    publicDir: argValue('--public-dir', DEFAULT_PUBLIC_DIR),
    mainBundleGzipBudgetBytes: Number.isFinite(budgetNumeric) ? budgetNumeric : DEFAULT_MAIN_BUNDLE_GZIP_BUDGET_BYTES,
  });
  if (!result.ok) {
    console.error(result.failures.join('\n'));
    process.exit(1);
  }
  for (const note of result.notes) console.log(note);
  console.log(
    `Client bundle audit passed (${result.checked.publicFileCount} public files, `
    + `${result.checked.scannedChunkCount} chunks scanned, `
    + `main bundle ${result.checked.mainBundleGzipBytes} / ${result.checked.mainBundleGzipBudgetBytes} bytes gzip).`,
  );
}
