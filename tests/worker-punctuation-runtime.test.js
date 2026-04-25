import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../worker/src/app.js';
import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';
import { buildPunctuationReadModel } from '../worker/src/subjects/punctuation/read-models.js';
import {
  createPunctuationContentIndexes,
  createPunctuationMasteryKey,
} from '../shared/punctuation/content.js';
import { createMigratedSqliteD1Database } from './helpers/sqlite-d1.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function createHarness({ punctuationEnabled = true, random = () => 0 } = {}) {
  const nowRef = { value: Date.UTC(2026, 0, 1) };
  const DB = createMigratedSqliteD1Database();
  seedAccountLearner(DB);
  const app = createWorkerApp({
    now: () => nowRef.value,
    subjectRuntime: createWorkerSubjectRuntime({ punctuation: { random } }),
  });
  const env = {
    DB,
    AUTH_MODE: 'development-stub',
    ENVIRONMENT: 'test',
    PUNCTUATION_SUBJECT_ENABLED: punctuationEnabled ? 'true' : 'false',
  };
  let revision = 0;
  let sequence = 0;

  async function postRaw(body, headers = {}) {
    const response = await app.fetch(new Request('https://repo.test/api/subjects/punctuation/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-a',
        ...headers,
      },
      body: JSON.stringify(body),
    }), env, {});
    return { response, body: await response.json(), requestBody: body };
  }

  async function bootstrap(headers = {}) {
    const response = await app.fetch(new Request('https://repo.test/api/bootstrap', {
      method: 'GET',
      headers: {
        origin: 'https://repo.test',
        'x-ks2-dev-account-id': 'adult-a',
        ...headers,
      },
    }), env, {});
    return { response, body: await response.json() };
  }

  async function command(commandName, payload = {}) {
    sequence += 1;
    const result = await postRaw({
      command: commandName,
      learnerId: 'learner-a',
      requestId: `punctuation-command-${sequence}`,
      expectedLearnerRevision: revision,
      payload,
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    revision = result.body.mutation.appliedRevision;
    return result;
  }

  return {
    DB,
    app,
    env,
    nowRef,
    postRaw,
    bootstrap,
    command,
    close() {
      DB.close();
    },
    get revision() {
      return revision;
    },
  };
}

function payloadText(value) {
  return JSON.stringify(value);
}

function correctAnswerFor(readItem) {
  const source = createPunctuationContentIndexes().itemById.get(readItem.id);
  assert.ok(source, `Expected source item for ${readItem.id}`);
  if (readItem.inputKind === 'choice') return { choiceIndex: source.correctIndex };
  return { typed: source.model };
}

function wrongAnswerFor(readItem) {
  return readItem.inputKind === 'choice' ? { choiceIndex: 99 } : { typed: 'not sure' };
}

function expectedContextForSession(session) {
  return {
    expectedSessionId: session.id,
    expectedItemId: session.currentItem?.id || '',
    expectedAnsweredCount: session.answeredCount,
    expectedReleaseId: session.releaseId,
  };
}

function answerPayloadForSession(session, answer) {
  return {
    ...answer,
    ...expectedContextForSession(session),
  };
}

test('Worker runtime registers punctuation command handlers', async () => {
  const runtime = createWorkerSubjectRuntime({ punctuation: { random: () => 0 } });
  let runtimeReads = 0;
  const result = await runtime.dispatch({
    subjectId: 'punctuation',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'cmd-runtime-punctuation',
    correlationId: 'cmd-runtime-punctuation',
    expectedLearnerRevision: 0,
    payload: { roundLength: '1' },
  }, {
    session: { accountId: 'adult-a' },
    repository: {
      async readSubjectRuntime() {
        runtimeReads += 1;
        return { subjectRecord: { ui: {}, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
    },
  });

  assert.equal(runtimeReads, 1);
  assert.equal(result.subjectId, 'punctuation');
  assert.equal(result.subjectReadModel.phase, 'active-item');
});

test('punctuation command route starts a session and persists through generic runtime stores', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', { mode: 'endmarks', roundLength: '1' });
    assert.equal(start.body.subjectId, 'punctuation');
    assert.equal(start.body.command, 'start-session');
    assert.equal(start.body.subjectReadModel.phase, 'active-item');
    assert.equal(start.body.subjectReadModel.session.currentItem.mode, 'choose');
    assert.doesNotMatch(payloadText(start.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);

    const subjectRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM child_subject_state
      WHERE learner_id = 'learner-a' AND subject_id = 'punctuation'
    `).get();
    const sessionRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM practice_sessions
      WHERE learner_id = 'learner-a' AND subject_id = 'punctuation' AND status = 'active'
    `).get();
    assert.equal(subjectRows.count, 1);
    assert.equal(sessionRows.count, 1);
  } finally {
    harness.close();
  }
});

test('punctuation command route starts guided mode with a redacted teach box', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', {
      mode: 'guided',
      skillId: 'speech',
      roundLength: '1',
    });

    assert.equal(start.body.subjectReadModel.phase, 'active-item');
    assert.equal(start.body.subjectReadModel.session.mode, 'guided');
    assert.equal(start.body.subjectReadModel.session.guided.skillId, 'speech');
    assert.equal(start.body.subjectReadModel.session.guided.supportLevel, 2);
    assert.match(start.body.subjectReadModel.session.guided.teachBox.rule, /spoken words/i);
    assert.ok(start.body.subjectReadModel.session.guided.teachBox.workedExample);
    assert.ok(start.body.subjectReadModel.session.guided.teachBox.contrastExample);
    assert.equal(start.body.subjectReadModel.session.currentItem.skillIds.includes('speech'), true);
    assert.doesNotMatch(payloadText(start.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);
  } finally {
    harness.close();
  }
});

