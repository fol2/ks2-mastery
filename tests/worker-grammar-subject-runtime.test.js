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
  assert.deepEqual(result.subjectReadModel.capabilities.enabledModes.map((mode) => mode.id), [
    'learn',
    'smart',
    'satsset',
    'trouble',
    'surgery',
    'builder',
    'worked',
    'faded',
  ]);
  assert.equal(result.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'trouble'), false);
  assert.equal(result.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'surgery'), false);
  assert.equal(result.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'builder'), false);
  assert.equal(result.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'worked'), false);
  assert.equal(result.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'faded'), false);
});

test('worker subject runtime starts Grammar trouble drills against weak concepts', async () => {
  const runtime = createWorkerSubjectRuntime({
    grammar: { now: () => 1_777_000_000_000 },
  });
  const result = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-trouble-start',
    correlationId: 'grammar-trouble-start',
    expectedLearnerRevision: 0,
    payload: { mode: 'trouble', roundLength: 2, seed: 77 },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime(accountId, learnerId, subjectId) {
        assert.equal(accountId, 'adult-a');
        assert.equal(learnerId, 'learner-a');
        assert.equal(subjectId, 'grammar');
        return {
          subjectRecord: {
            ui: null,
            data: {
              mastery: {
                concepts: {
                  adverbials: {
                    attempts: 3,
                    correct: 0,
                    wrong: 3,
                    strength: 0.1,
                    dueAt: 1,
                  },
                },
              },
            },
          },
          latestSession: null,
        };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
    },
  });

  assert.equal(result.subjectReadModel.phase, 'session');
  assert.equal(result.subjectReadModel.session.mode, 'trouble');
  assert.equal(result.subjectReadModel.session.type, 'trouble-drill');
  assert.equal(result.subjectReadModel.session.focusConceptId, 'adverbials');
  assert.ok(result.subjectReadModel.session.currentItem.skillIds.includes('adverbials'));
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

test('Grammar command route accepts trouble drill mode', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-trouble-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'trouble',
      roundLength: 2,
      seed: 120,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.phase, 'session');
  assert.equal(start.body.subjectReadModel.session.mode, 'trouble');
  assert.equal(start.body.subjectReadModel.session.type, 'trouble-drill');
  assert.equal(start.body.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'trouble'), false);

  DB.close();
});

test('Grammar command route runs strict mini-test save, navigation, and finish commands', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-mini-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'satsset',
      roundLength: 8,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.phase, 'session');
  assert.equal(start.body.subjectReadModel.session.type, 'mini-set');
  assert.equal(start.body.subjectReadModel.session.miniTest.questions.length, 8);
  assert.equal(start.body.subjectReadModel.feedback, null);

  const ai = await postCommand(app, DB, {
    command: 'request-ai-enrichment',
    learnerId: 'learner-a',
    requestId: 'grammar-mini-route-ai',
    expectedLearnerRevision: 1,
    payload: { kind: 'explanation' },
  });
  assert.equal(ai.response.status, 400, JSON.stringify(ai.body));
  assert.equal(ai.body.code, 'grammar_ai_unavailable_for_mini_test');

  const save = await postCommand(app, DB, {
    command: 'save-mini-test-response',
    learnerId: 'learner-a',
    requestId: 'grammar-mini-route-save',
    expectedLearnerRevision: 1,
    payload: {
      response: sample.correctResponse,
      advance: true,
    },
  });
  assert.equal(save.response.status, 200, JSON.stringify(save.body));
  assert.equal(save.body.subjectReadModel.phase, 'session');
  assert.equal(save.body.subjectReadModel.session.currentIndex, 1);
  assert.equal(save.body.subjectReadModel.session.answered, 1);
  assert.equal(save.body.subjectReadModel.feedback, null);
  assert.equal(save.body.domainEvents.some((event) => event.type === 'grammar.answer-submitted'), false);
  assert.equal(save.body.mutation.appliedRevision, 2);

  const move = await postCommand(app, DB, {
    command: 'move-mini-test',
    learnerId: 'learner-a',
    requestId: 'grammar-mini-route-move',
    expectedLearnerRevision: 2,
    payload: {
      index: 0,
    },
  });
  assert.equal(move.response.status, 200, JSON.stringify(move.body));
  assert.equal(move.body.subjectReadModel.session.currentIndex, 0);
  assert.equal(move.body.subjectReadModel.session.miniTest.questions[0].answered, true);

  const finish = await postCommand(app, DB, {
    command: 'finish-mini-test',
    learnerId: 'learner-a',
    requestId: 'grammar-mini-route-finish',
    expectedLearnerRevision: 3,
    payload: {
      saveCurrent: false,
    },
  });
  assert.equal(finish.response.status, 200, JSON.stringify(finish.body));
  assert.equal(finish.body.subjectReadModel.phase, 'summary');
  assert.equal(finish.body.subjectReadModel.summary.answered, 1);
  assert.equal(finish.body.subjectReadModel.summary.miniTestReview.questions.length, 8);
  assert.equal(finish.body.domainEvents.filter((event) => event.type === 'grammar.answer-submitted').length, 1);
  assert.equal(finish.body.domainEvents.some((event) => event.type === 'grammar.session-completed'), true);

  DB.close();
});

