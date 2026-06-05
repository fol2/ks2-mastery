import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSpellingContentSummary,
  normaliseSpellingContentBundle,
  resolvePublishedRelease,
  resolvePublishedSnapshot,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const inputFile = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(rootDir, 'content', 'spelling.seed.json');
const outputFile = path.join(rootDir, 'src', 'subjects', 'spelling', 'data', 'content-data.js');
const runtimeFile = path.join(rootDir, 'src', 'subjects', 'spelling', 'data', 'word-data.js');
const workerSeedFile = path.join(rootDir, 'worker', 'src', 'generated-spelling-content-seed.js');

function stripSnapshotIndex(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
  const { wordBySlug, ...rest } = snapshot;
  return rest;
}

function buildWorkerSeedContentBundle(bundle) {
  return {
    ...bundle,
    releases: bundle.releases.map((release) => ({
      ...release,
      snapshot: stripSnapshotIndex(release.snapshot),
    })),
  };
}

const raw = JSON.parse(await readFile(inputFile, 'utf8'));
const bundle = normaliseSpellingContentBundle(raw);
const validation = validateSpellingContentBundle(bundle);
if (!validation.ok) {
  const details = validation.errors.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`).join('\n');
  throw new Error(`Spelling content validation failed.\n${details}`);
}

const release = resolvePublishedRelease(bundle, { fallbackToLatest: true });
const snapshot = resolvePublishedSnapshot(bundle);
if (!release || !snapshot) {
  throw new Error('A published spelling release is required before generating runtime data.');
}

const summary = buildSpellingContentSummary(bundle);
const moduleSource = `// Generated from ${path.relative(rootDir, inputFile)} via scripts/generate-spelling-content.mjs\n// Runtime reads are pinned to the published release snapshot, not the live draft payload.\n\nexport const SEEDED_SPELLING_CONTENT_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n\nexport const SEEDED_SPELLING_PUBLISHED_RELEASE = ${JSON.stringify(release, null, 2)};\n\nexport const SEEDED_SPELLING_PUBLISHED_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};\n\nexport const SEEDED_SPELLING_CONTENT_SUMMARY = ${JSON.stringify(summary, null, 2)};\n`;
const runtimeSource = `// Generated from ${path.relative(rootDir, inputFile)} via scripts/generate-spelling-content.mjs\n// This file stays as a small compatibility shim for the existing spelling runtime.\n\nexport {\n  SEEDED_SPELLING_PUBLISHED_SNAPSHOT,\n} from './content-data.js';\n\nexport const WORDS = ${JSON.stringify(snapshot.words, null, 2)};\n\nexport const WORD_BY_SLUG = ${JSON.stringify(snapshot.wordBySlug, null, 2)};\n`;
const gzipBase64 = (value) => gzipSync(JSON.stringify(value), { level: 9 }).toString('base64');
const workerSeedContentBundle = buildWorkerSeedContentBundle(bundle);
const workerSeedSource = `// Generated from ${path.relative(rootDir, inputFile)} via scripts/generate-spelling-content.mjs\n// Keep the Worker seed compressed so the deployed script stays under Cloudflare's Free plan size limit.\n// The compressed payload keeps the editable bundle; duplicate wordBySlug indexes are rebuilt at runtime.\n\nconst SEEDED_SPELLING_CONTENT_BUNDLE_GZIP_BASE64 = ${JSON.stringify(gzipBase64(workerSeedContentBundle))};\n\nexport const SEEDED_SPELLING_CONTENT_SUMMARY = ${JSON.stringify(summary, null, 2)};\n\nlet contentBundlePromise = null;\nlet publishedSnapshotPromise = null;\n\nfunction decodeBase64(value) {\n  const binary = atob(value);\n  const bytes = new Uint8Array(binary.length);\n  for (let index = 0; index < binary.length; index += 1) {\n    bytes[index] = binary.charCodeAt(index);\n  }\n  return bytes;\n}\n\nfunction rebuildSnapshotIndexes(snapshot) {\n  const words = Array.isArray(snapshot?.words) ? snapshot.words : [];\n  return {\n    ...(snapshot || {}),\n    words,\n    wordBySlug: Object.fromEntries(words.map((word) => [word.slug, word])),\n  };\n}\n\nfunction rebuildBundleIndexes(bundle) {\n  return {\n    ...bundle,\n    releases: (Array.isArray(bundle?.releases) ? bundle.releases : []).map((release) => ({\n      ...release,\n      snapshot: rebuildSnapshotIndexes(release?.snapshot),\n    })),\n  };\n}\n\nfunction resolvePublishedRelease(bundle) {\n  const releases = Array.isArray(bundle?.releases) ? bundle.releases : [];\n  const currentReleaseId = bundle?.publication?.currentReleaseId || '';\n  const selected = currentReleaseId ? releases.find((release) => release.id === currentReleaseId) : null;\n  if (selected) return selected;\n  return [...releases]\n    .filter((release) => release?.state === 'published' || release?.state === 'archived')\n    .sort((a, b) => (Number(b?.version) || 0) - (Number(a?.version) || 0) || (Number(b?.publishedAt) || 0) - (Number(a?.publishedAt) || 0))[0] || null;\n}\n\nasync function inflateJsonFromBase64(value) {\n  if (typeof DecompressionStream !== 'function') {\n    throw new Error('DecompressionStream is required to read the compressed spelling seed.');\n  }\n  const stream = new Blob([decodeBase64(value)]).stream().pipeThrough(new DecompressionStream('gzip'));\n  return JSON.parse(await new Response(stream).text());\n}\n\nexport function readSeededSpellingContentBundle() {\n  if (!contentBundlePromise) {\n    contentBundlePromise = inflateJsonFromBase64(SEEDED_SPELLING_CONTENT_BUNDLE_GZIP_BASE64)\n      .then(rebuildBundleIndexes);\n  }\n  return contentBundlePromise;\n}\n\nexport function readSeededSpellingPublishedSnapshot() {\n  if (!publishedSnapshotPromise) {\n    publishedSnapshotPromise = readSeededSpellingContentBundle()\n      .then((bundle) => resolvePublishedRelease(bundle)?.snapshot || rebuildSnapshotIndexes(null));\n  }\n  return publishedSnapshotPromise;\n}\n`;

await mkdir(path.dirname(outputFile), { recursive: true });
await mkdir(path.dirname(workerSeedFile), { recursive: true });
await writeFile(outputFile, moduleSource, 'utf8');
await writeFile(runtimeFile, runtimeSource, 'utf8');
await writeFile(workerSeedFile, workerSeedSource, 'utf8');
console.log(`Generated ${path.relative(rootDir, outputFile)}, ${path.relative(rootDir, runtimeFile)}, and ${path.relative(rootDir, workerSeedFile)}.`);
