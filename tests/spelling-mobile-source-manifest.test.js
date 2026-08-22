import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sourceManifest from '../scripts/lib/spelling-mobile-source-manifest.mjs';

const {
  buildSpellingMobileSourceManifest,
  serialiseSpellingMobileSourceManifest,
} = sourceManifest;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'content/spelling.mobile-source-manifest.json');
const PINNED_DONOR_COMMIT = '8da3218a5077be24cabaf82031ade17d0389a958';
const PINNED_COMMITTED_AT = '2026-07-09T23:29:04+01:00';
const EXPECTED_VERIFICATION_POLICY = {
  fullHistory:
    'Verify the pinned donor commit time and all 14 raw donor blob SHA-256 hashes; full Git history is mandatory for A0 certification.',
  confirmedShallowOrArchive:
    'Verify the LF-canonical pinned spelling seed SHA-256 and only reproduce output from A0-frozen donor evidence; reduced mode cannot certify A0.',
};
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

function repositoryIsShallow() {
  return execFileSync(
    'git',
    ['rev-parse', '--is-shallow-repository'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  ).trim() === 'true';
}
const EXPECTED_DONOR_FILES = [
  {
    path: 'content/spelling.seed.json',
    sha256: '4c21cb32e4cbcb71f36015625ec30eb8397f3ce5cff3cc445f27a11134f25fdf',
  },
  {
    path: 'shared/spelling/service.js',
    sha256: '1a9fe623eb4f0bf4ab68199b047d6aeb7613d3c3c411db6f3f63fcee24936791',
  },
  {
    path: 'shared/spelling/legacy-engine.js',
    sha256: '1de5bf31b48a22b052f2855a10bbb99c9bfe99e4ca321d0a47f864723673507d',
  },
  {
    path: 'shared/spelling-audio.js',
    sha256: 'f3e02bd5fcd734d6ffa70061a013ca7ba636a7dc16eac092e8e8dcac9166b14f',
  },
  {
    path: 'src/subjects/spelling/service-contract.js',
    sha256: '2f3d1c5d942f5081b17f3df2734c5be05d8be12148827322bf2cd4df99c516be',
  },
  {
    path: 'src/subjects/spelling/events.js',
    sha256: 'e19c3c3912e08233fd1870b2943b406bf18d076652b678ec3680a08785ebe954',
  },
  {
    path: 'src/subjects/spelling/read-model.js',
    sha256: '67fe3d66317ed9594afe770a984b1a0aee2e734a4154f081461173e7c553091d',
  },
  {
    path: 'src/subjects/spelling/repository.js',
    sha256: 'b45444f6ca9da740f8f28bd4813cb595affae341e8a4465f5a0d19f6dc79d741',
  },
  {
    path: 'src/platform/game/mastery/spelling.js',
    sha256: 'e91fec7a687cd2110eab2cfae7f916a6be173521616832918a9db8bf6cfb2970',
  },
  {
    path: 'src/platform/game/reward-track-config.js',
    sha256: '8da2c86c04671e20eb48bfa70b8bb74f82a21ad665d28e51fd227e497ea8c22a',
  },
  {
    path: 'src/platform/game/monsters.js',
    sha256: 'e3353e9479eec6c9b0d46b51b18e9c315ed3e8a12a6fe970db97f626f7a2bfba',
  },
  {
    path: 'src/platform/game/monster-asset-manifest.js',
    sha256: 'dd92aa2cbb6a455b9663e54188e3e782be4c391dcbc12409f6a3acbd49f2cb10',
  },
  {
    path: 'src/platform/hubs/parent-read-model.js',
    sha256: '5d3a29b75650500994197fede23bc6f558e0e13ce495e7b8889ffba84287ecc7',
  },
  {
    path: 'scripts/build-spelling-word-audio.mjs',
    sha256: 'fccde2b0e40487622f5720005b71e64b815011ee804891f7415c8e1961a9fcea',
  },
];

function canonicaliseLineEndings(value) {
  return value.replaceAll('\r\n', '\n');
}

function useCrlfLineEndings(value) {
  return canonicaliseLineEndings(value).replaceAll('\n', '\r\n');
}

function createMinimalRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'spelling-mobile-source-manifest-'));
  const { globalConfigPath, hooksDirectory, templateDirectory } = gitFixturePaths(repoRoot);
  mkdirSync(resolve(repoRoot, 'config'), { recursive: true });
  mkdirSync(resolve(repoRoot, 'content'), { recursive: true });
  mkdirSync(resolve(repoRoot, 'scripts/lib'), { recursive: true });
  mkdirSync(hooksDirectory, { recursive: true });
  mkdirSync(templateDirectory, { recursive: true });
  writeFileSync(globalConfigPath, '', 'utf8');
  copyFileSync(
    resolve(REPO_ROOT, 'config/mobile-spelling-packs.json'),
    resolve(repoRoot, 'config/mobile-spelling-packs.json'),
  );
  copyFileSync(
    resolve(REPO_ROOT, 'config/mobile-spelling-source-branches.json'),
    resolve(repoRoot, 'config/mobile-spelling-source-branches.json'),
  );
  copyFileSync(
    resolve(REPO_ROOT, 'content/spelling.seed.json'),
    resolve(repoRoot, 'content/spelling.seed.json'),
  );
  copyFileSync(
    resolve(REPO_ROOT, 'scripts/build-spelling-mobile-source-manifest.mjs'),
    resolve(repoRoot, 'scripts/build-spelling-mobile-source-manifest.mjs'),
  );
  copyFileSync(
    resolve(REPO_ROOT, 'scripts/lib/spelling-mobile-source-manifest.mjs'),
    resolve(repoRoot, 'scripts/lib/spelling-mobile-source-manifest.mjs'),
  );
  return repoRoot;
}

