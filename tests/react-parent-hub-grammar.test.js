// Phase 4 U7 — React Parent Hub Grammar confidence chip rendering.
//
// Covers the following plan-named scenarios:
//   - Happy path (F3): Parent Hub renders a row per tracked Grammar concept,
//     each row carries an <AdultConfidenceChip> with the confidence label +
//     sample-size text.
//   - Edge case: concept with 1 attempt surfaces `"1 attempt"` (singular).
//   - Edge case: concept with zero attempts renders the default `'emerging'`
//     label with `"0 attempts"`.
//   - Edge case (R17): an out-of-taxonomy label renders `'Unknown'` with the
//     `unknown` tone class — NEVER silently falls back to `'emerging'`.
//   - Error path: `confidence: null` renders no chip and causes no NPE.
//   - 18 concepts: when the full concept list is seeded, every row appears.
//
// We drive the surface through the same bundled-subprocess SSR harness used
// by `react-hub-surfaces.test.js` so we exercise `ParentHubSurface` end-to-
// end, not just the chip component in isolation.

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

async function renderParentHub({ conceptStatus = [], recentSessions = [] }) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-parent-grammar-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { ParentHubSurface } from ${JSON.stringify(path.join(rootDir, 'src/surfaces/hubs/ParentHubSurface.jsx'))};

      const conceptStatus = ${JSON.stringify(conceptStatus)};
      const recentSessions = ${JSON.stringify(recentSessions)};
      const model = {
        learner: { id: 'learner-a', name: 'Ava', lastActivityAt: 0 },
        learnerOverview: {
          secureWords: 0, dueWords: 0, troubleWords: 0,
          secureGrammarConcepts: 2, dueGrammarConcepts: 1, weakGrammarConcepts: 1,
          grammarAccuracyPercent: 67,
          securePunctuationUnits: 0, duePunctuationItems: 0, weakPunctuationItems: 0,
          punctuationAccuracyPercent: null,
          accuracyPercent: null,
        },
        dueWork: [],
        recentSessions,
        strengths: [],
        weaknesses: [],
        misconceptionPatterns: [],
        progressSnapshots: [],
        grammarEvidence: {
          subjectId: 'grammar',
          hasEvidence: true,
          progressSnapshot: { subjectId: 'grammar', trackedConcepts: conceptStatus.length, totalConcepts: conceptStatus.length, securedConcepts: 0, dueConcepts: 0, weakConcepts: 0 },
          conceptStatus,
          dueConcepts: [],
          weakConcepts: [],
          questionTypeSummary: [],
          misconceptionPatterns: [],
          recentActivity: [],
          recentSessions: [],
          parentSummaryDraft: null,
        },
        punctuationEvidence: { subjectId: 'punctuation', hasEvidence: false, progressSnapshot: null },
        exportEntryPoints: [],
        accessibleLearners: [],
        selectedLearnerId: 'learner-a',
        permissions: {
          canViewParentHub: true,
          canMutateLearnerData: false,
          platformRoleLabel: 'Parent',
          membershipRoleLabel: 'Viewer',
          accessModeLabel: 'Read-only learner',
        },
      };
      const appState = { learners: { selectedId: 'learner-a', byId: { 'learner-a': { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' } }, allIds: ['learner-a'] }, persistence: { mode: 'remote-sync' }, toasts: [], monsterCelebrations: { queue: [] } };
      const accessContext = { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: { learnerId: 'learner-a', writable: false } };
      const actions = { navigateHome() {}, openSubject() {}, dispatch() {} };
      const html = renderToStaticMarkup(
        <ParentHubSurface
          appState={appState}
          model={model}
          hubState={{ status: 'loaded' }}
          accessContext={accessContext}
          actions={actions}
        />,
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

function makeRow(id, name, overrides = {}) {
  return {
    id,
    name,
    domain: overrides.domain || 'Grammar',
    status: overrides.status || 'learning',
    attempts: overrides.attempts ?? 0,
    correct: overrides.correct ?? 0,
    wrong: overrides.wrong ?? 0,
    accuracyPercent: overrides.accuracyPercent ?? null,
    confidence: overrides.confidence === null
      ? null
      : overrides.confidence || {
        label: 'emerging',
        sampleSize: overrides.attempts ?? 0,
        intervalDays: 0,
        distinctTemplates: 0,
        recentMisses: 0,
      },
  };
}

test('U7: Parent Hub renders a Grammar concepts confidence panel with the 5-label taxonomy chip per row', async () => {
  const conceptStatus = [
    makeRow('adverbials', 'Adverbials', { status: 'weak', attempts: 5, correct: 1, wrong: 4, confidence: { label: 'needs-repair', sampleSize: 5, intervalDays: 0, distinctTemplates: 2, recentMisses: 3 } }),
    makeRow('relative_clauses', 'Relative clauses', { status: 'secured', attempts: 10, correct: 10, wrong: 0, confidence: { label: 'secure', sampleSize: 10, intervalDays: 14, distinctTemplates: 5, recentMisses: 0 } }),
  ];
  const html = await renderParentHub({ conceptStatus });

  // Section heading
  assert.match(html, /Grammar concepts/);
  assert.match(html, /Concept confidence/);

  // Both concept rows appear with chip + sample size
  assert.match(html, /data-concept-id="adverbials"/);
  assert.match(html, /grammar-adult-confidence needs-repair/);
  assert.match(html, /needs-repair.*?5 attempts/);
  assert.match(html, /3 recent misses/);

  assert.match(html, /data-concept-id="relative_clauses"/);
  assert.match(html, /grammar-adult-confidence secure/);
  assert.match(html, /secure.*?10 attempts/);

  // Parent Hub MUST NOT render admin-only extras (intervalDays / distinctTemplates text)
  assert.doesNotMatch(html, /14d spacing/);
  assert.doesNotMatch(html, /5 templates/);
});

test('U7: Parent Hub renders all 18 concepts when the full concept list is seeded', async () => {
  const conceptStatus = [];
  for (let i = 0; i < 18; i += 1) {
    conceptStatus.push(makeRow(`concept_${i}`, `Concept ${i}`, {
      attempts: i,
      confidence: { label: i > 2 ? 'building' : 'emerging', sampleSize: i, intervalDays: 0, distinctTemplates: 0, recentMisses: 0 },
    }));
  }
  const html = await renderParentHub({ conceptStatus });
  for (let i = 0; i < 18; i += 1) {
    assert.match(html, new RegExp(`data-concept-id="concept_${i}"`), `concept_${i} row rendered`);
  }
  // Chip sample size counts rendered: at least one singular + plural variant
  assert.match(html, /1 attempt</);
  assert.match(html, /17 attempts</);
});

test('U7: Parent Hub — zero-attempt concept row renders emerging chip with "0 attempts"', async () => {
  const conceptStatus = [makeRow('sentence_functions', 'Sentence functions', { attempts: 0 })];
  const html = await renderParentHub({ conceptStatus });
  assert.match(html, /grammar-adult-confidence emerging/);
  assert.match(html, /emerging · 0 attempts/);
});

test('U7 (R17): Parent Hub — out-of-taxonomy label renders "Unknown" with neutral tone, NOT emerging', async () => {
  const conceptStatus = [makeRow('weird_concept', 'Weird concept', {
    attempts: 4,
    confidence: { label: 'not-a-real-label', sampleSize: 4, intervalDays: 0, distinctTemplates: 0, recentMisses: 0 },
  })];
  const html = await renderParentHub({ conceptStatus });
  // Chip class uses `unknown` tone, not `emerging` or the garbage label name
  assert.match(html, /grammar-adult-confidence unknown/);
  assert.match(html, /Unknown · 4 attempts/);
  // MUST NOT render the legitimate `emerging` tone or the raw garbage label name
  assert.doesNotMatch(html, /grammar-adult-confidence emerging/);
  assert.doesNotMatch(html, /grammar-adult-confidence not-a-real-label/);
});

test('U7: Parent Hub — confidence: null on a row renders no chip and no NPE', async () => {
  const conceptStatus = [
    makeRow('adverbials', 'Adverbials', { attempts: 0, confidence: null }),
    makeRow('relative_clauses', 'Relative clauses', { attempts: 3, confidence: { label: 'building', sampleSize: 3 } }),
  ];
  const html = await renderParentHub({ conceptStatus });
  // Page still renders — no NPE
  assert.match(html, /Grammar concepts/);
  // Chip exists for the row with a non-null confidence
  assert.match(html, /grammar-adult-confidence building/);
  assert.match(html, /3 attempts/);
  // Scoping: the adverbials row exists but has NO adult-confidence span inside it
  const adverbialsRow = html.match(/data-concept-id="adverbials"[\s\S]*?<\/li>/)?.[0] || '';
  assert.ok(adverbialsRow.length > 0, 'adverbials row rendered');
  assert.doesNotMatch(adverbialsRow, /grammar-adult-confidence/);
});

test('U7: Parent Hub — singular "1 attempt" on a single-attempt concept row', async () => {
  const conceptStatus = [makeRow('clauses', 'Subordinate clauses', {
    attempts: 1,
    confidence: { label: 'emerging', sampleSize: 1, intervalDays: 0, distinctTemplates: 1, recentMisses: 0 },
  })];
  const html = await renderParentHub({ conceptStatus });
  assert.match(html, /emerging · 1 attempt</);
});

test('U7: Parent Hub — single recent miss uses singular "miss" (not "misses")', async () => {
  const conceptStatus = [makeRow('formality', 'Formal and informal', {
    attempts: 4,
    confidence: { label: 'building', sampleSize: 4, intervalDays: 0, distinctTemplates: 2, recentMisses: 1 },
  })];
  const html = await renderParentHub({ conceptStatus });
  assert.match(html, /1 recent miss</);
  assert.doesNotMatch(html, /1 recent misses/);
});

test('P2: Parent Hub renders Grammar manual-review sessions without mistake warning', async () => {
  const html = await renderParentHub({
    recentSessions: [{
      id: 'grammar-manual-review',
      subjectId: 'grammar',
      status: 'completed',
      sessionKind: 'practice',
      label: 'Grammar practice',
      updatedAt: Date.UTC(2026, 3, 28, 12, 0),
      mistakeCount: 0,
      headline: 'Saved for review',
    }],
  });

  assert.match(html, /Grammar practice/);
  assert.match(html, /Saved for review/);
  assert.match(html, /0 mistakes/);
  assert.doesNotMatch(html, /1 mistake/);
  assert.doesNotMatch(html, /chip warn">0 mistakes/);
});
