import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApiPlatformRepositories,
} from '../src/platform/core/repositories/index.js';
import { cloneSerialisable } from '../src/platform/core/repositories/helpers.js';
import { SPELLING_CONTENT_MODEL_VERSION } from '../src/subjects/spelling/content/model.js';
import { createApiSpellingContentRepository } from '../src/subjects/spelling/content/repository.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { coreOnlyVersionOneContent } from './helpers/spelling-content.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function learnerSnapshot(name = 'Ava') {
  return {
    byId: {
      'learner-a': {
        id: 'learner-a',
        name,
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  };
}

function seedAccountLearner(DB, { accountId = 'adult-a', learnerId = 'learner-a' } = {}) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, 'Adult A', 'parent', ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET selected_learner_id = excluded.selected_learner_id
  `).run(accountId, `${accountId}@example.test`, learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
    ON CONFLICT(account_id, learner_id) DO UPDATE SET role = excluded.role
  `).run(accountId, learnerId, now, now);
}

function adminAuthSession(server, accountId = 'adult-a') {
  return server.authSessionFor(accountId, { platformRole: 'admin' });
}

function fetchAdmin(server, input, init = {}, accountId = 'adult-a') {
  return server.fetchAs(accountId, input, init, {
    'x-ks2-dev-platform-role': 'admin',
  });
}

function stripWordExplanations(bundle) {
  const next = cloneSerialisable(bundle);
  next.draft.words = next.draft.words.map(({ explanation: _explanation, ...word }) => word);
  next.releases = next.releases.map((release) => {
    const words = release.snapshot.words.map(({ explanation: _explanation, ...word }) => word);
    return {
      ...release,
      snapshot: {
        ...release.snapshot,
        words,
        wordBySlug: Object.fromEntries(words.map((word) => [word.slug, word])),
      },
    };
  });
  return next;
}

function addExtraWordList(bundle) {
  const next = cloneSerialisable(bundle);
  const listId = 'extra-api-science';
  next.draft.wordLists.push({
    id: listId,
    title: 'Extra API science',
    spellingPool: 'extra',
    yearGroups: [],
    tags: ['extra', 'science'],
    wordSlugs: ['cephalopod'],
    sourceNote: 'Extra API test list',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.words.push({
    slug: 'cephalopod',
    word: 'cephalopod',
    family: 'Science: cephalopods',
    listId,
    yearGroups: [],
    tags: ['extra', 'science'],
    accepted: ['cephalopod'],
    explanation: 'A cephalopod is a sea animal such as an octopus or squid.',
    sentenceEntryIds: ['cephalopod__01'],
    sourceNote: 'Extra API test word',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.sentences.push({
    id: 'cephalopod__01',
    wordSlug: 'cephalopod',
    text: 'An octopus is a cephalopod with eight arms.',
    variantLabel: 'baseline',
    tags: ['extra', 'science'],
    sourceNote: 'Extra API test sentence',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  return next;
}

test('api spelling content repository hydrates the seeded published bundle and persists valid content changes', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const repository = createApiSpellingContentRepository({
      baseUrl: 'https://repo.test',
      fetch: server.fetch.bind(server),
      authSession: adminAuthSession(server),
    });

    const bundle = await repository.hydrate();
    assert.equal(bundle.publication.publishedVersion, SEEDED_SPELLING_CONTENT_BUNDLE.publication.publishedVersion);
    assert.ok(bundle.draft.words.some((word) => word.slug === 'mollusc' && word.spellingPool === 'extra'));
    assert.equal(repository.getAccountRevision(), 0);

    const updated = cloneSerialisable(bundle);
    updated.draft.notes = 'Operator note from API repository test.';
    const saved = await repository.write(updated);
    assert.equal(saved.draft.notes, 'Operator note from API repository test.');
    assert.equal(repository.getAccountRevision(), 1);

    const receipt = server.DB.db.prepare('SELECT request_hash, response_json FROM mutation_receipts WHERE mutation_kind = ?').get('subject_content.put');
    assert.ok(receipt);
    assert.ok(receipt.request_hash.length > 16);
    assert.ok(receipt.response_json.length < 100_000);
    assert.equal(JSON.parse(receipt.response_json).content, undefined);

    const fresh = createApiSpellingContentRepository({
      baseUrl: 'https://repo.test',
      fetch: server.fetch.bind(server),
      authSession: adminAuthSession(server),
    });
    const reloaded = await fresh.hydrate();
    assert.equal(reloaded.draft.notes, 'Operator note from API repository test.');
    assert.ok(reloaded.draft.words.some((word) => word.slug === 'mollusc' && word.spellingPool === 'extra'));
  } finally {
    server.close();
  }
});

test('worker spelling content route is limited to operator roles', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const parentRead = await server.fetch('https://repo.test/api/content/spelling');
    const parentPayload = await parentRead.json();
    assert.equal(parentRead.status, 403);
    assert.equal(parentPayload.code, 'subject_content_export_forbidden');

    const opsRead = await server.fetchAs('adult-a', 'https://repo.test/api/content/spelling', {}, {
      'x-ks2-dev-platform-role': 'ops',
    });
    assert.equal(opsRead.status, 200);

    const opsWrite = await server.fetchAs('adult-a', 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: SEEDED_SPELLING_CONTENT_BUNDLE,
        mutation: {
          requestId: 'content-ops-write-forbidden',
          correlationId: 'content-ops-write-forbidden',
          expectedAccountRevision: 0,
        },
      }),
    }, {
      'x-ks2-dev-platform-role': 'ops',
    });
    const opsWritePayload = await opsWrite.json();
    assert.equal(opsWrite.status, 403);
    assert.equal(opsWritePayload.code, 'subject_content_write_forbidden');
  } finally {
    server.close();
  }
});