test('Grammar command route persists session goals and practice settings', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const prefs = await postCommand(app, DB, {
    command: 'save-prefs',
    learnerId: 'learner-a',
    requestId: 'grammar-goal-settings-prefs',
    expectedLearnerRevision: 0,
    payload: {
      prefs: {
        goalType: 'timed',
        allowTeachingItems: true,
        showDomainBeforeAnswer: false,
      },
    },
  });
  assert.equal(prefs.response.status, 200, JSON.stringify(prefs.body));
  assert.equal(prefs.body.subjectReadModel.prefs.goalType, 'timed');
  assert.equal(prefs.body.subjectReadModel.prefs.allowTeachingItems, true);
  assert.equal(prefs.body.subjectReadModel.prefs.showDomainBeforeAnswer, false);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-goal-settings-start',
    expectedLearnerRevision: 1,
    payload: {
      mode: 'smart',
      roundLength: 15,
      seed: 321,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.session.goal.type, 'timed');
  assert.equal(start.body.subjectReadModel.session.goal.timeLimitMs, 10 * 60_000);
  assert.equal(start.body.subjectReadModel.session.supportLevel, 1);
  assert.equal(start.body.subjectReadModel.session.supportGuidance.kind, 'faded');

  DB.close();
});

test('Grammar command route persists repair actions through Worker commands', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  const wrongAnswer = sample.sample.inputSpec.options.find((option) => option.value !== sample.correctResponse.answer).value;
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-repair-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));

  const faded = await postCommand(app, DB, {
    command: 'use-faded-support',
    learnerId: 'learner-a',
    requestId: 'grammar-repair-route-faded',
    expectedLearnerRevision: 1,
    payload: {},
  });
  assert.equal(faded.response.status, 200, JSON.stringify(faded.body));
  assert.equal(faded.body.subjectReadModel.session.supportLevel, 1);
  assert.equal(faded.body.subjectReadModel.session.supportGuidance.kind, 'faded');

  const submit = await postCommand(app, DB, {
    command: 'submit-answer',
    learnerId: 'learner-a',
    requestId: 'grammar-repair-route-submit',
    expectedLearnerRevision: 2,
    payload: { response: { answer: wrongAnswer } },
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.subjectReadModel.phase, 'feedback');
  assert.equal(submit.body.subjectReadModel.feedback.result.correct, false);

  const worked = await postCommand(app, DB, {
    command: 'show-worked-solution',
    learnerId: 'learner-a',
    requestId: 'grammar-repair-route-worked',
    expectedLearnerRevision: 3,
    payload: {},
  });
  assert.equal(worked.response.status, 200, JSON.stringify(worked.body));
  assert.ok(worked.body.subjectReadModel.feedback.workedSolution.answerText);
  assert.equal(worked.body.subjectReadModel.session.supportLevel, 2);

  const retry = await postCommand(app, DB, {
    command: 'retry-current-question',
    learnerId: 'learner-a',
    requestId: 'grammar-repair-route-retry',
    expectedLearnerRevision: 4,
    payload: {},
  });
  assert.equal(retry.response.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.subjectReadModel.phase, 'session');
  assert.equal(retry.body.subjectReadModel.session.answered, 1);
  assert.equal(retry.body.subjectReadModel.session.repair.retryingCurrent, true);

  DB.close();
});

