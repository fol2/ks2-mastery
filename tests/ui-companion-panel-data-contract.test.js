import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

async function renderFixture(entrySource) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-companion-data-'));
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

test('ready subject companion panels map subject-owned data into real panel inputs', () => {
  const contracts = [
    {
      subject: 'spelling',
      path: 'src/subjects/spelling/components/SpellingSetupScene.jsx',
      markers: ['monsterVisuals', 'stats.secure', 'stats.due', 'stats.trouble', 'Trouble words need attention'],
      useMonsterVisuals: true,
    },
    {
      subject: 'grammar',
      path: 'src/subjects/grammar/components/GrammarSetupScene.jsx',
      markers: ['dashboard.monsterStrip', 'dashboard.todayCards', 'troubleCount', 'Trouble concepts need revision'],
    },
    {
      subject: 'punctuation',
      path: 'src/subjects/punctuation/components/PunctuationSetupScene.jsx',
      markers: ['dashboard.activeMonsters', 'dueCount', 'weakCount', 'grandStars', 'Wobbly spots need practice'],
    },
  ];

  for (const contract of contracts) {
    const text = source(contract.path);
    assert.ok(text.includes('<SubjectCompanionPanel'), `${contract.subject} must use SubjectCompanionPanel`);
    assert.ok(text.includes(`subjectId="${contract.subject}"`), `${contract.subject} must set subjectId`);
    if (contract.useMonsterVisuals) {
      assert.ok(text.includes('monsterVisuals={'), `${contract.subject} must pass monsterVisuals`);
    } else {
      assert.ok(text.includes('monsters={'), `${contract.subject} must pass monsters`);
    }
    assert.ok(text.includes('stats={'), `${contract.subject} must pass stats`);
    assert.ok(text.includes('nextFocus={'), `${contract.subject} must pass nextFocus`);
    for (const marker of contract.markers) {
      assert.ok(text.includes(marker), `${contract.subject} companion panel must include ${marker}`);
    }
  }
});

test('ready subject companion panel data renders subject-owned stats without shaming empty states', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SubjectCompanionPanel } from ${absoluteSpecifier('src/platform/ui/SubjectCompanionPanel.jsx')};
    const fixtures = [
      ['spelling', [{ name: 'Codex', discovered: true }], [
        { label: 'Secure', value: '12', tone: 'good' },
        { label: 'Due', value: '3', tone: 'warn' },
        { label: 'Trouble', value: '1', tone: 'warn' },
      ], 'Try the next due word.'],
      ['grammar', [{ name: 'Grammox', discovered: true }], [
        { label: 'Confidence', value: 'steady', tone: 'good' },
        { label: 'Trouble concepts', value: '2', tone: 'warn' },
      ], 'Revise noun phrases.'],
      ['punctuation', [{ name: 'Comma Egg', discovered: true }], [
        { label: 'Due', value: '4', tone: 'warn' },
        { label: 'Wobbly', value: '2', tone: 'warn' },
        { label: 'Grand Stars', value: '1', tone: 'good' },
      ], 'Practise wobbly spots.'],
    ];
    const rendered = fixtures.map(([subjectId, monsters, stats, nextFocus]) => renderToStaticMarkup(
      <SubjectCompanionPanel
        subjectId={subjectId}
        monsters={monsters}
        stats={stats}
        nextFocus={nextFocus}
        emptyState="No discoveries yet. Start a short round when you are ready."
        visible
      />
    ));
    rendered.push(renderToStaticMarkup(
      <SubjectCompanionPanel
        subjectId="grammar"
        monsters={[]}
        stats={[]}
        emptyState="No discoveries yet. Start a short round when you are ready."
        visible
      />
    ));
    console.log(rendered.join('\\n---\\n'));
  `);

  for (const subjectId of ['spelling', 'grammar', 'punctuation']) {
    assert.match(html, new RegExp(`data-subject="${subjectId}"`));
  }
  for (const label of ['Secure', 'Due', 'Trouble', 'Confidence', 'Trouble concepts', 'Wobbly', 'Grand Stars']) {
    assert.match(html, new RegExp(`ss-stat-label">${label}</div>`));
  }
  assert.match(html, /Try the next due word\./);
  assert.match(html, /Revise noun phrases\./);
  assert.match(html, /Practise wobbly spots\./);
  assert.match(html, /No discoveries yet\. Start a short round when you are ready\./);
  assert.doesNotMatch(html, /failed|weak|bad|behind|lost/i);
});
