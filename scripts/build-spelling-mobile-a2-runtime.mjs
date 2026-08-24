#!/usr/bin/env node
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildMobileSpellingA2Manifest,
  buildMobileSpellingA2Runtime,
} from './lib/spelling-mobile-a2-runtime.mjs';

const args = process.argv.slice(2);
if (args.some((argument) => argument !== '--check')
    || args.filter((argument) => argument === '--check').length > 1) {
  throw new TypeError('Usage: node scripts/build-spelling-mobile-a2-runtime.mjs [--check]');
}
const check = args[0] === '--check';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const runtime = await buildMobileSpellingA2Runtime(repoRoot);
const manifest = await buildMobileSpellingA2Manifest(repoRoot);
const outputs = new Map([
  ['content/spelling.mobile-a2-contract-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
  ['content/spelling.mobile-runtime-starter.json', `${JSON.stringify(runtime.starter, null, 2)}\n`],
  ['content/spelling.mobile-runtime-full.json', `${JSON.stringify(runtime.full, null, 2)}\n`],
]);

for (const [relativePath, expected] of outputs) {
  const target = join(repoRoot, relativePath);
  if (check) {
    const actual = await readFile(target, 'utf8').catch((error) => (
      error?.code === 'ENOENT' ? null : Promise.reject(error)
    ));
    if (actual !== expected) throw new Error(`A2 runtime artefact is stale: ${relativePath}`);
    continue;
  }
  const temporary = join(dirname(target), `.${relativePath.split('/').at(-1)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, expected, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
