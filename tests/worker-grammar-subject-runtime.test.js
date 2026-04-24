import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

function seedAccountLearner(DB, { accountId = 'adult-a', learnerId = 'learner-a', revision = 0 } = {}) {
  const now = Date.now();
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, ?)
  `).run(learnerId, now, now, revision);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, 'Adult A', 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
}

async function postCommand(app, DB, body, headers = {}) {
  const response = await app.fetch(new Request('https://repo.test/api/subjects/grammar/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
      ...headers,
    },
    body: JSON.stringify(body),
  }), {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  }, {});
  return {
    response,
    body: await response.json(),
  };
}

test('worker subject runtime registers Grammar command handlers', async () => {
  const runtime = createWorkerSubjectRuntime({
    grammar: { now: () => 1_777_000_000_000 },
  });
  let runtimeReads = 0;
  const result = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-start',
    correlationId: 'grammar-start',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart', roundLength: 1, templateId: 'fronted_adverbial_choose', seed: 10 },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime(accountId, learnerId, subjectId) {
        runtimeReads += 1;
        assert.equal(subjectId, 'grammar');
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
    },
  });

  assert.equal(runtimeReads, 1);
  assert.equal(result.subjectId, 'grammar');
  assert.equal(result.command, 'start-session');
  assert.equal(result.subjectReadModel.phase, 'session');
  assert.equal(result.subjectReadModel.session.currentItem.templateId, 'fronted_adverbial_choose');
  assert.equal(result.subjectReadModel.session.currentItem.evaluate, undefined);
  assert.equal(result.subjectReadModel.session.currentItem.promptText.includes('<'), false);
});

test('Grammar command route persists subject state, practice session, and events', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'question_mark_select');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-start-1',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.ok, true);
  assert.equal(start.body.subjectId, 'grammar');
  assert.equal(start.body.subjectReadModel.authority, 'worker');
  assert.equal(start.body.subjectReadModel.content.conceptCount, 18);
  assert.equal(start.body.subjectReadModel.content.templateCount, 51);
  assert.equal(start.body.mutation.kind, 'subject_command.grammar.start-session');
  assert.equal(start.body.mutation.appliedRevision, 1);

  const submit = await postCommand(app, DB, {
    command: 'submit-answer',
    learnerId: 'learner-a',
    requestId: 'grammar-submit-1',
    expectedLearnerRevision: 1,
    payload: { response: sample.correctResponse },
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.subjectReadModel.phase, 'feedback');
  assert.equal(submit.body.subjectReadModel.feedback.result.correct, true);
  assert.equal(submit.body.mutation.appliedRevision, 2);
  assert.equal(submit.body.domainEvents.some((event) => event.type === 'grammar.answer-submitted'), true);

  const subject = DB.db.prepare(`
    SELECT ui_json, data_json
    FROM child_subject_state
    WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
  `).get();
  const ui = JSON.parse(subject.ui_json);
  const data = JSON.parse(subject.data_json);
  assert.equal(ui.phase, 'feedback');
  assert.equal(data.mastery.concepts.sentence_functions.attempts, 1);
  assert.equal(data.mastery.concepts.speech_punctuation.attempts, 1);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM practice_sessions WHERE subject_id = 'grammar'").get().count, 1);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE subject_id = 'grammar' AND event_type = 'grammar.answer-submitted'").get().count, 1);

  DB.close();
});

test('Grammar command route keeps practice sessions learner scoped when clients send session ids', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'question_mark_select');
  seedAccountLearner(DB, { accountId: 'adult-a', learnerId: 'learner-a' });
  seedAccountLearner(DB, { accountId: 'adult-b', learnerId: 'learner-b' });

  const first = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-shared-session-a',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
      sessionId: 'shared-session-id',
    },
  });
  assert.equal(first.response.status, 200, JSON.stringify(first.body));

  const second = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-b',
    requestId: 'grammar-shared-session-b',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
      sessionId: 'shared-session-id',
    },
  }, { 'x-ks2-dev-account-id': 'adult-b' });
  assert.equal(second.response.status, 200, JSON.stringify(second.body));

  const sessions = DB.db.prepare(`
    SELECT id, learner_id
    FROM practice_sessions
    WHERE subject_id = 'grammar'
    ORDER BY learner_id
  `).all();
  assert.deepEqual(sessions.map((session) => session.learner_id), ['learner-a', 'learner-b']);
  assert.equal(new Set(sessions.map((session) => session.id)).size, 2);
  assert.equal(sessions.some((session) => session.id === 'shared-session-id'), false);

  DB.close();
});

test('Grammar command route rejects continue before an answer advances the item', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-early-continue-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 2,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));

  const early = await postCommand(app, DB, {
    command: 'continue-session',
    learnerId: 'learner-a',
    requestId: 'grammar-early-continue',
    expectedLearnerRevision: 1,
    payload: {},
  });
  assert.equal(early.response.status, 400);
  assert.equal(early.body.code, 'grammar_advance_not_ready');

  const subject = DB.db.prepare(`
    SELECT ui_json
    FROM child_subject_state
    WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
  `).get();
  const ui = JSON.parse(subject.ui_json);
  assert.equal(ui.session.currentIndex, 0);
  assert.equal(ui.session.answered, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 1);

  DB.close();
});

test('Grammar command route rejects end-session without an active session', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const ended = await postCommand(app, DB, {
    command: 'end-session',
    learnerId: 'learner-a',
    requestId: 'grammar-end-without-session',
    expectedLearnerRevision: 0,
    payload: {},
  });
  assert.equal(ended.response.status, 400);
  assert.equal(ended.body.code, 'grammar_session_stale');
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM practice_sessions WHERE subject_id = 'grammar'").get().count, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 0);

  DB.close();
});

test('Grammar command route normalises answer responses before storing read models', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-normalise-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));

  const submit = await postCommand(app, DB, {
    command: 'submit-answer',
    learnerId: 'learner-a',
    requestId: 'grammar-normalise-submit',
    expectedLearnerRevision: 1,
    payload: {
      response: {
        ...sample.correctResponse,
        extra: 'x'.repeat(120_000),
        selected: Array.from({ length: 120 }, () => 'not an option'),
        nested: { value: 'not persisted' },
      },
    },
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.deepEqual(submit.body.subjectReadModel.feedback.response, sample.correctResponse);

  const subject = DB.db.prepare(`
    SELECT ui_json, data_json
    FROM child_subject_state
    WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
  `).get();
  const ui = JSON.parse(subject.ui_json);
  const data = JSON.parse(subject.data_json);
  assert.deepEqual(ui.feedback.response, sample.correctResponse);
  assert.deepEqual(data.recentAttempts[0].response, sample.correctResponse);

  DB.close();
});

test('Grammar save-prefs drops invalid focus concepts so later sessions can start', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const saved = await postCommand(app, DB, {
    command: 'save-prefs',
    learnerId: 'learner-a',
    requestId: 'grammar-invalid-focus-prefs',
    expectedLearnerRevision: 0,
    payload: {
      prefs: {
        mode: 'smart',
        roundLength: 2,
        focusConceptId: 'not-a-real-concept',
      },
    },
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.subjectReadModel.prefs.focusConceptId, '');

  const subject = DB.db.prepare(`
    SELECT data_json
    FROM child_subject_state
    WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
  `).get();
  const data = JSON.parse(subject.data_json);
  assert.equal(data.prefs.focusConceptId, '');

  const started = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-start-after-invalid-focus',
    expectedLearnerRevision: 1,
    payload: {},
  });
  assert.equal(started.response.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.subjectReadModel.phase, 'session');
  assert.equal(started.body.subjectReadModel.session.focusConceptId, '');

  DB.close();
});

test('Grammar command replay is idempotent and does not double-apply events', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const body = {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-replay-1',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  };
  const first = await postCommand(app, DB, body);
  const replay = await postCommand(app, DB, body);

  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.mutation.replayed, true);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 1);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 1);

  DB.close();
});

test('Grammar unknown commands and future AI scoring commands fail closed', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp();
  seedAccountLearner(DB);

  const unknown = await postCommand(app, DB, {
    command: 'ai-scored-question',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-1',
    expectedLearnerRevision: 0,
    payload: { questionText: 'AI wrote this scored item.' },
  });

  assert.equal(unknown.response.status, 404);
  assert.equal(unknown.body.code, 'subject_command_not_found');
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 0);

  DB.close();
});

test('production Grammar commands require same-origin before handlers run', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp();
  seedAccountLearner(DB);

  const response = await app.fetch(new Request('https://repo.test/api/subjects/grammar/command', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
      'x-ks2-dev-account-id': 'adult-a',
    },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'grammar-origin-1',
      expectedLearnerRevision: 0,
    }),
  }), {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
  }, {});
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, 'same_origin_required');
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 0);

  DB.close();
});

test('stale Grammar command revisions do not double-apply mastery or events', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-stale-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));

  const stale = await postCommand(app, DB, {
    command: 'submit-answer',
    learnerId: 'learner-a',
    requestId: 'grammar-stale-submit',
    expectedLearnerRevision: 0,
    payload: { response: sample.correctResponse },
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.code, 'stale_write');
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE subject_id = 'grammar'").get().count, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 1);

  DB.close();
});
