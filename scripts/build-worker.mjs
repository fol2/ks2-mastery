import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const workerDistDir = path.join(rootDir, 'dist', 'worker');
const workerEntry = path.join(rootDir, 'worker', 'src', 'index.js');
const workerOutfile = path.join(workerDistDir, 'index.js');
const workerMetafile = path.join(workerDistDir, 'index.meta.json');
const workerGeneratedDir = path.join(rootDir, 'dist', 'worker-generated');
const generatedSpellingPublicRuntime = path.join(workerGeneratedDir, 'spelling-public-runtime.js');

const grammarManualExpansionPath = path.join(rootDir, 'worker', 'src', 'subjects', 'grammar', 'manual-expansion.generated.js');
const punctuationP12QualityPath = path.join(rootDir, 'shared', 'punctuation', 'manual-p12-quality-bank.js');
const punctuationDeepExpansionPath = path.join(rootDir, 'shared', 'punctuation', 'manual-deep-expansion-bank.js');
const spellingSeedPath = path.join(rootDir, 'worker', 'src', 'generated-spelling-content-seed.js');

const grammarManualRuntime = path.join(workerGeneratedDir, 'grammar-manual-expansion-runtime.js');
const grammarManualPayload = path.join(workerGeneratedDir, 'grammar-manual-expansion.bin');
const punctuationP12Runtime = path.join(workerGeneratedDir, 'punctuation-p12-quality-runtime.js');
const punctuationP12Payload = path.join(workerGeneratedDir, 'punctuation-p12-quality.bin');
const punctuationDeepRuntime = path.join(workerGeneratedDir, 'punctuation-deep-expansion-runtime.js');
const punctuationDeepPayload = path.join(workerGeneratedDir, 'punctuation-deep-expansion.bin');
const spellingSeedRuntime = path.join(workerGeneratedDir, 'spelling-content-seed-runtime.js');
const spellingBundlePayload = path.join(workerGeneratedDir, 'spelling-content-bundle.bin');
const spellingSnapshotPayload = path.join(workerGeneratedDir, 'spelling-published-snapshot.bin');

const spellingContentDataPath = path.join(rootDir, 'src', 'subjects', 'spelling', 'data', 'content-data.js');
const spellingWordDataPath = path.join(rootDir, 'src', 'subjects', 'spelling', 'data', 'word-data.js');

function compactWord(word = {}) {
  const output = {
    slug: String(word.slug || ''),
    word: String(word.word || ''),
    year: word.year === '5-6' ? '5-6' : word.year === 'extra' ? 'extra' : '3-4',
    yearLabel: String(word.yearLabel || ''),
    spellingPool: word.spellingPool === 'extra' ? 'extra' : 'core',
    coverageTier: String(word.coverageTier || ''),
    family: String(word.family || ''),
  };
  return Object.fromEntries(Object.entries(output).filter(([, value]) => value !== ''));
}