function withMinimalRepo(run) {
  const repoRoot = createMinimalRepo();
  try {
    return run(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function gitFixturePaths(repoRoot) {
  const controlDirectory = resolve(repoRoot, '.git-fixture-control');
  return {
    globalConfigPath: resolve(controlDirectory, 'global.config'),
    hooksDirectory: resolve(controlDirectory, 'hooks'),
    templateDirectory: resolve(controlDirectory, 'template'),
  };
}

function gitFixtureEnvironment(repoRoot) {
  const { globalConfigPath, templateDirectory } = gitFixturePaths(repoRoot);
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
  environment.GIT_CONFIG_GLOBAL = globalConfigPath;
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_TEMPLATE_DIR = templateDirectory;
  return environment;
}

function gitOutput(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: gitFixtureEnvironment(repoRoot),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function initialiseGitFixture(repoRoot, { shallow = false } = {}) {
  const { hooksDirectory } = gitFixturePaths(repoRoot);
  gitOutput(repoRoot, ['init', '--quiet', '--object-format=sha1']);
  gitOutput(repoRoot, ['config', '--local', 'user.name', 'KS2 Test']);
  gitOutput(repoRoot, ['config', '--local', 'user.email', 'ks2-test@example.invalid']);
  gitOutput(repoRoot, ['config', '--local', 'commit.gpgSign', 'false']);
  gitOutput(repoRoot, ['config', '--local', 'core.hooksPath', hooksDirectory]);
  gitOutput(repoRoot, ['commit', '--allow-empty', '--quiet', '-m', 'test fixture']);
  if (shallow) {
    const head = gitOutput(repoRoot, ['rev-parse', 'HEAD']).trim();
    writeFileSync(resolve(repoRoot, '.git/shallow'), `${head}\n`, 'utf8');
  }
}

function runManifestCli(repoRoot, args = []) {
  const result = spawnSync(
    process.execPath,
    [resolve(repoRoot, 'scripts/build-spelling-mobile-source-manifest.mjs'), ...args],
    { cwd: repoRoot, encoding: 'utf8', env: gitFixtureEnvironment(repoRoot) },
  );
  if (result.error) throw result.error;
  return result;
}

test('mobile source manifest library exposes only the brief interfaces', () => {
  assert.deepEqual(Object.keys(sourceManifest).sort(), [
    'buildSpellingMobileSourceManifest',
    'serialiseSpellingMobileSourceManifest',
  ]);
});

test('formal A0 verification uses the full-history certification command', () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['spelling:mobile:source-manifest:certify'],
    'node scripts/build-spelling-mobile-source-manifest.mjs --check --require-full-history',
  );
  assert.equal(
    packageJson.scripts['verify:spelling-mobile:a0'],
    'node --test tests/mobile-spelling-pack-config.test.js tests/mobile-spelling-source-branches.test.js tests/spelling-mobile-source-manifest.test.js && npm run content:validate && npm run spelling:mobile:source-manifest:certify',
  );
});

test('mobile source manifest regenerates canonically byte-for-byte', () => {
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );
  assert.equal(canonicaliseLineEndings(readFileSync(MANIFEST_PATH, 'utf8')), expected);
});

test('mobile source manifest freezes allocation, provenance and branch decisions', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.source.commit, PINNED_DONOR_COMMIT);
  assert.equal(manifest.source.committedAt, PINNED_COMMITTED_AT);
  assert.deepEqual(manifest.source.verificationPolicy, EXPECTED_VERIFICATION_POLICY);
  assert.deepEqual(manifest.source.files, EXPECTED_DONOR_FILES);
  assert.equal(manifest.source.release.id, 'spelling-r7');
  assert.equal(manifest.source.release.version, 7);
  assert.equal(manifest.allocations.starter.itemIds.length, 20);
  assert.equal(manifest.allocations.fullKs2.itemIds.length, 213);
  assert.equal(manifest.allocations.futureSecureVocabulary.itemIds.length, 1215);
  assert.equal(manifest.allocations.futureExtraVocabulary.itemIds.length, 52);
  assert.deepEqual(manifest.sentenceCorrections, [
    {
      catalogueId: 'ks2-core:full',
      itemId: 'famous',
      sentenceId: 'sentence-6',
      expectedText: 'The castle is famous with visitors from many countries.',
      replacementText: 'The castle is famous among visitors from many countries.',
    },
  ]);
  assert.ok(
    manifest.allocations.starter.itemIds.every((itemId) =>
      manifest.allocations.fullKs2.itemIds.includes(itemId)),
  );
  assert.equal(manifest.validation.duplicateNormalisedTargets.length, 0);
  assert.deepEqual(manifest.validation.fullSecureOverlapItemIds, []);
  assert.deepEqual(manifest.validation.fullExtraOverlapItemIds, []);
  assert.equal(manifest.validation.fullContainsSecureExtension, false);
  assert.equal(manifest.validation.fullContainsEnrichmentExtra, false);
  assert.deepEqual(manifest.audio.profiles, ['Iapetus', 'Sulafat']);
  assert.deepEqual(manifest.audio.requiredAssetCountsByCatalogue, {
    'ks2-core:starter': 840,
    'ks2-core:full': 8946,
  });
  assert.equal(manifest.source.branches.length, 6);
});

