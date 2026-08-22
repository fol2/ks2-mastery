import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { resolve } from 'node:path';

const DESIGN_SPEC = 'docs/superpowers/specs/2026-07-09-standalone-spelling-mobile-application-design.md';
const PINNED_DONOR_COMMIT = '8da3218a5077be24cabaf82031ade17d0389a958';
const PINNED_DONOR_COMMITTED_AT = '2026-07-09T23:29:04+01:00';
const PINNED_SEED_SHA256 = '4c21cb32e4cbcb71f36015625ec30eb8397f3ce5cff3cc445f27a11134f25fdf';
const EXPECTED_COVERAGE_TIER_COUNTS = Object.freeze({
  'statutory-core': 213,
  'secure-extension': 1215,
  'enrichment-extra': 52,
});
const EXPECTED_TOTAL_WORD_COUNT = 1480;
const VERIFICATION_POLICY = Object.freeze({
  fullHistory:
    'Verify the pinned donor commit time and all 14 raw donor blob SHA-256 hashes; full Git history is mandatory for A0 certification.',
  confirmedShallowOrArchive:
    'Verify the LF-canonical pinned spelling seed SHA-256 and only reproduce output from A0-frozen donor evidence; reduced mode cannot certify A0.',
});
const GIT_ENVIRONMENT_VARIABLES_TO_REMOVE = new Set([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_INDEX_FILE',
  'GIT_SHALLOW_FILE',
  'GIT_GRAFT_FILE',
  'GIT_REPLACE_REF_BASE',
  'GIT_NAMESPACE',
  'GIT_QUARANTINE_PATH',
  'GIT_PREFIX',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_TEMPLATE_DIR',
  'GIT_DEFAULT_HASH',
]);

const AUDIO_SOURCE_PATHS = Object.freeze([
  'shared/spelling-audio.js',
  'scripts/build-spelling-word-audio.mjs',
]);
const MONSTER_SOURCE_PATHS = Object.freeze([
  'src/platform/game/mastery/spelling.js',
  'src/platform/game/reward-track-config.js',
  'src/platform/game/monsters.js',
  'src/platform/game/monster-asset-manifest.js',
]);

const PINNED_DONOR_FILES = Object.freeze([
  Object.freeze({
    path: 'content/spelling.seed.json',
    sha256: PINNED_SEED_SHA256,
  }),
  Object.freeze({
    path: 'shared/spelling/service.js',
    sha256: '1a9fe623eb4f0bf4ab68199b047d6aeb7613d3c3c411db6f3f63fcee24936791',
  }),
  Object.freeze({
    path: 'shared/spelling/legacy-engine.js',
    sha256: '1de5bf31b48a22b052f2855a10bbb99c9bfe99e4ca321d0a47f864723673507d',
  }),
  Object.freeze({
    path: AUDIO_SOURCE_PATHS[0],
    sha256: 'f3e02bd5fcd734d6ffa70061a013ca7ba636a7dc16eac092e8e8dcac9166b14f',
  }),
  Object.freeze({
    path: 'src/subjects/spelling/service-contract.js',
    sha256: '2f3d1c5d942f5081b17f3df2734c5be05d8be12148827322bf2cd4df99c516be',
  }),
  Object.freeze({
    path: 'src/subjects/spelling/events.js',
    sha256: 'e19c3c3912e08233fd1870b2943b406bf18d076652b678ec3680a08785ebe954',
  }),
  Object.freeze({
    path: 'src/subjects/spelling/read-model.js',
    sha256: '67fe3d66317ed9594afe770a984b1a0aee2e734a4154f081461173e7c553091d',
  }),
  Object.freeze({
    path: 'src/subjects/spelling/repository.js',
    sha256: 'b45444f6ca9da740f8f28bd4813cb595affae341e8a4465f5a0d19f6dc79d741',
  }),
  Object.freeze({
    path: MONSTER_SOURCE_PATHS[0],
    sha256: 'e91fec7a687cd2110eab2cfae7f916a6be173521616832918a9db8bf6cfb2970',
  }),
  Object.freeze({
    path: MONSTER_SOURCE_PATHS[1],
    sha256: '8da2c86c04671e20eb48bfa70b8bb74f82a21ad665d28e51fd227e497ea8c22a',
  }),
  Object.freeze({
    path: MONSTER_SOURCE_PATHS[2],
    sha256: 'e3353e9479eec6c9b0d46b51b18e9c315ed3e8a12a6fe970db97f626f7a2bfba',
  }),
  Object.freeze({
    path: MONSTER_SOURCE_PATHS[3],
    sha256: 'dd92aa2cbb6a455b9663e54188e3e782be4c391dcbc12409f6a3acbd49f2cb10',
  }),
  Object.freeze({
    path: 'src/platform/hubs/parent-read-model.js',
    sha256: '5d3a29b75650500994197fede23bc6f558e0e13ce495e7b8889ffba84287ecc7',
  }),
  Object.freeze({
    path: AUDIO_SOURCE_PATHS[1],
    sha256: 'fccde2b0e40487622f5720005b71e64b815011ee804891f7415c8e1961a9fcea',
  }),
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function gitChildEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    const normalisedKey = key.toUpperCase();
    if (
      GIT_ENVIRONMENT_VARIABLES_TO_REMOVE.has(normalisedKey)
      || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(normalisedKey)
    ) {
      delete environment[key];
    }
  }
  environment.GIT_CONFIG_GLOBAL = devNull;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  return environment;
}

