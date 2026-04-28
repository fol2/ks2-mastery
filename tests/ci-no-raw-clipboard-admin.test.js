// P5 U2: CI invariant — no direct navigator.clipboard usage in Admin panels.
//
// All Admin*.jsx files in src/surfaces/hubs/ MUST use the safe-copy helper
// (admin-safe-copy.js) rather than calling navigator.clipboard directly.
// The only permitted exception is the safe-copy helper itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const searchDir = resolve(rootDir, 'src', 'surfaces', 'hubs');

test('no direct navigator.clipboard usage in Admin*.jsx files', () => {
  let output = '';
  try {
    // grep -rn for navigator.clipboard in Admin*.jsx files.
    output = execSync(
      `grep -rn "navigator\\.clipboard" "${searchDir}"/Admin*.jsx`,
      { encoding: 'utf8', cwd: rootDir },
    );
  } catch (err) {
    // grep exits 1 when no matches found — that is the expected success case.
    if (err.status === 1) {
      output = '';
    } else {
      throw err;
    }
  }

  if (output.trim()) {
    assert.fail(
      'Direct navigator.clipboard usage found in Admin panel files. ' +
      'Use the safe-copy helper (admin-safe-copy.js) instead.\n\n' +
      'Violations:\n' + output,
    );
  }
});