test('Grammar command route accepts sentence surgery mode', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-surgery-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'surgery',
      roundLength: 2,
      seed: 120,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.phase, 'session');
  assert.equal(start.body.subjectReadModel.session.mode, 'surgery');
  assert.equal(start.body.subjectReadModel.session.type, 'sentence-surgery');
  assert.match(start.body.subjectReadModel.session.currentItem.questionType, /^(fix|rewrite)$/);
  assert.equal(start.body.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'surgery'), false);

  DB.close();
});

test('Grammar command route rejects non-surgery template overrides in surgery mode', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-surgery-route-template-bypass',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'surgery',
      roundLength: 2,
      seed: 120,
      templateId: 'sentence_type_table',
    },
  });

  assert.equal(start.response.status, 400, JSON.stringify(start.body));
  assert.equal(start.body.code, 'grammar_template_unavailable_for_mode');

  DB.close();
});

test('Grammar command route starts explicit templates without inheriting stored focus', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'question_mark_select');
  seedAccountLearner(DB);

  const prefs = await postCommand(app, DB, {
    command: 'save-prefs',
    learnerId: 'learner-a',
    requestId: 'grammar-explicit-template-focus-prefs',
    expectedLearnerRevision: 0,
    payload: {
      prefs: {
        focusConceptId: 'word_classes',
      },
    },
  });
  assert.equal(prefs.response.status, 200, JSON.stringify(prefs.body));
  assert.equal(prefs.body.subjectReadModel.prefs.focusConceptId, 'word_classes');

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-explicit-template-start',
    expectedLearnerRevision: 1,
    payload: {
      mode: 'smart',
      roundLength: 1,
      seed: sample.sample.seed,
      templateId: sample.id,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.session.currentItem.templateId, sample.id);
  assert.equal(start.body.subjectReadModel.session.focusConceptId, '');
  assert.equal(start.body.subjectReadModel.prefs.focusConceptId, 'word_classes');

  DB.close();
});

test('Grammar command route accepts sentence builder mode', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-builder-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'builder',
      roundLength: 2,
      seed: 120,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.phase, 'session');
  assert.equal(start.body.subjectReadModel.session.mode, 'builder');
  assert.equal(start.body.subjectReadModel.session.type, 'sentence-builder');
  assert.equal(start.body.subjectReadModel.session.focusConceptId, '');
  assert.match(start.body.subjectReadModel.session.currentItem.questionType, /^(build|rewrite)$/);
  assert.equal(start.body.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'builder'), false);

  DB.close();
});

test('Grammar command route accepts worked example mode with concept guidance', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-worked-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'worked',
      roundLength: 1,
      seed: 120,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.session.mode, 'worked');
  assert.equal(start.body.subjectReadModel.session.type, 'worked-example');
  assert.equal(start.body.subjectReadModel.session.supportLevel, 2);
  assert.equal(start.body.subjectReadModel.session.supportGuidance.kind, 'worked');
  assert.ok(start.body.subjectReadModel.session.supportGuidance.workedExample.exampleResponse);
  assert.equal(start.body.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'worked'), false);

  DB.close();
});

test('Grammar command route accepts faded guidance mode without current-answer leakage', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-faded-route-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'faded',
      roundLength: 1,
      seed: 120,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.subjectReadModel.session.mode, 'faded');
  assert.equal(start.body.subjectReadModel.session.type, 'faded-guidance');
  assert.equal(start.body.subjectReadModel.session.supportLevel, 1);
  assert.equal(start.body.subjectReadModel.session.supportGuidance.kind, 'faded');
  assert.equal(start.body.subjectReadModel.session.currentItem.solutionLines, undefined);
  assert.equal(start.body.subjectReadModel.session.supportGuidance.workedExample, undefined);
  assert.equal(start.body.subjectReadModel.capabilities.lockedModes.some((mode) => mode.id === 'faded'), false);

  DB.close();
});

