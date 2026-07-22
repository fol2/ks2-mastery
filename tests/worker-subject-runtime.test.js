import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createWorkerApp } from '../worker/src/app.js';
import {
  PUBLIC_SPELLING_MONSTER_IDS,
  PUBLIC_SPELLING_REWARD_TRACK_IDS,
  createWorkerRepository,
  publicMonsterCodexState,
  publicMonsterCodexStateFromSpellingProgress,
  publicMonsterCodexStateWithoutSpellingEntries,
} from '../worker/src/repository.js';
import { createSubjectRuntime, createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { normaliseSubjectCommandRequest } from '../worker/src/subjects/command-contract.js';
import { resolveRuntimeSnapshot } from '../src/subjects/spelling/content/model.js';
import {
  SEEDED_SPELLING_CONTENT_BUNDLE,
  SEEDED_SPELLING_PUBLISHED_SNAPSHOT,
} from '../src/subjects/spelling/data/content-data.js';
import {
  SEEDED_SPELLING_CONTENT_SUMMARY,
  readSeededSpellingContentBundle,
  readSeededSpellingPublishedSnapshot,
} from '../worker/src/generated-spelling-content-seed.js';
import {
  encodeContentOperationSnapshot,
} from '../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  isStatutoryCoreWord,
} from '../src/subjects/spelling/content/taxonomy.js';
import {
  LEGACY_SPELLING_REWARD_TRACKS,
} from '../src/platform/game/reward-track-config.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

function cookieFrom(response) {
  const setCookie = response.headers.get('set-cookie') || '';
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  return match ? `ks2_session=${match[1]}` : '';
}

function accountContentQueries(db) {
  return db.takeQueryLog().filter((entry) => /account_subject_content/i.test(entry.sql || ''));
}

function selectsRawContentJson(sql = '') {
  return /\n\s*content_json\s*(?:,|\n|\r)/i.test(sql);
}

test('Worker spelling codex projection follows legacy reward-track mapping without migrating state', () => {
  const derived = publicMonsterCodexStateFromSpellingProgress(
    {
      possess: { stage: 4 },
      necessary: { stage: 4 },
      mollusc: { stage: 4 },
    },
    {
      words: [
        { slug: 'possess', spellingPool: 'core', yearBand: '3-4' },
        { slug: 'necessary', spellingPool: 'core', yearBand: '5-6' },
        { slug: 'mollusc', spellingPool: 'extra', yearBand: 'extra' },
      ],
    },
    {},
    { learnerId: 'learner-reward-track-projection' },
  );

  assert.deepEqual(
    PUBLIC_SPELLING_REWARD_TRACK_IDS,
    LEGACY_SPELLING_REWARD_TRACKS.map((track) => track.id),
  );
  assert.equal(derived.knownWordCount, 3);
  assert.equal(derived.state.inklet.masteredCount, 1);
  assert.equal(derived.state.glimmerbug.masteredCount, 1);
  assert.equal(derived.state.phaeton.masteredCount, 2);
  assert.equal(derived.state.vellhorn.masteredCount, 1);
  assert.equal(derived.state.inklet.rewardTrackId, undefined);
});

test('Worker spelling codex projection respects reward-track Hero / Codex exposure', () => {
  const now = Date.UTC(2026, 5, 12, 9, 0, 0);
  const exposedTracks = LEGACY_SPELLING_REWARD_TRACKS.map((track) => {
    if (track.id === 'spelling-core-inklet') {
      return { ...track, heroExposure: { state: 'hidden' } };
    }
    if (track.id === 'spelling-core-glimmerbug') {
      return { ...track, heroExposure: { state: 'scheduled', scheduledAt: now + 60_000 } };
    }
    return { ...track, heroExposure: { state: 'visible' } };
  });
  const snapshot = {
    rewardTracks: exposedTracks,
    words: [
      { slug: 'alpha', spellingPool: 'core', yearBand: '3-4' },
      { slug: 'bravo', spellingPool: 'core', yearBand: '5-6' },
    ],
  };
  const progress = {
    alpha: { stage: 4 },
    bravo: { stage: 4 },
  };

  const learnerRuntime = publicMonsterCodexStateFromSpellingProgress(progress, snapshot, {}, {
    learnerId: 'learner-exposure',
    now,
  });
  const afterSchedule = publicMonsterCodexStateFromSpellingProgress(progress, {
    ...snapshot,
    rewardTracks: exposedTracks.map((track) => (
      track.id === 'spelling-core-glimmerbug'
        ? { ...track, heroExposure: { state: 'scheduled', scheduledAt: now } }
        : track
    )),
  }, {}, {
    learnerId: 'learner-exposure',
    now,
  });
  const adminPreview = publicMonsterCodexStateFromSpellingProgress(progress, snapshot, {}, {
    learnerId: 'learner-exposure',
    now,
    includeAdminPreview: true,
  });

  assert.equal(learnerRuntime.knownWordCount, 2);
  assert.equal(learnerRuntime.state.inklet, undefined);
  assert.equal(learnerRuntime.state.glimmerbug, undefined);
  assert.equal(learnerRuntime.state.phaeton.masteredCount, 0);
  assert.equal(afterSchedule.state.glimmerbug.masteredCount, 1);
  assert.equal(afterSchedule.state.phaeton.masteredCount, 1);
  assert.equal(adminPreview.state.inklet.masteredCount, 1);
  assert.equal(adminPreview.state.glimmerbug.masteredCount, 1);
});