test('mobile source manifest builds identically without Git history or generated modules', () => {
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );

  withMinimalRepo((repoRoot) => {
    const actual = serialiseSpellingMobileSourceManifest(
      buildSpellingMobileSourceManifest({ repoRoot }),
    );
    assert.equal(actual, expected);
  });
});

test('mobile source manifest requires full donor history only when certifying A0', () => {
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );
  if (repositoryIsShallow()) {
    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT, requireFullHistory: true }),
      /A0 certification requires full Git history with the pinned donor commit/,
    );
    return;
  }
  const certified = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT, requireFullHistory: true }),
  );
  assert.equal(certified, expected);

  withMinimalRepo((repoRoot) => {
    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot, requireFullHistory: true }),
      /A0 certification requires full Git history with the pinned donor commit/,
    );
  });
});

test('full-history certification ignores inherited Git repository-routing variables', (t) => {
  if (repositoryIsShallow()) {
    t.skip('full-history routing proof requires the pinned donor commit');
    return;
  }
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );
  const poisonedPath = resolve(REPO_ROOT, '.git-routing-poison-must-not-be-used');
  const invalidGitConfigPath = resolve(REPO_ROOT, 'package.json');
  const poisonedEnvironment = {
    GIT_DIR: poisonedPath,
    GIT_WORK_TREE: poisonedPath,
    GIT_OBJECT_DIRECTORY: poisonedPath,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: poisonedPath,
    GIT_INDEX_FILE: poisonedPath,
    GIT_SHALLOW_FILE: poisonedPath,
    GIT_CONFIG_GLOBAL: invalidGitConfigPath,
    GIT_CONFIG_SYSTEM: invalidGitConfigPath,
    GIT_CONFIG_NOSYSTEM: '0',
    GIT_TEMPLATE_DIR: invalidGitConfigPath,
    GIT_DEFAULT_HASH: 'sha256',
  };
  const originalEnvironment = Object.fromEntries(
    Object.keys(poisonedEnvironment).map((key) => [key, process.env[key]]),
  );

  try {
    Object.assign(process.env, poisonedEnvironment);
    const actual = serialiseSpellingMobileSourceManifest(
      buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT, requireFullHistory: true }),
    );
    assert.equal(actual, expected);
  } finally {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('mobile source manifest canonicalises CRLF seed bytes in archive mode', () => {
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );

  withMinimalRepo((repoRoot) => {
    const seedPath = resolve(repoRoot, 'content/spelling.seed.json');
    const lfSeed = readFileSync(seedPath, 'utf8');
    writeFileSync(seedPath, useCrlfLineEndings(lfSeed), 'utf8');
    const actual = serialiseSpellingMobileSourceManifest(
      buildSpellingMobileSourceManifest({ repoRoot }),
    );
    assert.equal(actual, expected);
  });
});

