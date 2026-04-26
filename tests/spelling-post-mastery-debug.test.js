// P2 U1: Post-Mega spelling diagnostic panel tests.
//
// Coverage pinned here:
//  1. Characterisation — the pre-U1 post-mastery selector shape stays
//     stable (every existing sibling remains, and `postMasteryDebug` is
//     the only new top-level addition).
//  2. Happy-path counts — `postMasteryDebug.source === 'service'`, the
//     published / secure / blocking counts, and the first 10 blocking
//     slugs alphabetically for a half-secured learner.
//  3. H8 scrub — malformed / unpublished slugs never appear in the
//     preview; only slugs matching `/^[a-z][a-z0-9-]+$/` and
//     `word.published !== false` pass through.
//  4. Edge cases — empty progress, extra-pool ignore semantics.
//  5. Error path — `createLockedPostMasteryState` / the client stub
//     produces `source: 'locked-fallback'`.
//  6. Integration — admin hub response carries `postMasteryDebug` when
//     `canViewAdminHub === true`; parent-role adults see an empty envelope.
//  7. Integration — `SpellingSetupScene` renders the adult-only link
//     only when `platformRole ∈ {'admin', 'ops'}`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import {
  buildSpellingLearnerReadModel,
  getSpellingPostMasteryState,
} from '../src/subjects/spelling/read-model.js';
import { createSpellingReadModelService } from '../src/subjects/spelling/client-read-models.js';
import { buildAdminHubReadModel } from '../src/platform/hubs/admin-read-model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = 19_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = TODAY * DAY_MS;

function nodePaths() {
  return [
    path.join(rootDir, 'node_modules'),
    ...String(process.env.NODE_PATH || '').split(path.delimiter),
  ].filter((entry) => entry && existsSync(entry));
}