test('punctuation guided mode fades visible support with the recorded support level', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', {
      mode: 'guided',
      skillId: 'sentence_endings',
      roundLength: '2',
    });
    const firstAnswer = correctAnswerFor(start.body.subjectReadModel.session.currentItem);
    const first = await harness.command('submit-answer', firstAnswer);

    assert.equal(first.body.subjectReadModel.session.guided.supportLevel, 1);
    assert.match(first.body.subjectReadModel.session.guided.teachBox.rule, /sentence/i);
    assert.equal(first.body.subjectReadModel.session.guided.teachBox.workedExample, undefined);
    assert.equal(first.body.subjectReadModel.session.guided.teachBox.contrastExample, undefined);

    const next = await harness.command('continue-session');
    const secondAnswer = correctAnswerFor(next.body.subjectReadModel.session.currentItem);
    const second = await harness.command('submit-answer', secondAnswer);

    assert.equal(second.body.subjectReadModel.session.guided.supportLevel, 0);
    assert.equal(second.body.subjectReadModel.session.guided.teachBox, null);
  } finally {
    harness.close();
  }
});

test('punctuation command route starts weak spots with safe focus metadata', async () => {
  const harness = createHarness();
  try {
    await harness.command('start-session', { mode: 'speech', roundLength: '4' });
    const insert = await harness.command('skip-item');
    assert.equal(insert.body.subjectReadModel.session.currentItem.id, 'sp_insert_question');
    await harness.command('submit-answer', { typed: 'Ella asked can we start now' });

    const weak = await harness.command('start-session', { mode: 'weak', roundLength: '1' });

    assert.equal(weak.body.subjectReadModel.phase, 'active-item');
    assert.equal(weak.body.subjectReadModel.session.mode, 'weak');
    assert.equal(weak.body.subjectReadModel.session.currentItem.id, 'sp_insert_question');
    assert.equal(weak.body.subjectReadModel.session.weakFocus.skillId, 'speech');
    assert.equal(weak.body.subjectReadModel.session.weakFocus.source, 'weak_facet');
    assert.deepEqual(Object.keys(weak.body.subjectReadModel.session.weakFocus).sort(), [
      'bucket',
      'clusterId',
      'mode',
      'skillId',
      'skillName',
      'source',
    ]);
    assert.doesNotMatch(payloadText(weak.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);
  } finally {
    harness.close();
  }
});

test('punctuation command route serves combine items through redacted text-entry read models', async () => {
  const harness = createHarness();
  try {
    await harness.command('start-session', { mode: 'boundary', roundLength: '5' });
    await harness.command('skip-item');
    await harness.command('skip-item');
    await harness.command('skip-item');
    const combine = await harness.command('skip-item');

    assert.equal(combine.body.subjectReadModel.phase, 'active-item');
    assert.equal(combine.body.subjectReadModel.session.currentItem.id, 'sc_combine_rain_pitch');
    assert.equal(combine.body.subjectReadModel.session.currentItem.mode, 'combine');
    assert.equal(combine.body.subjectReadModel.session.currentItem.inputKind, 'text');
    assert.match(combine.body.subjectReadModel.session.currentItem.prompt, /Combine the two related clauses/i);
    assert.match(combine.body.subjectReadModel.session.currentItem.stem, /The rain had stopped/);
    assert.doesNotMatch(payloadText(combine.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);

    const submit = await harness.command('submit-answer', {
      typed: 'The rain had stopped; the pitch was still slippery.',
    });
    assert.equal(submit.body.subjectReadModel.feedback.kind, 'success');
    assert.equal(submit.body.domainEvents.some((event) => event.type === 'punctuation.item-attempted'), true);
  } finally {
    harness.close();
  }
});

test('punctuation command route serves paragraph items through redacted multiline read models', async () => {
  const harness = createHarness();
  try {
    await harness.command('start-session', { mode: 'boundary', roundLength: '6' });
    await harness.command('skip-item');
    await harness.command('skip-item');
    await harness.command('skip-item');
    await harness.command('skip-item');
    const paragraph = await harness.command('skip-item');

    assert.equal(paragraph.body.subjectReadModel.phase, 'active-item');
    assert.equal(paragraph.body.subjectReadModel.session.currentItem.id, 'pg_colon_semicolon');
    assert.equal(paragraph.body.subjectReadModel.session.currentItem.mode, 'paragraph');
    assert.equal(paragraph.body.subjectReadModel.session.currentItem.inputKind, 'text');
    assert.match(paragraph.body.subjectReadModel.session.currentItem.prompt, /Repair the punctuation/i);
    assert.match(paragraph.body.subjectReadModel.session.currentItem.stem, /The kit included three tools/);
    assert.doesNotMatch(payloadText(paragraph.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);

    const submit = await harness.command('submit-answer', {
      typed: 'The kit included three tools: a torch, a rope and a map. The weather changed; the team packed quickly.',
    });
    assert.equal(submit.body.subjectReadModel.feedback.kind, 'success');
    assert.equal(submit.body.domainEvents.some((event) => event.type === 'punctuation.item-attempted'), true);
  } finally {
    harness.close();
  }
});

test('punctuation command route runs GPS mode with delayed feedback and final review', async () => {
  const harness = createHarness();
  try {
    let step = await harness.command('start-session', { mode: 'gps', roundLength: '3' });

    assert.equal(step.body.subjectReadModel.phase, 'active-item');
    assert.equal(step.body.subjectReadModel.session.mode, 'gps');
    assert.equal(step.body.subjectReadModel.session.length, 3);
    assert.deepEqual(step.body.subjectReadModel.session.gps, {
      testLength: 3,
      answeredCount: 0,
      remainingCount: 3,
      delayedFeedback: true,
    });
    assert.equal(step.body.subjectReadModel.session.guided, null);
    assert.doesNotMatch(payloadText(step.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|queueItemIds|responses|generator|model|displayCorrection/);

    step = await harness.command(
      'submit-answer',
      answerPayloadForSession(step.body.subjectReadModel.session, wrongAnswerFor(step.body.subjectReadModel.session.currentItem)),
    );
    assert.equal(step.body.subjectReadModel.phase, 'active-item');
    assert.equal(step.body.subjectReadModel.feedback, null);
    assert.equal(step.body.subjectReadModel.session.correctCount, 0);
    assert.deepEqual(step.body.subjectReadModel.session.misconceptionTags, []);
    assert.equal(step.body.subjectReadModel.session.gps.answeredCount, 1);
    assert.equal(step.body.subjectReadModel.stats.attempts, 0);
    assert.equal(step.body.subjectReadModel.stats.correct, 0);
    assert.deepEqual(step.body.domainEvents, []);
    assert.deepEqual(step.body.reactionEvents, []);
    assert.doesNotMatch(payloadText(step.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|queueItemIds|responses|generator|model|displayCorrection/);

    step = await harness.command(
      'submit-answer',
      answerPayloadForSession(step.body.subjectReadModel.session, correctAnswerFor(step.body.subjectReadModel.session.currentItem)),
    );
    const final = await harness.command(
      'submit-answer',
      answerPayloadForSession(step.body.subjectReadModel.session, correctAnswerFor(step.body.subjectReadModel.session.currentItem)),
    );

    assert.equal(final.body.subjectReadModel.phase, 'summary');
    assert.equal(final.body.subjectReadModel.summary.label, 'Punctuation GPS test summary');
    assert.equal(final.body.subjectReadModel.summary.total, 3);
    assert.equal(final.body.subjectReadModel.summary.correct, 2);
    assert.equal(final.body.subjectReadModel.summary.gps.reviewItems.length, 3);
    assert.equal(final.body.subjectReadModel.summary.gps.recommendedMode, 'weak');
    assert.equal(final.body.domainEvents.filter((event) => event.type === 'punctuation.item-attempted').length, 3);
    assert.equal(final.body.domainEvents.some((event) => event.type === 'punctuation.session-completed'), true);

    const publicBootstrap = await harness.bootstrap({ 'x-ks2-public-read-models': '1' });
    assert.equal(publicBootstrap.response.status, 200, JSON.stringify(publicBootstrap.body));
    const publicState = publicBootstrap.body.subjectStates['learner-a::punctuation'];
    const publicSession = publicBootstrap.body.practiceSessions.find((session) => session.subjectId === 'punctuation');
    assert.deepEqual(publicState.ui.summary.gps.reviewItems, []);
    assert.deepEqual(publicSession.summary.gps.reviewItems, []);
    assert.doesNotMatch(payloadText({ publicState, publicSession }), /attemptedAnswer|displayCorrection|explanation|prompt|stem/);

    const itemAttemptRows = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'punctuation.item-attempted'
    `).get().count;
    const replay = await harness.postRaw(final.requestBody);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.mutation.replayed, true);
    assert.equal(harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'punctuation.item-attempted'
    `).get().count, itemAttemptRows);
  } finally {
    harness.close();
  }
});

test('punctuation GPS submit rejects stale retries bound to the previous item', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', { mode: 'gps', roundLength: '2' });
    const firstSession = start.body.subjectReadModel.session;
    const firstItem = firstSession.currentItem;
    const staleContext = expectedContextForSession(firstSession);
    const stalePayload = {
      ...wrongAnswerFor(firstItem),
      ...staleContext,
    };

    await harness.command('submit-answer', answerPayloadForSession(firstSession, correctAnswerFor(firstItem)));
    const currentRevision = harness.revision;
    const staleRetry = await harness.postRaw({
      command: 'submit-answer',
      learnerId: 'learner-a',
      requestId: 'punctuation-gps-stale-retry',
      expectedLearnerRevision: currentRevision,
      payload: stalePayload,
    });

    assert.equal(staleRetry.response.status, 400, JSON.stringify(staleRetry.body));
    assert.equal(staleRetry.body.code, 'punctuation_command_stale');
    assert.equal(staleRetry.body.expectedItemId, firstItem.id);
    assert.notEqual(staleRetry.body.itemId, firstItem.id);

    for (const command of ['skip-item', 'end-session']) {
      const staleCommand = await harness.postRaw({
        command,
        learnerId: 'learner-a',
        requestId: `punctuation-gps-stale-${command}`,
        expectedLearnerRevision: currentRevision,
        payload: staleContext,
      });
      assert.equal(staleCommand.response.status, 400, JSON.stringify(staleCommand.body));
      assert.equal(staleCommand.body.code, 'punctuation_command_stale');
      assert.equal(staleCommand.body.expectedItemId, firstItem.id);
      assert.notEqual(staleCommand.body.itemId, firstItem.id);
    }
    assert.equal(harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'punctuation.item-attempted'
    `).get().count, 0);
  } finally {
    harness.close();
  }
});

test('punctuation GPS commands reject missing visible item context', async () => {
  const harness = createHarness();
  try {
    const start = await harness.command('start-session', { mode: 'gps', roundLength: '2' });
    const firstSession = start.body.subjectReadModel.session;

    for (const [command, payload] of [
      ['submit-answer', correctAnswerFor(firstSession.currentItem)],
      ['skip-item', {}],
      ['end-session', {}],
    ]) {
      const result = await harness.postRaw({
        command,
        learnerId: 'learner-a',
        requestId: `punctuation-gps-missing-context-${command}`,
        expectedLearnerRevision: harness.revision,
        payload,
      });
      assert.equal(result.response.status, 400, JSON.stringify(result.body));
      assert.equal(result.body.code, 'punctuation_command_stale');
      assert.equal(result.body.missingExpectedContext, true);
      assert.equal(result.body.sessionId, firstSession.id);
      assert.equal(result.body.itemId, firstSession.currentItem.id);
    }
    assert.equal(harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'punctuation.item-attempted'
    `).get().count, 0);
  } finally {
    harness.close();
  }
});