test('mobile source manifest builds identically in a confirmed shallow Git repository', () => {
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );

  withMinimalRepo((repoRoot) => {
    initialiseGitFixture(repoRoot, { shallow: true });
    assert.equal(gitOutput(repoRoot, ['rev-parse', '--is-shallow-repository']).trim(), 'true');
    const actual = serialiseSpellingMobileSourceManifest(
      buildSpellingMobileSourceManifest({ repoRoot }),
    );
    assert.equal(actual, expected);
  });
});

test('ambient SHA-256 cannot change donor-present shallow fixture certification', () => {
  const expected = serialiseSpellingMobileSourceManifest(
    buildSpellingMobileSourceManifest({ repoRoot: REPO_ROOT }),
  );
  const originalDefaultHash = process.env.GIT_DEFAULT_HASH;

  try {
    process.env.GIT_DEFAULT_HASH = 'sha256';
    withMinimalRepo((repoRoot) => {
      initialiseGitFixture(repoRoot);
      assert.equal(gitOutput(repoRoot, ['rev-parse', '--show-object-format']).trim(), 'sha1');
      gitOutput(repoRoot, [
        'fetch',
        '--quiet',
        '--depth=1',
        '--no-tags',
        REPO_ROOT,
        PINNED_DONOR_COMMIT,
      ]);
      assert.equal(gitOutput(repoRoot, ['rev-parse', '--is-shallow-repository']).trim(), 'true');
      assert.equal(
        gitOutput(repoRoot, ['rev-parse', '--verify', `${PINNED_DONOR_COMMIT}^{commit}`]).trim(),
        PINNED_DONOR_COMMIT,
      );
      assert.equal(
        serialiseSpellingMobileSourceManifest(buildSpellingMobileSourceManifest({ repoRoot })),
        expected,
      );

      const seedPath = resolve(repoRoot, 'content/spelling.seed.json');
      const originalSeed = readFileSync(seedPath, 'utf8');
      const changedSeed = JSON.parse(originalSeed);
      changedSeed.publication.currentReleaseId = 'spelling-r6';
      writeFileSync(
        seedPath,
        useCrlfLineEndings(`${JSON.stringify(changedSeed, null, 2)}\n`),
        'utf8',
      );
      assert.throws(
        () => buildSpellingMobileSourceManifest({ repoRoot }),
        /Pinned spelling seed SHA-256 mismatch/,
      );
      writeFileSync(seedPath, originalSeed, 'utf8');

      assert.throws(
        () => buildSpellingMobileSourceManifest({ repoRoot, requireFullHistory: true }),
        /A0 certification requires full Git history with the pinned donor commit/,
      );

      const certification = runManifestCli(repoRoot, ['--check', '--require-full-history']);
      assert.equal(certification.status, 1);
      assert.match(
        certification.stderr,
        /A0 certification requires full Git history with the pinned donor commit/,
      );
    });
  } finally {
    if (originalDefaultHash === undefined) delete process.env.GIT_DEFAULT_HASH;
    else process.env.GIT_DEFAULT_HASH = originalDefaultHash;
  }
});

test('mobile source manifest rejects malformed Git metadata instead of falling back', () => {
  withMinimalRepo((repoRoot) => {
    writeFileSync(resolve(repoRoot, '.git'), 'not valid Git metadata\n', 'utf8');
    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot }),
      /Git metadata is present but unusable/,
    );
  });
});

test('mobile source manifest rejects a missing donor in a non-shallow Git repository', () => {
  withMinimalRepo((repoRoot) => {
    initialiseGitFixture(repoRoot);
    assert.equal(gitOutput(repoRoot, ['rev-parse', '--is-shallow-repository']).trim(), 'false');
    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot }),
      /Pinned donor commit is unavailable in a non-shallow Git repository/,
    );
  });
});

