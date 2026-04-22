import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPublishedSnapshotFromDraft,
  normaliseSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const contentFile = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(rootDir, 'content', 'spelling.seed.json');
const enrichmentFile = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(rootDir, 'content', 'spelling.explanations.json');

function listMessage(label, values) {
  return values.length ? `${label}: ${values.join(', ')}` : '';
}

const rawBundle = JSON.parse(await readFile(contentFile, 'utf8'));
const explanations = JSON.parse(await readFile(enrichmentFile, 'utf8'));
const bundle = normaliseSpellingContentBundle(rawBundle);
const draftSlugs = bundle.draft.words.map((word) => word.slug);
const draftSlugSet = new Set(draftSlugs);
const explanationSlugs = Object.keys(explanations).sort();
const missing = draftSlugs.filter((slug) => !explanations[slug]);
const extra = explanationSlugs.filter((slug) => !draftSlugSet.has(slug));

if (missing.length || extra.length) {
  throw new Error([
    'Spelling vocabulary enrichment does not match the draft word list.',
    listMessage('Missing explanations', missing),
    listMessage('Unknown explanation slugs', extra),
  ].filter(Boolean).join('\n'));
}

const draft = {
  ...bundle.draft,
  words: bundle.draft.words.map((word) => ({
    ...word,
    explanation: String(explanations[word.slug]).trim(),
  })),
};

const releases = bundle.releases.map((release, index) => ({
  ...release,
  snapshot: buildPublishedSnapshotFromDraft(draft, {
    generatedAt: release.snapshot?.generatedAt ?? release.publishedAt ?? index,
  }),
}));

const enriched = normaliseSpellingContentBundle({
  ...bundle,
  draft,
  releases,
});
const validation = validateSpellingContentBundle(enriched);
if (!validation.ok) {
  const details = validation.errors.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`).join('\n');
  throw new Error(`Enriched spelling content is invalid.\n${details}`);
}

await writeFile(contentFile, `${JSON.stringify(validation.bundle, null, 2)}\n`, 'utf8');
console.log(`Applied ${draftSlugs.length} vocabulary explanations to ${path.relative(rootDir, contentFile)}.`);
