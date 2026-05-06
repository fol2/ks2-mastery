#!/usr/bin/env node
/**
 * Pre-push hook — runs `npm test` before allowing push.
 * Cross-platform: Linux / macOS / Windows (Git Bash).
 *
 * Git pre-push protocol: stdin provides lines of
 *   <local-ref> <local-sha> <remote-ref> <remote-sha>
 *
 * Exit 0 = allow push; non-zero = block push.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Testable helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const DOCS_PATTERN = /^(docs\/|.*\.md$|\.github\/ISSUE_TEMPLATE\/)/;

/**
 * Returns true when ALL changed files match docs-only patterns.
 * @param {string[]} files
 * @returns {boolean}
 */
export function isDocsOnly(files) {
  if (files.length === 0) return true; // nothing changed → skip
  return files.every((f) => DOCS_PATTERN.test(f));
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

/**
 * Parse pre-push stdin into ref pairs.
 * @param {string} raw
 * @returns {Array<{localRef: string, localSha: string, remoteRef: string, remoteSha: string}>}
 */
export function parseRefs(raw) {
  return raw
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

/**
 * Determine the base SHA to diff against.
 * If remoteSha is all-zeros (new branch), fall back to merge-base with origin/main.
 * @param {string} remoteSha
 * @returns {string}
 */
export function resolveBase(remoteSha) {
  if (remoteSha === ZERO_SHA) {
    const result = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      // Fallback: if merge-base fails, use empty tree
      return '4b825dc642cb6eb9a060e54bf899d15f3c338fb9'; // git empty tree
    }
    return result.stdout.trim();
  }
  return remoteSha;
}

// ---------------------------------------------------------------------------
// Main hook logic
// ---------------------------------------------------------------------------

function main() {
  // 1. Read stdin (git pipes ref info)
  let stdin = '';
  try {
    stdin = readFileSync(0, 'utf-8');
  } catch {
    // No stdin (e.g. delete push) → allow
  }

  // 2. If stdin is empty (delete push), allow
  const refs = parseRefs(stdin);
  if (refs.length === 0) {
    process.exit(0);
  }

  // 3. SKIP_PREPUSH escape hatch
  if (process.env.SKIP_PREPUSH === '1') {
    console.log('⚠ SKIP_PREPUSH=1 — bypassing pre-push tests');
    process.exit(0);
  }

  // 4. Compute changed files using first ref pair
  const { localSha, remoteSha } = refs[0];
  const base = resolveBase(remoteSha);

  const diffResult = spawnSync('git', ['diff', '--name-only', `${base}..${localSha}`], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (diffResult.status === 0) {
    const files = diffResult.stdout.trim().split('\n').filter(Boolean);
    if (isDocsOnly(files)) {
      console.log('docs-only — skipping tests');
      process.exit(0);
    }
  }

  // 5. Run npm test
  console.log('[pre-push] Running npm test...');
  const isWindows = process.platform === 'win32';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  const testResult = spawnSync(npmCmd, ['test'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: isWindows,
  });

  if (testResult.error) {
    if (testResult.error.code === 'ENOENT') {
      console.error('[pre-push] ERROR: npm not found. Ensure Node.js is on PATH.');
    } else {
      console.error(`[pre-push] ERROR: ${testResult.error.message}`);
    }
    process.exit(1);
  }

  // 6. Exit with test exit code
  process.exit(testResult.status ?? 1);
}

// Only run main when executed directly (not imported for testing)
const isDirectExecution =
  typeof process.argv[1] !== 'undefined' &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

// Also detect being called via simple-git-hooks (no process.argv[1] match but stdin available)
if (isDirectExecution || process.argv[1]?.endsWith('pre-push.mjs')) {
  main();
}
