import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  ACHIEVEMENT_DEFINITIONS as canonicalAchievements,
} from '../shared/spelling/core/achievements.js';
import {
  SPELLING_PATTERNS as canonicalPatterns,
} from '../shared/spelling/core/content/patterns.js';
import {
  SPELLING_COVERAGE_TIERS as canonicalCoverageTiers,
} from '../shared/spelling/core/content/taxonomy.js';
import {
  ACHIEVEMENT_DEFINITIONS as subjectAchievements,
} from '../src/subjects/spelling/achievements.js';
import {
  SPELLING_PATTERNS as subjectPatterns,
} from '../src/subjects/spelling/content/patterns.js';
import {
  SPELLING_COVERAGE_TIERS as subjectCoverageTiers,
} from '../src/subjects/spelling/content/taxonomy.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

test('subject spelling leaves re-export the portable canonical objects', () => {
  assert.equal(subjectAchievements, canonicalAchievements);
  assert.equal(subjectPatterns, canonicalPatterns);
  assert.equal(subjectCoverageTiers, canonicalCoverageTiers);
});

test('published mobile spelling manifests retain their referenced evidence', () => {
  const sourceManifest = JSON.parse(readFileSync(
    resolve(REPO_ROOT, 'content/spelling.mobile-source-manifest.json'),
    'utf8',
  ));
  const a1Manifest = JSON.parse(readFileSync(
    resolve(REPO_ROOT, 'content/spelling.mobile-a1-kernel-manifest.json'),
    'utf8',
  ));
  const goldenPath = resolve(REPO_ROOT, a1Manifest.golden.path);

  assert.equal(existsSync(resolve(REPO_ROOT, sourceManifest.designSpec)), true);
  assert.equal(existsSync(goldenPath), true);
  assert.equal(
    createHash('sha256').update(readFileSync(goldenPath)).digest('hex'),
    a1Manifest.golden.sha256,
  );
});

test('published mobile spelling package commands reference tracked paths', () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
  const publishedCommands = Object.entries(packageJson.scripts)
    .filter(([name]) => name.startsWith('spelling:mobile:') || name.startsWith('verify:spelling-mobile:'));
  const missingPaths = [];

  for (const [name, command] of publishedCommands) {
    const referencedPaths = command.match(/(?:scripts|tests)\/[A-Za-z0-9_./-]+\.(?:js|mjs|json|md)/g) ?? [];
    for (const path of referencedPaths) {
      if (!existsSync(resolve(REPO_ROOT, path))) missingPaths.push(`${name}: ${path}`);
    }
  }

  assert.deepEqual(missingPaths, []);
});

test('published mobile spelling verification entry points pass from the repository tree', () => {
  const commands = [
    ['scripts/build-spelling-mobile-source-manifest.mjs', '--check'],
    ['scripts/verify-spelling-core-boundary.mjs'],
    ['scripts/build-spelling-mobile-a2-runtime.mjs', '--check'],
    ['scripts/build-spelling-mobile-a3-contracts.mjs', '--check'],
  ];

  for (const args of commands) {
    const result = spawnSync(process.execPath, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `${args.join(' ')} failed:\n${result.stdout}${result.stderr}`,
    );
  }
});