async function writeSpellingPublicRuntime() {
  const {
    SEEDED_SPELLING_CONTENT_BUNDLE,
    SEEDED_SPELLING_CONTENT_SUMMARY,
    SEEDED_SPELLING_PUBLISHED_SNAPSHOT,
  } = await import(pathToFileURL(spellingContentDataPath).href);

  const words = (Array.isArray(SEEDED_SPELLING_PUBLISHED_SNAPSHOT?.words)
    ? SEEDED_SPELLING_PUBLISHED_SNAPSHOT.words
    : []).map(compactWord);
  const wordBySlug = Object.fromEntries(words.map((word) => [word.slug, word]));
  const snapshot = {
    generatedAt: Number(SEEDED_SPELLING_PUBLISHED_SNAPSHOT?.generatedAt) || 0,
    words,
    wordBySlug,
  };
  const publication = SEEDED_SPELLING_CONTENT_BUNDLE?.publication || {};
  const publishedVersion = Number(publication.publishedVersion) || 0;
  const publishedAt = Number(publication.updatedAt) || 0;
  const releaseId = publication.currentReleaseId || `spelling-r${publishedVersion || 1}`;
  const contentBundle = {
    modelVersion: Number(SEEDED_SPELLING_CONTENT_BUNDLE?.modelVersion) || 6,
    subjectId: 'spelling',
    draft: {
      id: 'worker-public-runtime',
      state: 'draft',
      title: 'Worker public runtime',
      sourceNote: 'Compact public runtime snapshot for Worker bootstrap and Hero read models.',
      provenance: {
        source: 'scripts/build-worker.mjs',
        note: 'Generated from the published spelling snapshot.',
        importedAt: publishedAt,
      },
      wordLists: [],
      words: [],
      sentences: [],
      updatedAt: publishedAt,
    },
    releases: [{
      id: releaseId,
      state: 'published',
      version: publishedVersion || 1,
      title: 'Worker public runtime',
      notes: 'Compact public runtime snapshot for Worker bootstrap and Hero read models.',
      sourceDraftId: 'worker-public-runtime',
      sourceNote: 'Generated from the published spelling snapshot.',
      provenance: {
        source: 'scripts/build-worker.mjs',
        note: 'Generated from the published spelling snapshot.',
        importedAt: publishedAt,
      },
      publishedAt,
      snapshot,
    }],
    publication: {
      currentReleaseId: releaseId,
      publishedVersion: publishedVersion || 1,
      updatedAt: publishedAt,
    },
  };
  const summary = {
    ...SEEDED_SPELLING_CONTENT_SUMMARY,
    publishedReleaseId: SEEDED_SPELLING_CONTENT_SUMMARY?.publishedReleaseId || releaseId,
    publishedVersion: Number(SEEDED_SPELLING_CONTENT_SUMMARY?.publishedVersion) || publishedVersion || 1,
    publishedAt: Number(SEEDED_SPELLING_CONTENT_SUMMARY?.publishedAt) || publishedAt,
    runtimeWordCount: words.length,
  };
  const moduleSource = [
    '// GENERATED BY scripts/build-worker.mjs - do not edit by hand.',
    '// Compact spelling runtime used only by the bundled Cloudflare Worker.',
    `export const SEEDED_SPELLING_PUBLISHED_SNAPSHOT = ${JSON.stringify(snapshot)};`,
    `export const SEEDED_SPELLING_CONTENT_BUNDLE = ${JSON.stringify(contentBundle)};`,
    `export const SEEDED_SPELLING_CONTENT_SUMMARY = ${JSON.stringify(summary)};`,
    'export const SEEDED_SPELLING_PUBLISHED_RELEASE = SEEDED_SPELLING_CONTENT_BUNDLE.releases[0];',
    'export const WORDS = SEEDED_SPELLING_PUBLISHED_SNAPSHOT.words;',
    'export const WORD_BY_SLUG = SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug;',
    '',
  ].join('\n');

  await writeFile(generatedSpellingPublicRuntime, moduleSource, 'utf8');
}

function generatedModuleSource(lines) {
  return [
    '// GENERATED BY scripts/build-worker.mjs - do not edit by hand.',
    '// Immutable curriculum payloads are non-JavaScript Worker modules so cold',
    '// requests do not compile unrelated subject content.',
    ...lines,
    '',
  ].join('\n');
}

