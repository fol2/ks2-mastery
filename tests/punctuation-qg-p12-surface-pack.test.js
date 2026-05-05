import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPunctuationQGP12SurfacePack } from '../scripts/build-punctuation-qg-p12-surface-pack.mjs';

test('P12 surface pack covers the full P20-expanded pool and product journeys', () => {
  // P20 update: the surface-pack script reads from live source. The script's
  // "punctuation-qg-p12" phase label is legacy; the pack now reflects the
  // live P20 pool. The release ID matches PUNCTUATION_RELEASE_ID at run time.
  const pack = buildPunctuationQGP12SurfacePack();

  assert.equal(pack.phase, 'punctuation-qg-p12');
  assert.match(pack.releaseId, /^punctuation-qg-p\d+-\d+-\d{4}-\d{2}-\d{2}$/);
  assert.equal(pack.summary.productionDepth, 120);
  assert.equal(pack.summary.fixedCount, 512);
  assert.equal(pack.summary.generatedCount, 14560);
  assert.equal(pack.summary.totalItems, 15072);
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
