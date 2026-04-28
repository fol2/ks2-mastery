import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CANONICAL_PUBLIC_URLS = Object.freeze([
  'https://ks2.eugnel.uk/',
  'https://ks2.eugnel.uk/about/',
  'https://ks2.eugnel.uk/ks2-spelling-practice/',
  'https://ks2.eugnel.uk/ks2-grammar-practice/',
  'https://ks2.eugnel.uk/ks2-punctuation-practice/',
  'https://ks2.eugnel.uk/ks2-apostrophes-practice/',
  'https://ks2.eugnel.uk/year-5-spelling-practice/',
  'https://ks2.eugnel.uk/help-child-ks2-grammar-at-home/',
]);

test('SEO measurement baseline records canonical URLs and acquisition fields', async () => {
  const baseline = await readFile('docs/operations/seo-measurement-baseline.md', 'utf8');
  const runbook = await readFile('docs/operations/seo.md', 'utf8');

  for (const url of CANONICAL_PUBLIC_URLS) {
    assert.match(baseline, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(runbook, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const token of [
    'Search Console indexing state',
    'Impressions',
    'Clicks',
    'CTR',
    'Average position',
    'Cloudflare page views',
    'Referrers/source notes',
    'Next decision',
  ]) {
    assert.match(baseline, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const lane of [
    'Product identity',
    'Practice-tool intent',
    'Subject/problem intent',
    'Year and subject intent',
    'Parent-support intent',
  ]) {
    assert.match(baseline, new RegExp(lane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(baseline, /Worker observability is infrastructure telemetry, not organic acquisition analytics/);
  assert.match(baseline, /Analytics does not directly improve ranking/);
  assert.match(runbook, /AI-readable product identity/);
});

test('SEO operations docs reject fake analytics tokens and keyword chasing', async () => {
  const content = [
    await readFile('docs/operations/seo.md', 'utf8'),
    await readFile('docs/operations/seo-measurement-baseline.md', 'utf8'),
  ].join('\n');

  assert.doesNotMatch(content, /\bG-[A-Z0-9]{6,}\b|UA-\d+-\d+/);
  assert.doesNotMatch(content, /cf_web_analytics_token|YOUR_|PLACEHOLDER_TOKEN|TODO_TOKEN|VERIFICATION_TOKEN/i);
  assert.doesNotMatch(content, /analytics directly improves ranking/i);
  assert.doesNotMatch(content, /encourages broad keyword chasing|use broad keyword chasing/i);
  assert.match(content, /Do not add pages that require unverified curriculum coverage/);
});
