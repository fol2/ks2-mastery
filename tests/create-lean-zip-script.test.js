import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EXCLUDES,
  REVIEW_INCLUDE_GLOBS,
  globToRegex,
  parseArgs,
} from '../scripts/create-lean-zip.mjs';

test('create-lean-zip defaults to the review profile and omission mode', () => {
  const { config } = parseArgs([]);

  assert.equal(config.profile, 'review');
  assert.equal(config.mode, 'omit');
  assert.equal(config.maxMb, 25);
  assert.deepEqual(config.includes, REVIEW_INCLUDE_GLOBS);
  assert.ok(config.excludes.includes('reports/**'));
  assert.equal(config.excludes.includes('docs/plans/**'), false);
});

test('create-lean-zip tracked profile selects all tracked files before excludes', () => {
  const { config } = parseArgs(['--profile', 'tracked']);

  assert.equal(config.profile, 'tracked');
  assert.equal(config.mode, 'omit');
  assert.deepEqual(config.includes, []);
  assert.deepEqual(config.excludes, [...DEFAULT_EXCLUDES, 'docs/plans/**']);
});

test('create-lean-zip tracked profile is not narrowed by include globs', () => {
  const { config } = parseArgs(['--profile', 'tracked', '--include', 'docs/operations/**']);

  assert.equal(config.profile, 'tracked');
  assert.deepEqual(config.includes, []);
});

test('create-lean-zip accepts extra review include globs', () => {
  const { config } = parseArgs(['--include', 'docs/operations/**']);

  assert.equal(config.profile, 'review');
  assert.ok(config.includes.includes('docs/operations/**'));
  assert.equal(config.includes.filter((glob) => glob === 'docs/operations/**').length, 1);
});

test('create-lean-zip glob matcher supports recursive markdown globs', () => {
  const docsMarkdown = globToRegex('docs/**/*.md');

  assert.equal(docsMarkdown.test('docs/architecture.md'), true);
  assert.equal(docsMarkdown.test('docs/plans/james/audit.md'), true);
  assert.equal(docsMarkdown.test('docs/plans/james/audit.json'), false);
});

test('create-lean-zip glob matcher supports recursive directory excludes', () => {
  const docsPlans = globToRegex('docs/plans/**');

  assert.equal(docsPlans.test('docs/plans/james/grammar/audit.md'), true);
  assert.equal(docsPlans.test('docs/operations/capacity.md'), false);
});
