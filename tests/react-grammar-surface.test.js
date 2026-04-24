import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import {
  createGrammarHarness,
  grammarResponseFormData,
} from './helpers/grammar-subject-harness.js';
import { readGrammarLegacyOracle } from './helpers/grammar-legacy-oracle.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { grammarModule } from '../src/subjects/grammar/module.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';
import { grammarMasteryKey } from '../src/platform/game/monster-system.js';

function grammarOracleSample(templateId = 'question_mark_select') {
  return readGrammarLegacyOracle().templates.find((template) => template.id === templateId);
}

test('Grammar opens as a real Clause Conservatory subject surface', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /Clause Conservatory/);
  assert.match(html, /Grammar retrieval practice/);
  assert.match(html, /All 18 Grammar concepts/);
  assert.match(html, /Start practice/);
  assert.match(html, /Bracehart/);
  assert.match(html, /Concordium/);
  assert.doesNotMatch(html, /Future subject module/);
});

test('Grammar surface runs from setup to Worker-style feedback and summary', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'session');
  let html = harness.render();
  assert.match(html, /Grammar practice/);
  assert.match(html, /question mark/i);

  harness.dispatch('grammar-submit-form', {
    formData: grammarResponseFormData(sample.correctResponse),
  });

  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'feedback');
  html = harness.render();
  assert.match(html, /Correct\./);
  assert.match(html, /Finish round/);

  harness.dispatch('grammar-continue');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'summary');
  html = harness.render();
  assert.match(html, /Grammar session summary/);
  assert.match(html, /1\/1/);

  harness.dispatch('grammar-back');
  assert.equal(harness.store.getState().subjectUi.grammar.phase, 'dashboard');
  assert.match(harness.render(), /Grammar retrieval practice/);
});

test('Grammar submit requires an answer before recording an attempt', () => {
  const storage = installMemoryStorage();
  const harness = createGrammarHarness({ storage });
  const sample = grammarOracleSample();

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.dispatch('grammar-start', {
    payload: {
      roundLength: 1,
      templateId: sample.id,
      seed: sample.sample.seed,
    },
  });

  harness.dispatch('grammar-submit-form', { formData: new FormData() });

  const grammar = harness.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.answered, 0);
  assert.match(grammar.error, /Choose or type an answer/);
  assert.equal(grammar.analytics.concepts.some((concept) => concept.attempts > 0), false);
});

test('Grammar setup controls are disabled while a command is pending', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  harness.store.updateSubjectUi('grammar', (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: 'start-session',
  }));

  const html = harness.render();
  assert.match(html, /<button class="grammar-mode selected" type="button" disabled="">/);
  assert.match(html, /<select class="input" disabled=""[^>]*><option value="" selected="">Smart mix<\/option>/);
  assert.match(html, /<select class="input" disabled=""[^>]*><option value="3">3<\/option><option value="5" selected="">5<\/option>/);
  assert.match(html, /<button class="btn primary xl" type="button" disabled="">Starting\.\.\.<\/button>/);
});

test('Grammar monster progress rehydrates from persisted Codex state after reload normalisation', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;
  const key = grammarMasteryKey('sentence_functions');

  harness.repositories.gameState.write(learnerId, 'monster-codex', {
    bracehart: {
      branch: 'b1',
      caught: true,
      conceptTotal: 3,
      mastered: [key],
    },
    concordium: {
      branch: 'b1',
      caught: true,
      conceptTotal: 18,
      mastered: [key],
    },
  });
  harness.store.updateSubjectUi('grammar', normaliseGrammarReadModel({}, learnerId));
  harness.dispatch('open-subject', { subjectId: 'grammar' });

  const html = harness.render();

  assert.match(html, /Bracehart/);
  assert.match(html, /1\/3 Codex/);
  assert.match(html, /Concordium/);
  assert.match(html, /1\/18 Codex/);
});

test('Grammar command responses are pinned to the learner that sent them', async () => {
  let resolveCommand;
  const toasts = [];
  const celebrations = [];
  const context = {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: { grammar: normaliseGrammarReadModel({}, 'learner-a') },
    },
    runtimeReadOnly: false,
    subjectCommands: {
      send(request) {
        assert.equal(request.learnerId, 'learner-a');
        return new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    },
    store: {
      updateSubjectUi(subjectId, updater) {
        const previous = context.appState.subjectUi[subjectId] || {};
        const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
        context.appState = {
          ...context.appState,
          subjectUi: {
            ...context.appState.subjectUi,
            [subjectId]: next,
          },
        };
      },
      pushToasts(events) {
        toasts.push(...events);
      },
      pushMonsterCelebrations(events) {
        celebrations.push(...events);
      },
      reloadFromRepositories() {
        throw new Error('Late Grammar response must not reload the selected learner.');
      },
    },
  };

  grammarModule.handleAction('grammar-start', context);
  assert.equal(context.appState.subjectUi.grammar.pendingCommand, 'start-session');

  context.appState = {
    ...context.appState,
    learners: { selectedId: 'learner-b' },
    subjectUi: { grammar: normaliseGrammarReadModel({}, 'learner-b') },
  };
  resolveCommand({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: 'learner-a',
      phase: 'summary',
      summary: { sessionId: 'learner-a-summary' },
      analytics: { concepts: [] },
    }, 'learner-a'),
    projections: {
      rewards: {
        toastEvents: [{ id: 'toast-a' }],
        events: [{ id: 'celebration-a' }],
      },
    },
  });
  await Promise.resolve();

  const grammar = context.appState.subjectUi.grammar;
  assert.equal(grammar.learnerId, 'learner-b');
  assert.equal(grammar.phase, 'dashboard');
  assert.equal(grammar.summary, null);
  assert.equal(toasts.length, 0);
  assert.equal(celebrations.length, 0);
});

test('Grammar normaliser preserves Worker concept copy over client placeholders', () => {
  const grammar = normaliseGrammarReadModel({
    analytics: {
      concepts: [{
        id: 'clauses',
        name: 'Worker clauses',
        domain: 'Worker domain',
        summary: 'Worker-authored concept summary.',
        punctuationForGrammar: false,
        status: 'learning',
        attempts: 3,
      }],
    },
  }, 'learner-a');

  const clauses = grammar.analytics.concepts.find((concept) => concept.id === 'clauses');
  assert.equal(clauses.name, 'Worker clauses');
  assert.equal(clauses.domain, 'Worker domain');
  assert.equal(clauses.summary, 'Worker-authored concept summary.');
  assert.equal(clauses.punctuationForGrammar, false);
  assert.equal(clauses.attempts, 3);
});

test('Grammar locked future modes render unavailable without dispatching commands', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });

  harness.dispatch('open-subject', { subjectId: 'grammar' });
  const html = harness.render();

  assert.match(html, /Weak concepts drill[\s\S]*Coming next/);
  assert.match(html, /Sentence surgery[\s\S]*Coming next/);
  assert.match(html, /button class="grammar-mode locked" type="button" disabled=""/);
});