test('Worker spelling codex projection drops stale hidden entries while preserving other subjects', () => {
  const now = Date.UTC(2026, 5, 12, 9, 0, 0);
  const learnerId = 'learner-stale-exposure';
  const rewardTracks = LEGACY_SPELLING_REWARD_TRACKS.map((track) => {
    if (track.id === 'spelling-core-inklet') {
      return { ...track, heroExposure: { state: 'hidden' } };
    }
    return { ...track, heroExposure: { state: 'visible' } };
  });
  const existingState = publicMonsterCodexState({
    inklet: { masteredCount: 12, caught: true, branch: 'b1' },
    quoral: { masteredCount: 3, caught: true, branch: 'b2' },
  }, { learnerId });
  const derived = publicMonsterCodexStateFromSpellingProgress(
    { alpha: { stage: 4 }, bravo: { stage: 4 } },
    {
      rewardTracks,
      words: [
        { slug: 'alpha', spellingPool: 'core', yearBand: '3-4' },
        { slug: 'bravo', spellingPool: 'core', yearBand: '5-6' },
      ],
    },
    existingState,
    { learnerId, now },
  );
  const merged = publicMonsterCodexState({
    ...publicMonsterCodexStateWithoutSpellingEntries(existingState, { learnerId }),
    ...derived.state,
  }, { learnerId });

  assert.equal(PUBLIC_SPELLING_MONSTER_IDS.includes('inklet'), true);
  assert.equal(derived.state.inklet, undefined);
  assert.equal(merged.inklet, undefined);
  assert.equal(merged.glimmerbug.visibleInCodex, true);
  assert.equal(merged.phaeton.visibleInCodex, true);
  assert.equal(merged.quoral.masteredCount, 3);
  assert.equal(merged.quoral.branch, 'b2');
});

async function postJson(server, path, body = {}, headers = {}) {
  return server.fetchRaw(`https://repo.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function publishSpellingWordEdit(repository, word, {
  actorAccountId = 'admin-a',
  title = 'Runtime content package',
  fieldPath = 'explanation',
  action = 'set',
  payload = `Runtime content explanation for ${word?.word || 'word'}.`,
} = {}) {
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: actorAccountId,
    proof: { source: 'worker-subject-runtime-test-helper' },
  });
  const contentPackage = await repository.createContentOperationPackage({
    templateId: 'edit-spelling-word',
    title,
    createdByAccountId: actorAccountId,
  });
  await repository.appendContentOperation(contentPackage.packageId, {
    entityType: 'spelling.word',
    entityId: word.slug,
    fieldPath,
    action,
    payload,
  }, {
    actorAccountId,
  });
  const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
    actorAccountId,
  });
  await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
    approvedByAccountId: actorAccountId,
  });
  return repository.publishContentOperationPackage(contentPackage.packageId, {
    publishedByAccountId: actorAccountId,
  });
}

test('subject command contract requires command identity and revision metadata', () => {
  assert.throws(() => normaliseSubjectCommandRequest({
    routeSubjectId: 'spelling',
    body: {
      command: 'start',
      learnerId: 'learner-a',
      requestId: 'cmd-1',
    },
  }), /expectedLearnerRevision/);

  const command = normaliseSubjectCommandRequest({
    routeSubjectId: 'spelling',
    body: {
      command: 'Start Session',
      learnerId: 'learner-a',
      requestId: 'cmd-1',
      expectedLearnerRevision: 3,
      payload: { mode: 'smart' },
    },
  });

  assert.deepEqual(command, {
    subjectId: 'spelling',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-1',
    correlationId: 'cmd-1',
    expectedLearnerRevision: 3,
    payload: { mode: 'smart' },
  });
});

test('subject runtime dispatches to subject-owned handlers', async () => {
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async (command, context) => ({
          ok: true,
          learnerId: command.learnerId,
          subjectReadModel: { phase: 'setup' },
          accountId: context.session.accountId,
        }),
      },
    },
  });

  const result = await runtime.dispatch({
    subjectId: 'spelling',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-1',
    correlationId: 'cmd-1',
    expectedLearnerRevision: 0,
    payload: {},
  }, {
    session: { accountId: 'adult-a' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.subjectId, 'spelling');
  assert.equal(result.command, 'start-session');
  assert.equal(result.learnerId, 'learner-a');
  assert.deepEqual(result.subjectReadModel, { phase: 'setup' });
});

test('worker subject runtime keeps every subject command engine off the startup path', async () => {
  const source = await readFile(new URL('../worker/src/subjects/runtime.js', import.meta.url), 'utf8');

  for (const subjectId of ['arithmetic', 'grammar', 'punctuation', 'reading', 'reasoning', 'spelling']) {
    assert.doesNotMatch(
      source,
      new RegExp(`from\\s+['"]\\./${subjectId}/commands\\.js['"]`),
      `${subjectId} command handlers must stay lazy so unrelated gameplay content is not built during Worker startup`,
    );
    assert.match(
      source,
      new RegExp(`import\\(['"]\\./${subjectId}/commands\\.js['"]\\)`),
      `${subjectId} command handlers must load only when that subject is dispatched`,
    );
  }
});

