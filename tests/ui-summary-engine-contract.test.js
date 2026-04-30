import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// P3 U6: Contract tests for the shared SessionSummaryFrame primitive and
// its three-subject adoption (Spelling, Punctuation, Grammar).
//
// Test surface:
//   1. One primary action per render.
//   2. Empty misconceptions → section hidden.
//   3. Empty progressDelta → no progress section.
//   4. progressDelta cannot show mastery not in result model.
//   5. Subject-specific next-action routes dispatch correctly (data-action preserved).
//   6. No forbidden copy patterns.
//   7. SectionHeader adoption verified (import + render).

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-summary-engine-'));
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

// ---------- 1. One primary action per render ---------- //

test('SessionSummaryFrame renders exactly one primary action button', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="spelling"
        outcome="secure"
        title="Round complete"
        highlights={['5 words correct']}
        misconceptions={[]}
        progressDelta={[]}
        nextPrimaryAction={{ label: 'Continue', dataAction: 'spelling-back', onClick: () => {} }}
        secondaryActions={[
          { label: 'Word bank', dataAction: 'spelling-open-word-bank', variant: 'ghost', onClick: () => {} },
        ]}
      />
    );
    console.log(html);
  `);
  // Count buttons with class containing "primary"
  const primaryButtons = html.match(/class="btn primary[^"]*"/g) || [];
  assert.equal(primaryButtons.length, 1, 'Must render exactly one primary action button');
  assert.match(html, /data-action="spelling-back"/, 'Primary action data-action must be preserved');
});

// ---------- 2. Empty misconceptions → section hidden ---------- //

test('SessionSummaryFrame hides misconceptions section when array is empty', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="grammar"
        outcome="secure"
        title="Clean round"
        highlights={['All correct']}
        misconceptions={[]}
        progressDelta={[]}
        nextPrimaryAction={{ label: 'Continue', dataAction: 'grammar-start-again', onClick: () => {} }}
        secondaryActions={[]}
      />
    );
    console.log(html);
  `);
  assert.doesNotMatch(html, /data-summary-misconceptions/, 'Misconceptions section must not render when array is empty');
  assert.doesNotMatch(html, /Try again/, 'Try again heading must not render when misconceptions are empty');
});

// ---------- 3. Empty progressDelta → no progress section ---------- //

test('SessionSummaryFrame hides progress section when progressDelta is empty', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="punctuation"
        outcome="improving"
        title="Nice session"
        highlights={['8 out of 10 correct']}
        misconceptions={['Speech punctuation']}
        progressDelta={[]}
        nextPrimaryAction={{ label: 'Start again', dataAction: 'punctuation-start-again', onClick: () => {} }}
        secondaryActions={[]}
      />
    );
    console.log(html);
  `);
  assert.doesNotMatch(html, /data-summary-progress/, 'Progress section must not render when progressDelta is empty');
});

// ---------- 4. progressDelta cannot show mastery not in result model ---------- //

test('SessionSummaryFrame renders only the progress labels passed — cannot fabricate mastery', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="grammar"
        outcome="improving"
        title="Good progress"
        highlights={['3 of 5 correct']}
        misconceptions={['Noun phrases']}
        progressDelta={[{ label: 'Nouns', from: 'Stage 1', to: 'Stage 2' }]}
        nextPrimaryAction={{ label: 'Continue', dataAction: 'grammar-start-again', onClick: () => {} }}
        secondaryActions={[]}
      />
    );
    console.log(html);
  `);
  assert.match(html, /data-summary-progress/, 'Progress section must render when progressDelta has entries');
  assert.match(html, /data-progress-label="Nouns"/, 'Must render the passed progress label');
  assert.match(html, /Stage 1/, 'Must render the from value');
  assert.match(html, /Stage 2/, 'Must render the to value');
  // The frame must NOT show any label that was not passed via progressDelta
  assert.doesNotMatch(html, /data-progress-label="[^"]*Verbs[^"]*"/, 'Must not fabricate progress for labels not in the result model');
  assert.doesNotMatch(html, /data-progress-label="[^"]*Mega[^"]*"/, 'Must not fabricate Mega mastery progress');
});

// ---------- 5. Subject-specific next-action routes dispatch correctly ---------- //

