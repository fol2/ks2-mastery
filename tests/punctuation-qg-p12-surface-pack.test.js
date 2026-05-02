import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPunctuationQGP12SurfacePack } from '../scripts/build-punctuation-qg-p12-surface-pack.mjs';

test('P12 surface pack covers the full 3,312-item pool and product journeys', () => {
  const pack = buildPunctuationQGP12SurfacePack();

  assert.equal(pack.phase, 'punctuation-qg-p12');
  assert.equal(pack.releaseId, 'punctuation-qg-p12-3000-2026-05-02');
  assert.equal(pack.summary.productionDepth, 100);
  assert.equal(pack.summary.fixedCount, 512);
  assert.equal(pack.summary.generatedCount, 2800);
  assert.equal(pack.summary.totalItems, 3312);
  assert.equal(pack.summary.productAuditStatus, 'PASS');
  assert.equal(pack.humanReviewStatus.complete, false);
  assert.ok(pack.summary.productServiceSurfacedItemCount >= 60);
  assert.ok(pack.summary.journeyCount >= 24);
  assert.ok(pack.summary.surfaceKinds['first-click'] >= 1);
  assert.ok(pack.summary.surfaceKinds.retry >= 1);
  assert.ok(pack.summary.surfaceKinds['mixed-review'] >= 1);
  assert.ok(pack.summary.surfaceKinds['due-review'] >= 1);
  assert.ok(pack.summary.surfaceKinds['spaced-return'] >= 1);
});
