// Phase 4 U7 — AdultConfidenceChip SSR unit tests.
//
// Focused assertions on the extracted `AdultConfidenceChip` module itself:
//   - Renders nothing when `confidence` is null / undefined / empty.
//   - Renders the canonical label + sampleSize text when a canonical
//     projection is supplied.
//   - Renders `'Unknown'` (neutral tone) when the label is out-of-taxonomy —
//     NEVER silently falls back to `'emerging'`.
//   - Singular vs plural ("attempt" vs "attempts", "miss" vs "misses",
//     "template" vs "templates").
//   - Admin extras render only when `showAdminExtras` is true.
//
// SSR via bundled esbuild/React subprocess — same pattern as the hub tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderChip({ confidence, showAdminExtras = false }) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-adult-chip-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AdultConfidenceChip } from ${JSON.stringify(path.join(rootDir, 'src/subjects/grammar/components/AdultConfidenceChip.jsx'))};

      const confidence = ${JSON.stringify(confidence)};
      const showAdminExtras = ${JSON.stringify(showAdminExtras)};
      const html = renderToStaticMarkup(
        <div data-harness="adult-chip"><AdultConfidenceChip confidence={confidence} showAdminExtras={showAdminExtras} /></div>,
      );
      console.log(html);
    `);
    await build({
      absWorkingDir: rootDir,
      entryPoints: [entryPath],
      outfile: bundlePath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: ['node24'],
      jsx: 'automatic',
      jsxImportSource: 'react',
      loader: { '.js': 'jsx' },
      nodePaths: nodePaths(),
      logLevel: 'silent',
    });
    return execFileSync(process.execPath, [bundlePath], { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test('U7 chip: confidence=null renders nothing (harness wrapper stays empty)', async () => {
  const html = await renderChip({ confidence: null });
  const wrapper = html.match(/<div data-harness="adult-chip">[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(wrapper.length > 0);
  assert.doesNotMatch(wrapper, /grammar-adult-confidence/);
});

test('U7 chip: confidence={} (no label, no samples) renders nothing', async () => {
  const html = await renderChip({ confidence: {} });
  assert.doesNotMatch(html, /grammar-adult-confidence/);
});

test('U7 chip: canonical label renders label + sample count with proper tone class', async () => {
  const html = await renderChip({
    confidence: { label: 'secure', sampleSize: 10, intervalDays: 14, distinctTemplates: 5, recentMisses: 0 },
  });
  assert.match(html, /grammar-adult-confidence secure/);
  assert.match(html, /secure · 10 attempts/);
  assert.match(html, /data-confidence-label="secure"/);
  assert.match(html, /data-sample-size="10"/);
});

test('U7 chip (R17): out-of-taxonomy label renders "Unknown" with neutral tone — NOT emerging', async () => {
  const html = await renderChip({
    confidence: { label: 'garbage-label', sampleSize: 4, intervalDays: 0, distinctTemplates: 0, recentMisses: 0 },
  });
  assert.match(html, /grammar-adult-confidence unknown/);
  assert.match(html, /Unknown · 4 attempts/);
  assert.match(html, /data-confidence-label="Unknown"/);
  // MUST NOT render the emerging tone class or the garbage label verbatim
  assert.doesNotMatch(html, /grammar-adult-confidence emerging/);
  assert.doesNotMatch(html, /grammar-adult-confidence garbage-label/);
});

test('U7 chip: singular "1 attempt" when sampleSize === 1', async () => {
  const html = await renderChip({
    confidence: { label: 'emerging', sampleSize: 1, intervalDays: 0, distinctTemplates: 1, recentMisses: 0 },
  });
  assert.match(html, /emerging · 1 attempt</);
});

test('U7 chip: plural "attempts" when sampleSize > 1', async () => {
  const html = await renderChip({
    confidence: { label: 'building', sampleSize: 4, intervalDays: 1, distinctTemplates: 2, recentMisses: 0 },
  });
  assert.match(html, /building · 4 attempts/);
});

test('U7 chip: recent-miss count is appended with singular/plural forms', async () => {
  const one = await renderChip({
    confidence: { label: 'needs-repair', sampleSize: 3, intervalDays: 0, distinctTemplates: 1, recentMisses: 1 },
  });
  assert.match(one, /1 recent miss</);
  assert.doesNotMatch(one, /1 recent misses/);

  const many = await renderChip({
    confidence: { label: 'needs-repair', sampleSize: 5, intervalDays: 0, distinctTemplates: 2, recentMisses: 3 },
  });
  assert.match(many, /3 recent misses/);
});

test('U7 chip: admin extras are OFF by default — no intervalDays or distinctTemplates text', async () => {
  const html = await renderChip({
    confidence: { label: 'secure', sampleSize: 10, intervalDays: 14, distinctTemplates: 5, recentMisses: 0 },
    showAdminExtras: false,
  });
  assert.doesNotMatch(html, /14d spacing/);
  assert.doesNotMatch(html, /5 templates/);
});

test('U7 chip: admin extras render intervalDays + distinctTemplates when showAdminExtras=true', async () => {
  const html = await renderChip({
    confidence: { label: 'secure', sampleSize: 10, intervalDays: 14, distinctTemplates: 5, recentMisses: 0 },
    showAdminExtras: true,
  });
  assert.match(html, /14d spacing/);
  assert.match(html, /5 templates/);
});

test('U7 chip: admin extras singular "1 template"', async () => {
  const html = await renderChip({
    confidence: { label: 'building', sampleSize: 3, intervalDays: 0, distinctTemplates: 1, recentMisses: 0 },
    showAdminExtras: true,
  });
  assert.match(html, /1 template</);
  assert.doesNotMatch(html, /1 templates/);
});

test('U7 chip: malformed sampleSize (NaN / negative) coerces to 0', async () => {
  const html = await renderChip({
    confidence: { label: 'emerging', sampleSize: NaN, intervalDays: -4, distinctTemplates: -1, recentMisses: -2 },
  });
  assert.match(html, /emerging · 0 attempts/);
  // Negative recent misses coerced to 0 — so no recent-miss suffix appears
  assert.doesNotMatch(html, /recent miss/);
});