function gitOutput(repoRoot, args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding,
    env: gitChildEnvironment(),
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hasGitMetadata(repoRoot) {
  try {
    lstatSync(resolve(repoRoot, '.git'));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw new Error('Git metadata could not be inspected safely.', { cause: error });
  }
}

function gitProbe(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: gitChildEnvironment(),
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Error('Git metadata is present but unusable: Git could not be executed.', {
      cause: result.error,
    });
  }
  if (result.signal) {
    throw new Error(`Git metadata is present but unusable: Git exited on signal ${result.signal}.`);
  }
  return result;
}

function sourceVerificationMode(repoRoot) {
  if (!hasGitMetadata(repoRoot)) return 'verified-seed-fallback';

  const insideWorkTree = gitProbe(repoRoot, ['rev-parse', '--is-inside-work-tree']);
  if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== 'true') {
    throw new Error('Git metadata is present but unusable.');
  }

  const shallow = gitProbe(repoRoot, ['rev-parse', '--is-shallow-repository']);
  if (shallow.status !== 0) {
    throw new Error('Git metadata is present but repository shallowness could not be verified.');
  }
  const shallowValue = shallow.stdout.trim();
  if (shallowValue === 'true') return 'verified-seed-fallback';
  if (shallowValue !== 'false') {
    throw new Error(`Git returned an invalid shallow-repository value: ${shallowValue}.`);
  }

  const donor = gitProbe(repoRoot, [
    'rev-parse',
    '--verify',
    '--quiet',
    `${PINNED_DONOR_COMMIT}^{commit}`,
  ]);
  if (donor.status === 0) {
    if (donor.stdout.trim() !== PINNED_DONOR_COMMIT) {
      throw new Error('Git resolved the pinned donor commit to an unexpected object.');
    }
    return 'full-history';
  }

  const cleanMissingDonor = donor.status === 1 && donor.stderr.trim() === '';
  if (!cleanMissingDonor) {
    throw new Error('Git could not verify the pinned donor commit safely.');
  }
  throw new Error('Pinned donor commit is unavailable in a non-shallow Git repository.');
}

function readVerifiedDonorSeed(repoRoot) {
  let committedAt;
  try {
    committedAt = gitOutput(
      repoRoot,
      ['show', '-s', '--format=%cI', PINNED_DONOR_COMMIT],
    ).trim();
  } catch (error) {
    throw new Error('Pinned donor commit exists but its committed time could not be read.', {
      cause: error,
    });
  }
  if (committedAt !== PINNED_DONOR_COMMITTED_AT) {
    throw new Error(
      `Pinned donor committed time mismatch: expected ${PINNED_DONOR_COMMITTED_AT}, received ${committedAt}.`,
    );
  }

  let seedBytes = null;
  for (const evidence of PINNED_DONOR_FILES) {
    let bytes;
    try {
      bytes = gitOutput(repoRoot, ['show', `${PINNED_DONOR_COMMIT}:${evidence.path}`], null);
    } catch (error) {
      throw new Error(`Pinned donor blob could not be read: ${evidence.path}.`, { cause: error });
    }
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== evidence.sha256) {
      throw new Error(
        `Pinned donor SHA-256 mismatch for ${evidence.path}: expected ${evidence.sha256}, received ${actualSha256}.`,
      );
    }
    if (evidence.path === 'content/spelling.seed.json') seedBytes = bytes;
  }

  if (!seedBytes) throw new Error('Pinned donor spelling seed is missing from the evidence register.');
  return seedBytes;
}