test('Grammar faded guidance omits contrast examples that match current options', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-faded-formality-leakage',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'faded',
      roundLength: 1,
      templateId: 'proc2_formality_choice',
      seed: 1,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  const session = start.body.subjectReadModel.session;
  const optionLabels = session.currentItem.inputSpec.options.map((option) => option.label);
  assert.ok(optionLabels.includes('The club was established last year.'));
  assert.ok(optionLabels.includes('The club got set up last year.'));
  assert.equal(session.supportGuidance.kind, 'faded');
  assert.equal(session.supportGuidance.contrast.secureExample, undefined);
  assert.equal(session.supportGuidance.contrast.nearMiss, undefined);
  assert.equal(session.supportGuidance.contrast.why, 'The first is more formal.');
  assert.equal(JSON.stringify(session.supportGuidance).includes('The club was established last year.'), false);
  assert.equal(JSON.stringify(session.supportGuidance).includes('The club got set up last year.'), false);

  DB.close();
});

test('Grammar worked guidance omits model answers that match current table rows', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-worked-row-leakage',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'worked',
      roundLength: 1,
      templateId: 'sentence_type_table',
      seed: 4,
    },
  });

  assert.equal(start.response.status, 200, JSON.stringify(start.body));
  const session = start.body.subjectReadModel.session;
  const rowLabels = session.currentItem.inputSpec.rows.map((row) => row.label);
  assert.ok(rowLabels.includes('Close the gate before the dog escapes.'));
  assert.equal(session.supportGuidance.kind, 'worked');
  assert.equal(session.supportGuidance.workedExample.prompt, 'Which sentence is a command?');
  assert.equal(session.supportGuidance.workedExample.exampleResponse, undefined);
  assert.equal(session.supportGuidance.workedExample.why, 'It tells someone to do something.');
  assert.equal(JSON.stringify(session.supportGuidance).includes('Close the gate before the dog escapes.'), false);

  DB.close();
});

test('Grammar command route rejects non-builder template overrides in builder mode', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-builder-route-template-bypass',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'builder',
      roundLength: 2,
      seed: 120,
      templateId: 'sentence_type_table',
    },
  });

  assert.equal(start.response.status, 400, JSON.stringify(start.body));
  assert.equal(start.body.code, 'grammar_template_unavailable_for_mode');

  DB.close();
});

test('Grammar read model exposes evidence analytics for misconceptions and question types', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-evidence-start',
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
    requestId: 'grammar-evidence-submit',
    expectedLearnerRevision: 1,
    payload: { response: { answer: sample.sample.inputSpec.options[0].value } },
  });

  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.subjectReadModel.analytics.progressSnapshot.trackedConcepts, 1);
  assert.equal(submit.body.subjectReadModel.analytics.misconceptionPatterns[0].id, 'fronted_adverbial_confusion');
  assert.equal(submit.body.subjectReadModel.analytics.questionTypeSummary[0].id, 'choose');
  assert.equal(submit.body.subjectReadModel.analytics.questionTypeSummary[0].wrong, 1);
  assert.equal(submit.body.subjectReadModel.analytics.recentActivity[0].misconception, 'fronted_adverbial_confusion');

  DB.close();
});

