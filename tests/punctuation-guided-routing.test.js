import test from 'node:test';
import assert from 'node:assert/strict';

import { createPunctuationService } from '../shared/punctuation/service.js';
import { punctuationModule } from '../src/subjects/punctuation/module.js';
import { createInitialPunctuationState } from '../src/subjects/punctuation/service-contract.js';

function makeRepository(initialData = null) {
  let data = initialData ? JSON.parse(JSON.stringify(initialData)) : null;
  return {
    readData() {
      return data;
    },
    writeData(_learnerId, nextData) {
      data = JSON.parse(JSON.stringify(nextData));
      return data;
    },
    snapshot() {
      return data ? JSON.parse(JSON.stringify(data)) : null;
    },
  };
}

function makeContext({ service, data }) {
  let subjectUi = createInitialPunctuationState();
  const store = {
    updateSubjectUi(_subjectId, patch) {
      const next = typeof patch === 'function' ? patch(subjectUi) : patch;
      subjectUi = { ...subjectUi, ...next };
    },
  };
  return {
    appState: {
      learners: { selectedId: 'learner-a' },
      subjectUi: { punctuation: subjectUi },
    },
    get currentUi() {
      return subjectUi;
    },
    service,
    store,
    data,
    applySubjectTransition(_subjectId, transition) {
      if (!transition) return true;
      subjectUi = { ...subjectUi, ...transition.state };
      return true;
    },
  };
}

test('local-module guided start forwards data.skillId to service.startSession', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });
  const context = makeContext({
    service,
    data: { mode: 'guided', skillId: 'speech' },
  });
  const handled = punctuationModule.handleAction('punctuation-start', context);
  assert.equal(handled, true);
  const session = context.currentUi.session;
  assert.ok(session, 'session must be created');
  assert.equal(session.mode, 'guided');
  assert.equal(
    session.guidedSkillId,
    'speech',
    'guided session must honour the requested skillId from local-module fallback',
  );
});

test('local-module guided start honours guidedSkillId alias', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });
  const context = makeContext({
    service,
    data: { mode: 'guided', guidedSkillId: 'apostrophe_contractions' },
  });
  punctuationModule.handleAction('punctuation-start', context);
  assert.equal(context.currentUi.session.guidedSkillId, 'apostrophe_contractions');
});

test('non-guided start creates session without guided skill lock', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });
  const context = makeContext({
    service,
    data: { mode: 'smart', skillId: 'speech' },
  });
  punctuationModule.handleAction('punctuation-start', context);
  assert.equal(context.currentUi.session.mode, 'smart');
  assert.equal(context.currentUi.session.guidedSkillId ?? null, null);
});

test('invalid skillId in guided mode falls back without throwing', () => {
  const repository = makeRepository();
  const service = createPunctuationService({ repository, now: () => 0, random: () => 0 });
  const context = makeContext({
    service,
    data: { mode: 'guided', skillId: 'not-a-real-skill' },
  });
  assert.doesNotThrow(() => punctuationModule.handleAction('punctuation-start', context));
  assert.equal(context.currentUi.session.mode, 'guided');
});