function readVerifiedCheckoutSeed(repoRoot) {
  const seedPath = resolve(repoRoot, 'content/spelling.seed.json');
  let bytes;
  try {
    bytes = readFileSync(seedPath);
  } catch (error) {
    throw new Error('Pinned spelling seed is unavailable in this shallow checkout.', {
      cause: error,
    });
  }
  const rawSha256 = sha256(bytes);
  if (rawSha256 === PINNED_SEED_SHA256) return bytes;

  const canonicalBytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
  const canonicalSha256 = sha256(canonicalBytes);
  if (canonicalSha256 !== PINNED_SEED_SHA256) {
    throw new Error(
      `Pinned spelling seed SHA-256 mismatch: expected ${PINNED_SEED_SHA256}, received ${canonicalSha256}.`,
    );
  }
  return canonicalBytes;
}

function readPinnedSeed(repoRoot, { requireFullHistory = false } = {}) {
  const verificationMode = sourceVerificationMode(repoRoot);
  if (requireFullHistory && verificationMode !== 'full-history') {
    throw new Error('A0 certification requires full Git history with the pinned donor commit.');
  }
  const bytes = verificationMode === 'full-history'
    ? readVerifiedDonorSeed(repoRoot)
    : readVerifiedCheckoutSeed(repoRoot);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error('Pinned spelling seed is not valid JSON.', { cause: error });
  }
}

function publishedReleaseFromSeed(seed) {
  const releaseId = seed?.publication?.currentReleaseId;
  const releases = Array.isArray(seed?.releases) ? seed.releases : [];
  const release = releases.find((entry) => entry?.id === releaseId);
  if (!releaseId || !release) {
    throw new Error('Pinned spelling seed does not contain its current published release.');
  }
  if (release.state !== 'published') {
    throw new Error(`Pinned spelling release ${releaseId} is not published.`);
  }
  if (seed.publication.publishedVersion !== release.version) {
    throw new Error(`Pinned spelling release ${releaseId} has inconsistent publication versions.`);
  }
  if (!Array.isArray(release?.snapshot?.words)) {
    throw new Error(`Pinned spelling release ${releaseId} has no word snapshot.`);
  }
  return release;
}

function normalisedTarget(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-GB')
    .replaceAll('’', "'");
}

function duplicateTargets(words) {
  const firstByTarget = new Map();
  const duplicates = [];
  for (const word of words) {
    const target = normalisedTarget(word.word);
    const first = firstByTarget.get(target);
    if (first) {
      duplicates.push({ target, itemIds: [first, word.slug].sort() });
    } else {
      firstByTarget.set(target, word.slug);
    }
  }
  return duplicates.sort((left, right) => left.target.localeCompare(right.target, 'en-GB'));
}

function requiredAudioAssetCount(words, profileCount) {
  return words.reduce((total, word) => {
    const sentenceCount = Array.isArray(word.sentences) ? word.sentences.length : 0;
    const wordNatural = profileCount;
    const normalAndSlowDictation = sentenceCount * profileCount * 2;
    return total + wordNatural + normalAndSlowDictation;
  }, 0);
}

function catalogueById(config, catalogueId) {
  const catalogue = config.catalogues.find((entry) => entry.catalogueId === catalogueId);
  if (!catalogue) throw new Error(`Missing mobile spelling catalogue ${catalogueId}.`);
  return catalogue;
}

