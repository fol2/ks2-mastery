import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import * as manifest from '../shared/punctuation/scheduler-manifest.js';

describe('punctuation scheduler manifest', () => {
  it('exports all expected constants', () => {
    const expectedKeys = [
      'MAX_SAME_SIGNATURE_PER_SESSION',
      'MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS',
      'MAX_SAME_SIGNATURE_DAYS',
      'MISCONCEPTION_RETRY_WINDOW',
      'MISCONCEPTION_RETRY_PREFER_DIFFERENT_TEMPLATE',
      'SPACED_RETURN_MIN_DAYS',
      'RETENTION_AFTER_SECURE_MIN_DAYS',
      'REASON_TAGS',
      'EXPOSURE_WEIGHT_BLOCKED',
      'EXPOSURE_WEIGHT_PENALISED',
      'EXPOSURE_WEIGHT_DAY_AVOIDED',
    ];
    for (const key of expectedKeys) {
      assert.ok(key in manifest, `Missing export: ${key}`);
    }
  });

  it('constant count matches expected (drift test)', () => {
    const exportedKeys = Object.keys(manifest);
    assert.strictEqual(exportedKeys.length, 11, `Expected 11 exports, got ${exportedKeys.length}: ${exportedKeys.join(', ')}`);
  });

  it('REASON_TAGS is frozen with expected tags', () => {
    assert.ok(Object.isFrozen(manifest.REASON_TAGS));
    const expectedTags = ['due-review', 'weak-skill-repair', 'misconception-retry', 'spaced-return', 'mixed-review', 'retention-after-secure', 'breadth-gap', 'fallback'];
    const actualTags = Object.values(manifest.REASON_TAGS);
    assert.deepStrictEqual(actualTags.sort(), expectedTags.sort());
  });

  it('numeric constants are positive finite numbers', () => {
    const numerics = [
      manifest.MAX_SAME_SIGNATURE_PER_SESSION,
      manifest.MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS,
      manifest.MAX_SAME_SIGNATURE_DAYS,
      manifest.MISCONCEPTION_RETRY_WINDOW,
      manifest.SPACED_RETURN_MIN_DAYS,
      manifest.RETENTION_AFTER_SECURE_MIN_DAYS,
      manifest.EXPOSURE_WEIGHT_BLOCKED,
      manifest.EXPOSURE_WEIGHT_PENALISED,
      manifest.EXPOSURE_WEIGHT_DAY_AVOIDED,
    ];
    for (const value of numerics) {
      assert.ok(Number.isFinite(value) && value > 0, `Expected positive finite, got: ${value}`);
    }
  });

  it('has no imports from sibling punctuation modules (manifest-leaf pattern)', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../shared/punctuation/scheduler-manifest.js', import.meta.url), 'utf-8');
    const importLines = source.split('\n').filter(line => /^\s*import\s/.test(line));
    assert.strictEqual(importLines.length, 0, `Manifest-leaf must have zero imports, found: ${importLines.join('; ')}`);
  });
});
