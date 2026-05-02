// UI Refactor P4 U4: subject summaries must use SessionSummaryFrame as the
// primary summary frame, not append it below legacy headline/action clusters.

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
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-summary-actions-'));
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

test('P4 U4 summary scenes do not render legacy and shared action clusters together', () => {
  const scenes = [
    {
      name: 'Spelling',
      path: 'src/subjects/spelling/components/SpellingSummaryScene.jsx',
      forbidden: [
        'className="summary-actions"',
        'className="summary-bank-link"',
        'alongside the existing visual shell',
      ],
    },
    {
      name: 'Grammar',
      path: 'src/subjects/grammar/components/GrammarSummaryScene.jsx',
      forbidden: [
        'grammar-summary-primary-actions',
        'grammar-summary-secondary-actions',
        'grammar-summary-ribbon',
        'alongside the existing visual shell',
      ],
    },
    {
      name: 'Punctuation',
      path: 'src/subjects/punctuation/components/PunctuationSummaryScene.jsx',
      forbidden: [
        'function NextActionRow',
        'punctuation-summary-actions',
        'alongside the existing visual shell',
      ],
    },
  ];

  for (const scene of scenes) {
    const text = source(scene.path);
    assert.match(
      text,
      /<SessionSummaryFrame[\s\S]*nextPrimaryAction=\{nextPrimaryAction\}[\s\S]*secondaryActions=\{secondaryActions\}/,
      `${scene.name} summary must route its primary and secondary next actions through SessionSummaryFrame`,
    );
    for (const marker of scene.forbidden) {
      assert.doesNotMatch(
        text,
        new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${scene.name} summary still contains legacy duplicate marker: ${marker}`,
      );
    }
  }
});

test('P5 U4 summary scenes keep one primary action through SessionSummaryFrame', () => {
  const scenes = [
    ['Spelling', 'src/subjects/spelling/components/SpellingSummaryScene.jsx'],
    ['Grammar', 'src/subjects/grammar/components/GrammarSummaryScene.jsx'],
    ['Punctuation', 'src/subjects/punctuation/components/PunctuationSummaryScene.jsx'],
  ];

  for (const [name, relativePath] of scenes) {
    const text = source(relativePath);
    assert.equal(
      (text.match(/nextPrimaryAction=\{nextPrimaryAction\}/g) || []).length,
      1,
      `${name} summary should pass exactly one primary action prop`,
    );
    assert.match(text, /secondaryActions=\{secondaryActions\}/);
    assert.doesNotMatch(text, /className="btn primary xl"/);
    assert.doesNotMatch(text, /summary frame computes rewards|compute.*Stars|write.*mastery/i);
  }
});

test('P5 U4 Boss Dictation summary remains Mega-safe with no drill actions', () => {
  const text = source('src/subjects/spelling/components/SpellingSummaryScene.jsx');
  const bossBranch = text.slice(text.indexOf('isBossSummary'), text.indexOf('isPatternQuestSummary'));
  assert.match(text, /isBossSummary/);
  assert.match(text, /SummaryBossMissList/);
  assert.doesNotMatch(bossBranch, /spelling-drill-all|spelling-drill-single|Drill all/);
});

test('P5 U4 summary outcome variants render one primary action through the shared frame', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SessionSummaryFrame } from ${absoluteSpecifier('src/platform/ui/SessionSummaryFrame.jsx')};
    const variants = [
      ['spelling-boss', 'spelling', 'secure', 'Boss Dictation complete', 'spelling-back'],
      ['grammar-mini-test', 'grammar', 'review-complete', 'Mini-test complete', 'grammar-back'],
      ['grammar-repair', 'grammar', 'needs-practice', 'Repair round complete', 'grammar-repair-start'],
      ['grammar-smart', 'grammar', 'improving', 'Smart grammar complete', 'grammar-smart-start'],
      ['punctuation-smart', 'punctuation', 'improving', 'Smart punctuation complete', 'punctuation-start'],
      ['punctuation-guided', 'punctuation', 'needs-practice', 'Guided punctuation complete', 'punctuation-start-guided'],
      ['punctuation-gps', 'punctuation', 'secure', 'GPS challenge complete', 'punctuation-back'],
    ];
    const rendered = variants.map(([id, subjectId, outcome, title, dataAction]) => renderToStaticMarkup(
      <SessionSummaryFrame
        subjectId={subjectId}
        outcome={outcome}
        title={title}
        highlights={['Result returned by the subject summary model']}
        misconceptions={id.includes('repair') || id.includes('guided') ? ['Review target'] : []}
        progressDelta={[]}
        nextPrimaryAction={{ label: 'Continue', dataAction, onClick: () => {} }}
        secondaryActions={[{ label: 'Back to dashboard', dataAction: subjectId + '-back', variant: 'ghost', onClick: () => {} }]}
      />
    ));
    console.log(rendered.join('\\n---\\n'));
  `);

  const frames = html.split('\n---\n');
  assert.equal(frames.length, 7);
  for (const frame of frames) {
    assert.equal((frame.match(/class="btn primary/g) || []).length, 1);
    assert.match(frame, /class="session-summary-frame"/);
    assert.doesNotMatch(frame, /spelling-drill-all|spelling-drill-single|Drill all/);
    assert.doesNotMatch(frame, /compute.*Stars|write.*mastery|Hero Coins|Hero Camp/i);
  }
});

test('P5 U4 actual ready-subject summary scenes render one primary action per branch', async () => {
  const html = await renderFixture(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { SpellingSummaryScene } from ${absoluteSpecifier('src/subjects/spelling/components/SpellingSummaryScene.jsx')};
    import { GrammarSummaryScene } from ${absoluteSpecifier('src/subjects/grammar/components/GrammarSummaryScene.jsx')};
    import { PunctuationSummaryScene } from ${absoluteSpecifier('src/subjects/punctuation/components/PunctuationSummaryScene.jsx')};

    const learner = { id: 'learner-p5', name: 'Ava' };
    const actions = { dispatch() {}, openWordBank() {} };
    const spellingActions = { dispatch() {}, openWordBank() {} };
    const spellingBoss = {
      summary: {
        mode: 'boss',
        totalWords: 2,
        correct: 1,
        mistakes: [{ slug: 'receive', word: 'receive' }],
        cards: [
          { label: 'Answered', value: '2' },
          { label: 'Correct', value: '1' },
        ],
        message: 'Boss complete',
      },
      pendingCommand: '',
    };
    const grammarRegular = {
      summary: { answered: 5, correct: 4, trouble: 1, mistakes: [{ conceptId: 'noun_phrases' }] },
      pendingCommand: '',
      projections: { rewards: { state: {} } },
      analytics: { concepts: [{ id: 'noun_phrases', status: 'weak' }] },
    };
    const grammarMini = {
      summary: {
        mode: 'satsset',
        totalMarks: 2,
        miniTestReview: {
          questions: [
            { item: { skillIds: ['noun_phrases'], prompt: 'Pick the noun phrase.' }, marked: { result: { correct: false } } },
            { item: { skillIds: ['verbs'], prompt: 'Pick the verb.' }, marked: { result: { correct: true } } },
          ],
        },
      },
      pendingCommand: '',
      projections: { rewards: { state: {} } },
    };
    const punctuationSmart = {
      summary: {
        total: 5,
        correct: 4,
        accuracy: 80,
        focus: ['commas-in-lists'],
        skillsExercised: ['commas-in-lists'],
        message: 'Smart round complete.',
      },
      pendingCommand: '',
      stats: { due: 1 },
      rewardState: {},
    };
    const punctuationGps = {
      summary: {
        total: 3,
        correct: 3,
        accuracy: 100,
        focus: [],
        skillsExercised: ['speech-punctuation'],
        message: 'GPS challenge complete.',
        gps: { reviewItems: [{ itemId: 'gps-1', misconceptionTags: [] }] },
      },
      pendingCommand: '',
      stats: { due: 0 },
      rewardState: {},
    };

    const frames = [
      renderToStaticMarkup(<SpellingSummaryScene learner={learner} ui={spellingBoss} accent="#335577" actions={spellingActions} />),
      renderToStaticMarkup(<GrammarSummaryScene grammar={grammarRegular} rewardState={{}} actions={actions} learner={learner} runtimeReadOnly={false} />),
      renderToStaticMarkup(<GrammarSummaryScene grammar={grammarMini} rewardState={{}} actions={actions} learner={learner} runtimeReadOnly={false} />),
      renderToStaticMarkup(<PunctuationSummaryScene ui={punctuationSmart} actions={actions} rewardState={{}} />),
      renderToStaticMarkup(<PunctuationSummaryScene ui={punctuationGps} actions={actions} rewardState={{}} />),
    ];
    console.log(frames.join('\\n---\\n'));
  `);

  const frames = html.split('\n---\n');
  assert.equal(frames.length, 5);
  for (const frame of frames) {
    assert.equal((frame.match(/class="btn primary/g) || []).length, 1);
    assert.equal((frame.match(/data-session-summary-frame/g) || []).length, 1);
    assert.doesNotMatch(frame, /Hero Coins|Hero Camp|write mastery|compute Stars/i);
  }

  assert.doesNotMatch(frames[0], /spelling-drill-all|spelling-drill-single|Drill all/);
  assert.match(frames[1], /data-action="grammar-practise-missed"/);
  assert.match(frames[2], /data-action="grammar-practise-missed"/);
  assert.match(frames[3], /data-action="punctuation-start"/);
  assert.match(frames[4], /data-action="punctuation-start"/);
});
