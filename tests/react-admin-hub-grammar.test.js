// Phase 4 U7 — React Admin Hub Grammar confidence chip rendering.
//
// Covers the admin-specific variant of the Parent Hub chips:
//   - Happy path (F3): Admin Hub renders a Grammar concept confidence panel
//     with the same chip shape as Parent Hub + the `intervalDays` /
//     `distinctTemplates` extras.
//   - Edge case: 18 concepts seeded render 18 rows.
//   - Edge case (R17): out-of-taxonomy label renders `'Unknown'` with
//     neutral tone, NEVER silently falls back to `'emerging'`.
//   - Error path: `confidence: null` is tolerated without NPE.

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

async function renderAdminHub({ conceptStatus }) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-admin-grammar-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AdminHubSurface } from ${JSON.stringify(path.join(rootDir, 'src/surfaces/hubs/AdminHubSurface.jsx'))};
      import { BUNDLED_MONSTER_VISUAL_CONFIG } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/monster-visual-config.js'))};

      const conceptStatus = ${JSON.stringify(conceptStatus)};
      const adminNow = Date.UTC(2026, 3, 22, 12, 0);
      const model = {
        account: { id: 'adult-admin', repoRevision: 1, selectedLearnerId: 'learner-a' },
        permissions: { canViewAdminHub: true, platformRole: 'admin', platformRoleLabel: 'Admin', canManageMonsterVisualConfig: true },
        monsterVisualConfig: {
          permissions: { canManageMonsterVisualConfig: true, canViewMonsterVisualConfig: true },
          status: {
            schemaVersion: 1,
            manifestHash: BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash,
            draftRevision: 0,
            publishedVersion: 1,
            publishedAt: adminNow,
            validation: { ok: true, errorCount: 0, warningCount: 0, errors: [], warnings: [] },
          },
          draft: BUNDLED_MONSTER_VISUAL_CONFIG,
          published: BUNDLED_MONSTER_VISUAL_CONFIG,
          versions: [],
          mutation: {},
        },
        contentReleaseStatus: { publishedVersion: 1, publishedReleaseId: 'r', runtimeWordCount: 0, runtimeSentenceCount: 0, currentDraftId: 'd', currentDraftVersion: 1, draftUpdatedAt: 0 },
        importValidationStatus: { ok: true, errorCount: 0, warningCount: 0, source: '', importedAt: 0, errors: [] },
        auditLogLookup: { available: false, note: '', entries: [] },
        dashboardKpis: { generatedAt: adminNow, accounts: { total: 0 }, learners: { total: 0 }, demos: { active: 0 }, practiceSessions: { last7d: 0, last30d: 0 }, eventLog: { last7d: 0 }, mutationReceipts: { last7d: 0 }, errorEvents: { byStatus: { open: 0, investigating: 0, resolved: 0, ignored: 0 } }, accountOpsUpdates: { total: 0 } },
        opsActivityStream: { generatedAt: adminNow, entries: [] },
        accountOpsMetadata: { generatedAt: adminNow, accounts: [] },
        errorLogSummary: { generatedAt: adminNow, totals: { open: 0, investigating: 0, resolved: 0, ignored: 0, all: 0 }, entries: [] },
        demoOperations: { sessionsCreated: 0, activeSessions: 0, conversions: 0, cleanupCount: 0, rateLimitBlocks: 0, ttsFallbacks: 0, updatedAt: 0 },
        learnerSupport: {
          selectedLearnerId: 'learner-a',
          selectedDiagnostics: {
            learnerId: 'learner-a',
            learnerName: 'Ava',
            overview: { secureWords: 0, dueWords: 0, troubleWords: 0, secureGrammarConcepts: 0, dueGrammarConcepts: 0, weakGrammarConcepts: 0, securePunctuationUnits: 0, duePunctuationItems: 0, weakPunctuationItems: 0 },
            currentFocus: null,
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
          },
          accessibleLearners: [{
            learnerId: 'learner-a', learnerName: 'Ava', yearGroup: 'Y5', membershipRoleLabel: 'Viewer',
            accessModeLabel: 'Read-only learner', writable: false, overview: {}, grammarEvidence: {}, punctuationEvidence: {},
          }],
          punctuationReleaseDiagnostics: null,
          entryPoints: [],
        },
      };
      const actions = { dispatch() {}, navigateHome() {}, openSubject() {}, registerAccountOpsMetadataRowDirty() {} };
      const appState = { learners: { selectedId: 'learner-a', byId: { 'learner-a': { id: 'learner-a', name: 'Ava', yearGroup: 'Y5' } }, allIds: ['learner-a'] }, persistence: { mode: 'remote-sync' }, toasts: [], monsterCelebrations: { queue: [] } };
      const accessContext = { shellAccess: { source: 'worker-session' }, activeAdultLearnerContext: null };
      const accountDirectory = { status: 'loaded', accounts: [] };
      const html = renderToStaticMarkup(
        <AdminHubSurface
          appState={appState}
          model={model}
          hubState={{ status: 'loaded' }}
          accountDirectory={accountDirectory}
          accessContext={accessContext}
          actions={actions}
          initialSection="content"
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

test('U7: Admin Hub renders Grammar concept confidence panel with chip + admin extras (intervalDays + distinctTemplates)', async () => {
  const conceptStatus = [
    makeRow('relative_clauses', 'Relative clauses', {
      status: 'secured',
      attempts: 10,
      correct: 10,
      wrong: 0,
      confidence: { label: 'secure', sampleSize: 10, intervalDays: 14, distinctTemplates: 5, recentMisses: 0 },
    }),
    makeRow('adverbials', 'Adverbials', {
      status: 'weak',
      attempts: 6,
      correct: 2,
      wrong: 4,
      confidence: { label: 'needs-repair', sampleSize: 6, intervalDays: 2, distinctTemplates: 3, recentMisses: 3 },
    }),
  ];
  const html = await renderAdminHub({ conceptStatus });

  // Panel heading
  assert.match(html, /Grammar concepts/);
  assert.match(html, /Grammar · concept confidence/);
  assert.match(html, /data-panel="grammar-concept-confidence"/);

  // Both rows with chip + admin extras
  assert.match(html, /data-concept-id="relative_clauses"/);
  assert.match(html, /grammar-adult-confidence secure/);
  assert.match(html, /secure · 10 attempts/);
  // Admin extras — intervalDays + distinctTemplates must be rendered
  assert.match(html, /14d spacing/);
  assert.match(html, /5 templates/);

  assert.match(html, /data-concept-id="adverbials"/);
  assert.match(html, /grammar-adult-confidence needs-repair/);
  assert.match(html, /needs-repair · 6 attempts/);
  assert.match(html, /3 recent misses/);
  assert.match(html, /2d spacing/);
  assert.match(html, /3 templates/);
});

test('U7: Admin Hub renders all 18 concepts when full concept list is seeded', async () => {
  const conceptStatus = [];
  for (let i = 0; i < 18; i += 1) {
    conceptStatus.push(makeRow(`concept_${i}`, `Concept ${i}`, {
      attempts: i,
      confidence: { label: i > 2 ? 'building' : 'emerging', sampleSize: i, intervalDays: i, distinctTemplates: Math.min(i, 3), recentMisses: 0 },
    }));
  }
  const html = await renderAdminHub({ conceptStatus });
  for (let i = 0; i < 18; i += 1) {
    assert.match(html, new RegExp(`data-concept-id="concept_${i}"`), `concept_${i} row rendered`);
  }
});

test('U7 (R17): Admin Hub — out-of-taxonomy label renders "Unknown" neutral tone, NOT emerging', async () => {
  const conceptStatus = [makeRow('weird_concept', 'Weird', {
    attempts: 4,
    confidence: { label: 'garbage-label', sampleSize: 4, intervalDays: 1, distinctTemplates: 2, recentMisses: 0 },
  })];
  const html = await renderAdminHub({ conceptStatus });
  assert.match(html, /grammar-adult-confidence unknown/);
  assert.match(html, /Unknown · 4 attempts/);
  assert.match(html, /1d spacing/);
  assert.match(html, /2 templates/);
  // The panel region itself must not contain an `emerging` tone or the raw garbage label
  const panelHtml = html.match(/data-panel="grammar-concept-confidence"[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(panelHtml.length > 0, 'admin grammar panel rendered');
  assert.doesNotMatch(panelHtml, /grammar-adult-confidence emerging/);
  assert.doesNotMatch(panelHtml, /grammar-adult-confidence garbage-label/);
});

test('U7: Admin Hub — confidence: null on a row renders no chip and no NPE', async () => {
  const conceptStatus = [
    makeRow('relative_clauses', 'Relative clauses', { attempts: 0, confidence: null }),
    makeRow('adverbials', 'Adverbials', { attempts: 3, confidence: { label: 'building', sampleSize: 3, intervalDays: 1, distinctTemplates: 1, recentMisses: 0 } }),
  ];
  const html = await renderAdminHub({ conceptStatus });
  assert.match(html, /Grammar concepts/);
  // Scoping: relative_clauses row exists, has no chip; adverbials row has a building chip
  const rc = html.match(/data-concept-id="relative_clauses"[\s\S]*?<\/li>/)?.[0] || '';
  assert.ok(rc.length > 0, 'relative_clauses row rendered');
  assert.doesNotMatch(rc, /grammar-adult-confidence/);
  assert.match(html, /grammar-adult-confidence building/);
  assert.match(html, /building · 3 attempts/);
  assert.match(html, /1d spacing/);
  assert.match(html, /1 template</);
});
