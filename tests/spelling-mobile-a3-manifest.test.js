import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  buildMobileSpellingA3Manifest,
  serialiseMobileSpellingA3Manifest,
} from '../scripts/lib/spelling-mobile-a3-contracts.mjs';

const ROOT = new URL('..', import.meta.url);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const committedBytes = readFileSync(
  new URL('../content/spelling.mobile-a3-contract-manifest.json', import.meta.url),
);

test('A3 contract manifest regenerates byte-for-byte and pins frozen authority', async () => {
  const actual = await buildMobileSpellingA3Manifest({ repoRoot: ROOT });
  assert.equal(serialiseMobileSpellingA3Manifest(actual), committedBytes.toString('utf8'));
  assert.deepEqual(actual.authority, {
    a2MergedCommit: '00cee5c4cfd520d583192222c95c994375ea6263',
    a2Manifest: {
      path: 'content/spelling.mobile-a2-contract-manifest.json',
      sha256: '3d6e00e60fa76d0c826a72b8da13ef7e81f7b74d1e39ea04257c6f29fa8d6805',
    },
    a1Manifest: {
      path: 'content/spelling.mobile-a1-kernel-manifest.json',
      sha256: '51af549ce31a30adc021d5fa0bd6a70ed9de2366887add0df3fc7f8f42dc312f',
    },
    catalogues: {
      starter: {
        path: 'content/spelling.mobile-runtime-starter.json',
        sha256: '1416895f3e191a8385891756a56e38c3bd9f72aa594061cef618554fbed0437a',
      },
      full: {
        path: 'content/spelling.mobile-runtime-full.json',
        sha256: '362a6642b1c69e494043fea2cf2b7204938ee101840858ebb9afe2857159d62d',
      },
    },
  });
  assert.equal(actual.runtime.entry, 'shared/spelling/mobile/a3/index.js');
  assert.equal(actual.runtime.files.length, 24);
  assert.equal(actual.runtime.publicExports.length, 34);
  assert.deepEqual(actual.commands.allowList, [
    'start-session', 'submit-answer', 'continue-session', 'skip-word',
    'end-session', 'save-prefs', 'acknowledge-persistence-warning',
  ]);
  assert.deepEqual(actual.commands.parityFixture, {
    path: 'tests/fixtures/spelling-a3/command-parity.json',
    sha256: 'f772540f31880bae15b31e78e736d78dbab2d41e103482c7b91d525192b15ad3',
    scenarioCount: 9,
  });
  assert.equal(actual.commands.parityFixture.sha256, sha256(readFileSync(
    new URL('../tests/fixtures/spelling-a3/command-parity.json', import.meta.url),
  )));
});

test('A3 manifest records exact Monster, Guardian, Camp, Parent and exclusion contracts', async () => {
  const manifest = await buildMobileSpellingA3Manifest({ repoRoot: ROOT });
  assert.deepEqual(manifest.atomicity, {
    failureCheckpoints: [
      'after-subject-state', 'after-practice-session', 'after-events',
      'after-monster-state', 'after-camp-state', 'after-revision', 'before-commit',
    ],
    failureCheckpointCount: 7,
    maximumConflictAttempts: 3,
    certifiedClock: {
      requiredPort: 'now',
      samplesPerAttempt: 1,
      plannerContextKeys: ['nowMs', 'todayGuardianDay'],
      validatorOption: 'expectedNowMs',
      revisionEvidenceField: 'projections.revisionMission.todayGuardianDay',
      appendedEventTimestampField: 'appendedEvents[].createdAt',
      practiceSessionTimestampFields: ['startedAt', 'updatedAt', 'completedAt'],
    },
  });
  assert.deepEqual(manifest.monsters.boundaryMatrix.map((entry) => ({
    monsterId: entry.monsterId,
    thresholds: entry.thresholds,
  })), [
    { monsterId: 'inklet', thresholds: [1, 10, 30, 60, 100] },
    { monsterId: 'glimmerbug', thresholds: [1, 10, 30, 60, 100] },
    { monsterId: 'phaeton', thresholds: [3, 25, 95, 145, 213] },
  ]);
  assert.deepEqual(manifest.revision.guardianIntervals, [3, 7, 14, 30, 60, 90]);
  assert.deepEqual(manifest.revision.campTupleFields, [
    'learnerId', 'packId', 'canonicalGuardianDay',
  ]);
  assert.deepEqual(manifest.parent, {
    forbiddenKeyRegex: 'monster|camp|reward.?track|branch|high.?water',
    testedChildCount: 2,
  });
  assert.deepEqual(manifest.exclusions, {
    crossSubjectLeakageCount: 0,
    extraLeakageCount: 0,
    vellhornLeakageCount: 0,
  });
});
