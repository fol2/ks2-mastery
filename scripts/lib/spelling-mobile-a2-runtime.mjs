import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WORDS } from '../../src/subjects/spelling/data/word-data.js';
import {
  assertNoDuplicateActiveTargets,
  createRuntimeItemId,
  normaliseSpellingTarget,
  validateCatalogueV1,
} from '../../shared/spelling/mobile/index.js';

const RUNTIME_ENTRY = 'shared/spelling/mobile/index.js';
const RUNTIME_FILES = [
  'shared/spelling/mobile/identity.js',
  'shared/spelling/mobile/index.js',
  'shared/spelling/mobile/pack-contracts.js',
  'shared/spelling/mobile/runtime-catalogue.js',
  'shared/spelling/mobile/runtime-snapshot.js',
];
const CATALOGUE_FILES = [
  'content/spelling.mobile-runtime-full.json',
  'content/spelling.mobile-runtime-starter.json',
];
const HOSTILE_FIXTURE = 'tests/fixtures/spelling-a2/hostile-contracts.json';
const A1_MANIFEST = 'content/spelling.mobile-a1-kernel-manifest.json';
const A0_MANIFEST = 'content/spelling.mobile-source-manifest.json';
const PACK_CONFIG = 'config/mobile-spelling-packs.json';
const A1_MANIFEST_SHA256 = '51af549ce31a30adc021d5fa0bd6a70ed9de2366887add0df3fc7f8f42dc312f';
const A0_MANIFEST_SHA256 = '364b638abc6dcd0ddb61c1d814fce9dc4e013450a01b68d306186391608058e7';
const PACK_CONFIG_SHA256 = '2be67d2e3911e19dee0adc7db527878c87bb670bbc396d1688236d9a7fe4b1d1';
const EXPECTED_INVENTORY_SHA256 = Object.freeze({
  starter: '8fb6a2f7e8f8dcea6199843fa78685a21c48c40e29456b93e94b9bc89f834364',
  full: 'f24755467f424b6a7d044ed7bbc7599cdbde0bdf8fa14c6e7fba77c3980fff06',
});
const EXPORT_PROBE = [
  'const moduleUrl = process.argv[1];',
  'const runtime = await import(moduleUrl);',
  'process.stdout.write(JSON.stringify(Object.keys(runtime).sort()));',
].join('\n');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileEvidence(repoRoot, relativePaths) {
  return Promise.all([...relativePaths].sort().map(async (path) => ({
    path,
    sha256: sha256(await readFile(join(repoRoot, path))),
  })));
}

function inventorySha256(catalogue) {
  return sha256(`${JSON.stringify(catalogue.items.map(({ itemId }) => itemId))}\n`);
}