test('public bootstrap redacts active Punctuation GPS queue and delayed answers', async () => {
  const harness = createHarness();
  try {
    let step = await harness.command('start-session', { mode: 'gps', roundLength: '3' });
    step = await harness.command(
      'submit-answer',
      answerPayloadForSession(step.body.subjectReadModel.session, wrongAnswerFor(step.body.subjectReadModel.session.currentItem)),
    );

    const publicBootstrap = await harness.bootstrap({ 'x-ks2-public-read-models': '1' });
    assert.equal(publicBootstrap.response.status, 200, JSON.stringify(publicBootstrap.body));

    const publicState = publicBootstrap.body.subjectStates['learner-a::punctuation'];
    const publicReadModel = publicState.ui;
    const publicSession = publicBootstrap.body.practiceSessions.find((session) => session.subjectId === 'punctuation');
    const publicRuntimeText = payloadText({ publicState, publicSession });

    assert.deepEqual(publicState.data, {});
    assert.equal(publicReadModel.subjectId, 'punctuation');
    assert.equal(publicReadModel.phase, 'active-item');
    assert.equal(publicReadModel.session.mode, 'gps');
    assert.equal(publicReadModel.session.correctCount, 0);
    assert.deepEqual(publicReadModel.session.misconceptionTags, []);
    assert.deepEqual(publicReadModel.session.gps, {
      testLength: 3,
      answeredCount: 1,
      remainingCount: 2,
      delayedFeedback: true,
    });
    assert.equal(publicReadModel.feedback, null);
    assert.equal(publicSession.sessionState, null);
    assert.equal(publicSession.summary, null);
    assert.doesNotMatch(publicRuntimeText, /accepted|correctIndex|rubric|validator|hiddenQueue|queueItemIds|responses|generator|model|displayCorrection/);
  } finally {
    harness.close();
  }
});

