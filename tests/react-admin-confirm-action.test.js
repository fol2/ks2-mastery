// Admin Console P5 / U3: AdminConfirmAction component tests.
//
// Validates the SSR-rendered markup of the confirmation component at each
// supported level:
//   - high:     renders confirm dialog with danger copy and target display
//   - critical: renders typed confirmation input; confirm button disabled
//               until typed value matches
//
// Uses the esbuild + renderToStaticMarkup pattern established by the
// project's existing React component tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findNearestNodeModules(startDir) {
  let current = startDir;
  for (let index = 0; index < 12; index += 1) {
    const candidate = path.join(current, 'node_modules');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function nodePaths() {
  return [
    path.join(ROOT_DIR, 'node_modules'),
    findNearestNodeModules(ROOT_DIR),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-confirm-action-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, entrySource);
    await build({
      absWorkingDir: ROOT_DIR,
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
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function abs(rel) {
  return path.join(ROOT_DIR, rel);
}

// =================================================================
// 1. High-level: renders confirm dialog with danger copy
// =================================================================

test('AdminConfirmAction level=high renders confirm dialog with danger copy', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminConfirmAction } from ${JSON.stringify(abs('src/surfaces/hubs/AdminConfirmAction.jsx'))};

    const html = renderToStaticMarkup(
      <AdminConfirmAction
        level="high"
        dangerCopy="This action will modify live content visible to users."
        targetDisplay="Monster Visual Config v3"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    console.log(html);
  `);

  // Must contain the alertdialog role
  assert.ok(html.includes('role="alertdialog"'), 'missing alertdialog role');
  // Must display the danger copy
  assert.ok(html.includes('This action will modify live content visible to users.'), 'missing danger copy');
  // Must display the target
  assert.ok(html.includes('Monster Visual Config v3'), 'missing target display');
  // Must have confirm and cancel buttons
  assert.ok(html.includes('Confirm'), 'missing confirm button text');
  assert.ok(html.includes('Cancel'), 'missing cancel button text');
  // Must NOT have typed input section (high level does not require it)
  assert.ok(!html.includes('admin-confirm-typed-input'), 'should not render typed input for high level');
  // data-level attribute
  assert.ok(html.includes('data-level="high"'), 'missing data-level=high');
});

// =================================================================
// 2. Critical-level: renders typed confirmation input
// =================================================================

test('AdminConfirmAction level=critical renders typed confirmation input', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminConfirmAction } from ${JSON.stringify(abs('src/surfaces/hubs/AdminConfirmAction.jsx'))};

    const html = renderToStaticMarkup(
      <AdminConfirmAction
        level="critical"
        dangerCopy="This is a destructive operation that cannot be easily reversed."
        targetDisplay="concept-fronted-adverbials"
        typedConfirmValue="concept-fronted-adverbials"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    console.log(html);
  `);

  // Must have the typed input section
  assert.ok(html.includes('admin-confirm-typed-input'), 'missing typed input for critical level');
  // Must show the typed confirm value in the label
  assert.ok(html.includes('concept-fronted-adverbials'), 'missing typed confirm value in label');
  // Confirm button must be disabled (initial empty input does not match)
  assert.ok(html.includes('disabled'), 'confirm button should be disabled initially');
  // data-level attribute
  assert.ok(html.includes('data-level="critical"'), 'missing data-level=critical');
  // Title should indicate destructive operation
  assert.ok(html.includes('Destructive operation'), 'missing destructive operation title');
});

// =================================================================
// 3. High-level: confirm button is NOT disabled initially
// =================================================================

test('AdminConfirmAction level=high confirm button is enabled', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminConfirmAction } from ${JSON.stringify(abs('src/surfaces/hubs/AdminConfirmAction.jsx'))};

    const html = renderToStaticMarkup(
      <AdminConfirmAction
        level="high"
        dangerCopy="Warning text."
        targetDisplay="some target"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    // Output only the confirm button HTML to check disabled state
    const confirmMatch = html.match(/<button[^>]*class="admin-confirm-action__confirm"[^>]*>[^<]*<\\/button>/);
    console.log(confirmMatch ? confirmMatch[0] : 'NOT_FOUND');
  `);

  // The confirm button for high level should NOT be disabled
  assert.ok(!html.includes('disabled'), 'high-level confirm button should not be disabled');
  assert.ok(html.includes('Confirm'), 'missing confirm text');
});

// =================================================================
// 4. Critical-level: confirm disabled when no typedConfirmValue match
// =================================================================

test('AdminConfirmAction level=critical confirm disabled with empty input', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminConfirmAction } from ${JSON.stringify(abs('src/surfaces/hubs/AdminConfirmAction.jsx'))};

    const html = renderToStaticMarkup(
      <AdminConfirmAction
        level="critical"
        dangerCopy="Destructive."
        targetDisplay="seed-abc"
        typedConfirmValue="seed-abc"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    // Extract the confirm button to check disabled attribute
    const confirmMatch = html.match(/<button[^>]*class="admin-confirm-action__confirm"[^>]*>[^<]*<\\/button>/);
    console.log(confirmMatch ? confirmMatch[0] : 'NOT_FOUND');
  `);

  // Confirm button must be disabled (empty input != "seed-abc")
  assert.ok(html.includes('disabled'), 'critical confirm button should be disabled when input is empty');
});

// =================================================================
// 5. No dangerCopy prop: description paragraph omitted
// =================================================================

test('AdminConfirmAction without dangerCopy omits danger paragraph', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminConfirmAction } from ${JSON.stringify(abs('src/surfaces/hubs/AdminConfirmAction.jsx'))};

    const html = renderToStaticMarkup(
      <AdminConfirmAction
        level="high"
        dangerCopy=""
        targetDisplay="target-x"
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    console.log(html);
  `);

  // Empty dangerCopy should not render the danger paragraph
  assert.ok(!html.includes('admin-confirm-action__danger'), 'should not render danger paragraph when dangerCopy is empty');
});

// =================================================================
// 6. No targetDisplay prop: target paragraph omitted
// =================================================================

test('AdminConfirmAction without targetDisplay omits target paragraph', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AdminConfirmAction } from ${JSON.stringify(abs('src/surfaces/hubs/AdminConfirmAction.jsx'))};

    const html = renderToStaticMarkup(
      <AdminConfirmAction
        level="high"
        dangerCopy="Some warning."
        targetDisplay=""
        onConfirm={async () => {}}
        onCancel={() => {}}
      />
    );
    console.log(html);
  `);

  // Empty targetDisplay should not render the target paragraph
  assert.ok(!html.includes('admin-confirm-action__target'), 'should not render target paragraph when targetDisplay is empty');
});