function cleanExportProbeEnvironment() {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (upper.startsWith('NODE_') || upper.startsWith('GIT_') || upper.startsWith('LD_') || upper.startsWith('DYLD_')) continue;
    if (['SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'WINDIR'].includes(upper)) environment[key] = value;
  }
  return environment;
}

function collectPublicExports(repoRoot) {
  const stdout = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    EXPORT_PROBE,
    pathToFileURL(join(repoRoot, RUNTIME_ENTRY)).href,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: cleanExportProbeEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

function duplicateNormalisedTargetCount(catalogues) {
  const owners = new Map();
  let duplicates = 0;
  for (const catalogue of catalogues) {
    for (const item of catalogue.items) {
      const target = normaliseSpellingTarget(item.target);
      const previous = owners.get(target);
      if (previous && previous !== item.runtimeItemId) duplicates += 1;
      owners.set(target, item.runtimeItemId);
    }
  }
  return duplicates;
}

async function pinnedJson(repoRoot, relativePath, expectedSha256) {
  const bytes = await readFile(join(repoRoot, relativePath));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${relativePath} SHA-256 mismatch: expected ${expectedSha256}, received ${actualSha256}.`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

function idsDigest(itemIds) {
  return sha256(`${JSON.stringify(itemIds)}\n`);
}

function runtimeItem(packId, itemId, word) {
  return {
    runtimeItemId: createRuntimeItemId(packId, itemId),
    packId,
    itemId,
    legacySlug: word.slug,
    target: word.word,
    accepted: [...word.accepted],
    yearBand: word.year,
    yearLabel: word.yearLabel,
    family: word.family,
    familyWords: [...word.familyWords],
    sentencePrompts: word.sentences.map((text, index) => ({
      sentenceId: `sentence-${index + 1}`,
      text,
    })),
    explanation: word.explanation,
    patternIds: [...word.patternIds],
    coverageTier: word.coverageTier,
  };
}

function applySentenceCorrections(catalogueId, items, corrections) {
  const itemsById = new Map(items.map((item) => [item.itemId, item]));
  const seen = new Set();
  for (const correction of corrections.filter((entry) => entry.catalogueId === catalogueId)) {
    const key = `${correction.catalogueId}:${correction.itemId}:${correction.sentenceId}`;
    if (seen.has(key)) throw new Error(`Duplicate A2 sentence correction ${key}.`);
    seen.add(key);
    const item = itemsById.get(correction.itemId);
    const prompt = item?.sentencePrompts.find(({ sentenceId }) => sentenceId === correction.sentenceId);
    if (!prompt) throw new Error(`A2 sentence correction target is missing: ${key}.`);
    if (prompt.text !== correction.expectedText) {
      throw new Error(
        `A2 sentence correction source drift for ${key}: expected ${JSON.stringify(correction.expectedText)}, received ${JSON.stringify(prompt.text)}.`,
      );
    }
    prompt.text = correction.replacementText;
  }
  return items;
}

function catalogue({
  catalogueId,
  entitlementIds,
  rewardTracks,
  requiredAssetCount,
  itemIds,
  wordsBySlug,
  config,
  corrections,
}) {
  const items = applySentenceCorrections(catalogueId, itemIds.map((itemId) => {
    const word = wordsBySlug.get(itemId);
    if (!word) throw new Error(`A0 allocated item is absent from WORDS: ${itemId}.`);
    return runtimeItem('ks2-core', itemId, word);
  }), corrections);
  return validateCatalogueV1({
    schemaVersion: 1,
    catalogueId,
    packId: 'ks2-core',
    entitlementIds,
    rewardTracks,
    audio: {
      profiles: [...config.audioProfiles],
      kinds: [...config.audioKinds],
      fallback: null,
      requiredAssetCount,
    },
    items,
  });
}

export async function buildMobileSpellingA2Runtime(rawRepoRoot) {
  const repoRoot = rawRepoRoot instanceof URL
    ? fileURLToPath(rawRepoRoot)
    : resolve(String(rawRepoRoot));
  const source = await pinnedJson(repoRoot, A0_MANIFEST, A0_MANIFEST_SHA256);
  await pinnedJson(repoRoot, A1_MANIFEST, A1_MANIFEST_SHA256);
  const config = await pinnedJson(repoRoot, PACK_CONFIG, PACK_CONFIG_SHA256);
  if (JSON.stringify(source.sentenceCorrections) !== JSON.stringify(config.sentenceCorrections)) {
    throw new Error('A0 sentence corrections do not match the pinned pack configuration.');
  }
  const starterIds = source.allocations.starter.itemIds;
  const fullIds = source.allocations.fullKs2.itemIds;
  if (idsDigest(starterIds) !== EXPECTED_INVENTORY_SHA256.starter
      || idsDigest(fullIds) !== EXPECTED_INVENTORY_SHA256.full) {
    throw new Error('A0 Starter or Full inventory changed after product approval.');
  }
  const wordsBySlug = new Map(WORDS.map((word) => [word.slug, word]));
  const ks2Tracks = config.rewardTracks.filter(({ packId }) => packId === 'ks2-core');
  const starter = catalogue({
    catalogueId: 'ks2-core:starter',
    entitlementIds: [],
    rewardTracks: ks2Tracks.filter(({ rewardTrackId }) => rewardTrackId === 'spelling-core-inklet' || rewardTrackId === 'spelling-core-glimmerbug'),
    requiredAssetCount: source.audio.requiredAssetCountsByCatalogue['ks2-core:starter'],
    itemIds: starterIds,
    wordsBySlug,
    config,
    corrections: source.sentenceCorrections,
  });
  const full = catalogue({
    catalogueId: 'ks2-core:full',
    entitlementIds: ['full-ks2'],
    rewardTracks: ks2Tracks,
    requiredAssetCount: source.audio.requiredAssetCountsByCatalogue['ks2-core:full'],
    itemIds: fullIds,
    wordsBySlug,
    config,
    corrections: source.sentenceCorrections,
  });
  if (starter.items.length !== 20 || full.items.length !== 213) {
    throw new Error('A2 catalogue count mismatch.');
  }
  const fullByItemId = new Map(full.items.map((item) => [item.itemId, item.runtimeItemId]));
  if (starter.items.some((item) => fullByItemId.get(item.itemId) !== item.runtimeItemId)) {
    throw new Error('Starter identity is not stable in Full.');
  }
  if ([...starter.items, ...full.items].some(({ coverageTier }) => coverageTier !== 'statutory-core')) {
    throw new Error('Excluded spelling tier leaked into A2.');
  }
  assertNoDuplicateActiveTargets([starter, full]);
  return { starter, full };
}

export async function buildMobileSpellingA2Manifest(rawRepoRoot) {
  const repoRoot = rawRepoRoot instanceof URL ? fileURLToPath(rawRepoRoot) : resolve(String(rawRepoRoot));
  const a1Bytes = await readFile(join(repoRoot, A1_MANIFEST));
  const a0Bytes = await readFile(join(repoRoot, A0_MANIFEST));
  const packConfigBytes = await readFile(join(repoRoot, PACK_CONFIG));
  if (sha256(a1Bytes) !== A1_MANIFEST_SHA256
      || sha256(a0Bytes) !== A0_MANIFEST_SHA256
      || sha256(packConfigBytes) !== PACK_CONFIG_SHA256) {
    throw new Error('A2 authority manifest hash mismatch.');
  }

  const { starter, full } = await buildMobileSpellingA2Runtime(repoRoot);
  const starterInventorySha256 = inventorySha256(starter);
  const fullInventorySha256 = inventorySha256(full);
  if (starterInventorySha256 !== EXPECTED_INVENTORY_SHA256.starter
      || fullInventorySha256 !== EXPECTED_INVENTORY_SHA256.full) {
    throw new Error('A2 runtime inventory does not match the frozen A0 allocation.');
  }
  const fullByItemId = new Map(full.items.map((item) => [item.itemId, item.runtimeItemId]));
  const sharedIdentityMismatchCount = starter.items.filter(
    (item) => fullByItemId.get(item.itemId) !== item.runtimeItemId,
  ).length;

  return {
    schemaVersion: 1,
    authority: {
      a1MergedCommit: '05e01aaac47126ffcf840530f1cde230407fb9e5',
      a1ManifestSha256: A1_MANIFEST_SHA256,
      a0ManifestSha256: A0_MANIFEST_SHA256,
      packConfigSha256: PACK_CONFIG_SHA256,
    },
    runtime: {
      entry: RUNTIME_ENTRY,
      files: await fileEvidence(repoRoot, RUNTIME_FILES),
      publicExports: collectPublicExports(repoRoot),
    },
    catalogues: {
      files: [
        { path: CATALOGUE_FILES[0], sha256: sha256(`${JSON.stringify(full, null, 2)}\n`) },
        { path: CATALOGUE_FILES[1], sha256: sha256(`${JSON.stringify(starter, null, 2)}\n`) },
      ],
      counts: { starter: starter.items.length, full: full.items.length },
      inventorySha256: { starter: starterInventorySha256, full: fullInventorySha256 },
      sharedIdentityMismatchCount,
      duplicateNormalisedTargetCount: duplicateNormalisedTargetCount([starter, full]),
      excludedTierLeakage: {
        secureExtension: [...starter.items, ...full.items].filter(({ coverageTier }) => coverageTier === 'secure-extension').length,
        enrichmentExtra: [...starter.items, ...full.items].filter(({ coverageTier }) => coverageTier === 'enrichment-extra').length,
      },
    },
    hostileFixtures: {
      path: HOSTILE_FIXTURE,
      sha256: sha256(await readFile(join(repoRoot, HOSTILE_FIXTURE))),
    },
  };
}