test('punctuation command route stays unavailable until the rollout gate is enabled', async () => {
  const harness = createHarness({ punctuationEnabled: false });
  try {
    const start = await harness.postRaw({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'punctuation-gated-start',
      expectedLearnerRevision: 0,
      payload: { mode: 'speech', roundLength: '1' },
    });

    assert.equal(start.response.status, 404);
    assert.equal(start.body.code, 'subject_command_not_found');
    assert.equal(harness.DB.db.prepare('SELECT COUNT(*) AS count FROM child_subject_state').get().count, 0);
    assert.equal(harness.DB.db.prepare('SELECT COUNT(*) AS count FROM practice_sessions').get().count, 0);
  } finally {
    harness.close();
  }
});

test('punctuation submit returns redacted feedback and completed summary', async () => {
  const harness = createHarness();
  try {
    await harness.command('start-session', { mode: 'endmarks', roundLength: '1' });
    const submit = await harness.command('submit-answer', { choiceIndex: 1 });
    assert.equal(submit.body.subjectReadModel.phase, 'feedback');
    assert.equal(submit.body.subjectReadModel.feedback.kind, 'success');
    assert.doesNotMatch(payloadText(submit.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);
    assert.equal(submit.body.domainEvents.some((event) => event.type === 'punctuation.item-attempted'), true);

    const summary = await harness.command('continue-session');
    assert.equal(summary.body.subjectReadModel.phase, 'summary');
    assert.equal(summary.body.subjectReadModel.summary.total, 1);
    assert.equal(summary.body.domainEvents.some((event) => event.type === 'punctuation.session-completed'), true);

    const completed = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM practice_sessions
      WHERE learner_id = 'learner-a' AND subject_id = 'punctuation' AND status = 'completed'
    `).get();
    assert.equal(completed.count, 1);
  } finally {
    harness.close();
  }
});

test('punctuation command route redacts generated live items', async () => {
  const harness = createHarness({ random: () => 0.99 });
  try {
    const start = await harness.command('start-session', { mode: 'endmarks', roundLength: '2' });
    const choiceIndex = start.body.subjectReadModel.session.currentItem.options
      .find((option) => option.text === start.body.subjectReadModel.session.currentItem.model)?.index ?? 0;
    await harness.command('submit-answer', { choiceIndex });

    const generated = await harness.command('continue-session');
    assert.equal(generated.body.subjectReadModel.phase, 'active-item');
    assert.equal(generated.body.subjectReadModel.session.currentItem.source, 'generated');
    assert.doesNotMatch(payloadText(generated.body.subjectReadModel), /accepted|correctIndex|rubric|validator|hiddenQueue|generator/);
  } finally {
    harness.close();
  }
});

test('punctuation choice answers reject coerced null, empty, and array indexes', async () => {
  for (const [label, choiceIndex] of [
    ['null', null],
    ['empty string', ''],
    ['array', [0]],
  ]) {
    const harness = createHarness();
    try {
      await harness.command('start-session', { mode: 'speech', roundLength: '1' });
      const submit = await harness.command('submit-answer', { choiceIndex });

      assert.equal(submit.body.subjectReadModel.session.currentItem.mode, 'choose', label);
      assert.equal(submit.body.subjectReadModel.feedback.kind, 'error', label);
      assert.equal(submit.body.subjectReadModel.session.correctCount, 0, label);
      assert.equal(submit.body.domainEvents.some((event) => event.type === 'punctuation.unit-secured'), false, label);
      assert.equal(submit.body.reactionEvents.length, 0, label);
    } finally {
      harness.close();
    }
  }
});

test('punctuation Worker redaction fails closed for server-only live item fields', () => {
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: {
      phase: 'active-item',
      session: {
        currentItem: {
          id: 'leaky',
          mode: 'insert',
          prompt: 'Prompt',
          accepted: ['Hidden answer'],
        },
      },
    },
  }), /server-only item field: accepted/);
});

test('unknown punctuation commands and stale transitions do not mutate learner state', async () => {
  const harness = createHarness();
  try {
    const missing = await harness.postRaw({
      command: 'missing',
      learnerId: 'learner-a',
      requestId: 'punctuation-missing',
      expectedLearnerRevision: 0,
    });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.code, 'subject_command_not_found');

    const stale = await harness.postRaw({
      command: 'submit-answer',
      learnerId: 'learner-a',
      requestId: 'punctuation-stale-session',
      expectedLearnerRevision: 0,
      payload: { typed: 'No session.' },
    });
    assert.equal(stale.response.status, 400);
    assert.equal(stale.body.code, 'punctuation_session_stale');

    assert.equal(harness.DB.db.prepare('SELECT COUNT(*) AS count FROM child_subject_state').get().count, 0);
    assert.equal(harness.DB.db.prepare('SELECT COUNT(*) AS count FROM practice_sessions').get().count, 0);
  } finally {
    harness.close();
  }
});

test('punctuation secure-unit events project idempotent Monster Codex rewards', async () => {
  const harness = createHarness();
  try {
    let secureSubmit = null;
    for (const day of [0, 4, 8]) {
      harness.nowRef.value = Date.UTC(2026, 0, 1) + day * DAY_MS;
      await harness.command('start-session', { mode: 'endmarks', roundLength: '1' });
      const submit = await harness.command('submit-answer', { choiceIndex: 1 });
      if (submit.body.domainEvents.some((event) => event.type === 'punctuation.unit-secured')) secureSubmit = submit;
      await harness.command('continue-session');
    }

    assert.ok(secureSubmit, 'third spaced clean attempt should secure a reward unit');
    assert.ok(secureSubmit.body.reactionEvents.some((event) => (
      event.type === 'reward.monster'
      && event.subjectId === 'punctuation'
      && event.monsterId === 'pealark'
    )));
    assert.ok(secureSubmit.body.projections.rewards.state.pealark.mastered.includes(
      createPunctuationMasteryKey({ clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core' }),
    ));

    const rewardCount = harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'reward.monster'
    `).get().count;
    const replay = await harness.postRaw(secureSubmit.requestBody);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.mutation.replayed, true);
    assert.equal(harness.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = 'learner-a' AND event_type = 'reward.monster'
    `).get().count, rewardCount);
  } finally {
    harness.close();
  }
});
