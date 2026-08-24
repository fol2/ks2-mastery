#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildMobileSpellingA3Manifest,
  serialiseMobileSpellingA3Manifest,
} from './lib/spelling-mobile-a3-contracts.mjs';

const args = process.argv.slice(2);
if (args.some((argument) => argument !== '--check')
    || args.filter((argument) => argument === '--check').length > 1) {
  throw new TypeError('Usage: node scripts/build-spelling-mobile-a3-contracts.mjs [--check]');
}

const check = args[0] === '--check';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativePath = 'content/spelling.mobile-a3-contract-manifest.json';
const outputPath = path.join(repoRoot, relativePath);
const manifest = await buildMobileSpellingA3Manifest({ repoRoot });
const expected = serialiseMobileSpellingA3Manifest(manifest);

if (check) {
  const actual = await readFile(outputPath, 'utf8').catch((error) => (
    error?.code === 'ENOENT' ? null : Promise.reject(error)
  ));
  if (actual !== expected) throw new Error(`A3 contract artefact is stale: ${relativePath}`);
  process.stdout.write('A3 contract manifest is current.\n');
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, expected, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true });
  }
  process.stdout.write(`Wrote ${relativePath}\n`);
}
