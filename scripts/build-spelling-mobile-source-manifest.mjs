import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSpellingMobileSourceManifest,
  serialiseSpellingMobileSourceManifest,
} from './lib/spelling-mobile-source-manifest.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(repoRoot, 'content/spelling.mobile-source-manifest.json');
const canonicaliseLineEndings = (value) => value.replaceAll('\r\n', '\n');
const requireFullHistory = process.argv.includes('--require-full-history');
const expected = serialiseSpellingMobileSourceManifest(
  buildSpellingMobileSourceManifest({ repoRoot, requireFullHistory }),
);

if (process.argv.includes('--check')) {
  try {
    const actual = readFileSync(outputPath, 'utf8');
    if (canonicaliseLineEndings(actual) !== expected) {
      console.error('Mobile spelling source manifest is stale. Run npm run spelling:mobile:source-manifest.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Mobile spelling source manifest is missing: ${error.message}`);
    process.exitCode = 1;
  }
} else {
  const temporaryOutputPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryOutputPath, expected, 'utf8');
    renameSync(temporaryOutputPath, outputPath);
  } finally {
    rmSync(temporaryOutputPath, { force: true });
  }
  console.log('Wrote content/spelling.mobile-source-manifest.json');
}
