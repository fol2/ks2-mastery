import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildMobileSpellingA2Manifest } from '../scripts/lib/spelling-mobile-a2-runtime.mjs';

const committed = JSON.parse(readFileSync(
  new URL('../content/spelling.mobile-a2-contract-manifest.json', import.meta.url), 'utf8',
));

test('A2 certification manifest is current and pins A1 authority', async () => {
  const actual = await buildMobileSpellingA2Manifest(new URL('..', import.meta.url));
  assert.deepEqual(committed, actual);
  assert.deepEqual(actual.authority, {
    a1MergedCommit: '05e01aaac47126ffcf840530f1cde230407fb9e5',
    a1ManifestSha256: '51af549ce31a30adc021d5fa0bd6a70ed9de2366887add0df3fc7f8f42dc312f',
    a0ManifestSha256: '364b638abc6dcd0ddb61c1d814fce9dc4e013450a01b68d306186391608058e7',
    packConfigSha256: '2be67d2e3911e19dee0adc7db527878c87bb670bbc396d1688236d9a7fe4b1d1',
  });
  assert.deepEqual(actual.catalogues.counts, { starter: 20, full: 213 });
  assert.deepEqual(actual.catalogues.inventorySha256, {
    starter: '8fb6a2f7e8f8dcea6199843fa78685a21c48c40e29456b93e94b9bc89f834364',
    full: 'f24755467f424b6a7d044ed7bbc7599cdbde0bdf8fa14c6e7fba77c3980fff06',
  });
  assert.equal(actual.catalogues.sharedIdentityMismatchCount, 0);
  assert.equal(actual.catalogues.duplicateNormalisedTargetCount, 0);
  assert.deepEqual(actual.catalogues.excludedTierLeakage, {
    secureExtension: 0,
    enrichmentExtra: 0,
  });
  assert.match(actual.hostileFixtures.sha256, /^[a-f0-9]{64}$/);
});