function normaliseLineEndings(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Shared fixture renderer for SpellingSetupScene — bundles JSX via esbuild
// then runs the entry subprocess so the JSX imports resolve. Mirrors the
// pattern in tests/react-admin-hub-kpi-split.test.js.
async function renderSetupSceneViaBundle({ platformRole }) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'ks2-setup-pr-'));
  const entryPath = path.join(tmpDir, 'entry.jsx');
  const bundlePath = path.join(tmpDir, 'entry.cjs');
  try {
    await writeFile(entryPath, `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { SpellingSetupScene } from ${JSON.stringify(path.join(rootDir, 'src/subjects/spelling/components/SpellingSetupScene.jsx'))};
      import { MonsterVisualConfigProvider } from ${JSON.stringify(path.join(rootDir, 'src/platform/game/MonsterVisualConfigContext.jsx'))};

      const learner = { id: 'learner-a', name: 'Diag', yearGroup: 'Y5' };
      const subject = { id: 'spelling', name: 'Spelling' };
      const prefs = {
        mode: 'smart',
        yearFilter: 'core',
        roundLength: '20',
        showCloze: true,
        autoSpeak: true,
        extraWordFamilies: false,
      };
      const ui = { phase: 'dashboard', pendingCommand: '' };
      const postMastery = {
        allWordsMega: false,
        guardianDueCount: 0,
        wobblingCount: 0,
        wobblingDueCount: 0,
        nonWobblingDueCount: 0,
        unguardedMegaCount: 0,
        guardianAvailableCount: 0,
        guardianMissionState: 'locked',
        guardianMissionAvailable: false,
        recommendedWords: [],
        nextGuardianDueDay: null,
        todayDay: ${TODAY},
        guardianMap: {},
      };
      const service = {
        getStats: () => ({ total: 10, secure: 3, due: 2, trouble: 1, fresh: 4, accuracy: 65 }),
        getPrefs: () => prefs,
        initState: (rawState) => rawState || { phase: 'dashboard' },
        getAnalyticsSnapshot: () => null,
        getPostMasteryState: () => postMastery,
        getAudioCue: () => null,
      };
      const repositories = { gameState: null };
      const actions = { dispatch() {} };
      const html = renderToStaticMarkup(
        <MonsterVisualConfigProvider value={null}>
          <SpellingSetupScene
            learner={learner}
            service={service}
            repositories={repositories}
            subject={subject}
            prefs={prefs}
            ui={ui}
            codex={[]}
            accent="#3E6FA8"
            actions={actions}
            postMastery={postMastery}
            setupHeroTone=""
            previousHeroBg=""
            runtimeReadOnly={false}
            platformRole={${JSON.stringify(platformRole)}}
          />
        </MonsterVisualConfigProvider>
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

function makeCoreWord(index, overrides = {}) {
  return {
    slug: `core-${String(index).padStart(3, '0')}`,
    word: `core-${index}`,
    family: `family-${index % 12}`,
    year: index % 2 === 0 ? '3-4' : '5-6',
    yearLabel: index % 2 === 0 ? 'Years 3-4' : 'Years 5-6',
    spellingPool: 'core',
    accepted: [`core-${index}`],
    sentence: `Sentence for core word ${index}.`,
    ...overrides,
  };
}

function makeExtraWord(index) {
  return {
    slug: `extra-${String(index).padStart(3, '0')}`,
    word: `extra-${index}`,
    family: `family-extra-${index % 4}`,
    year: 'extra',
    yearLabel: 'Extra',
    spellingPool: 'extra',
    accepted: [`extra-${index}`],
    sentence: `Sentence for extra word ${index}.`,
  };
}

function makeRuntimeSnapshot({ coreCount = 20, extraCount = 0, extraWords = [] } = {}) {
  const coreWords = Array.from({ length: coreCount }, (_, i) => makeCoreWord(i + 1));
  const extras = Array.from({ length: extraCount }, (_, i) => makeExtraWord(i + 1));
  const allExtras = [...extras, ...extraWords];
  const words = [...coreWords, ...allExtras];
  const wordBySlug = Object.fromEntries(words.map((word) => [word.slug, word]));
  return { words, wordBySlug, coreWords, extraWords: allExtras };
}

function secureProgressEntries(words) {
  return Object.fromEntries(
    words.map((word) => [word.slug, {
      stage: 4,
      attempts: 6,
      correct: 5,
      wrong: 1,
      dueDay: TODAY + 60,
      lastDay: TODAY - 7,
      lastResult: true,
    }]),
  );
}

function partialProgressEntries(words, { stage = 2 } = {}) {
  return Object.fromEntries(
    words.map((word) => [word.slug, {
      stage,
      attempts: 3,
      correct: 2,
      wrong: 1,
      dueDay: TODAY + 1,
      lastDay: TODAY - 1,
      lastResult: false,
    }]),
  );
}

function makeSubjectStateRecord({ progress = {}, guardian = {}, prefs = {}, extra = {} } = {}) {
  return {
    data: {
      prefs,
      progress,
      guardian,
      ...extra,
    },
  };
}

// --------------------------------------------------------------------------
// Characterisation: getSpellingPostMasteryState return shape stays stable.
// --------------------------------------------------------------------------

test('characterisation: getSpellingPostMasteryState preserves every pre-U1 top-level field', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 10 });
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: NOW_MS });

  // Pre-U1 fields must still exist and have the same semantics.
  assert.ok('allWordsMega' in state);
  assert.ok('guardianDueCount' in state);
  assert.ok('wobblingCount' in state);
  assert.ok('wobblingDueCount' in state);
  assert.ok('nonWobblingDueCount' in state);
  assert.ok('unguardedMegaCount' in state);
  assert.ok('guardianAvailableCount' in state);
  assert.ok('guardianMissionState' in state);
  assert.ok('guardianMissionAvailable' in state);
  assert.ok('recommendedWords' in state);
  assert.ok('nextGuardianDueDay' in state);

  // U1 addition — the only new top-level sibling.
  assert.ok('postMasteryDebug' in state);
  assert.equal(typeof state.postMasteryDebug, 'object');
});

// --------------------------------------------------------------------------
// Happy-path: source === 'service' and counts match computation.
// --------------------------------------------------------------------------

test('U1 happy: sourceHint "service" yields postMasteryDebug.source === "service" and matching counts', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 5 });
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords.slice(0, 2)),
  });
  const state = getSpellingPostMasteryState({
    subjectStateRecord,
    runtimeSnapshot,
    now: NOW_MS,
    sourceHint: 'service',
  });
  assert.equal(state.postMasteryDebug.source, 'service');
  assert.equal(state.postMasteryDebug.publishedCoreCount, 5);
  assert.equal(state.postMasteryDebug.secureCoreCount, 2);
  assert.equal(state.postMasteryDebug.blockingCoreCount, 3);
  assert.equal(state.postMasteryDebug.allWordsMega, false);
  assert.equal(state.postMasteryDebug.stickyUnlocked, false);
  assert.equal(state.postMasteryDebug.contentReleaseId, null);
});

test('U1 happy: sourceHint "worker" flows through to postMasteryDebug.source', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 3 });
  const subjectStateRecord = makeSubjectStateRecord({});
  const state = getSpellingPostMasteryState({
    subjectStateRecord,
    runtimeSnapshot,
    now: NOW_MS,
    sourceHint: 'worker',
  });
  assert.equal(state.postMasteryDebug.source, 'worker');
});

test('U1 happy: unknown sourceHint falls back to "service"', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 3 });
  const state = getSpellingPostMasteryState({
    subjectStateRecord: makeSubjectStateRecord({}),
    runtimeSnapshot,
    now: NOW_MS,
    sourceHint: 'bogus-source',
  });
  assert.equal(state.postMasteryDebug.source, 'service');
});

// --------------------------------------------------------------------------
// blockingCoreSlugsPreview — alphabetical, first 10, scrubbed.
// --------------------------------------------------------------------------

test('U1 happy: blockingCoreSlugsPreview lists first 10 blocking core slugs alphabetically', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 15 });
  const subjectStateRecord = makeSubjectStateRecord({ progress: {} });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: NOW_MS });
  assert.equal(state.postMasteryDebug.blockingCoreSlugsPreview.length, 10);
  assert.deepEqual(state.postMasteryDebug.blockingCoreSlugsPreview.slice(0, 3), [
    'core-001',
    'core-002',
    'core-003',
  ]);
  const sorted = [...state.postMasteryDebug.blockingCoreSlugsPreview].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(state.postMasteryDebug.blockingCoreSlugsPreview, sorted);
});

test('U1 H8 scrub: slugs outside /^[a-z][a-z0-9-]+$/ never reach the preview', () => {
  const core1 = makeCoreWord(1);
  const badUpperSlug = { ...makeCoreWord(2), slug: 'Core-002' };
  const badUnderscoreSlug = { ...makeCoreWord(3), slug: 'core_003' };
  const words = [core1, badUpperSlug, badUnderscoreSlug];
  const runtimeSnapshot = {
    words,
    wordBySlug: Object.fromEntries(words.map((w) => [w.slug, w])),
    coreWords: words,
    extraWords: [],
  };
  const state = getSpellingPostMasteryState({
    subjectStateRecord: makeSubjectStateRecord({}),
    runtimeSnapshot,
    now: NOW_MS,
  });
  // Only the valid slug passes the regex scrub.
  assert.deepEqual(state.postMasteryDebug.blockingCoreSlugsPreview, ['core-001']);
});

test('U1 H8 scrub: word.published === false excludes the slug from the preview', () => {
  const core1 = makeCoreWord(1);
  const unpublishedSlug = { ...makeCoreWord(2), slug: 'rude-word-test-do-not-ship', published: false };
  const words = [core1, unpublishedSlug];
  const runtimeSnapshot = {
    words,
    wordBySlug: Object.fromEntries(words.map((w) => [w.slug, w])),
    coreWords: words,
    extraWords: [],
  };
  const state = getSpellingPostMasteryState({
    subjectStateRecord: makeSubjectStateRecord({}),
    runtimeSnapshot,
    now: NOW_MS,
  });
  assert.deepEqual(state.postMasteryDebug.blockingCoreSlugsPreview, ['core-001']);
});

// --------------------------------------------------------------------------
// Edge: empty published core + empty progress.
// --------------------------------------------------------------------------

test('U1 edge: empty published core => blockingCoreCount 0, preview [], stickyUnlocked false', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 0 });
  const state = getSpellingPostMasteryState({
    subjectStateRecord: makeSubjectStateRecord({}),
    runtimeSnapshot,
    now: NOW_MS,
  });
  assert.equal(state.postMasteryDebug.publishedCoreCount, 0);
  assert.equal(state.postMasteryDebug.blockingCoreCount, 0);
  assert.deepEqual(state.postMasteryDebug.blockingCoreSlugsPreview, []);
  assert.equal(state.postMasteryDebug.stickyUnlocked, false);
  assert.equal(state.postMasteryDebug.allWordsMega, false);
});

// --------------------------------------------------------------------------
// Edge: extraWordsIgnoredCount excludes non-core pool.
// --------------------------------------------------------------------------

test('U1 edge: extraWordsIgnoredCount counts extra-pool progress entries without inflating blocking core', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 3, extraCount: 5 });
  const subjectStateRecord = makeSubjectStateRecord({
    progress: {
      ...secureProgressEntries(runtimeSnapshot.coreWords),
      ...partialProgressEntries(runtimeSnapshot.extraWords, { stage: 2 }),
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: NOW_MS });
  assert.equal(state.postMasteryDebug.publishedCoreCount, 3);
  assert.equal(state.postMasteryDebug.secureCoreCount, 3);
  assert.equal(state.postMasteryDebug.blockingCoreCount, 0);
  assert.equal(state.postMasteryDebug.allWordsMega, true);
  assert.equal(state.postMasteryDebug.extraWordsIgnoredCount, 5);
});

// --------------------------------------------------------------------------
// Edge: stickyUnlocked reads `data.postMega != null`.
// --------------------------------------------------------------------------

test('U1 edge: stickyUnlocked is true when subjectStateRecord.data.postMega is a plain object', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 3 });
  const stateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    extra: { postMega: { unlockedAt: 1_777_000_000_000 } },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord: stateRecord, runtimeSnapshot, now: NOW_MS });
  assert.equal(state.postMasteryDebug.stickyUnlocked, true);
});

// --------------------------------------------------------------------------
// guardianMapCount.
// --------------------------------------------------------------------------

test('U1 edge: guardianMapCount reflects normalised guardian map size', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 3 });
  const [w0, w1] = runtimeSnapshot.coreWords;
  const subjectStateRecord = makeSubjectStateRecord({
    progress: secureProgressEntries(runtimeSnapshot.coreWords),
    guardian: {
      [w0.slug]: {
        reviewLevel: 1,
        lastReviewedDay: TODAY - 3,
        nextDueDay: TODAY - 1,
        correctStreak: 0,
        lapses: 0,
        renewals: 0,
        wobbling: false,
      },
      [w1.slug]: {
        reviewLevel: 0,
        lastReviewedDay: null,
        nextDueDay: TODAY + 3,
        correctStreak: 0,
        lapses: 0,
        renewals: 0,
        wobbling: false,
      },
    },
  });
  const state = getSpellingPostMasteryState({ subjectStateRecord, runtimeSnapshot, now: NOW_MS });
  assert.equal(state.postMasteryDebug.guardianMapCount, 2);
});

// --------------------------------------------------------------------------
// Error path: createLockedPostMasteryState via the client stub carries
// source: 'locked-fallback'.
// --------------------------------------------------------------------------

test('U1 error: client-read-models fallback stub attaches postMasteryDebug.source === "locked-fallback"', () => {
  const service = createSpellingReadModelService({
    getState: () => ({}),
  });
  const snapshot = service.getPostMasteryState('learner-a');
  assert.ok(snapshot.postMasteryDebug);
  assert.equal(snapshot.postMasteryDebug.source, 'locked-fallback');
  assert.equal(snapshot.postMasteryDebug.publishedCoreCount, 0);
  assert.equal(snapshot.postMasteryDebug.stickyUnlocked, false);
  assert.deepEqual(snapshot.postMasteryDebug.blockingCoreSlugsPreview, []);
});

test('U1: buildSpellingLearnerReadModel propagates postMasteryDebug into the postMastery sibling', () => {
  const runtimeSnapshot = makeRuntimeSnapshot({ coreCount: 5 });
  const output = buildSpellingLearnerReadModel({
    subjectStateRecord: makeSubjectStateRecord({
      progress: secureProgressEntries(runtimeSnapshot.coreWords.slice(0, 2)),
    }),
    runtimeSnapshot,
    now: NOW_MS,
  });
  assert.ok(output.postMastery.postMasteryDebug);
  assert.equal(output.postMastery.postMasteryDebug.publishedCoreCount, 5);
  assert.equal(output.postMastery.postMasteryDebug.blockingCoreCount, 3);
});

// --------------------------------------------------------------------------
// Admin hub integration: postMasteryDebug present when canViewAdminHub true.
// --------------------------------------------------------------------------

function makeAdminHubLearner(id = 'learner-a') {
  return {
    id,
    name: 'Diagnostic Learner',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
  };
}

test('U1 integration: admin hub response includes postMasteryDebug for admin-role viewer', () => {
  const learner = makeAdminHubLearner();
  const model = buildAdminHubReadModel({
    account: { id: 'adult-admin', selectedLearnerId: learner.id, platformRole: 'admin' },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [{ learnerId: learner.id, learner, role: 'owner' }],
    learnerBundles: { [learner.id]: { subjectStates: { spelling: { data: { progress: {} } } } } },
    runtimeSnapshots: {},
    selectedLearnerId: learner.id,
    now: () => NOW_MS,
  });
  assert.equal(model.permissions.canViewAdminHub, true);
  assert.ok(model.postMasteryDebug);
  assert.equal(typeof model.postMasteryDebug.source, 'string');
  assert.equal(model.postMasteryDebug.source, 'service');
  assert.equal(model.reality.postMasteryDebug, 'real');
});

test('U1 integration: admin hub response returns empty postMasteryDebug envelope for parent-role viewer', () => {
  const learner = makeAdminHubLearner();
  const model = buildAdminHubReadModel({
    account: { id: 'adult-parent', selectedLearnerId: learner.id, platformRole: 'parent' },
    platformRole: 'parent',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [{ learnerId: learner.id, learner, role: 'owner' }],
    learnerBundles: { [learner.id]: { subjectStates: { spelling: { data: { progress: {} } } } } },
    runtimeSnapshots: {},
    selectedLearnerId: learner.id,
    now: () => NOW_MS,
  });
  assert.equal(model.permissions.canViewAdminHub, false);
  assert.ok(model.postMasteryDebug);
  assert.equal(model.postMasteryDebug.source, 'locked-fallback');
  assert.equal(model.postMasteryDebug.publishedCoreCount, 0);
  assert.equal(model.reality.postMasteryDebug, 'placeholder');
});

// --------------------------------------------------------------------------
// SpellingSetupScene adult-only link: role gating.
// --------------------------------------------------------------------------

test('U1 integration: setup scene renders adult-only post-mastery debug link for admin role', async () => {
  const html = await renderSetupSceneViaBundle({ platformRole: 'admin' });
  assert.match(html, /Why is Guardian locked\?/);
  assert.match(html, /data-adult-debug="post-mastery"/);
  assert.match(html, /data-action="open-admin-hub"/);
});

test('U1 integration: setup scene renders adult-only post-mastery debug link for ops role', async () => {
  const html = await renderSetupSceneViaBundle({ platformRole: 'ops' });
  assert.match(html, /Why is Guardian locked\?/);
  assert.match(html, /data-adult-debug="post-mastery"/);
});

test('U1 integration: setup scene omits post-mastery debug link for parent role', async () => {
  const html = await renderSetupSceneViaBundle({ platformRole: 'parent' });
  assert.doesNotMatch(html, /Why is Guardian locked\?/);
  assert.doesNotMatch(html, /data-adult-debug="post-mastery"/);
});

test('U1 integration: setup scene omits post-mastery debug link when platformRole is empty', async () => {
  const html = await renderSetupSceneViaBundle({ platformRole: '' });
  assert.doesNotMatch(html, /Why is Guardian locked\?/);
});

test('U1 integration: setup scene omits post-mastery debug link for learner role', async () => {
  const html = await renderSetupSceneViaBundle({ platformRole: 'learner' });
  assert.doesNotMatch(html, /Why is Guardian locked\?/);
});
