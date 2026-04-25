import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationReadModel } from '../worker/src/subjects/punctuation/read-models.js';

const BASE_STATE = {
  phase: 'summary',
  session: null,
  feedback: null,
  summary: {
    completedAt: 1_777_000_000_000,
    correctCount: 2,
    total: 4,
    mode: 'smart',
    releaseId: 'punctuation-r4-full-14-skill-structure',
    sessionId: 'session-abc',
    reviewRows: [
      {
        itemId: 'sp_choose_reporting_comma',
        mode: 'choose',
        correct: true,
        skillIds: ['speech'],
        misconceptionTags: [],
        displayCorrection: '"We made it!" shouted Noah.',
      },
    ],
    misconceptionTags: ['speech.quote_missing'],
  },
  availability: { status: 'ready', code: null, message: '' },
};

test('safeSummary passes a clean payload through redaction without throwing', () => {
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 0 },
  });
  assert.equal(result.phase, 'summary');
  assert.equal(result.summary.correctCount, 2);
  assert.equal(result.summary.mode, 'smart');
});

test('safeSummary fails closed when a forbidden key is present anywhere in the summary', () => {
  const leaky = {
    ...BASE_STATE,
    summary: {
      ...BASE_STATE.summary,
      accepted: ['"We made it!" shouted Noah.'],
    },
  };
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: leaky,
    prefs: {},
    stats: {},
  }), /server-only .*field: accepted/);
});

test('safeSummary fails closed on a nested forbidden key inside a review row', () => {
  const leaky = {
    ...BASE_STATE,
    summary: {
      ...BASE_STATE.summary,
      reviewRows: [
        {
          ...BASE_STATE.summary.reviewRows[0],
          validator: { facets: ['speech::insert'] },
        },
      ],
    },
  };
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: leaky,
    prefs: {},
    stats: {},
  }), /server-only .*field: validator/);
});

test('safeSummary fails closed on nested seed and hiddenQueue fields', () => {
  const leaky = {
    ...BASE_STATE,
    summary: {
      ...BASE_STATE.summary,
      nextQueue: { hiddenQueue: ['sp_item_1'] },
    },
  };
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: leaky,
    prefs: {},
    stats: {},
  }), /server-only .*field: hiddenQueue/);
});

test('feedback allowlist already strips forbidden fields before the recursive scan', () => {
  // Feedback goes through safeFeedback's allowlist, so a forbidden field
  // on the raw feedback never reaches the payload. The scan is belt-and-
  // braces for paths that are cloneSerialisable'd (prefs, stats, analytics,
  // summary) — feedback is defended earlier.
  const feedbackState = {
    phase: 'feedback',
    session: {
      id: 'session-abc',
      mode: 'smart',
      length: 4,
      answeredCount: 1,
      correctCount: 1,
      currentItem: { id: 'ok', mode: 'choose', prompt: '', stem: '' },
    },
    feedback: {
      kind: 'error',
      headline: 'Missing quote',
      body: 'Speech punctuation must go inside the closing quote.',
      correctIndex: 2,
    },
    availability: { status: 'ready', code: null, message: '' },
  };
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: feedbackState,
    prefs: {},
    stats: {},
  });
  assert.equal(result.feedback.kind, 'error');
  assert.equal('correctIndex' in result.feedback, false);
});

test('analytics payload fails closed on forbidden fields', () => {
  const analyticsLeak = {
    byItemMode: [{ id: 'insert', attempts: 2, correct: 1, rubric: { facets: [] } }],
  };
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: {},
    analytics: analyticsLeak,
  }), /server-only .*field: rubric/);
});

test('contextPack allowlist strips forbidden fields before the recursive scan', () => {
  // contextPack goes through safeContextPackSummary's allowlist, so a
  // forbidden field never reaches the payload. Defence-in-depth happens
  // earlier; the scan covers clone-passthrough paths instead.
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: {},
    contextPack: {
      status: 'ready',
      acceptedCount: 3,
      rejectedCount: 0,
      atomKinds: ['noun'],
      generator: { seed: 'leak' },
    },
  });
  assert.equal(result.contextPack.acceptedCount, 3);
  assert.equal('generator' in result.contextPack, false);
});

test('stats payload fails closed on forbidden fields', () => {
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 0, hiddenQueue: ['x'] },
  }), /server-only .*field: hiddenQueue/);
});

test('content payload fails closed on forbidden fields', () => {
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: {},
    content: {
      releaseId: 'r4',
      skills: [],
      unpublished: { peek: 'leak' },
    },
  }), /server-only .*field: unpublished/);
});

test('availability payload fails closed on forbidden fields', () => {
  const leakyState = {
    ...BASE_STATE,
    availability: { status: 'ready', code: null, message: '', seed: 'x' },
  };
  assert.throws(() => buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: leakyState,
    prefs: {},
    stats: {},
  }), /server-only .*field: seed/);
});

test('clean payloads with all allowed fields pass redaction', () => {
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: { mode: 'smart', roundLength: '4' },
    stats: { total: 14, secure: 0, publishedRewardUnits: 14, securedRewardUnits: 0 },
    analytics: { bySessionMode: [], byItemMode: [], weakestFacets: [] },
    content: {
      releaseId: 'punctuation-r4-full-14-skill-structure',
      skills: [{ id: 'speech', name: 'Speech', clusterId: 'speech' }],
    },
    contextPack: {
      status: 'ready',
      acceptedCount: 3,
      rejectedCount: 0,
      atomKinds: ['noun'],
      affectedGeneratorFamilies: ['speech.basic'],
      generatedItemCount: 3,
    },
  });
  assert.equal(result.phase, 'summary');
  assert.equal(result.summary.correctCount, 2);
  assert.equal(result.contextPack.acceptedCount, 3);
  assert.equal(result.content.skills[0].id, 'speech');
});