test('worker spelling content route accepts valid Extra pool content without statutory year groups', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initialResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling');
    const initial = await initialResponse.json();
    const updated = addExtraWordList(initial.content);

    const response = await fetchAdmin(server, 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: updated,
        mutation: {
          requestId: 'content-extra-pool-1',
          correlationId: 'content-extra-pool-1',
          expectedAccountRevision: initial.mutation.accountRevision,
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.content.draft.wordLists.find((list) => list.id === 'extra-api-science').spellingPool, 'extra');
    assert.equal(payload.content.draft.words.find((word) => word.slug === 'cephalopod').spellingPool, 'extra');
    assert.deepEqual(payload.content.draft.words.find((word) => word.slug === 'cephalopod').yearGroups, []);

    const reloadedResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling');
    const reloaded = await reloadedResponse.json();
    assert.equal(reloaded.content.draft.words.find((word) => word.slug === 'cephalopod').spellingPool, 'extra');
  } finally {
    server.close();
  }
});

test('worker spelling word bank route returns paginated public rows and detail audio tokens', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAccountLearner(server.DB);

    const response = await server.fetch('https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&pageSize=5&year=y3-4');
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.wordBank.learnerId, 'learner-a');
    assert.equal(payload.wordBank.analytics.wordBank.returnedRows, 5);
    assert.equal(payload.wordBank.analytics.wordBank.hasNextPage, true);
    assert.ok(payload.wordBank.analytics.pools.core.total > 0);
    const rows = payload.wordBank.analytics.wordGroups.flatMap((group) => group.words);
    assert.equal(rows.length, 5);
    assert.equal(rows[0].accepted, undefined);
    assert.equal(rows[0].sentence, undefined);
    assert.equal(rows[0].explanation, undefined);

    const detailResponse = await server.fetch(`https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&detailSlug=${rows[0].slug}`);
    const detailPayload = await detailResponse.json();

    assert.equal(detailResponse.status, 200);
    assert.equal(detailPayload.wordBank.detail.slug, rows[0].slug);
    assert.equal(typeof detailPayload.wordBank.detail.sentence, 'string');
    assert.ok(detailPayload.wordBank.detail.sentence.length > 0);
    assert.equal(detailPayload.wordBank.detail.accepted, undefined);
    assert.ok(detailPayload.wordBank.detail.audio.dictation.promptToken);
    assert.ok(detailPayload.wordBank.detail.audio.word.promptToken);
  } finally {
    server.close();
  }
});

test('worker spelling word bank route controls empty, high-page, and invalid-detail cases', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAccountLearner(server.DB);

    const empty = await server.fetch('https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&q=zzzz-no-match');
    const emptyPayload = await empty.json();
    assert.equal(empty.status, 200);
    assert.equal(emptyPayload.wordBank.analytics.wordBank.filteredRows, 0);

    const highPage = await server.fetch('https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&page=999');
    const highPagePayload = await highPage.json();
    assert.equal(highPage.status, 200);
    assert.equal(highPagePayload.wordBank.analytics.wordBank.returnedRows, 0);

    const missing = await server.fetch('https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&detailSlug=not-a-word');
    const missingPayload = await missing.json();
    assert.equal(missing.status, 404);
    assert.equal(missingPayload.code, 'spelling_word_not_found');
  } finally {
    server.close();
  }
});

test('worker spelling content route backfills version-one core bundles without pool metadata', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initialResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling');
    const initial = await initialResponse.json();
    const legacy = coreOnlyVersionOneContent(initial.content);

    const response = await fetchAdmin(server, 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: legacy,
        mutation: {
          requestId: 'content-version-one-core-1',
          correlationId: 'content-version-one-core-1',
          expectedAccountRevision: initial.mutation.accountRevision,
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    // P2 U10: normaliser bumps any stored bundle with modelVersion < current
    // to `SPELLING_CONTENT_MODEL_VERSION` (now 4, skipping 3 per H7 synthesis)
    // so the UI never reads a stale shape.
    assert.equal(payload.content.modelVersion, SPELLING_CONTENT_MODEL_VERSION);
    assert.equal(payload.content.draft.wordLists.every((list) => list.spellingPool === 'core'), true);
    assert.equal(payload.content.draft.words.every((word) => word.spellingPool === 'core'), true);
    assert.equal(payload.content.releases[0].snapshot.words.every((word) => word.spellingPool === 'core'), true);
  } finally {
    server.close();
  }
});

