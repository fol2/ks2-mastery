// U4 review follower — AdminSectionTabs SSR render contract.
//
// Validates the tab bar renders correctly in SSR:
//  1. All 5 tabs render with correct labels.
//  2. Active tab has aria-selected="true" and the visual indicator class.
//  3. Inactive tabs have aria-selected="false".
//  4. Marketing tab shows the "Soon" chip.
//  5. Each tab carries a data-section attribute matching its key.
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

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function renderTabs({ activeSection = 'overview' } = {}) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-section-tabs-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AdminSectionTabs } from ${JSON.stringify(path.join(rootDir, 'src/surfaces/hubs/AdminSectionTabs.jsx'))};

      const html = renderToStaticMarkup(
        <AdminSectionTabs
          activeSection={${JSON.stringify(activeSection)}}
          onTabChange={() => {}}
        />
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
    const output = execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return normaliseLineEndings(output).replace(/\n+$/, '');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test('all 5 tabs render with correct labels', async () => {
  const html = await renderTabs();
  const expectedLabels = ['Overview', 'Accounts', 'Debugging &amp; Logs', 'Content', 'Marketing'];
  for (const label of expectedLabels) {
    assert.match(html, new RegExp(label), `expected tab label "${label}" to be present`);
  }
});

test('active tab has aria-selected="true" and bold font-weight', async () => {
  const html = await renderTabs({ activeSection: 'accounts' });
  // Extract the full <button ...> opening tag that contains data-section="accounts".
  // React may place aria-selected before or after data-section, so we match
  // the entire opening tag.
  const accountsButtonMatch = html.match(/<button[^>]*data-section="accounts"[^>]*>/);
  assert.ok(accountsButtonMatch, 'accounts tab button should exist');
  const tag = accountsButtonMatch[0];
  assert.match(tag, /aria-selected="true"/, 'active tab should have aria-selected="true"');
  assert.match(tag, /font-weight:700/, 'active tab should have bold font-weight');
});

test('inactive tabs have aria-selected="false"', async () => {
  const html = await renderTabs({ activeSection: 'overview' });
  // All tabs except overview should be aria-selected="false".
  const inactiveKeys = ['accounts', 'debug', 'content', 'marketing'];
  for (const key of inactiveKeys) {
    const buttonMatch = html.match(new RegExp(`<button[^>]*data-section="${key}"[^>]*>`));
    assert.ok(buttonMatch, `tab "${key}" button should exist`);
    assert.match(buttonMatch[0], /aria-selected="false"/, `tab "${key}" should have aria-selected="false"`);
  }
});

test('marketing tab shows "Soon" chip', async () => {
  const html = await renderTabs();
  // The "Soon" chip should appear inside the marketing tab button.
  // Look for the chip after the marketing data-section attribute.
  assert.match(html, /data-section="marketing"/, 'marketing tab should exist');
  assert.match(html, /Marketing<span class="chip"[^>]*>Soon<\/span>/, 'marketing tab should contain "Soon" chip');
});

test('each tab carries a data-section attribute matching its key', async () => {
  const html = await renderTabs();
  const expectedKeys = ['overview', 'accounts', 'debug', 'content', 'marketing'];
  for (const key of expectedKeys) {
    assert.match(html, new RegExp(`data-section="${key}"`), `tab with data-section="${key}" should exist`);
  }
});