test('worker repository keeps heavy punctuation read-model service off the startup path', async () => {
  const source = await readFile(new URL('../worker/src/repository.js', import.meta.url), 'utf8');
  const persistenceSource = await readFile(
    new URL('../worker/src/subjects/punctuation/gameplay-persistence.js', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /import\s+\{[^}]*buildPunctuationReadModel[^}]*\}\s+from\s+['"]\.\/subjects\/punctuation\/read-models\.js['"]/,
    'punctuation read-model assembly must stay lazy so the generated runtime manifest is not built during Worker startup',
  );
  assert.doesNotMatch(
    source,
    /import\s+\{[^}]*createPunctuationService[^}]*\}\s+from\s+['"]\.\.\/\.\.\/shared\/punctuation\/service\.js['"]/,
    'punctuation service must stay lazy because its default runtime manifest is expensive to build',
  );
  assert.doesNotMatch(
    source,
    /from\s+['"]\.\/subjects\/punctuation\/gameplay-state\.js['"]/,
    'the repository must not reach the heavy Punctuation planner through a transitive import',
  );
  assert.match(source, /from\s+['"]\.\/subjects\/punctuation\/gameplay-persistence\.js['"]/);
  assert.doesNotMatch(
    persistenceSource,
    /from\s+['"][^'"]*punctuation\/(?:content|generators|scheduler|service)\.js['"]/,
    'Punctuation persistence helpers must remain independent of the generated catalogue graph',
  );
  assert.match(source, /import\(['"]\.\/subjects\/punctuation\/read-models\.js['"]\)/);
  assert.match(source, /import\(['"]\.\.\/\.\.\/shared\/punctuation\/service\.js['"]\)/);
});

test('worker repository keeps subject content read-model engines off the startup path', async () => {
  const source = await readFile(new URL('../worker/src/repository.js', import.meta.url), 'utf8');

  for (const subjectId of ['grammar', 'reading', 'arithmetic', 'reasoning']) {
    assert.doesNotMatch(
      source,
      new RegExp(`from\\s+['"]\\./subjects/${subjectId}/(?:engine|read-models)\\.js['"]`),
      `${subjectId} content and read-model modules must not initialise for unrelated Worker requests`,
    );
    assert.match(
      source,
      new RegExp(`import\\(['"]\\./subjects/${subjectId}/read-models\\.js['"]\\)`),
      `${subjectId} read-model assembly must be route-lazy`,
    );
  }
});

test('worker repository keeps the generated Spelling seed off the startup path', async () => {
  const source = await readFile(new URL('../worker/src/repository.js', import.meta.url), 'utf8');
  const loaderSource = await readFile(
    new URL('../worker/src/spelling-content-seed-loader.js', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /from\s+['"]\.\/generated-spelling-content-seed\.js['"]/,
    'the compressed Spelling seed must not be parsed for unrelated Worker requests',
  );
  assert.match(source, /from\s+['"]\.\/spelling-content-seed-loader\.js['"]/);
  assert.doesNotMatch(
    loaderSource,
    /from\s+['"]\.\/generated-spelling-content-seed\.js['"]/,
    'the seed loader must not turn the generated seed back into a static dependency',
  );
  assert.match(
    loaderSource,
    /import\(['"]\.\/generated-spelling-content-seed\.js['"]\)/,
    'the Spelling seed must load only when a Spelling content path needs it',
  );
});

test('Worker keeps content-operations routes and repository off gameplay startup', async () => {
  const appSource = await readFile(new URL('../worker/src/app.js', import.meta.url), 'utf8');
  const repositorySource = await readFile(new URL('../worker/src/repository.js', import.meta.url), 'utf8');

  for (const modulePath of ['./content-operations/routes.js', './content-operations/assets.js']) {
    assert.doesNotMatch(appSource, new RegExp(`from\\s+['"]${modulePath.replaceAll('.', '\\.')}['"]`));
    assert.match(appSource, new RegExp(`import\\(['"]${modulePath.replaceAll('.', '\\.')}['"]\\)`));
  }
  assert.doesNotMatch(
    repositorySource,
    /from\s+['"]\.\/content-operations\/repository\.js['"]/,
  );
  assert.match(
    repositorySource,
    /import\(['"]\.\/content-operations\/repository\.js['"]\)/,
  );
});

test('Worker keeps the full monster visual manifest and validators off gameplay startup', async () => {
  const source = await readFile(new URL('../worker/src/repository.js', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /from\s+['"]\.\.\/\.\.\/src\/platform\/game\/monster-asset-manifest\.js['"]/,
    'gameplay startup needs only the small generated manifest hash',
  );
  assert.doesNotMatch(
    source,
    /from\s+['"]\.\.\/\.\.\/src\/platform\/game\/monster-visual-config\.js['"]/,
    'monster visual validators must load only on their own route',
  );
  assert.match(
    source,
    /from\s+['"]\.\.\/\.\.\/src\/platform\/game\/monster-asset-manifest-meta\.js['"]/,
  );
  assert.match(
    source,
    /import\(['"]\.\.\/\.\.\/src\/platform\/game\/monster-visual-config\.js['"]\)/,
  );
});

test('Worker build emits route-lazy modules instead of one monolithic startup file', async () => {
  const source = await readFile(new URL('../scripts/build-worker.mjs', import.meta.url), 'utf8');

  assert.match(source, /splitting:\s*true/);
  assert.match(source, /outdir:\s*workerDistDir/);
  assert.match(source, /chunkNames:\s*['"]chunks\/\[name\]-\[hash\]['"]/);
  assert.doesNotMatch(source, /outfile:\s*workerOutfile/);
});

test('repository reuses cached spelling runtime content for hot subject paths', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_776_000_000_000 });
  try {
    const first = await repository.readSpellingRuntimeContent('adult-a', 'spelling');
    const second = await repository.readSpellingRuntimeContent('adult-a', 'spelling');

    assert.equal(second.snapshot, first.snapshot);
    assert.equal(second.summary, first.summary);
    assert.equal(second.content, first.content);
    assert.equal(first.snapshot, await readSeededSpellingPublishedSnapshot());
    assert.equal(first.summary, SEEDED_SPELLING_CONTENT_SUMMARY);
    assert.equal(first.content, null);
    assert.deepEqual(first.snapshot, SEEDED_SPELLING_PUBLISHED_SNAPSHOT);
    assert.equal(second.snapshot.words.length, SEEDED_SPELLING_PUBLISHED_SNAPSHOT.words.length);
  } finally {
    DB.close();
  }
});

test('repository can serve spelling runtime from the bundled snapshot without D1 content reads', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_776_000_000_000 });
  try {
    DB.clearQueryLog();

    const runtime = await repository.readSpellingRuntimeContent('adult-a', 'spelling', {
      includeAccountContent: false,
    });
    const contentQueries = accountContentQueries(DB);

    assert.equal(runtime.content, null);
    assert.equal(runtime.summary, SEEDED_SPELLING_CONTENT_SUMMARY);
    assert.equal(runtime.snapshot, await readSeededSpellingPublishedSnapshot());
    assert.equal(contentQueries.length, 0);
  } finally {
    DB.close();
  }
});

test('repository serves spelling runtime from the global content operations release', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_777_000_000_000 });
  try {
    const seeded = await readSeededSpellingContentBundle();
    await repository.seedFirstContentOperationRelease({
      seededByAccountId: 'admin-a',
      proof: { source: 'worker-subject-runtime-global-release-test' },
    });
    const word = seeded.draft.words[0];
    const explanation = `A global-release learner-facing explanation for ${word.word}.`;
    const contentPackage = await repository.createContentOperationPackage({
      templateId: 'edit-spelling-word',
      title: 'Runtime global release package',
      createdByAccountId: 'admin-a',
    });
    await repository.appendContentOperation(contentPackage.packageId, {
      entityType: 'spelling.word',
      entityId: word.slug,
      fieldPath: 'explanation',
      action: 'set',
      payload: explanation,
    }, {
      actorAccountId: 'admin-a',
    });
    const candidate = await repository.buildContentOperationCandidate(contentPackage.packageId, {
      actorAccountId: 'admin-a',
    });
    await repository.approveContentOperationCandidate(contentPackage.packageId, candidate.candidateId, {
      approvedByAccountId: 'admin-a',
    });
    await repository.publishContentOperationPackage(contentPackage.packageId, {
      publishedByAccountId: 'admin-a',
    });

    DB.clearQueryLog();
    const runtime = await repository.readSpellingRuntimeContent('adult-a', 'spelling', {
      includeAccountContent: false,
    });
    const accountContentReads = accountContentQueries(DB);

    assert.equal(runtime.content.draft.words[0].explanation, explanation);
    assert.equal(runtime.content.draft.words.length, seeded.draft.words.length);
    assert.equal(runtime.summary.runtimeWordCount, seeded.releases.at(-1).snapshot.words.length);
    assert.equal(accountContentReads.length, 0);
  } finally {
    DB.close();
  }
});

test('repository runtime activates scheduled spelling pool visibility at request time', async () => {
  const DB = createMigratedSqliteD1Database();
  let currentNow = 1_777_000_000_000;
  const repository = createWorkerRepository({ env: { DB }, now: () => currentNow });
  try {
    const content = JSON.parse(JSON.stringify(await readSeededSpellingContentBundle()));
    content.draft.pools.push({
      id: 'scheduled-runtime',
      title: 'Scheduled runtime',
      type: 'extension',
      visibility: { state: 'scheduled', scheduledAt: currentNow + 60_000 },
      noRewardException: { approved: true, reason: 'Runtime visibility regression fixture.' },
      sourceNote: 'Runtime visibility regression fixture.',
      provenance: { source: 'worker-subject-runtime-test' },
      sortIndex: content.draft.pools.length,
    });
    content.draft.wordLists.push({
      id: 'scheduled-runtime-list',
      title: 'Scheduled runtime list',
      spellingPool: 'scheduled-runtime',
      coverageTier: 'secure-extension',
      yearGroups: [],
      wordSlugs: ['scheduledfocus'],
      sourceNote: 'Runtime visibility regression fixture.',
      provenance: { source: 'worker-subject-runtime-test' },
      sortIndex: content.draft.wordLists.length,
    });
    content.draft.words.push({
      slug: 'scheduledfocus',
      word: 'scheduledfocus',
      family: 'scheduled-runtime-family',
      listId: 'scheduled-runtime-list',
      spellingPool: 'scheduled-runtime',
      coverageTier: 'secure-extension',
      yearGroups: [],
      accepted: ['scheduledfocus'],
      tags: ['scheduled-runtime'],
      explanation: 'Scheduledfocus is a runtime visibility regression fixture.',
      sentenceEntryIds: ['scheduledfocus-s1'],
      sourceNote: 'Runtime visibility regression fixture.',
      provenance: { source: 'worker-subject-runtime-test' },
      progressKey: 'scheduledfocus',
      sortIndex: content.draft.words.length,
    });
    content.draft.sentences.push({
      id: 'scheduledfocus-s1',
      wordSlug: 'scheduledfocus',
      text: 'Scheduledfocus appears only after the pool activation time.',
      variantLabel: 'default',
      sourceNote: 'Runtime visibility regression fixture.',
      provenance: { source: 'worker-subject-runtime-test' },
      sortIndex: content.draft.sentences.length,
    });

    DB.db.prepare(`
      INSERT INTO content_operation_releases (
        release_id, subject_id, status, snapshot_json, snapshot_hash,
        base_release_id, package_id, published_at, published_by_account_id,
        rollback_of_release_id, proof_json, created_at
      )
      VALUES (?, 'spelling', 'published', ?, ?, NULL, NULL, ?, 'admin-a', NULL, NULL, ?)
    `).run(
      'corel-scheduled-runtime',
      await encodeContentOperationSnapshot(content),
      'scheduled-runtime-hash',
      currentNow,
      currentNow,
    );

    const beforeActivation = await repository.readSpellingRuntimeContent('adult-a', 'spelling', {
      includeAccountContent: false,
    });
    assert.equal(beforeActivation.content.draft.words.some((word) => word.slug === 'scheduledfocus'), true);
    assert.equal(beforeActivation.snapshot.wordBySlug.scheduledfocus, undefined);

    currentNow += 60_000;
    const afterActivation = await repository.readSpellingRuntimeContent('adult-a', 'spelling', {
      includeAccountContent: false,
    });
    assert.equal(afterActivation.snapshot.wordBySlug.scheduledfocus.word, 'scheduledfocus');
  } finally {
    DB.close();
  }
});

test('repository runtime uses global release ahead of legacy account content after cutover', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_777_000_000_000 });
  try {
    const seeded = await readSeededSpellingContentBundle();
    const word = seeded.draft.words[0];
    const globalExplanation = `Global cutover explanation for ${word.word}.`;
    const legacyExplanation = `Legacy account content explanation for ${word.word}.`;
    await publishSpellingWordEdit(repository, word, {
      title: 'Global release should win over legacy content',
      payload: globalExplanation,
    });

    const legacyContent = JSON.parse(JSON.stringify(seeded));
    legacyContent.draft.words[0].explanation = legacyExplanation;
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'admin', NULL, ?, ?, 0)
    `).run(1_777_000_000_000, 1_777_000_000_000);
    DB.db.prepare(`
      INSERT INTO account_subject_content (account_id, subject_id, content_json, updated_at, updated_by_account_id)
      VALUES ('adult-a', 'spelling', ?, ?, 'adult-a')
    `).run(JSON.stringify(legacyContent), 1_777_000_000_100);

    DB.clearQueryLog();
    const runtime = await repository.readSpellingRuntimeContent('adult-a', 'spelling');
    const accountContentReads = accountContentQueries(DB);

    assert.equal(runtime.content.draft.words[0].explanation, globalExplanation);
    assert.equal(accountContentReads.length, 0);
  } finally {
    DB.close();
  }
});

test('repository runtime keeps account overrides ahead of global releases without reading account content rows', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_777_000_000_000 });
  try {
    const seeded = await readSeededSpellingContentBundle();
    const firstWord = seeded.draft.words[0];
    const secondWord = seeded.draft.words[1];
    const overrideExplanation = `Override release explanation for ${firstWord.word}.`;
    const globalExplanation = `Latest global explanation for ${secondWord.word}.`;

    const overrideRelease = await publishSpellingWordEdit(repository, firstWord, {
      title: 'Account override source release',
      payload: overrideExplanation,
    });
    await publishSpellingWordEdit(repository, secondWord, {
      actorAccountId: 'admin-b',
      title: 'Latest global source release',
      payload: globalExplanation,
    });
    DB.db.prepare(`
      INSERT INTO content_operation_account_overrides (
        override_id, account_id, subject_id, release_id, reason, active,
        created_by_account_id, created_at, ended_at
      )
      VALUES ('override-runtime-a', 'adult-a', 'spelling', ?, 'Runtime test override', 1, 'admin-a', ?, NULL)
    `).run(overrideRelease.releaseId, 1_777_000_000_001);

    DB.clearQueryLog();
    const overridden = await repository.readSpellingRuntimeContent('adult-a', 'spelling', {
      includeAccountContent: false,
    });
    const latest = await repository.readSpellingRuntimeContent('adult-b', 'spelling', {
      includeAccountContent: false,
    });
    const accountContentReads = accountContentQueries(DB);

    assert.equal(overridden.content.draft.words[0].explanation, overrideExplanation);
    assert.equal(latest.content.draft.words[1].explanation, globalExplanation);
    assert.equal(accountContentReads.length, 0);
  } finally {
    DB.close();
  }
});

test('Hero subject projections never hydrate the published Spelling content snapshot', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_777_000_000_000 });
  try {
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', NULL, ?, ?, 0)
    `).run(1_777_000_000_000, 1_777_000_000_000);
    DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES ('learner-hero', 'Hero Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run(1_777_000_000_000, 1_777_000_000_000);
    DB.db.prepare(`
      INSERT INTO content_operation_releases (
        release_id, subject_id, status, snapshot_json, snapshot_hash,
        base_release_id, package_id, published_at, published_by_account_id,
        rollback_of_release_id, proof_json, created_at
      )
      VALUES ('corel-hero-cold-content', 'spelling', 'published', ?, 'release-hero-cold-content',
        NULL, NULL, ?, 'adult-a', NULL, ?, ?)
    `).run(
      JSON.stringify({ shouldNeverReachHero: 'x'.repeat(1_100_000) }),
      1_777_000_000_000,
      JSON.stringify({
        contentOperationsHeroExposure: {
          version: 1,
          rewardTracks: [],
        },
      }),
      1_777_000_000_000,
    );
    const expectedCoreWordCount = 213;
    const emptyPool = {
      total: 0,
      secure: 0,
      due: 0,
      fresh: 0,
      trouble: 0,
      attempts: 0,
      correct: 0,
      accuracy: null,
    };
    DB.db.prepare(`
      INSERT INTO spelling_learner_state (
        learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
      )
      VALUES ('learner-hero', ?, ?, ?, ?, 'adult-a')
      ON CONFLICT(learner_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        stats_json = excluded.stats_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `).run(
      JSON.stringify({ phase: 'dashboard' }),
      JSON.stringify({ prefs: { mode: 'smart' } }),
      JSON.stringify({
        all: { ...emptyPool, total: expectedCoreWordCount, fresh: expectedCoreWordCount },
        core: { ...emptyPool, total: expectedCoreWordCount, fresh: expectedCoreWordCount },
        y34: emptyPool,
        y56: emptyPool,
        secureExtension: emptyPool,
        extra: emptyPool,
      }),
      1_777_000_000_000,
    );

    DB.clearQueryLog();
    const heroModels = await repository.readHeroSubjectReadModels('learner-hero', {
      accountId: 'adult-a',
      now: 1_777_000_000_000,
    });
    const heroQueries = DB.takeQueryLog();

    assert.equal(heroModels.spelling.ui.stats.all.total, expectedCoreWordCount);
    assert.equal(
      heroQueries.some((entry) => /\bFROM\s+content_operation_releases\b/i.test(entry.sql || '')),
      false,
      'Hero subject projections must be independent of the size of the published content snapshot',
    );
  } finally {
    DB.close();
  }
});

test('Hero subject projections never hydrate Punctuation item history', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_777_000_000_000 });
  try {
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES ('adult-hero-punct', 'adult-hero-punct@example.test', 'Adult', 'parent', NULL, ?, ?, 0)
    `).run(1_777_000_000_000, 1_777_000_000_000);
    DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES ('learner-hero-punct', 'Hero Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run(1_777_000_000_000, 1_777_000_000_000);
    DB.db.prepare(`
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      ) VALUES ('learner-hero-punct', 'punctuation', ?, ?, ?, 'adult-hero-punct')
    `).run(
      JSON.stringify({ phase: 'setup', session: null }),
      JSON.stringify({
        progress: {
          itemTotals: { version: 1, tracked: 10_000, new: 9_997, secure: 1, weak: 1 },
          facets: {
            'sentence_endings::choose': { attempts: 4, correct: 1, lapses: 2, streak: 0, dueAt: 1 },
            'list_commas::choose': { attempts: 4, correct: 3, streak: 1, dueAt: 1 },
            'apostrophe_contractions::choose': {
              attempts: 5,
              correct: 5,
              streak: 5,
              dueAt: 1,
              firstCorrectAt: 1_776_000_000_000,
              lastCorrectAt: 1_777_000_000_000,
            },
          },
          attempts: [{
            ts: 1_776_999_999_000,
            itemId: 'retired-punctuation:999',
            itemMode: 'choose',
            correct: false,
          }],
          rewardUnits: {},
          sessionsCompleted: 3,
        },
      }),
      1_777_000_000_000,
    );

    const insertItem = DB.db.prepare(`
      INSERT INTO punctuation_item_state (
        learner_id, item_id, state_json, updated_at, updated_by_account_id
      ) VALUES ('learner-hero-punct', ?, ?, ?, 'adult-hero-punct')
    `);
    for (let index = 0; index < 1_000; index += 1) {
      insertItem.run(
        `retired-punctuation:${index}`,
        JSON.stringify({ attempts: 10, correct: 8, streak: 1, dueAt: 1 }),
        1_777_000_000_000 - index,
      );
    }

    DB.clearQueryLog();
    const heroModels = await repository.readHeroSubjectReadModels('learner-hero-punct', {
      accountId: 'adult-hero-punct',
      now: 1_777_000_000_000,
    });
    const heroQueries = DB.takeQueryLog();

    assert.equal(heroModels.punctuation.ui.stats.weak, 1);
    assert.equal(heroModels.punctuation.ui.stats.due, 1);
    assert.equal(heroModels.punctuation.ui.stats.secure, 1);
    assert.equal(
      heroQueries.some((entry) => /\bFROM\s+punctuation_item_state\b/i.test(entry.sql || '')),
      false,
      'Hero must use bounded facets instead of learner lifetime item rows',
    );
  } finally {
    DB.close();
  }
});

test('repository reads full spelling runtime content rows when they exceed the public inline budget', async () => {
  const DB = createMigratedSqliteD1Database();
  const repository = createWorkerRepository({ env: { DB }, now: () => 1_776_000_000_000 });
  try {
    const content = JSON.parse(JSON.stringify(await readSeededSpellingContentBundle()));
    const release = content.releases.at(-1);
    const sentinelSourceNote = 'large-row regression sentinel '.repeat(45_000);
    release.id = 'spelling-large-row-test';
    release.version = 987;
    release.publishedAt = 1_779_293_842_422;
    release.snapshot.words[0] = {
      ...release.snapshot.words[0],
      sourceNote: sentinelSourceNote,
    };
    content.publication.currentReleaseId = release.id;
    content.publication.publishedVersion = release.version;
    content.publication.updatedAt = release.publishedAt;
    const contentJson = JSON.stringify(content);
    assert.ok(contentJson.length > 1_000_000, 'fixture must exercise the large-row path');

    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES ('adult-large', 'adult-large@example.test', 'Adult Large', 'parent', NULL, ?, ?, 0)
    `).run(release.publishedAt, release.publishedAt);
    DB.db.prepare(`
      INSERT INTO account_subject_content (account_id, subject_id, content_json, updated_at, updated_by_account_id)
      VALUES ('adult-large', 'spelling', ?, ?, 'adult-large')
    `).run(contentJson, release.publishedAt);

    DB.clearQueryLog();
    const runtime = await repository.readSpellingRuntimeContent('adult-large', 'spelling');
    const firstContentQueries = accountContentQueries(DB);
    const firstRawFetchCount = firstContentQueries.filter((entry) => selectsRawContentJson(entry.sql)).length;

    assert.equal(runtime.content.publication.publishedVersion, 987);
    assert.equal(runtime.summary.publishedVersion, 987);
    assert.equal(runtime.snapshot.words.length, release.snapshot.words.length);
    assert.match(runtime.snapshot.words[0].sourceNote, /^large-row regression sentinel /);
    assert.ok(runtime.snapshot.words[0].sourceNote.length > sentinelSourceNote.length - 100);
    assert.ok(firstContentQueries.length >= 2, 'cache miss reads metadata first, then the full content row');
    assert.match(firstContentQueries[0].sql, /NULL\s+AS\s+content_json/i);
    assert.equal(firstRawFetchCount, 1, 'cache miss fetches the raw content_json exactly once');

    DB.clearQueryLog();
    const cachedRuntime = await repository.readSpellingRuntimeContent('adult-large', 'spelling');
    const cachedContentQueries = accountContentQueries(DB);
    const cachedRawFetchCount = cachedContentQueries.filter((entry) => selectsRawContentJson(entry.sql)).length;

    assert.equal(cachedRuntime.content, runtime.content);
    assert.equal(cachedRuntime.summary, runtime.summary);
    assert.equal(cachedRuntime.snapshot, runtime.snapshot);
    assert.ok(cachedContentQueries.length >= 1, 'cache hit still checks content metadata for freshness');
    assert.match(cachedContentQueries[0].sql, /NULL\s+AS\s+content_json/i);
    assert.equal(cachedRawFetchCount, 0, 'cache hit must not fetch raw content_json');
  } finally {
    DB.close();
  }
});

test('spelling command runtime prefers repository runtime content over raw content reads', async () => {
  const snapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  let runtimeContentReads = 0;
  let runtimeContentOptions = null;
  const runtime = createWorkerSubjectRuntime();

  const result = await runtime.dispatch({
    subjectId: 'spelling',
    command: 'check-word-bank-drill',
    learnerId: 'learner-a',
    requestId: 'cmd-runtime-content',
    correlationId: 'cmd-runtime-content',
    expectedLearnerRevision: 0,
    payload: {
      slug: 'possess',
      typed: 'possess',
    },
  }, {
    session: { accountId: 'adult-a' },
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: {}, data: {} }, latestSession: null };
      },
      async readSpellingRuntimeContent(_accountId, _subjectId, options) {
        runtimeContentReads += 1;
        runtimeContentOptions = options;
        return {
          subjectId: 'spelling',
          snapshot,
          summary: {
            publishedReleaseId: 'spelling-r-test',
            publishedVersion: 1,
            publishedAt: 1,
            runtimeWordCount: snapshot.words.length,
          },
        };
      },
      async readSubjectContent() {
        throw new Error('raw content read should not be used by spelling commands');
      },
    },
  });

  assert.equal(runtimeContentReads, 1);
  assert.deepEqual(runtimeContentOptions, { includeAccountContent: false });
  assert.equal(result.changed, false);
  assert.equal(result.wordBankDrill.result, 'correct');
});

test('worker subject command route validates auth, same-origin, and handler availability', async () => {
  const DB = createMigratedSqliteD1Database();
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async command => ({
          learnerId: command.learnerId,
          subjectReadModel: { phase: 'started' },
        }),
      },
    },
  });
  const app = createWorkerApp({ subjectRuntime: runtime });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', NULL, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);
  DB.db.prepare("UPDATE adult_accounts SET selected_learner_id = 'learner-a' WHERE id = 'adult-a'").run();

  const unauthenticated = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }), env, {});
  assert.equal(unauthenticated.status, 401);

  const crossOrigin = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-1',
      expectedLearnerRevision: 0,
    }),
  }), env, {});
  const crossOriginPayload = await crossOrigin.json();
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOriginPayload.code, 'same_origin_required');

  const ok = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-2',
      expectedLearnerRevision: 0,
    }),
  }), env, {});
  const okPayload = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(okPayload.ok, true);
  assert.equal(okPayload.subjectId, 'spelling');
  assert.equal(okPayload.command, 'start-session');
  assert.equal(okPayload.mutation.kind, 'subject_command.spelling.start-session');
  assert.equal(okPayload.mutation.appliedRevision, 1);
  assert.deepEqual(okPayload.subjectReadModel, { phase: 'started' });

  const replay = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-2',
      expectedLearnerRevision: 0,
    }),
  }), env, {});
  const replayPayload = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayPayload.mutation.replayed, true);
  assert.equal(replayPayload.replayRequiresRefresh, true);
  assert.equal(replayPayload.subjectReadModel, undefined);
  const storedReceipt = DB.db.prepare('SELECT response_json FROM mutation_receipts WHERE request_id = ?').get('cmd-2');
  assert.ok(storedReceipt, 'subject command receipt must be stored');
  assert.ok(storedReceipt.response_json.length < 512, `receipt response should be compact, saw ${storedReceipt.response_json.length} bytes`);
  const storedReplay = JSON.parse(storedReceipt.response_json);
  assert.equal(storedReplay.replayRequiresRefresh, true);
  assert.equal(storedReplay.subjectId, 'spelling');
  assert.equal(storedReplay.command, 'start-session');
  assert.equal(storedReplay.subjectReadModel, undefined);

  const missing = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'missing',
      learnerId: 'learner-a',
      requestId: 'cmd-3',
      expectedLearnerRevision: 1,
    }),
  }), env, {});
  const missingPayload = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(missingPayload.code, 'subject_command_not_found');

  DB.close();
});

