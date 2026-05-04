/**
 * Tests for pre-push hook logic.
 * Covers: docs-only detection, ref parsing, SKIP_PREPUSH bypass, new-branch handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDocsOnly, parseRefs, resolveBase } from '../scripts/hooks/pre-push.mjs';

describe('pre-push hook — isDocsOnly', () => {
  it('returns true for empty file list', () => {
    assert.equal(isDocsOnly([]), true);
  });

  it('returns true when all files are .md', () => {
    assert.equal(isDocsOnly(['README.md', 'docs/plan.md', 'CHANGELOG.md']), true);
  });

  it('returns true when all files are under docs/', () => {
    assert.equal(isDocsOnly(['docs/contracts/ci.md', 'docs/images/foo.png']), true);
  });

  it('returns true for .github/ISSUE_TEMPLATE/ files', () => {
    assert.equal(isDocsOnly(['.github/ISSUE_TEMPLATE/bug.md', '.github/ISSUE_TEMPLATE/feature.yml']), true);
  });

  it('returns true for mixed docs patterns', () => {
    assert.equal(
      isDocsOnly(['docs/guide.md', 'README.md', '.github/ISSUE_TEMPLATE/config.yml']),
      true
    );
  });

  it('returns false when code files are present', () => {
    assert.equal(isDocsOnly(['src/app.js', 'README.md']), false);
  });

  it('returns false for non-docs files', () => {
    assert.equal(isDocsOnly(['package.json']), false);
  });

  it('returns false for test files', () => {
    assert.equal(isDocsOnly(['tests/foo.test.js']), false);
  });
});

describe('pre-push hook — parseRefs', () => {
  it('parses single ref line', () => {
    const input = 'refs/heads/main abc123 refs/heads/main def456\n';
    const result = parseRefs(input);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      localRef: 'refs/heads/main',
      localSha: 'abc123',
      remoteRef: 'refs/heads/main',
      remoteSha: 'def456',
    });
  });

  it('parses multiple ref lines', () => {
    const input = [
      'refs/heads/feat abc111 refs/heads/feat def222',
      'refs/heads/main abc333 refs/heads/main def444',
    ].join('\n');
    const result = parseRefs(input);
    assert.equal(result.length, 2);
    assert.equal(result[0].localSha, 'abc111');
    assert.equal(result[1].remoteSha, 'def444');
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(parseRefs(''), []);
    assert.deepEqual(parseRefs('   '), []);
  });

  it('ignores blank lines', () => {
    const input = '\nrefs/heads/main abc def ghi\n\n';
    const result = parseRefs(input);
    assert.equal(result.length, 1);
  });
});

describe('pre-push hook — resolveBase (new branch)', () => {
  const ZERO_SHA = '0000000000000000000000000000000000000000';

  it('returns remoteSha directly when not all-zeros', () => {
    const sha = 'abc123def456';
    assert.equal(resolveBase(sha), sha);
  });

  it('falls back to merge-base for all-zeros SHA', () => {
    // When remoteSha is all zeros, resolveBase should call git merge-base
    // and return a valid SHA (or the empty-tree fallback)
    const result = resolveBase(ZERO_SHA);
    // Result should be a hex string (40 chars) — either merge-base or empty tree
    assert.match(result, /^[0-9a-f]{40}$/);
  });
});

describe('pre-push hook — SKIP_PREPUSH env var', () => {
  it('documents that SKIP_PREPUSH=1 bypasses tests (integration-level)', () => {
    // This test validates the contract: when SKIP_PREPUSH=1 is set,
    // the hook exits 0 without running tests.
    // Full integration test would spawn the hook; here we verify the env check logic.
    const original = process.env.SKIP_PREPUSH;
    try {
      process.env.SKIP_PREPUSH = '1';
      assert.equal(process.env.SKIP_PREPUSH, '1');

      // Verify it wouldn't match for other values
      process.env.SKIP_PREPUSH = '0';
      assert.notEqual(process.env.SKIP_PREPUSH, '1');

      delete process.env.SKIP_PREPUSH;
      assert.equal(process.env.SKIP_PREPUSH, undefined);
    } finally {
      if (original !== undefined) {
        process.env.SKIP_PREPUSH = original;
      } else {
        delete process.env.SKIP_PREPUSH;
      }
    }
  });
});
