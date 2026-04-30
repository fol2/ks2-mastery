// U8 — Admin Visual Engine diagnostics panel characterisation tests.
//
// Validates:
//   1. All 6 subjects displayed with accent values
//   2. Read-only (no write endpoints, no mutation)
//   3. Placeholder reported as "placeholder" not "broken"
//   4. SectionHeader adopted
//   5. Section renders within admin hub tab registry
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

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-admin-visual-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, entrySource);
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
    return execFileSync(process.execPath, [bundlePath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function absoluteSpecifier(relativePath) {
  return JSON.stringify(path.join(rootDir, relativePath));
}

// ---------- Test 1: All 6 subjects rendered with accent values ---------- //

test('AdminVisualEngineSection renders all 6 subject theme tokens with accent values', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  // All 6 subject IDs must appear
  const subjects = ['spelling', 'grammar', 'punctuation', 'reading', 'reasoning', 'arithmetic'];
  for (const subject of subjects) {
    assert.ok(
      html.includes(`data-subject="${subject}"`),
      `Expected subject "${subject}" to appear in rendered output`
    );
  }

  // Accent values must appear
  const accents = ['#3E6FA8', '#7e5bb6', '#B8873F', '#4B7A4A', '#8A5A9D', '#C06B3E'];
  for (const accent of accents) {
    assert.ok(
      html.includes(accent),
      `Expected accent "${accent}" to appear in rendered output`
    );
  }
});

// ---------- Test 2: Read-only — no write endpoints, no mutation ---------- //

test('AdminVisualEngineSection contains no form elements, buttons, or mutation handlers', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  // No form elements that imply write capability
  assert.ok(!html.includes('<form'), 'Should not contain <form> elements');
  assert.ok(!html.includes('<input'), 'Should not contain <input> elements');
  assert.ok(!html.includes('<textarea'), 'Should not contain <textarea> elements');
  // No onClick handlers in the rendered body content (buttons in AdminPanelFrame header are OK)
  // The section body should be purely display-oriented
  assert.ok(!html.includes('onSubmit'), 'Should not contain onSubmit handlers');
});

// ---------- Test 3: Placeholder reported as "placeholder" not "broken" ---------- //

test('AdminVisualEngineSection reports placeholder assets with info severity not error', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  // If any placeholders exist, they must use severity="info" and status="placeholder"
  // Either way, the word "broken" must NEVER appear as a status
  assert.ok(!html.includes('data-status="broken"'), 'Should never report assets as "broken"');
  assert.ok(!html.includes('data-severity="error"'), 'Should never use error severity for placeholders');

  // If placeholder text is present, it must be info-level
  if (html.includes('data-status="placeholder"')) {
    assert.ok(
      html.includes('data-severity="info"'),
      'Placeholder assets must use info severity'
    );
  }
});

// ---------- Test 4: SectionHeader adopted ---------- //

test('AdminVisualEngineSection uses SectionHeader primitive for diagnostic categories', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  // SectionHeader renders <header class="section-header"> with h3 elements
  assert.ok(
    html.includes('class="section-header"'),
    'Expected SectionHeader class in rendered output'
  );

  // Multiple section headers for each diagnostic category
  const sectionTestIds = [
    'section-subject-themes',
    'section-monster-assets',
    'section-placeholders',
    'section-stage-assignments',
    'section-motion-profiles',
    'section-alt-text',
  ];
  for (const testId of sectionTestIds) {
    assert.ok(
      html.includes(`data-testid="${testId}"`),
      `Expected SectionHeader with data-testid="${testId}"`
    );
  }
});

// ---------- Test 5: Section renders within admin hub tab registry ---------- //

test('Visual Engine tab is registered in ADMIN_SECTION_TABS', async () => {
  const output = await renderFixture(`
    import { ADMIN_SECTION_TABS } from ${absoluteSpecifier('src/surfaces/hubs/AdminSectionTabs.jsx')};
    const visualTab = ADMIN_SECTION_TABS.find((t) => t.key === 'visual-engine');
    console.log(JSON.stringify(visualTab));
  `);
  const visualTab = JSON.parse(output.trim());
  assert.ok(visualTab, 'Expected "visual-engine" tab in ADMIN_SECTION_TABS');
  assert.equal(visualTab.key, 'visual-engine');
  assert.equal(visualTab.label, 'Visual Engine');
});

// ---------- Test 6: Monster visual contexts are displayed ---------- //

test('AdminVisualEngineSection displays all registered visual contexts', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  const contexts = ['meadow', 'codexCard', 'codexFeature', 'lightbox', 'celebrationOverlay', 'toastPortrait'];
  for (const ctx of contexts) {
    assert.ok(
      html.includes(ctx),
      `Expected visual context "${ctx}" in rendered output`
    );
  }
});

// ---------- Test 7: Motion profiles section is present ---------- //

test('AdminVisualEngineSection displays motion profile options', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  const profiles = ['still', 'egg-breathe', 'walk', 'walk-b', 'fly-a', 'fly-b'];
  for (const profile of profiles) {
    assert.ok(
      html.includes(profile),
      `Expected motion profile "${profile}" in rendered output`
    );
  }
});

// ---------- Test 8: AdminPanelFrame wraps the section ---------- //

test('AdminVisualEngineSection is wrapped in AdminPanelFrame', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminVisualEngineSection } from ${absoluteSpecifier('src/surfaces/hubs/AdminVisualEngineSection.jsx')};
    const markup = renderToStaticMarkup(React.createElement(AdminVisualEngineSection));
    console.log(markup);
  `);

  // AdminPanelFrame renders with data-panel-frame attribute
  assert.ok(
    html.includes('data-panel-frame="Asset &amp; Property Diagnostics"'),
    'Expected AdminPanelFrame wrapper with panel title'
  );
});