function validatedSentenceCorrections(packs, wordsBySlug, catalogueItemIds) {
  if (!Array.isArray(packs.sentenceCorrections)) {
    throw new Error('Mobile spelling sentenceCorrections must be an array.');
  }

  const seen = new Set();
  return packs.sentenceCorrections.map((correction) => {
    if (!correction || typeof correction !== 'object' || Array.isArray(correction)) {
      throw new Error('Mobile spelling sentence correction must be an object.');
    }
    const { catalogueId, itemId, sentenceId, expectedText, replacementText } = correction;
    if ([catalogueId, itemId, sentenceId, expectedText, replacementText]
      .some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new Error('Mobile spelling sentence correction fields must be non-empty strings.');
    }
    if (expectedText === replacementText) {
      throw new Error(`Mobile spelling sentence correction ${catalogueId}:${itemId}:${sentenceId} is a no-op.`);
    }
    const key = `${catalogueId}:${itemId}:${sentenceId}`;
    if (seen.has(key)) throw new Error(`Duplicate mobile spelling sentence correction ${key}.`);
    seen.add(key);

    const allowedItems = catalogueItemIds.get(catalogueId);
    if (!allowedItems?.has(itemId)) {
      throw new Error(`Mobile spelling sentence correction target is outside its catalogue: ${key}.`);
    }
    const sentenceNumber = /^sentence-([1-9][0-9]*)$/.exec(sentenceId)?.[1];
    const word = wordsBySlug.get(itemId);
    const actualText = sentenceNumber ? word?.sentences?.[Number(sentenceNumber) - 1] : undefined;
    if (actualText !== expectedText) {
      throw new Error(
        `Mobile spelling sentence correction source drift for ${key}: expected ${JSON.stringify(expectedText)}, received ${JSON.stringify(actualText)}.`,
      );
    }
    return { catalogueId, itemId, sentenceId, expectedText, replacementText };
  });
}

function wordsByCoverageTier(words) {
  const itemIds = new Set();
  const tiers = new Map(
    Object.keys(EXPECTED_COVERAGE_TIER_COUNTS).map((coverageTier) => [coverageTier, []]),
  );

  for (const word of words) {
    if (!word || typeof word !== 'object' || Array.isArray(word)) {
      throw new Error('Pinned spelling release contains an invalid word record.');
    }
    if (typeof word.slug !== 'string' || !word.slug) {
      throw new Error('Pinned spelling release contains a word without an item ID.');
    }
    if (itemIds.has(word.slug)) {
      throw new Error(`Pinned spelling release contains duplicate item ID ${word.slug}.`);
    }
    itemIds.add(word.slug);

    const tierWords = tiers.get(word.coverageTier);
    if (!tierWords) {
      throw new Error(`Pinned spelling release contains unsupported tier ${word.coverageTier}.`);
    }
    tierWords.push(word);
  }

  if (words.length !== EXPECTED_TOTAL_WORD_COUNT) {
    throw new Error(
      `Pinned spelling release must contain exactly ${EXPECTED_TOTAL_WORD_COUNT} items; received ${words.length}.`,
    );
  }
  for (const [coverageTier, expectedCount] of Object.entries(EXPECTED_COVERAGE_TIER_COUNTS)) {
    const actualCount = tiers.get(coverageTier).length;
    if (actualCount !== expectedCount) {
      throw new Error(
        `Pinned spelling tier ${coverageTier} must contain exactly ${expectedCount} items; received ${actualCount}.`,
      );
    }
  }

  return tiers;
}

