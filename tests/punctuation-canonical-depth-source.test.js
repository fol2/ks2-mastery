import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createPunctuationRuntimeManifest,
  PRODUCTION_DEPTH,
} from '../shared/punctuation/generators.js';
import {
  PUNCTUATION_CONTENT_MANIFEST,
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import { createPunctuationService } from '../shared/punctuation/service.js';

// ---------------------------------------------------------------------------
// Canonical production depth source — drift prevention gate.
//
// PRODUCTION_DEPTH in shared/punctuation/generators.js is THE single source
// of truth for how many generated items per family are expanded at runtime.
// Prior to P7-U2 the service maintained an independent constant
// (GENERATED_ITEMS_PER_FAMILY) that could drift silently. This test suite
// ensures:
//
//   1. The service uses the canonical PRODUCTION_DEPTH (no local duplicate).
//   2. The runtime manifest item count matches the expected formula:
//        FIXED_COUNT + FAMILY_COUNT * PRODUCTION_DEPTH
//   3. No hardcoded production-depth duplicates are introduced in source.
//
// Depth-6 activation path: raise PRODUCTION_DEPTH from 4 to 6 in
// generators.js once all P5 capacity gates pass at depth 6. The single
// constant update propagates to both generators and service automatically.
//
// P7-U2  |  canonical depth source
// ---------------------------------------------------------------------------

const FIXED_ITEM_COUNT = PUNCTUATION_CONTENT_MANIFEST.items.filter(
  (item) => item.source === 'fixed',
).length;
const FAMILY_COUNT = PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length;

test('PRODUCTION_DEPTH is 4 (current production setting)', () => {
  assert.equal(PRODUCTION_DEPTH, 4);
});

test('runtime manifest item count matches FIXED + FAMILIES * PRODUCTION_DEPTH', () => {
  const manifest = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });
  const expectedTotal = FIXED_ITEM_COUNT + FAMILY_COUNT * PRODUCTION_DEPTH;
  assert.equal(manifest.items.length, expectedTotal);
});

test('createPunctuationService default manifest uses PRODUCTION_DEPTH', () => {
  const service = createPunctuationService({
    now: () => 1_800_000_000_000,
    random: () => 0.5,
  });
  const stats = service.getStats('depth-parity-learner');
  const expectedTotal = FIXED_ITEM_COUNT + FAMILY_COUNT * PRODUCTION_DEPTH;
  assert.equal(
    stats.total,
    expectedTotal,
    `Service total (${stats.total}) does not match canonical depth formula (${expectedTotal})`,
  );
});

test('service and standalone runtime manifest produce identical item counts', () => {
  const standaloneManifest = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });
  const standaloneIndexes = createPunctuationContentIndexes(standaloneManifest);

  const service = createPunctuationService({
    now: () => 1_800_000_000_000,
    random: () => 0.5,
  });
  const stats = service.getStats('parity-learner');

  assert.equal(
    stats.total,
    standaloneIndexes.items.length,
    'Service item count diverges from standalone manifest — depth drift detected',
  );
});

test('no hardcoded production depth constant in service.js source', () => {
  const servicePath = resolve(import.meta.dirname, '..', 'shared', 'punctuation', 'service.js');
  const source = readFileSync(servicePath, 'utf8');

  // Must NOT contain a local constant duplicating the depth value.
  const driftPattern = /const\s+GENERATED_ITEMS_PER_FAMILY\s*=/;
  assert.doesNotMatch(
    source,
    driftPattern,
    'service.js must not define its own GENERATED_ITEMS_PER_FAMILY — use PRODUCTION_DEPTH from generators.js',
  );
});

test('service.js imports PRODUCTION_DEPTH from generators.js', () => {
  const servicePath = resolve(import.meta.dirname, '..', 'shared', 'punctuation', 'service.js');
  const source = readFileSync(servicePath, 'utf8');

  const importPattern = /import\s*\{[^}]*PRODUCTION_DEPTH[^}]*\}\s*from\s*['"]\.\/generators\.js['"]/;
  assert.match(
    source,
    importPattern,
    'service.js must import PRODUCTION_DEPTH from ./generators.js',
  );
});

test('no other punctuation source files define a hardcoded depth constant', () => {
  const sharedDir = resolve(import.meta.dirname, '..', 'shared', 'punctuation');
  const filesToCheck = ['service.js', 'scheduler.js', 'marking.js', 'content.js'];

  for (const filename of filesToCheck) {
    const filePath = resolve(sharedDir, filename);
    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch {
      continue; // File may not exist in all configurations.
    }
    const driftPattern = /const\s+(?:GENERATED_ITEMS_PER_FAMILY|ITEMS_PER_FAMILY|GEN_DEPTH)\s*=\s*\d+/;
    assert.doesNotMatch(
      source,
      driftPattern,
      `${filename} contains a hardcoded depth constant — use PRODUCTION_DEPTH from generators.js`,
    );
  }
});
