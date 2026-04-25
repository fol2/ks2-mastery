#!/usr/bin/env node
// U7 (sys-hardening p1): compute SHA-256 of the inline theme script
// block embedded in `index.html` so the CSP `script-src` can list it
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

/**
 * Extract the first `<script>...</script>` block that does NOT carry a
 * `src="..."` attribute (inline script). Returns the raw character data
 * between the opening and closing tags, preserving whitespace.
 *
 * The app's `index.html` has exactly one such inline block — the theme
 * bootstrapper at lines 25-34 — and one external `<script src=...>`
 * that loads the app bundle. If a future change adds a second inline
 * block we must either hash it too or fail the build; this helper
 * throws when more than one inline block is present.
 *
 * @param {string} html
 * @returns {string} inline script contents
 */
export function extractInlineScriptContents(html) {
  if (typeof html !== 'string') {
    throw new TypeError('extractInlineScriptContents: html must be a string.');
  }
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const inlineBlocks = [];
  let match = pattern.exec(html);
  while (match) {
    const attributes = String(match[1] || '');
    const body = match[2] || '';
    if (!/\bsrc\s*=/i.test(attributes)) {
      inlineBlocks.push(body);
    }
    match = pattern.exec(html);
  }
  if (inlineBlocks.length === 0) {
    throw new Error('No inline <script> block found in HTML. CSP hash cannot be computed.');
  }
  if (inlineBlocks.length > 1) {
    throw new Error(
      `Expected exactly one inline <script> block, found ${inlineBlocks.length}. `
      + 'Update scripts/compute-inline-script-hash.mjs if multi-inline support is intentional.',
    );
  }
  return inlineBlocks[0];
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
 * Read the HTML file at `htmlPath` and return its CSP hash.
 *
 * @param {string} [htmlPath]
 * @returns {Promise<string>}
 */
export async function computeInlineScriptHashFromFile(htmlPath = DEFAULT_HTML_PATH) {
  const html = await readFile(htmlPath, 'utf8');
  return computeInlineScriptHash(html);
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
  const hash = await computeInlineScriptHashFromFile(htmlPath);
  process.stdout.write(`${hash}\n`);
}