export function buildSpellingMobileSourceManifest({ repoRoot, requireFullHistory = false }) {
  if (!repoRoot) throw new TypeError('repoRoot is required.');
  const packs = readJson(resolve(repoRoot, 'config/mobile-spelling-packs.json'));
  const branchRegister = readJson(resolve(repoRoot, 'config/mobile-spelling-source-branches.json'));
  if (branchRegister.sourceCommit !== PINNED_DONOR_COMMIT) {
    throw new Error(
      `Mobile spelling source commit must equal the frozen donor commit ${PINNED_DONOR_COMMIT}.`,
    );
  }

  const release = publishedReleaseFromSeed(readPinnedSeed(repoRoot, { requireFullHistory }));
  const words = release.snapshot.words;
  const tiers = wordsByCoverageTier(words);
  const fullWords = tiers.get('statutory-core');
  const secureWords = tiers.get('secure-extension');
  const extraWords = tiers.get('enrichment-extra');
  const wordsBySlug = new Map(words.map((word) => [word.slug, word]));
  const starter = catalogueById(packs, 'ks2-core:starter');
  const full = catalogueById(packs, 'ks2-core:full');
  const futureSecureVocabulary = catalogueById(packs, 'secure-vocabulary:future');
  const futureExtraVocabulary = catalogueById(packs, 'extra-vocabulary:future');

  if (!Array.isArray(starter.itemIds) || starter.itemIds.length !== 20) {
    throw new Error('Starter must contain exactly 20 items.');
  }
  if (new Set(starter.itemIds).size !== starter.itemIds.length) {
    throw new Error('Starter must contain 20 unique item IDs.');
  }
  const unknownStarterItemIds = starter.itemIds.filter((itemId) => !wordsBySlug.has(itemId));
  if (unknownStarterItemIds.length > 0) {
    throw new Error(`Starter contains unknown items: ${unknownStarterItemIds.join(', ')}.`);
  }
  const nonStatutoryStarterItemIds = starter.itemIds.filter(
    (itemId) => wordsBySlug.get(itemId).coverageTier !== 'statutory-core',
  );
  if (nonStatutoryStarterItemIds.length > 0) {
    throw new Error(
      `Starter contains non-statutory items: ${nonStatutoryStarterItemIds.join(', ')}.`,
    );
  }

  const starterWords = starter.itemIds.map((itemId) => wordsBySlug.get(itemId));
  const fullItemIds = fullWords.map((word) => word.slug);
  const secureItemIds = secureWords.map((word) => word.slug);
  const extraItemIds = extraWords.map((word) => word.slug);
  const fullItemIdSet = new Set(fullItemIds);
  const secureItemIdSet = new Set(secureItemIds);
  const extraItemIdSet = new Set(extraItemIds);
  const fullSecureOverlapItemIds = fullItemIds.filter((itemId) => secureItemIdSet.has(itemId));
  const fullExtraOverlapItemIds = fullItemIds.filter((itemId) => extraItemIdSet.has(itemId));
  const starterIsFullSubset = starter.itemIds.every((itemId) => fullItemIdSet.has(itemId));
  if (!starterIsFullSubset) throw new Error('Every Starter item must also belong to Full KS2.');
  const sentenceCorrections = validatedSentenceCorrections(packs, wordsBySlug, new Map([
    [starter.catalogueId, new Set(starter.itemIds)],
    [full.catalogueId, fullItemIdSet],
    [futureSecureVocabulary.catalogueId, secureItemIdSet],
    [futureExtraVocabulary.catalogueId, extraItemIdSet],
  ]));

  const coverageTierCounts = {
    statutoryCore: fullWords.length,
    secureExtension: secureWords.length,
    enrichmentExtra: extraWords.length,
    total: words.length,
  };

  return {
    schemaVersion: 1,
    designSpec: DESIGN_SPEC,
    source: {
      commit: PINNED_DONOR_COMMIT,
      committedAt: PINNED_DONOR_COMMITTED_AT,
      verificationPolicy: { ...VERIFICATION_POLICY },
      release: {
        id: release.id,
        version: release.version,
        publishedAt: release.publishedAt,
      },
      counts: coverageTierCounts,
      files: PINNED_DONOR_FILES.map((entry) => ({ ...entry })),
      branches: branchRegister.branches,
      a1SelectiveReviewCommits: branchRegister.a1SelectiveReviewCommits,
    },
    allocations: {
      starter: {
        catalogueId: starter.catalogueId,
        packId: starter.packId,
        itemIds: [...starter.itemIds],
      },
      fullKs2: {
        catalogueId: full.catalogueId,
        packId: full.packId,
        itemIds: fullItemIds,
      },
      futureSecureVocabulary: {
        catalogueId: futureSecureVocabulary.catalogueId,
        packId: futureSecureVocabulary.packId,
        itemIds: secureItemIds,
      },
      futureExtraVocabulary: {
        catalogueId: futureExtraVocabulary.catalogueId,
        packId: futureExtraVocabulary.packId,
        itemIds: extraItemIds,
      },
    },
    sentenceCorrections,
    rewardTracks: packs.rewardTracks,
    audio: {
      profiles: packs.audioProfiles,
      kinds: packs.audioKinds,
      sourceStatus: 'build-input-only-not-pack-ready',
      sourcePaths: [...AUDIO_SOURCE_PATHS],
      requiredAssetCountsByCatalogue: {
        'ks2-core:starter': requiredAudioAssetCount(starterWords, packs.audioProfiles.length),
        'ks2-core:full': requiredAudioAssetCount(fullWords, packs.audioProfiles.length),
      },
    },
    monsters: {
      sourceStatus: 'cross-subject-source-requires-spelling-only-extraction',
      sourcePaths: [...MONSTER_SOURCE_PATHS],
    },
    validation: {
      duplicateNormalisedTargets: duplicateTargets(words),
      starterIsFullSubset,
      fullSecureOverlapItemIds,
      fullExtraOverlapItemIds,
      fullContainsSecureExtension: fullSecureOverlapItemIds.length > 0,
      fullContainsEnrichmentExtra: fullExtraOverlapItemIds.length > 0,
    },
  };
}

export function serialiseSpellingMobileSourceManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
