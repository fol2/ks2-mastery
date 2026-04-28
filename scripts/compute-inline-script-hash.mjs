#!/usr/bin/env node
// U7 (sys-hardening p1): compute SHA-256 of the intentional inline script
// blocks embedded in `index.html` so the CSP `script-src` can list them
// via `'sha256-<base64>'` instead of falling back to `unsafe-inline`.
//
// CLI usage:
//   node ./scripts/compute-inline-script-hash.mjs [--html <path>]
// Outputs the hash in CSP format: `sha256-<base64>` (no backticks, no
// quotes). Also exported as a function for the build step to reuse.
//
// The script contents are matched byte-for-byte. CSP's hash directive
// covers the literal text between `<script>` and `</script>`, including
// leading/trailing whitespace — browsers compute the digest over the
// exact character data node. Be careful when editing `index.html`: any
// whitespace change inside the script block invalidates the deployed
// CSP hash until the build regenerates it.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HTML_PATH = path.resolve(__dirname, '..', 'index.html');

function extractInlineScriptBlocks(html) {
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const inlineBlocks = [];
  let match = pattern.exec(html);
  while (match) {
    const attributes = String(match[1] || '');
    const body = match[2] || '';
    if (!/\bsrc\s*=/i.test(attributes)) {
      inlineBlocks.push({ attributes, body });
    }
    match = pattern.exec(html);
  }
  return inlineBlocks;
}

function assertExpectedIndexInlineScripts(blocks) {
  if (blocks.length !== 2) {
    throw new Error(
      `Expected exactly two intentional inline <script> blocks in index.html, found ${blocks.length}. `
      + 'Only the theme bootstrapper and JSON-LD product identity may be inline.',
    );
  }

  const [themeBootstrap, jsonLdIdentity] = blocks;
  if (themeBootstrap.attributes.trim() !== '') {
    throw new Error('The first inline <script> in index.html must be the attribute-free theme bootstrapper.');
  }

  const jsonLdAttributes = jsonLdIdentity.attributes.trim();
  if (!/^type\s*=\s*["']application\/ld\+json["']$/i.test(jsonLdAttributes)) {
    throw new Error(
      'The second inline <script> in index.html must be the JSON-LD product identity. '
      + `Found attributes: ${jsonLdAttributes || '(none)'}`,
    );
  }

  try {
    JSON.parse(jsonLdIdentity.body);
  } catch (error) {
    throw new Error(`The JSON-LD inline script in index.html must contain valid JSON: ${error?.message || error}`);
  }
}

/**
 * Extract `<script>...</script>` blocks that do NOT carry a `src="..."`
 * attribute. Returns each raw character-data body between the opening and
 * closing tags, preserving whitespace.
 *
 * The app's `index.html` intentionally has more than one inline block now:
 * the executable theme bootstrapper and non-executing JSON-LD product
 * identity. CSP still needs to know about every intentional inline script
 * element, so callers should usually use `computeInlineScriptHashes()`.
 *
 * @param {string} html
 * @returns {string[]} inline script contents
 */
export function extractInlineScriptContentsList(html) {
  if (typeof html !== 'string') {
    throw new TypeError('extractInlineScriptContentsList: html must be a string.');
  }
  const inlineBlocks = extractInlineScriptBlocks(html).map((block) => block.body);
  if (inlineBlocks.length === 0) {
    throw new Error('No inline <script> block found in HTML. CSP hash cannot be computed.');
  }
  return inlineBlocks;
}

/**
 * Backwards-compatible single-script extractor. This remains for existing
 * callers and tests that care about the first inline script only.
 *
 * @param {string} html
 * @returns {string} first inline script contents
 */
export function extractInlineScriptContents(html) {
  return extractInlineScriptContentsList(html)[0];
}

/**
 * Compute the CSP-formatted hash for the inline theme script.
 *
 * @param {string} html
 * @returns {string} e.g. `sha256-abc...=`
 */
export function computeInlineScriptHash(html) {
  const script = extractInlineScriptContents(html);
  const digest = createHash('sha256').update(script, 'utf8').digest('base64');
  return `sha256-${digest}`;
}

/**
 * Compute CSP-formatted hashes for every intentional inline script block.
 *
 * @param {string} html
 * @returns {string[]} e.g. [`sha256-abc...=`]
 */
export function computeInlineScriptHashes(html) {
  if (typeof html !== 'string') {
    throw new TypeError('computeInlineScriptHashes: html must be a string.');
  }
  const blocks = extractInlineScriptBlocks(html);
  if (blocks.length === 0) {
    throw new Error('No inline <script> block found in HTML. CSP hash cannot be computed.');
  }
  assertExpectedIndexInlineScripts(blocks);
  return blocks.map(({ body }) => {
    const digest = createHash('sha256').update(body, 'utf8').digest('base64');
    return `sha256-${digest}`;
  });
}

/**
 * Read the HTML file at `htmlPath` and return its CSP hash.
 *
 * @param {string} [htmlPath]
 * @returns {Promise<string>}
 */
export async function computeInlineScriptHashFromFile(htmlPath = DEFAULT_HTML_PATH) {
  const html = await readFile(htmlPath, 'utf8');
  return computeInlineScriptHash(html);
}

export async function computeInlineScriptHashesFromFile(htmlPath = DEFAULT_HTML_PATH) {
  const html = await readFile(htmlPath, 'utf8');
  return computeInlineScriptHashes(html);
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

// CLI entry — match on file URL rather than argv[1] so the script works
// on Windows where argv[1] is backslashed (see the pre-existing
// audit-client-bundle.mjs note in p1-baseline.md).
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const htmlPath = argValue('--html', DEFAULT_HTML_PATH);
  const hashes = await computeInlineScriptHashesFromFile(htmlPath);
  process.stdout.write(`${hashes.join('\n')}\n`);
}