test('SessionSummaryFrame preserves subject-specific data-action attributes', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="punctuation"
        outcome="needs-practice"
        title="Keep trying"
        highlights={[]}
        misconceptions={['Commas in lists']}
        progressDelta={[]}
        nextPrimaryAction={{ label: 'Practise wobbly spots', dataAction: 'punctuation-start', onClick: () => {} }}
        secondaryActions={[
          { label: 'Open Map', dataAction: 'punctuation-open-map', variant: 'secondary', onClick: () => {} },
          { label: 'Back to dashboard', dataAction: 'punctuation-back', variant: 'ghost', onClick: () => {} },
        ]}
      />
    );
    console.log(html);
  `);
  assert.match(html, /data-action="punctuation-start"/, 'Primary data-action must be preserved');
  assert.match(html, /data-action="punctuation-open-map"/, 'Secondary data-action must be preserved');
  assert.match(html, /data-action="punctuation-back"/, 'Tertiary data-action must be preserved');
});

// ---------- 6. No forbidden copy patterns ---------- //

test('SessionSummaryFrame does not contain forbidden copy patterns', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="spelling"
        outcome="needs-practice"
        title="Keep going"
        highlights={['3 of 5 correct']}
        misconceptions={['receive', 'believe']}
        progressDelta={[{ label: 'Spelling', from: '4 Stars', to: '5 Stars' }]}
        nextPrimaryAction={{ label: 'Start another round', dataAction: 'spelling-start-again', onClick: () => {} }}
        secondaryActions={[
          { label: 'Back', dataAction: 'spelling-back', variant: 'ghost', onClick: () => {} },
        ]}
      />
    );
    console.log(html);
  `);
  const forbidden = [
    'lose your streak',
    'Earn coins',
    'failed this monster',
    'Mega lost',
    'Buy now',
    'limited time',
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(
      html,
      new RegExp(pattern, 'i'),
      `Frame-authored text must not contain forbidden copy pattern: "${pattern}"`,
    );
  }
});

// ---------- 7. SectionHeader adoption verified ---------- //

test('SessionSummaryFrame imports and renders SectionHeader for section headings', async () => {
  // Verify source imports SectionHeader
  const source = readFileSync(
    path.join(rootDir, 'src/platform/ui/SessionSummaryFrame.jsx'),
    'utf8',
  );
  assert.match(
    source,
    /import\s*\{[^}]*SectionHeader[^}]*\}\s*from\s*['"]\.\/SectionHeader\.jsx['"]/,
    'SessionSummaryFrame must import SectionHeader from ./SectionHeader.jsx',
  );

  // Verify SectionHeader renders in the output
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const html = renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId="grammar"
        outcome="improving"
        title="Nice work"
        highlights={['4 of 5 correct']}
        misconceptions={['Verb tenses']}
        progressDelta={[]}
        nextPrimaryAction={{ label: 'Continue', dataAction: 'grammar-start-again', onClick: () => {} }}
        secondaryActions={[]}
      />
    );
    console.log(html);
  `);
  // SectionHeader renders <header class="section-header ..."> with child elements
  assert.match(html, /class="[^"]*section-header[^"]*"/, 'SectionHeader must render in the output');
  assert.match(html, /class="[^"]*section-title[^"]*"/, 'SectionHeader title must render with section-title class');
  // Verify "What went well" and "Try again" headings are present
  assert.match(html, /What went well/, 'Must render "What went well" section heading');
  assert.match(html, /Try again/, 'Must render "Try again" section heading');
});

// ---------- Subject adoption gate: all 3 summary scenes import SessionSummaryFrame ---------- //

test('All three subject summary scenes import SessionSummaryFrame', () => {
  const subjects = [
    { name: 'Spelling', path: 'src/subjects/spelling/components/SpellingSummaryScene.jsx' },
    { name: 'Punctuation', path: 'src/subjects/punctuation/components/PunctuationSummaryScene.jsx' },
    { name: 'Grammar', path: 'src/subjects/grammar/components/GrammarSummaryScene.jsx' },
  ];
  for (const subject of subjects) {
    const source = readFileSync(path.join(rootDir, subject.path), 'utf8');
    assert.match(
      source,
      /import\s*\{[^}]*SessionSummaryFrame[^}]*\}/,
      `${subject.name} summary scene must import SessionSummaryFrame`,
    );
  }
});
