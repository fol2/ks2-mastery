import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import { verifySpellingCoreBoundary } from './spelling-core-boundary.mjs';

const A3_ROOT = 'shared/spelling';
const A3_ENTRY = 'shared/spelling/mobile/a3/index.js';
const A3_DIRECTORY = 'shared/spelling/mobile/a3';
const A1_ENTRY = 'shared/spelling/core/index.js';
const PARITY_FIXTURE = 'tests/fixtures/spelling-a3/command-parity.json';
const EXPECTED_RUNTIME_PATHS = Object.freeze([
  'shared/spelling/core/achievements.js',
  'shared/spelling/core/audio-preferences.js',
  'shared/spelling/core/content/patterns.js',
  'shared/spelling/core/content/taxonomy.js',
  'shared/spelling/core/events.js',
  'shared/spelling/core/index.js',
  'shared/spelling/core/legacy-engine.js',
  'shared/spelling/core/service-contract.js',
  'shared/spelling/core/service.js',
  'shared/spelling/mobile/a3/camp-projection.js',
  'shared/spelling/mobile/a3/command-contracts.js',
  'shared/spelling/mobile/a3/command-planner.js',
  'shared/spelling/mobile/a3/command-repository.js',
  'shared/spelling/mobile/a3/index.js',
  'shared/spelling/mobile/a3/monster-projection.js',
  'shared/spelling/mobile/a3/parent-projection.js',
  'shared/spelling/mobile/a3/profile-repository.js',
  'shared/spelling/mobile/a3/revision-authority.js',
  'shared/spelling/mobile/a3/revision-projection.js',
  'shared/spelling/mobile/identity.js',
  'shared/spelling/mobile/index.js',
  'shared/spelling/mobile/pack-contracts.js',
  'shared/spelling/mobile/runtime-catalogue.js',
  'shared/spelling/mobile/runtime-snapshot.js',
]);
const A3_SOURCE_PATHS = Object.freeze(
  EXPECTED_RUNTIME_PATHS.filter((value) => value.startsWith(`${A3_DIRECTORY}/`)),
);
const EXPECTED_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-word',
  'end-session',
  'save-prefs',
  'acknowledge-persistence-warning',
]);
const FAILURE_CHECKPOINTS = Object.freeze([
  'after-subject-state',
  'after-practice-session',
  'after-events',
  'after-monster-state',
  'after-camp-state',
  'after-revision',
  'before-commit',
]);
const AUTHORITY = Object.freeze({
  a2MergedCommit: '00cee5c4cfd520d583192222c95c994375ea6263',
  a2Manifest: Object.freeze({
    path: 'content/spelling.mobile-a2-contract-manifest.json',
    sha256: '3d6e00e60fa76d0c826a72b8da13ef7e81f7b74d1e39ea04257c6f29fa8d6805',
  }),
  a1Manifest: Object.freeze({
    path: 'content/spelling.mobile-a1-kernel-manifest.json',
    sha256: '51af549ce31a30adc021d5fa0bd6a70ed9de2366887add0df3fc7f8f42dc312f',
  }),
  catalogues: Object.freeze({
    starter: Object.freeze({
      path: 'content/spelling.mobile-runtime-starter.json',
      sha256: '1416895f3e191a8385891756a56e38c3bd9f72aa594061cef618554fbed0437a',
    }),
    full: Object.freeze({
      path: 'content/spelling.mobile-runtime-full.json',
      sha256: '362a6642b1c69e494043fea2cf2b7204938ee101840858ebb9afe2857159d62d',
    }),
  }),
});
const MODULE_PROBE = [
  'const [entryUrl, coreUrl] = process.argv.slice(1);',
  'const runtime = await import(entryUrl);',
  'const core = await import(coreUrl);',
  'process.stdout.write(JSON.stringify({',
  '  publicExports: Object.keys(runtime).sort(),',
  '  commands: runtime.SPELLING_MOBILE_COMMAND_TYPES,',
  '  maximumConflictAttempts: runtime.SPELLING_COMMAND_MAX_CONFLICT_ATTEMPTS,',
  '  guardianIntervals: core.GUARDIAN_INTERVALS,',
  '}));',
].join('\n');
const EXPORT_ENVIRONMENT_KEYS = new Set([
  'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'WINDIR',
]);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function filesystemPath(value) {
  if (value instanceof URL) return fileURLToPath(value);
  return String(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalisePath(filePath) {
  return filePath.split(path.sep).join('/').replaceAll('\\', '/');
}

function repoRelativePath(repoRoot, absolutePath) {
  return normalisePath(path.relative(repoRoot, absolutePath));
}

function cleanProbeEnvironment() {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (EXPORT_ENVIRONMENT_KEYS.has(upper)) environment[key] = value;
  }
  return environment;
}

async function pinnedJson(repoRoot, evidence, label) {
  const bytes = await readFile(path.join(repoRoot, evidence.path));
  const actual = sha256(bytes);
  if (actual !== evidence.sha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${evidence.sha256}, received ${actual}.`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
  return value;
}

function collectModuleContract(repoRoot) {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    MODULE_PROBE,
    '--',
    pathToFileURL(path.join(repoRoot, A3_ENTRY)).href,
    pathToFileURL(path.join(repoRoot, A1_ENTRY)).href,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: cleanProbeEnvironment(),
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error('A3 portable module contract could not be collected safely.');
  }
  let contract;
  try {
    contract = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error('A3 portable module contract could not be collected safely.', { cause: error });
  }
  if (!Array.isArray(contract.publicExports)
      || !contract.publicExports.every((value) => typeof value === 'string')
      || new Set(contract.publicExports).size !== contract.publicExports.length
      || !sameJson(contract.publicExports, [...contract.publicExports].sort(compareText))
      || !sameJson(contract.commands, EXPECTED_COMMANDS)
      || contract.maximumConflictAttempts !== 3
      || !sameJson(contract.guardianIntervals, [3, 7, 14, 30, 60, 90])) {
    throw new Error('A3 portable module contract drifted from the certified command and revision boundary.');
  }
  return contract;
}

async function fileEvidence(repoRoot, paths) {
  return Promise.all(paths.map(async (relativePath) => ({
    path: relativePath,
    sha256: sha256(await readFile(path.join(repoRoot, relativePath))),
  })));
}

async function collectA3ImportPolicy(repoRoot) {
  const allowedTargets = new Map(A3_SOURCE_PATHS
    .filter((relativePath) => relativePath !== A3_ENTRY)
    .map((relativePath) => [
      `./${path.posix.basename(relativePath)}`,
      relativePath,
    ]));
  allowedTargets.set('../index.js', 'shared/spelling/mobile/index.js');
  allowedTargets.set('../../core/index.js', A1_ENTRY);
  const records = [];
  const violations = [];

  try {
    await build({
      entryPoints: [A3_ENTRY],
      absWorkingDir: repoRoot,
      bundle: true,
      write: false,
      platform: 'neutral',
      format: 'esm',
      logLevel: 'silent',
      plugins: [{
        name: 'spelling-mobile-a3-import-policy',
        setup(buildContext) {
          buildContext.onResolve({ filter: /.*/ }, async (args) => {
            if (args.kind === 'entry-point') return undefined;
            const absoluteImporter = path.isAbsolute(args.importer)
              ? args.importer
              : path.resolve(repoRoot, args.importer);
            const importer = repoRelativePath(repoRoot, absoluteImporter);
            if (!importer.startsWith(`${A3_DIRECTORY}/`)) return undefined;

            let resolved = null;
            if (args.path.startsWith('.')) {
              const requestedTarget = path.resolve(args.resolveDir || repoRoot, args.path);
              try {
                resolved = repoRelativePath(repoRoot, await realpath(requestedTarget));
              } catch {
                resolved = repoRelativePath(repoRoot, requestedTarget);
              }
            }
            const record = {
              importer,
              kind: args.kind,
              specifier: args.path,
              resolved,
            };
            records.push(record);
            const expectedTarget = allowedTargets.get(args.path);
            if (args.kind !== 'import-statement' || resolved !== expectedTarget) {
              violations.push(record);
              return { path: args.path, external: true };
            }
            return undefined;
          });
        },
      }],
    });
  } catch (error) {
    throw new Error('A3 import graph could not be parsed safely.', { cause: error });
  }

  const sortedRecords = records.sort((left, right) => (
    compareText(left.importer, right.importer)
    || compareText(left.specifier, right.specifier)
    || compareText(left.kind, right.kind)
    || compareText(String(left.resolved), String(right.resolved))
  ));
  if (violations.length > 0) {
    const [violation] = violations.sort((left, right) => (
      compareText(left.importer, right.importer)
      || compareText(left.specifier, right.specifier)
      || compareText(left.kind, right.kind)
    ));
    throw new Error(
      `${violation.importer} has a forbidden A3 import: ${violation.specifier} (${violation.kind}).`,
    );
  }

  const expectedSpecifiers = [...allowedTargets.keys()].sort(compareText);
  const actualSpecifiers = [...new Set(sortedRecords.map(({ specifier }) => specifier))]
    .sort(compareText);
  if (!sameJson(actualSpecifiers, expectedSpecifiers)) {
    throw new Error('A3 import allow-list is not exercised by the exact certified closure.');
  }
  return {
    allowedSpecifiers: expectedSpecifiers,
    records: sortedRecords,
    violationCount: 0,
  };
}

function monsterBoundaryMatrix(fullCatalogue) {
  const entries = fullCatalogue.rewardTracks.map((track) => ({
    rewardTrackId: track.rewardTrackId,
    packId: track.packId,
    monsterId: track.monsterId,
    ...(track.yearBand === undefined ? {} : { yearBand: track.yearBand }),
    ...(track.sourceRewardTrackIds === undefined
      ? {}
      : { sourceRewardTrackIds: [...track.sourceRewardTrackIds] }),
    thresholds: [...track.thresholds],
  }));
  const expected = [
    {
      rewardTrackId: 'spelling-core-inklet', packId: 'ks2-core', monsterId: 'inklet',
      yearBand: '3-4', thresholds: [1, 10, 30, 60, 100],
    },
    {
      rewardTrackId: 'spelling-core-glimmerbug', packId: 'ks2-core', monsterId: 'glimmerbug',
      yearBand: '5-6', thresholds: [1, 10, 30, 60, 100],
    },
    {
      rewardTrackId: 'spelling-core-phaeton', packId: 'ks2-core', monsterId: 'phaeton',
      sourceRewardTrackIds: ['spelling-core-inklet', 'spelling-core-glimmerbug'],
      thresholds: [3, 25, 95, 145, 213],
    },
  ];
  if (!sameJson(entries, expected)) {
    throw new Error('A3 Monster boundary matrix drifted from the frozen Full catalogue.');
  }
  return entries;
}

export async function buildMobileSpellingA3Manifest({ repoRoot: rawRepoRoot } = {}) {
  if (!rawRepoRoot) throw new TypeError('repoRoot is required.');
  const repoRoot = await realpath(path.resolve(filesystemPath(rawRepoRoot)));
  const a2Manifest = await pinnedJson(repoRoot, AUTHORITY.a2Manifest, 'A2 manifest');
  await pinnedJson(repoRoot, AUTHORITY.a1Manifest, 'A1 manifest');
  const starterCatalogue = await pinnedJson(
    repoRoot,
    AUTHORITY.catalogues.starter,
    'Starter catalogue',
  );
  const fullCatalogue = await pinnedJson(repoRoot, AUTHORITY.catalogues.full, 'Full catalogue');
  if (a2Manifest?.authority?.a1ManifestSha256 !== AUTHORITY.a1Manifest.sha256
      || a2Manifest?.catalogues?.files?.find(
        ({ path: value }) => value === AUTHORITY.catalogues.starter.path,
      )?.sha256 !== AUTHORITY.catalogues.starter.sha256
      || a2Manifest?.catalogues?.files?.find(
        ({ path: value }) => value === AUTHORITY.catalogues.full.path,
      )?.sha256 !== AUTHORITY.catalogues.full.sha256
      || starterCatalogue.catalogueId !== 'ks2-core:starter'
      || fullCatalogue.catalogueId !== 'ks2-core:full') {
    throw new Error('A3 authority chain does not match the frozen A1/A2 contracts.');
  }

  const importPolicy = await collectA3ImportPolicy(repoRoot);
  const boundary = await verifySpellingCoreBoundary({
    repoRoot,
    coreRoot: A3_ROOT,
    entry: A3_ENTRY,
  });
  if (!boundary.ok
      || boundary.resolvedInputsOutsideCore !== 0
      || !sameJson(boundary.inputs, EXPECTED_RUNTIME_PATHS)) {
    throw new Error('A3 portable runtime boundary verification failed.');
  }
  const moduleContract = collectModuleContract(repoRoot);
  const parityBytes = await readFile(path.join(repoRoot, PARITY_FIXTURE));
  const parity = JSON.parse(parityBytes.toString('utf8'));
  if (parity?.schemaVersion !== 1
      || !Array.isArray(parity.scenarios)
      || parity.scenarios.length !== 9
      || new Set(parity.scenarios.map(({ id }) => id)).size !== 9) {
    throw new Error('A3 parity fixture does not contain the nine certified scenarios.');
  }

  return {
    schemaVersion: 1,
    authority: {
      a2MergedCommit: AUTHORITY.a2MergedCommit,
      a2Manifest: { ...AUTHORITY.a2Manifest },
      a1Manifest: { ...AUTHORITY.a1Manifest },
      catalogues: {
        starter: { ...AUTHORITY.catalogues.starter },
        full: { ...AUTHORITY.catalogues.full },
      },
    },
    runtime: {
      root: A3_ROOT,
      entry: A3_ENTRY,
      files: await fileEvidence(repoRoot, EXPECTED_RUNTIME_PATHS),
      publicExports: moduleContract.publicExports,
      importPolicy,
      boundary: {
        status: 'pass',
        resolvedInputsOutsideCore: boundary.resolvedInputsOutsideCore,
        issueCount: boundary.issues.length,
      },
    },
    commands: {
      allowList: [...EXPECTED_COMMANDS],
      commandCount: EXPECTED_COMMANDS.length,
      parityFixture: {
        path: PARITY_FIXTURE,
        sha256: sha256(parityBytes),
        scenarioCount: parity.scenarios.length,
      },
    },
    atomicity: {
      failureCheckpoints: [...FAILURE_CHECKPOINTS],
      failureCheckpointCount: FAILURE_CHECKPOINTS.length,
      maximumConflictAttempts: moduleContract.maximumConflictAttempts,
      certifiedClock: {
        requiredPort: 'now',
        samplesPerAttempt: 1,
        plannerContextKeys: ['nowMs', 'todayGuardianDay'],
        validatorOption: 'expectedNowMs',
        revisionEvidenceField: 'projections.revisionMission.todayGuardianDay',
        appendedEventTimestampField: 'appendedEvents[].createdAt',
        practiceSessionTimestampFields: ['startedAt', 'updatedAt', 'completedAt'],
      },
    },
    monsters: {
      boundaryMatrix: monsterBoundaryMatrix(fullCatalogue),
    },
    revision: {
      guardianIntervals: [...moduleContract.guardianIntervals],
      eligibleMissionKinds: ['first-patrol', 'wobbling', 'due'],
      optionalPatrolAllowed: false,
      campTupleFields: ['learnerId', 'packId', 'canonicalGuardianDay'],
      campCreditDeltas: [0, 1],
    },
    parent: {
      forbiddenKeyRegex: 'monster|camp|reward.?track|branch|high.?water',
      testedChildCount: 2,
    },
    exclusions: {
      crossSubjectLeakageCount: boundary.inputs.filter(
        (relativePath) => !relativePath.startsWith('shared/spelling/'),
      ).length,
      extraLeakageCount: fullCatalogue.rewardTracks.filter(
        ({ packId }) => packId === 'extra-vocabulary',
      ).length,
      vellhornLeakageCount: fullCatalogue.rewardTracks.filter(
        ({ monsterId }) => monsterId === 'vellhorn',
      ).length,
    },
  };
}

export function serialiseMobileSpellingA3Manifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
