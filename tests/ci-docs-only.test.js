import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isDocsOnlyChange,
  isDocumentationPath,
  normaliseChangedFiles,
} from '../scripts/ci-docs-only.mjs';

test('normaliseChangedFiles removes empty lines and whitespace', () => {
  assert.deepEqual(
    normaliseChangedFiles('docs/a.md\n\n src/app.jsx \r\n'),
    ['docs/a.md', 'src/app.jsx'],
  );
});

test('isDocumentationPath accepts docs directory files and Markdown files', () => {
  assert.equal(isDocumentationPath('docs/operations/capacity.md'), true);
  assert.equal(isDocumentationPath('docs/evidence/report.json'), true);
  assert.equal(isDocumentationPath('README.md'), true);
  assert.equal(isDocumentationPath('.github/workflows/README.md'), true);
});

test('isDocumentationPath rejects runtime, CI config, and public index files', () => {
  assert.equal(isDocumentationPath('src/app.jsx'), false);
  assert.equal(isDocumentationPath('.github/workflows/node-test.yml'), false);
  assert.equal(isDocumentationPath('llms.txt'), false);
  assert.equal(isDocumentationPath('public/sitemap.xml'), false);
});

test('isDocsOnlyChange requires a non-empty all-documentation change set', () => {
  assert.equal(isDocsOnlyChange([]), false);
  assert.equal(
    isDocsOnlyChange([
      'docs/operations/capacity.md',
      'docs/evidence/report.json',
      'README.md',
    ]),
    true,
  );
  assert.equal(
    isDocsOnlyChange([
      'docs/operations/capacity.md',
      'src/app.jsx',
    ]),
    false,
  );
});