test('Grammar concept-secured events project monster rewards atomically', async () => {
  const DB = createMigratedSqliteD1Database();
  const now = 1_777_000_000_000;
  const app = createWorkerApp({ now: () => now });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'question_mark_select');
  seedAccountLearner(DB);

  const start = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-reward-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(start.response.status, 200, JSON.stringify(start.body));

  const subject = DB.db.prepare(`
    SELECT ui_json, data_json
    FROM child_subject_state
    WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
  `).get();
  const ui = JSON.parse(subject.ui_json);
  const data = JSON.parse(subject.data_json);
  for (const conceptId of start.body.subjectReadModel.session.currentItem.skillIds) {
    const nearlySecured = {
      attempts: 2,
      correct: 2,
      wrong: 0,
      strength: 0.81,
      intervalDays: 7,
      dueAt: now + 7 * 86400000,
      lastSeenAt: new Date(now - 86400000).toISOString(),
      lastWrongAt: null,
      correctStreak: 2,
    };
    data.mastery.concepts[conceptId] = nearlySecured;
    ui.mastery.concepts[conceptId] = nearlySecured;
  }
  DB.db.prepare(`
    UPDATE child_subject_state
    SET ui_json = ?, data_json = ?
    WHERE learner_id = 'learner-a' AND subject_id = 'grammar'
  `).run(JSON.stringify(ui), JSON.stringify(data));

  const submit = await postCommand(app, DB, {
    command: 'submit-answer',
    learnerId: 'learner-a',
    requestId: 'grammar-reward-submit',
    expectedLearnerRevision: 1,
    payload: { response: sample.correctResponse },
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.domainEvents.some((event) => event.type === 'grammar.concept-secured'), true);
  assert.equal(submit.body.reactionEvents.some((event) => (
    event.type === 'reward.monster'
    && event.subjectId === 'grammar'
    && event.monsterId === 'bracehart'
  )), true);
  assert.equal(submit.body.reactionEvents.some((event) => (
    event.type === 'reward.monster'
    && event.subjectId === 'grammar'
    && event.monsterId === 'concordium'
  )), true);
  assert.ok(submit.body.projections.rewards.state.bracehart.mastered.includes(
    'grammar:grammar-legacy-reviewed-2026-04-24:sentence_functions',
  ));
  assert.ok(submit.body.projections.rewards.state.concordium.mastered.includes(
    'grammar:grammar-legacy-reviewed-2026-04-24:speech_punctuation',
  ));
  assert.equal(submit.body.projections.rewards.state.quoral, undefined);

  const gameRow = DB.db.prepare(`
    SELECT state_json
    FROM child_game_state
    WHERE learner_id = 'learner-a' AND system_id = 'monster-codex'
  `).get();
  const gameState = JSON.parse(gameRow.state_json);
  assert.ok(gameState.bracehart.mastered.includes('grammar:grammar-legacy-reviewed-2026-04-24:sentence_functions'));
  assert.equal(gameState.quoral, undefined);

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

test('Grammar AI enrichment returns non-scored deterministic drill suggestions without mutating mastery', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const enrichment = await postCommand(app, DB, {
    command: 'request-ai-enrichment',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-enrichment-valid',
    expectedLearnerRevision: 0,
    payload: {
      kind: 'explanation',
      conceptId: 'adverbials',
      aiResponse: JSON.stringify({
        title: 'Fronted adverbials',
        explanation: 'A fronted adverbial comes before the main clause and usually takes a comma in KS2 writing.',
        keyPoints: [
          'Find the opener before the main clause.',
          'Check whether the comma separates the opener cleanly.',
        ],
        revisionCards: [{
          title: 'Comma check',
          front: 'Find the fronted adverbial.',
          back: 'Look before the first comma and test whether it tells when, where or how.',
        }],
        drills: [{ templateId: 'fronted_adverbial_choose' }],
      }),
    },
  });

  assert.equal(enrichment.response.status, 200, JSON.stringify(enrichment.body));
  assert.equal(enrichment.body.changed, false);
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.status, 'ready');
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.nonScored, true);
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.concept.id, 'adverbials');
  assert.deepEqual(enrichment.body.subjectReadModel.aiEnrichment.revisionDrills.map((drill) => drill.templateId), [
    'fronted_adverbial_choose',
  ]);
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.revisionDrills[0].deterministic, true);
  assert.equal(enrichment.body.mutation.appliedRevision, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM event_log WHERE subject_id = 'grammar'").get().count, 0);

  DB.close();
});

