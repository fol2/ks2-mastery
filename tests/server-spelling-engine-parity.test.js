import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../src/subjects/spelling/content/model.js';
import { createServerSpellingEngine, SPELLING_SERVER_AUTHORITY } from '../worker/src/subjects/spelling/engine.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function contentSnapshot() {
  return resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
}

function makeReferenceService({ now, random }) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  return createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    contentSnapshot: contentSnapshot(),
  });
}

function seedAccountLearner(DB, { accountId = 'adult-a', learnerId = 'learner-a' } = {}) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, 'Adult A', learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
}

async function postCommand(server, {
  command,
  learnerId = 'learner-a',
  requestId,
  expectedLearnerRevision,
  payload = {},
}) {
  const response = await server.fetch('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command,
      learnerId,
      requestId,
      expectedLearnerRevision,
      payload,
    }),
  });
  return {
    response,
    body: await response.json(),
  };
}

test('server spelling engine preserves deterministic selection and retry progression parity', () => {
  const now = () => Date.UTC(2026, 0, 1);
  const learnerId = 'learner-a';
  const reference = makeReferenceService({ now, random: makeSeededRandom(42) });
  const server = createServerSpellingEngine({
    now,
    random: makeSeededRandom(42),
    contentSnapshot: contentSnapshot(),
  });

  const referenceStarted = reference.startSession(learnerId, {
    mode: 'smart',
    yearFilter: 'extra',
    length: 5,
  });
  const serverStarted = server.apply({
    learnerId,
    subjectRecord: { ui: null, data: {} },
    latestSession: null,
    command: 'start-session',
    payload: {
      mode: 'smart',
      yearFilter: 'extra',
      length: 5,
    },
  });

  assert.equal(serverStarted.state.session.serverAuthority, SPELLING_SERVER_AUTHORITY);
  assert.deepEqual(serverStarted.state.session.uniqueWords, referenceStarted.state.session.uniqueWords);
  assert.equal(serverStarted.state.session.currentCard.slug, referenceStarted.state.session.currentCard.slug);

  const wrongAnswer = 'not the spelling';
  const referenceSubmitted = reference.submitAnswer(learnerId, referenceStarted.state, wrongAnswer);
  const serverSubmitted = server.apply({
    learnerId,
    subjectRecord: { ui: serverStarted.state, data: serverStarted.data },
    latestSession: serverStarted.practiceSession,
    command: 'submit-answer',
    payload: { answer: wrongAnswer },
  });

  assert.equal(serverSubmitted.state.session.phase, referenceSubmitted.state.session.phase);
  assert.equal(serverSubmitted.state.feedback.headline, referenceSubmitted.state.feedback.headline);
  assert.equal(serverSubmitted.state.awaitingAdvance, referenceSubmitted.state.awaitingAdvance);
  assert.deepEqual(serverSubmitted.data.progress, {});
});

test('worker spelling command route starts, submits, continues, and completes server-side', async () => {
  const server = createWorkerRepositoryServer();
  seedAccountLearner(server.DB);
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (
      id,
      learner_id,
      subject_id,
      session_kind,
      status,
      session_state_json,
      summary_json,
      created_at,
      updated_at,
      updated_by_account_id
    )
    VALUES ('legacy-active', 'learner-a', 'spelling', 'learning', 'active', '{"id":"legacy-active"}', NULL, 1, 1, 'adult-a')
  `).run();

  try {
    let step = await postCommand(server, {
      command: 'start-session',
      requestId: 'spell-start-1',
      expectedLearnerRevision: 0,
      payload: {
        mode: 'single',
        slug: 'possess',
        length: 1,
      },
    });
    assert.equal(step.response.status, 200);
    assert.equal(step.body.subjectReadModel.phase, 'session');
    assert.equal(step.body.subjectReadModel.session.serverAuthority, SPELLING_SERVER_AUTHORITY);
    assert.equal(step.body.mutation.appliedRevision, 1);
    const answer = 'possess';
    assert.equal(step.body.subjectReadModel.session.currentCard.word, undefined);
    assert.equal(step.body.subjectReadModel.session.currentCard.prompt.sentence, undefined);
    assert.ok(step.body.audio.promptToken);
    assert.ok(step.body.subjectReadModel.audio.promptToken);

    const legacy = server.DB.db.prepare('SELECT status FROM practice_sessions WHERE id = ?').get('legacy-active');
    assert.equal(legacy.status, 'abandoned');

    step = await postCommand(server, {
      command: 'submit-answer',
      requestId: 'spell-submit-1',
      expectedLearnerRevision: 1,
      payload: { answer },
    });
    assert.equal(step.response.status, 200);
    assert.equal(step.body.subjectReadModel.phase, 'session');
    assert.equal(step.body.subjectReadModel.awaitingAdvance, true);
    assert.equal(step.body.subjectReadModel.feedback.headline, 'Good first hit.');
    assert.equal(step.body.audio, null);
    assert.ok(step.body.subjectReadModel.audio.promptToken);

    step = await postCommand(server, {
      command: 'continue-session',
      requestId: 'spell-continue-1',
      expectedLearnerRevision: 2,
    });
    assert.equal(step.response.status, 200);
    assert.equal(step.body.subjectReadModel.phase, 'session');
    assert.equal(step.body.subjectReadModel.awaitingAdvance, false);
    assert.ok(step.body.audio.promptToken);
    assert.ok(step.body.subjectReadModel.audio.promptToken);

    step = await postCommand(server, {
      command: 'submit-answer',
      requestId: 'spell-submit-2',
      expectedLearnerRevision: 3,
      payload: { answer },
    });
    assert.equal(step.response.status, 200);
    assert.equal(step.body.subjectReadModel.awaitingAdvance, true);
    assert.equal(step.body.subjectReadModel.feedback.headline, 'Correct.');
    assert.equal(step.body.audio, null);
    assert.ok(step.body.subjectReadModel.audio.promptToken);

    step = await postCommand(server, {
      command: 'continue-session',
      requestId: 'spell-continue-2',
      expectedLearnerRevision: 4,
    });
    assert.equal(step.response.status, 200);
    assert.equal(step.body.subjectReadModel.phase, 'summary');
    assert.equal(step.body.audio, null);
    assert.equal(step.body.subjectReadModel.audio, null);
    assert.ok(step.body.events.some((event) => event.type === 'spelling.session-completed'));

    const subject = server.DB.db.prepare(`
      SELECT ui_json, data_json
      FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
    `).get();
    const ui = JSON.parse(subject.ui_json);
    const data = JSON.parse(subject.data_json);
    assert.equal(ui.phase, 'summary');
    assert.equal(data.progress.possess.attempts, 1);
    assert.equal(data.progress.possess.correct, 1);

    const latest = server.DB.db.prepare(`
      SELECT status, summary_json
      FROM practice_sessions
      WHERE learner_id = 'learner-a' AND subject_id = 'spelling'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get();
    assert.equal(latest.status, 'completed');
    assert.equal(JSON.parse(latest.summary_json).totalWords, 1);
  } finally {
    server.close();
  }
});