function extractBase64Constant(source, constantName) {
  const prefix = `const ${constantName} = "`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Missing ${constantName} in generated Spelling seed.`);
  const valueStart = start + prefix.length;
  const valueEnd = source.indexOf('";', valueStart);
  if (valueEnd < 0) throw new Error(`Unterminated ${constantName} in generated Spelling seed.`);
  return Buffer.from(source.slice(valueStart, valueEnd), 'base64');
}

async function writeCurriculumPayloadModules() {
  const [grammar, punctuationP12, punctuationDeep, spelling, spellingSource] = await Promise.all([
    import(pathToFileURL(grammarManualExpansionPath).href),
    import(pathToFileURL(punctuationP12QualityPath).href),
    import(pathToFileURL(punctuationDeepExpansionPath).href),
    import(pathToFileURL(spellingSeedPath).href),
    readFile(spellingSeedPath, 'utf8'),
  ]);

  await Promise.all([
    writeFile(grammarManualPayload, JSON.stringify({
      families: grammar.GRAMMAR_MANUAL_EXPANSION_FAMILIES,
      releaseId: grammar.GRAMMAR_MANUAL_EXPANSION_RELEASE_ID,
      summary: grammar.GRAMMAR_MANUAL_EXPANSION_SUMMARY,
    }), 'utf8'),
    writeFile(punctuationP12Payload, JSON.stringify({
      targetDepth: punctuationP12.PUNCTUATION_MANUAL_P12_QUALITY_TARGET_DEPTH,
      bank: punctuationP12.PUNCTUATION_MANUAL_P12_QUALITY_BANK,
    }), 'utf8'),
    writeFile(punctuationDeepPayload, JSON.stringify({
      targetDepth: punctuationDeep.PUNCTUATION_MANUAL_DEEP_EXPANSION_TARGET_DEPTH,
      perFamily: punctuationDeep.PUNCTUATION_MANUAL_DEEP_EXPANSION_PER_FAMILY,
      bank: punctuationDeep.PUNCTUATION_MANUAL_DEEP_TEMPLATE_EXPANSION_BANK,
    }), 'utf8'),
    writeFile(
      spellingBundlePayload,
      extractBase64Constant(spellingSource, 'SEEDED_SPELLING_CONTENT_BUNDLE_GZIP_BASE64'),
    ),
    writeFile(
      spellingSnapshotPayload,
      extractBase64Constant(spellingSource, 'SEEDED_SPELLING_PUBLISHED_SNAPSHOT_GZIP_BASE64'),
    ),
  ]);

  await Promise.all([
    writeFile(grammarManualRuntime, generatedModuleSource([
      "import payloadBytes from './grammar-manual-expansion.bin';",
      'const payload = JSON.parse(new TextDecoder().decode(payloadBytes));',
      'export const GRAMMAR_MANUAL_EXPANSION_FAMILIES = payload.families;',
      'export const GRAMMAR_MANUAL_EXPANSION_RELEASE_ID = payload.releaseId;',
      'export const GRAMMAR_MANUAL_EXPANSION_SUMMARY = payload.summary;',
    ]), 'utf8'),
    writeFile(punctuationP12Runtime, generatedModuleSource([
      "import payloadBytes from './punctuation-p12-quality.bin';",
      'const payload = JSON.parse(new TextDecoder().decode(payloadBytes));',
      'export const PUNCTUATION_MANUAL_P12_QUALITY_TARGET_DEPTH = payload.targetDepth;',
      'export const PUNCTUATION_MANUAL_P12_QUALITY_BANK = Object.freeze(Object.fromEntries(',
      '  Object.entries(payload.bank).map(([familyId, templates]) => [familyId, Object.freeze(templates)]),',
      '));',
      'function apostropheTokensFromModel(model) {',
      "  const matches = String(model || '').match(/[A-Za-z]+(?:'[A-Za-z]+|')/g) || [];",
      '  return [...new Set(matches)];',
      '}',
      'function withDerivedPossessionInsertValidator(familyId, template) {',
      "  if (familyId !== 'gen_apostrophe_possession_insert' || template.validator) return template;",
      '  const tokens = apostropheTokensFromModel(template.model);',
      '  if (!tokens.length) return template;',
      "  return { ...template, validator: { type: 'requiresTokens', tokens } };",
      '}',
      'const enrichedBank = Object.freeze(Object.fromEntries(',
      '  Object.entries(PUNCTUATION_MANUAL_P12_QUALITY_BANK).map(([familyId, templates]) => [',
      '    familyId,',
      '    Object.freeze(templates.map((template) => withDerivedPossessionInsertValidator(familyId, template))),',
      '  ]),',
      '));',
      'export function manualP12QualityTemplatesForFamily(familyId) {',
      '  return enrichedBank[familyId] || Object.freeze([]);',
      '}',
    ]), 'utf8'),
    writeFile(punctuationDeepRuntime, generatedModuleSource([
      "import payloadBytes from './punctuation-deep-expansion.bin';",
      'const payload = JSON.parse(new TextDecoder().decode(payloadBytes));',
      'export const PUNCTUATION_MANUAL_DEEP_EXPANSION_TARGET_DEPTH = payload.targetDepth;',
      'export const PUNCTUATION_MANUAL_DEEP_EXPANSION_PER_FAMILY = payload.perFamily;',
      'export const PUNCTUATION_MANUAL_DEEP_TEMPLATE_EXPANSION_BANK = Object.freeze(Object.fromEntries(',
      '  Object.entries(payload.bank).map(([familyId, templates]) => [familyId, Object.freeze(templates)]),',
      '));',
      'export function manualDeepExpansionTemplatesForFamily(familyId) {',
      '  return PUNCTUATION_MANUAL_DEEP_TEMPLATE_EXPANSION_BANK[familyId] || Object.freeze([]);',
      '}',
    ]), 'utf8'),
    writeFile(spellingSeedRuntime, generatedModuleSource([
      "import contentBundleGzip from './spelling-content-bundle.bin';",
      "import publishedSnapshotGzip from './spelling-published-snapshot.bin';",
      `export const SEEDED_SPELLING_CONTENT_SUMMARY = ${JSON.stringify(spelling.SEEDED_SPELLING_CONTENT_SUMMARY)};`,
      'let contentBundlePromise = null;',
      'let publishedSnapshotPromise = null;',
      'async function inflateJson(bytes) {',
      "  if (typeof DecompressionStream !== 'function') {",
      "    throw new Error('DecompressionStream is required to read the compressed spelling seed.');",
      '  }',
      "  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));",
      '  return JSON.parse(await new Response(stream).text());',
      '}',
      'export function readSeededSpellingContentBundle() {',
      '  if (!contentBundlePromise) contentBundlePromise = inflateJson(contentBundleGzip);',
      '  return contentBundlePromise;',
      '}',
      'export function readSeededSpellingPublishedSnapshot() {',
      '  if (!publishedSnapshotPromise) publishedSnapshotPromise = inflateJson(publishedSnapshotGzip);',
      '  return publishedSnapshotPromise;',
      '}',
    ]), 'utf8'),
  ]);
}

function workerAliasPlugin() {
  const aliases = new Map([
    [path.normalize(spellingContentDataPath), generatedSpellingPublicRuntime],
    [path.normalize(spellingWordDataPath), generatedSpellingPublicRuntime],
    [path.normalize(grammarManualExpansionPath), grammarManualRuntime],
    [path.normalize(punctuationP12QualityPath), punctuationP12Runtime],
    [path.normalize(punctuationDeepExpansionPath), punctuationDeepRuntime],
    [path.normalize(spellingSeedPath), spellingSeedRuntime],
  ]);

  return {
    name: 'ks2-worker-aliases',
    setup(buildContext) {
      buildContext.onResolve({ filter: /\.js$/ }, (args) => {
        const absolutePath = path.normalize(path.resolve(args.resolveDir, args.path));
        const aliasPath = aliases.get(absolutePath);
        return aliasPath ? { path: aliasPath } : null;
      });
    },
  };
}

if (path.dirname(workerDistDir) !== path.join(rootDir, 'dist') || path.basename(workerDistDir) !== 'worker') {
  throw new Error(`Refusing to clean unexpected Worker output directory: ${workerDistDir}`);
}
await rm(workerDistDir, { recursive: true, force: true });
await mkdir(workerDistDir, { recursive: true });
await mkdir(workerGeneratedDir, { recursive: true });
await Promise.all([
  writeSpellingPublicRuntime(),
  writeCurriculumPayloadModules(),
]);

const result = await build({
  entryPoints: [workerEntry],
  outdir: workerDistDir,
  entryNames: 'index',
  chunkNames: 'chunks/[name]-[hash]',
  absWorkingDir: rootDir,
  bundle: true,
  format: 'esm',
  splitting: true,
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  metafile: true,
  legalComments: 'none',
  loader: {
    '.bin': 'copy',
  },
  assetNames: 'content/[name]-[hash]',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [workerAliasPlugin()],
  logLevel: 'info',
});

const inputPaths = new Set(Object.keys(result.metafile.inputs).map((inputPath) => inputPath.replaceAll('\\', '/')));
const forbiddenExecutableInputs = [
  grammarManualExpansionPath,
  punctuationP12QualityPath,
  punctuationDeepExpansionPath,
  spellingSeedPath,
].map((inputPath) => path.relative(rootDir, inputPath).replaceAll('\\', '/'));
const leakedExecutableInputs = forbiddenExecutableInputs.filter((inputPath) => inputPaths.has(inputPath));
if (leakedExecutableInputs.length) {
  throw new Error(`Immutable curriculum leaked into executable Worker JavaScript: ${leakedExecutableInputs.join(', ')}`);
}

const outputPaths = Object.keys(result.metafile.outputs).map((outputPath) => outputPath.replaceAll('\\', '/'));
for (const payloadName of [
  'grammar-manual-expansion',
  'punctuation-p12-quality',
  'punctuation-deep-expansion',
  'spelling-content-bundle',
  'spelling-published-snapshot',
]) {
  if (!outputPaths.some((outputPath) => (
    outputPath.includes(`/content/${payloadName}-`) && outputPath.endsWith('.bin')
  ))) {
    throw new Error(`Missing non-JavaScript Worker curriculum payload: ${payloadName}`);
  }
}

const executableBytes = Object.entries(result.metafile.outputs)
  .filter(([outputPath]) => outputPath.endsWith('.js'))
  .reduce((sum, [, output]) => sum + (Number(output.bytes) || 0), 0);

await writeFile(workerMetafile, `${JSON.stringify(result.metafile, null, 2)}\n`, 'utf8');

console.log(`Worker executable JavaScript: ${(executableBytes / 1024 / 1024).toFixed(2)} MiB`);
console.log(`Built Worker bundle at ${path.relative(rootDir, workerOutfile)}`);