test('subject command replay requires current learner write access', async () => {
  const DB = createMigratedSqliteD1Database();
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async command => ({
          learnerId: command.learnerId,
          subjectReadModel: { phase: 'started' },
        }),
      },
    },
  });
  const app = createWorkerApp({ subjectRuntime: runtime });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', 'learner-a', ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);

  const body = {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-replay-access',
    expectedLearnerRevision: 0,
  };
  const first = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify(body),
  }), env, {});
  assert.equal(first.status, 200, await first.text());

  DB.db.prepare(`
    DELETE FROM account_learner_memberships
    WHERE account_id = 'adult-a' AND learner_id = 'learner-a'
  `).run();

  const replay = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify(body),
  }), env, {});
  const replayPayload = await replay.json();

  assert.equal(replay.status, 403);
  assert.equal(replayPayload.code, 'forbidden');

  DB.close();
});

test('subject command keeps runtime events in projection memory without appending event_log rows', async () => {
  const DB = createMigratedSqliteD1Database();
  delete DB.supportsSqlTransactions;
  const runtime = createSubjectRuntime({
    handlers: {
      spelling: {
        'start-session': async command => ({
          learnerId: command.learnerId,
          changed: true,
          subjectReadModel: { phase: 'started' },
          runtimeWrite: {
            state: { phase: 'session' },
            data: { prefs: { mode: 'smart' } },
            events: [
              { id: 'bad-event', learnerId: 'missing-learner', type: 'spelling.word-secured', createdAt: 1 },
            ],
          },
        }),
      },
    },
  });
  const app = createWorkerApp({ subjectRuntime: runtime });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', NULL, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);

  const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'cmd-atomic-failure',
      expectedLearnerRevision: 0,
    }),
  }), env, {});

  assert.equal(response.status, 200, await response.text());
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 1);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM child_subject_state WHERE learner_id = ?').get('learner-a').count, 1);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM event_log WHERE id = ?').get('bad-event').count, 0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM learner_activity_feed').get().count, 0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id = ?').get('cmd-atomic-failure').count, 1);

  DB.close();
});