test('content writes share the account revision without leaving later learner writes degraded', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const authSession = server.authSessionFor('adult-a');
    const platform = createApiPlatformRepositories({
      baseUrl: 'https://repo.test',
      fetch: server.fetch.bind(server),
      storage: installMemoryStorage(),
      authSession,
    });
    await platform.hydrate();
    platform.learners.write(learnerSnapshot());
    await platform.flush();

    const content = createApiSpellingContentRepository({
      baseUrl: 'https://repo.test',
      fetch: server.fetch.bind(server),
      authSession: adminAuthSession(server),
    });
    const bundle = await content.hydrate();
    assert.equal(content.getAccountRevision(), 1);

    const updatedContent = cloneSerialisable(bundle);
    updatedContent.draft.notes = 'This content write advances the shared account revision.';
    await content.write(updatedContent);
    assert.equal(content.getAccountRevision(), 2);

    platform.learners.write(learnerSnapshot('Ava Rebased'));
    await platform.flush();

    const persistence = platform.persistence.read();
    assert.equal(persistence.mode, 'remote-sync');
    assert.equal(persistence.pendingWriteCount, 0);
    assert.equal(persistence.lastError, null);
    assert.equal(platform.learners.read().byId['learner-a'].name, 'Ava Rebased');

    const freshPlatform = createApiPlatformRepositories({
      baseUrl: 'https://repo.test',
      fetch: server.fetch.bind(server),
      storage: installMemoryStorage(),
      authSession,
    });
    await freshPlatform.hydrate();
    assert.equal(freshPlatform.learners.read().byId['learner-a'].name, 'Ava Rebased');
  } finally {
    server.close();
  }
});

test('worker spelling content receipt replay returns full content without storing the large bundle in receipts', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initialResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling');
    const initial = await initialResponse.json();
    const updated = cloneSerialisable(initial.content);
    updated.draft.notes = 'Replay-safe content write test.';
    const requestId = 'content-replay-safe-1';
    const body = {
      content: updated,
      mutation: {
        requestId,
        correlationId: requestId,
        expectedAccountRevision: initial.mutation.accountRevision,
      },
    };

    const firstResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const firstPayload = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(firstPayload.content.draft.notes, 'Replay-safe content write test.');

    const receipt = server.DB.db.prepare('SELECT response_json FROM mutation_receipts WHERE request_id = ?').get(requestId);
    assert.ok(receipt);
    assert.ok(receipt.response_json.length < 100_000);
    assert.equal(JSON.parse(receipt.response_json).content, undefined);

    const replayResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const replayPayload = await replayResponse.json();
    assert.equal(replayResponse.status, 200);
    assert.equal(replayPayload.content.draft.notes, 'Replay-safe content write test.');
    assert.equal(replayPayload.mutation.replayed, true);
  } finally {
    server.close();
  }
});

test('worker spelling content route backfills legacy bundles before validation and persistence', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const initialResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling');
    const initial = await initialResponse.json();
    const legacy = stripWordExplanations(initial.content);
    legacy.draft.notes = 'Legacy spelling bundle without word explanations.';

    const response = await fetchAdmin(server, 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: legacy,
        mutation: {
          requestId: 'content-backfill-explanations-1',
          correlationId: 'content-backfill-explanations-1',
          expectedAccountRevision: initial.mutation.accountRevision,
        },
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.content.draft.words.find((word) => word.slug === 'possess').explanation, 'To possess something means to own it or have it.');
    assert.equal(payload.content.releases[0].snapshot.wordBySlug.possess.explanation, 'To possess something means to own it or have it.');

    const reloadedResponse = await fetchAdmin(server, 'https://repo.test/api/content/spelling');
    const reloaded = await reloadedResponse.json();
    assert.equal(reloaded.content.draft.notes, 'Legacy spelling bundle without word explanations.');
    assert.equal(reloaded.content.releases[0].snapshot.wordBySlug.possess.explanation, 'To possess something means to own it or have it.');
  } finally {
    server.close();
  }
});

test('worker spelling content route rejects invalid bundles with explicit validation details', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const invalid = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
    invalid.draft.words[0].yearGroups = [];
    invalid.draft.words[0].sentenceEntryIds = ['missing-sentence'];

    const response = await fetchAdmin(server, 'https://repo.test/api/content/spelling', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: invalid,
        mutation: {
          requestId: 'content-invalid-1',
          correlationId: 'content-invalid-1',
          expectedAccountRevision: 0,
        },
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'content_validation_failed');
    assert.ok(Array.isArray(payload.validation.errors));
    assert.ok(payload.validation.errors.some((issue) => issue.code === 'missing_year_group_metadata'));
    assert.ok(payload.validation.errors.some((issue) => issue.code === 'broken_sentence_reference'));
  } finally {
    server.close();
  }
});