test('mobile source manifest rejects a changed shallow-checkout seed', () => {
  withMinimalRepo((repoRoot) => {
    const seedPath = resolve(repoRoot, 'content/spelling.seed.json');
    const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
    seed.publication.currentReleaseId = 'spelling-r6';
    writeFileSync(seedPath, useCrlfLineEndings(`${JSON.stringify(seed, null, 2)}\n`), 'utf8');

    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot }),
      /Pinned spelling seed SHA-256 mismatch/,
    );
  });
});

test('mobile source manifest rejects sentence correction source drift', () => {
  withMinimalRepo((repoRoot) => {
    const configPath = resolve(repoRoot, 'config/mobile-spelling-packs.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.sentenceCorrections[0].expectedText = 'A silently changed source sentence.';
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot }),
      /sentence correction source drift/,
    );
  });
});

test('mobile source manifest rejects a branch register pointed at another source commit', () => {
  withMinimalRepo((repoRoot) => {
    const registerPath = resolve(repoRoot, 'config/mobile-spelling-source-branches.json');
    const register = JSON.parse(readFileSync(registerPath, 'utf8'));
    register.sourceCommit = '0000000000000000000000000000000000000000';
    writeFileSync(registerPath, `${JSON.stringify(register, null, 2)}\n`, 'utf8');

    assert.throws(
      () => buildSpellingMobileSourceManifest({ repoRoot }),
      /Mobile spelling source commit must equal the frozen donor commit/,
    );
  });
});

test('mobile source manifest CLI refuses A0 certification in reduced-history modes', () => {
  withMinimalRepo((repoRoot) => {
    const archive = runManifestCli(repoRoot, ['--check', '--require-full-history']);
    assert.equal(archive.status, 1);
    assert.match(
      archive.stderr,
      /A0 certification requires full Git history with the pinned donor commit/,
    );
  });

  withMinimalRepo((repoRoot) => {
    initialiseGitFixture(repoRoot, { shallow: true });
    const shallow = runManifestCli(repoRoot, ['--check', '--require-full-history']);
    assert.equal(shallow.status, 1);
    assert.match(
      shallow.stderr,
      /A0 certification requires full Git history with the pinned donor commit/,
    );
  });
});

test('mobile source manifest CLI rejects stale states and atomically writes current content', () => {
  withMinimalRepo((repoRoot) => {
    const outputPath = resolve(repoRoot, 'content/spelling.mobile-source-manifest.json');

    const missing = runManifestCli(repoRoot, ['--check']);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Mobile spelling source manifest is missing/);

    writeFileSync(outputPath, '', 'utf8');
    const zeroByte = runManifestCli(repoRoot, ['--check']);
    assert.equal(zeroByte.status, 1);
    assert.match(zeroByte.stderr, /Mobile spelling source manifest is stale/);

    writeFileSync(outputPath, '{"stale":true}\n', 'utf8');
    const stale = runManifestCli(repoRoot, ['--check']);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /Mobile spelling source manifest is stale/);
    const staleInode = lstatSync(outputPath).ino;

    const write = runManifestCli(repoRoot);
    assert.equal(write.status, 0);
    assert.match(write.stdout, /Wrote content\/spelling\.mobile-source-manifest\.json/);
    assert.notEqual(lstatSync(outputPath).ino, staleInode);
    assert.equal(
      readFileSync(outputPath, 'utf8'),
      serialiseSpellingMobileSourceManifest(
        buildSpellingMobileSourceManifest({ repoRoot }),
      ),
    );
    assert.deepEqual(
      readdirSync(resolve(repoRoot, 'content')).filter(
        (name) => name.startsWith('spelling.mobile-source-manifest.json.') && name.endsWith('.tmp'),
      ),
      [],
    );

    const current = runManifestCli(repoRoot, ['--check']);
    assert.equal(current.status, 0);
    assert.equal(current.stderr, '');

    const lfManifest = readFileSync(outputPath, 'utf8');
    writeFileSync(outputPath, useCrlfLineEndings(lfManifest), 'utf8');
    const crlfCurrent = runManifestCli(repoRoot, ['--check']);
    assert.equal(crlfCurrent.status, 0);
    assert.equal(crlfCurrent.stderr, '');
  });
});