test('Grammar AI enrichment uses deterministic fallback content when no provider response is available', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  const sample = readGrammarLegacyOracle().templates.find((template) => template.id === 'fronted_adverbial_choose');
  seedAccountLearner(DB);

  const started = await postCommand(app, DB, {
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-fallback-start',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'smart',
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });
  assert.equal(started.response.status, 200, JSON.stringify(started.body));

  const enrichment = await postCommand(app, DB, {
    command: 'request-ai-enrichment',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-fallback-revision-cards',
    expectedLearnerRevision: 1,
    payload: {
      kind: 'revision-card',
    },
  });

  assert.equal(enrichment.response.status, 200, JSON.stringify(enrichment.body));
  assert.equal(enrichment.body.changed, false);
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.status, 'ready');
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.kind, 'revision-card');
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.nonScored, true);
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.concept.id, 'adverbials');
  assert.ok(enrichment.body.subjectReadModel.aiEnrichment.revisionCards.length >= 1);
  assert.ok(enrichment.body.subjectReadModel.aiEnrichment.revisionDrills.length >= 1);
  assert.ok(enrichment.body.subjectReadModel.aiEnrichment.revisionDrills.every((drill) => drill.deterministic === true));
  assert.equal(enrichment.body.mutation.appliedRevision, 1);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 1);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 1);

  DB.close();
});

test('Grammar AI enrichment contains malformed output as a non-mutating read-model failure', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const enrichment = await postCommand(app, DB, {
    command: 'request-ai-enrichment',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-enrichment-malformed',
    expectedLearnerRevision: 0,
    payload: {
      kind: 'revision-card',
      aiResponse: '{"title":',
    },
  });

  assert.equal(enrichment.response.status, 200, JSON.stringify(enrichment.body));
  assert.equal(enrichment.body.changed, false);
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.status, 'failed');
  assert.equal(enrichment.body.subjectReadModel.aiEnrichment.error.code, 'grammar_ai_enrichment_malformed');
  assert.equal(enrichment.body.mutation.appliedRevision, 0);
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 0);

  DB.close();
});

test('Grammar AI enrichment rejects score-bearing fields and unknown drill templates without mutation', async () => {
  const DB = createMigratedSqliteD1Database();
  const app = createWorkerApp({ now: () => 1_777_000_000_000 });
  seedAccountLearner(DB);

  const scored = await postCommand(app, DB, {
    command: 'request-ai-enrichment',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-enrichment-scored',
    expectedLearnerRevision: 0,
    payload: {
      kind: 'explanation',
      aiResponse: {
        title: 'Unsafe question',
        questionText: 'Choose the correct adverbial.',
        correctAnswer: 'After lunch,',
      },
    },
  });

  assert.equal(scored.response.status, 200, JSON.stringify(scored.body));
  assert.equal(scored.body.changed, false);
  assert.equal(scored.body.subjectReadModel.aiEnrichment.status, 'failed');
  assert.equal(scored.body.subjectReadModel.aiEnrichment.error.code, 'grammar_ai_enrichment_score_bearing');

  const invalidTemplate = await postCommand(app, DB, {
    command: 'request-ai-enrichment',
    learnerId: 'learner-a',
    requestId: 'grammar-ai-enrichment-invalid-template',
    expectedLearnerRevision: 0,
    payload: {
      kind: 'explanation',
      aiResponse: {
        explanation: 'Revise fronted adverbials with a reviewed deterministic drill.',
        drills: [{ templateId: 'ai_authored_fronted_adverbial_question' }],
      },
    },
  });

  assert.equal(invalidTemplate.response.status, 200, JSON.stringify(invalidTemplate.body));
  assert.equal(invalidTemplate.body.changed, false);
  assert.equal(invalidTemplate.body.subjectReadModel.aiEnrichment.status, 'failed');
  assert.equal(invalidTemplate.body.subjectReadModel.aiEnrichment.error.code, 'grammar_ai_enrichment_invalid_template');
  assert.equal(DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a').state_revision, 0);
  assert.equal(DB.db.prepare("SELECT COUNT(*) AS count FROM child_subject_state WHERE subject_id = 'grammar'").get().count, 0);

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