test('demo sessions cannot use legacy broad learner runtime write routes', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const demo = await postJson(server, '/api/demo/session');
  const cookie = cookieFrom(demo);

  const response = await server.fetchRaw('https://repo.test/api/child-subject-state', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify({
      learnerId: 'learner-demo-x',
      subjectId: 'spelling',
      record: { ui: null, data: {} },
      mutation: {
        requestId: 'legacy-write-1',
        expectedLearnerRevision: 0,
      },
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.code, 'subject_command_required');

  server.close();
});

test('production real sessions cannot use legacy broad learner runtime write routes', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await postJson(server, '/api/auth/register', {
    email: 'legacy-runtime@example.test',
    password: 'password-1234',
  });
  const cookie = cookieFrom(register);
  const routes = [
    {
      path: '/api/child-subject-state',
      method: 'PUT',
      body: { learnerId: 'learner-a', subjectId: 'spelling', record: { ui: null, data: {} }, mutation: { requestId: 'legacy-subject-put', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/practice-sessions',
      method: 'PUT',
      body: { record: { id: 'sess-a', learnerId: 'learner-a', subjectId: 'spelling' }, mutation: { requestId: 'legacy-session-put', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/child-game-state',
      method: 'PUT',
      body: { learnerId: 'learner-a', systemId: 'monster-codex', state: {}, mutation: { requestId: 'legacy-game-put', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/event-log',
      method: 'POST',
      body: { event: { learnerId: 'learner-a', type: 'spelling.word-secured' }, mutation: { requestId: 'legacy-event-post', expectedLearnerRevision: 0 } },
    },
    {
      path: '/api/debug/reset',
      method: 'POST',
      body: { mutation: { requestId: 'legacy-debug-reset', expectedAccountRevision: 0 } },
    },
  ];

  for (const route of routes) {
    const response = await server.fetchRaw(`https://repo.test${route.path}`, {
      method: route.method,
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify(route.body),
    });
    const payload = await response.json();
    assert.equal(response.status, 403, `${route.method} ${route.path}`);
    assert.equal(payload.code, 'subject_command_required');
  }

  server.close();
});

test('production subject commands require same-origin headers', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await postJson(server, '/api/auth/register', {
    email: 'subject-origin@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-origin', 'Origin Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, 'learner-origin', 'owner', 0, ?, ?)
  `).run(accountId, now, now);

  const body = {
    command: 'start-session',
    learnerId: 'learner-origin',
    requestId: 'subject-origin-1',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'single',
      slug: 'early',
      length: 1,
    },
  };
  const missingOrigin = await server.fetchRaw('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify(body),
  });
  const missingPayload = await missingOrigin.json();
  assert.equal(missingOrigin.status, 403);
  assert.equal(missingPayload.code, 'same_origin_required');

  const sameOrigin = await server.fetchRaw('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      origin: 'https://repo.test',
    },
    body: JSON.stringify(body),
  });
  const sameOriginPayload = await sameOrigin.json();
  assert.equal(sameOrigin.status, 200, JSON.stringify(sameOriginPayload));

  server.close();
});

test('server-owned learner progress reset clears runtime collections in production', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await postJson(server, '/api/auth/register', {
    email: 'reset-progress@example.test',
    password: 'password-1234',
  });
  const registerPayload = await register.json();
  const cookie = cookieFrom(register);
  const accountId = registerPayload.session.accountId;
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-reset', 'Reset Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, 'learner-reset', 'owner', 0, ?, ?)
  `).run(accountId, now, now);
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES ('learner-reset', 'spelling', '{"phase":"dashboard"}', '{"progress":{"early":{"stage":2}}}', ?, ?)
  `).run(now, accountId);
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at, updated_by_account_id)
    VALUES ('session-reset', 'learner-reset', 'spelling', 'learning', 'active', '{}', NULL, ?, ?, ?)
  `).run(now, now, accountId);
  server.DB.db.prepare(`
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES ('learner-reset', 'monster-codex', '{"caught":["inklet"]}', ?, ?)
  `).run(now, accountId);
  server.DB.db.prepare(`
    INSERT INTO event_log (id, learner_id, subject_id, event_type, event_json, created_at, actor_account_id)
    VALUES ('event-reset', 'learner-reset', 'spelling', 'spelling.word-secured', '{}', ?, ?)
  `).run(now, accountId);

  const reset = await postJson(server, '/api/learners/reset-progress', {
    learnerId: 'learner-reset',
    mutation: {
      requestId: 'reset-progress-1',
      expectedLearnerRevision: 0,
    },
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  const payload = await reset.json();

  assert.equal(reset.status, 200, JSON.stringify(payload));
  assert.equal(payload.reset, true);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM practice_sessions WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM child_game_state WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE learner_id = 'learner-reset'").get().count, 0);
  assert.equal(server.DB.db.prepare("SELECT state_revision FROM learner_profiles WHERE id = 'learner-reset'").get().state_revision, 1);

  server.DB.db.prepare(`
    DELETE FROM account_learner_memberships
    WHERE account_id = ? AND learner_id = 'learner-reset'
  `).run(accountId);
  const replay = await postJson(server, '/api/learners/reset-progress', {
    learnerId: 'learner-reset',
    mutation: {
      requestId: 'reset-progress-1',
      expectedLearnerRevision: 0,
    },
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  const replayPayload = await replay.json();
  assert.equal(replay.status, 403);
  assert.equal(replayPayload.code, 'forbidden');

  server.close();
});

test('word-bank drill checks go through the subject command boundary without writing scheduler state', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp();
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  };
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES ('learner-a', 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 3)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES ('adult-a', 'adult-a@example.test', 'Adult A', 'parent', 'learner-a', ?, ?, 0)
  `).run(now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES ('adult-a', 'learner-a', 'owner', 0, ?, ?)
  `).run(now, now);

  const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'check-word-bank-drill',
      learnerId: 'learner-a',
      requestId: 'drill-check-1',
      expectedLearnerRevision: 1,
      payload: { slug: 'early', typed: 'early' },
    }),
  }), env, {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.mutation.kind, 'subject_command.spelling.check-word-bank-drill');
  assert.equal(payload.mutation.expectedRevision, 1);
  assert.equal(payload.mutation.appliedRevision, 3);
  assert.equal(payload.wordBankDrill.result, 'correct');
  assert.equal(payload.subjectReadModel, undefined);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts').get().count, 0);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM child_subject_state').get().count, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 3);

  DB.close();
});
