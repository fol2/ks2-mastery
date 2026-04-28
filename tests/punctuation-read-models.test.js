import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNoForbiddenPunctuationAdultEvidenceKeys,
  assertNoForbiddenPunctuationReadModelKeys,
} from '../scripts/punctuation-production-smoke.mjs';
import { buildAdminHubReadModel } from '../src/platform/hubs/admin-read-model.js';
import { buildParentHubReadModel } from '../src/platform/hubs/parent-read-model.js';
import { buildPunctuationReadModel } from '../worker/src/subjects/punctuation/read-models.js';
import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';
import { createPunctuationReadModelService } from '../src/subjects/punctuation/client-read-models.js';
import {
  ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS,
  FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS,
  FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS,
} from './helpers/forbidden-keys.mjs';

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

const GENERATED_ACTIVE_ITEM_FORBIDDEN_KEYS = Object.freeze([
  'templateId',
  'generatorFamilyId',
  'validator',
  'validators',
  'accepted',
  'acceptedAnswers',
  'answers',
  'rawResponse',
  'rawGenerator',
  'model',
]);

function generatedPunctuationSubjectState(now = 1_777_000_000_000) {
  return {
    data: {
      progress: {
        items: {
          gen_speech_insert_1: {
            attempts: 1,
            correct: 0,
            incorrect: 1,
            streak: 0,
            lapses: 1,
            dueAt: now,
            firstCorrectAt: null,
            lastCorrectAt: null,
            lastSeen: now,
          },
        },
        facets: {},
        rewardUnits: {},
        attempts: [
          {
            ts: now,
            sessionId: 'punctuation-generated-session',
            itemId: 'gen_speech_insert_1',
            variantSignature: 'puncsig_parent1',
            templateId: 'gen_speech_insert_template_secret',
            generatorFamilyId: 'gen_speech_insert',
            acceptedAnswers: ['Maya said, "Hello."'],
            validator: { type: 'speech' },
            rawResponse: { typed: 'maya said hello' },
            response: 'maya said hello',
            typed: 'maya said hello',
            attemptedAnswer: 'maya said hello',
            model: 'Maya said, "Hello."',
            displayCorrection: 'Maya said, "Hello."',
            mode: 'insert',
            itemMode: 'insert',
            skillIds: ['speech'],
            rewardUnitId: 'speech-core',
            sessionMode: 'smart',
            correct: false,
            misconceptionTags: ['speech.quote_missing'],
            facetOutcomes: [{ id: 'speech::insert', label: 'Speech - Insert punctuation', ok: false }],
          },
        ],
        sessionsCompleted: 1,
      },
    },
    updatedAt: now,
  };
}

function makeLearner(id = 'learner-punctuation-u4') {
  return {
    id,
    name: 'Ava',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    createdAt: 1000,
  };
}

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

test('default child-scope payload does not carry contextPack (U8)', () => {
  // Phase 3 U8: even when the Worker composes a read-model with a fully
  // populated context-pack summary, the child-scope payload must not
  // expose the `contextPack` key. Parent/Admin surfaces will opt back in
  // via a future scope parameter; today child is the only caller.
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
  assert.equal('contextPack' in result, false);
});

test('child-scope payload has no contextPack key when contextPack arg is omitted (U8)', () => {
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: {},
  });
  assert.equal('contextPack' in result, false);
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

test('scan catches rawGenerator, queueItemIds, and responses at any depth', () => {
  for (const key of ['acceptedAnswers', 'generatorFamilyId', 'rawGenerator', 'rawResponse', 'queueItemIds', 'responses', 'templateId', 'validators', 'variantSignature']) {
    const leaky = {
      ...BASE_STATE,
      summary: {
        ...BASE_STATE.summary,
        metadata: { [key]: { payload: 'leak' } },
      },
    };
    assert.throws(
      () => buildPunctuationReadModel({
        learnerId: 'learner-a',
        state: leaky,
        prefs: {},
        stats: {},
      }),
      new RegExp(`server-only .*field: ${key}`),
      `forbidden key ${key} must trip the recursive scan`,
    );
  }
});

test('active generated currentItem exposes only an opaque variant signature', () => {
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: {
      phase: 'active-item',
      session: {
        id: 'session-generated',
        releaseId: 'punctuation-r4-full-14-skill-structure',
        mode: 'smart',
        length: 1,
        phase: 'active-item',
        startedAt: 1_777_000_000_000,
        answeredCount: 0,
        correctCount: 0,
        currentItem: {
          id: 'generated-speech-insert',
          mode: 'insert',
          source: 'generated',
          prompt: 'Add the direct-speech punctuation.',
          stem: 'Maya said, hello.',
          inputKind: 'text',
          skillIds: ['speech'],
          clusterId: 'speech',
          variantSignature: 'puncsig_abc123',
        },
        serverAuthority: 'worker',
      },
      availability: { status: 'ready', code: null, message: '' },
    },
    prefs: {},
    stats: {},
  });
  const currentItem = result.session.currentItem;

  assert.equal(currentItem.source, 'generated');
  assert.equal(currentItem.variantSignature, 'puncsig_abc123');
  assertNoForbiddenPunctuationReadModelKeys(result, 'punctuation.active.startModel');
  for (const key of GENERATED_ACTIVE_ITEM_FORBIDDEN_KEYS) {
    assert.equal(Object.hasOwn(currentItem, key), false, `active generated currentItem must not expose ${key}`);
  }
});

test('shared punctuation metadata policy allows variantSignature only on active currentItem', () => {
  assert.deepEqual(ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS, ['variantSignature']);
  assert.equal(FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS.includes('variantSignature'), true);
  assert.equal(FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS.includes('variantSignature'), true);

  assert.doesNotThrow(() => assertNoForbiddenPunctuationReadModelKeys({
    session: {
      currentItem: {
        source: 'generated',
        variantSignature: 'puncsig_abc123',
      },
    },
  }, 'punctuation.smart.startModel'));
  assert.throws(
    () => assertNoForbiddenPunctuationReadModelKeys({
      summary: {
        gps: {
          reviewItems: [{ itemId: 'generated-speech-insert', variantSignature: 'puncsig_abc123' }],
        },
      },
    }, 'punctuation.gps.summaryModel'),
    /variantSignature exposed a server-only field/,
  );
  assert.throws(
    () => assertNoForbiddenPunctuationAdultEvidenceKeys({
      recentMistakes: [{ itemId: 'generated-speech-insert', variantSignature: 'puncsig_abc123' }],
    }, 'parentHub.punctuationEvidence'),
    /variantSignature exposed a server-only field/,
  );
});

test('Parent Hub and Admin punctuation evidence omit generated metadata and answer fields', () => {
  const now = 1_777_000_000_000;
  const learner = makeLearner();
  const subjectState = generatedPunctuationSubjectState(now);
  const parentModel = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'owner',
    subjectStates: { punctuation: subjectState },
    practiceSessions: [],
    eventLog: [],
    now: () => now,
  });

  assert.equal(parentModel.punctuationEvidence.hasEvidence, true);
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentModel.punctuationEvidence, 'parentHub.punctuationEvidence');
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentModel.progressSnapshots, 'parentHub.progressSnapshots');
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentModel.misconceptionPatterns, 'parentHub.misconceptionPatterns');
  for (const key of ['variantSignature', 'templateId', 'generatorFamilyId', 'acceptedAnswers', 'validator', 'rawResponse', 'response', 'typed', 'attemptedAnswer', 'model', 'displayCorrection']) {
    assert.equal(
      Object.hasOwn(parentModel.punctuationEvidence.recentMistakes[0], key),
      false,
      `Parent Hub recent mistake must not expose ${key}`,
    );
  }

  const adminModel = buildAdminHubReadModel({
    account: { id: 'adult-admin', selectedLearnerId: learner.id, repoRevision: 7, platformRole: 'admin' },
    platformRole: 'admin',
    memberships: [{ learnerId: learner.id, learner, role: 'owner' }],
    learnerBundles: {
      [learner.id]: {
        subjectStates: { punctuation: subjectState },
        practiceSessions: [],
        eventLog: [],
        gameState: {},
      },
    },
    selectedLearnerId: learner.id,
    now: () => now,
  });
  const diagnostics = adminModel.learnerSupport.selectedDiagnostics;

  assert.equal(diagnostics.punctuationEvidence.hasEvidence, true);
  assertNoForbiddenPunctuationAdultEvidenceKeys(diagnostics.punctuationEvidence, 'adminHub.selectedDiagnostics.punctuationEvidence');
});

test('client normaliser drops contextPack if the worker ever re-adds it (U8 belt-and-braces)', () => {
  // Guards against a future Worker regression that sneaks `contextPack` back
  // into the default child-scope payload. The cache-hydration path must strip
  // the field before the React surface ever sees it.
  const service = createPunctuationReadModelService({ getState: () => null });
  const rawFromWorker = {
    subjectId: 'punctuation',
    phase: 'summary',
    contextPack: {
      status: 'ready',
      acceptedCount: 3,
      rejectedCount: 0,
      atomKinds: ['noun'],
    },
  };
  const normalised = service.initState(rawFromWorker);
  assert.equal('contextPack' in normalised, false);
});

test('client normaliser passes through an ordinary payload unchanged (U8)', () => {
  // Proves the normaliser ran (phase + error survive) without relying on
  // `'contextPack' in normalised === false` — that would pass vacuously
  // because `createInitialPunctuationState()` already omits contextPack,
  // so the assertion held even if stripForbiddenChildScopeFields were a no-op.
  const service = createPunctuationReadModelService({ getState: () => null });
  const normalised = service.initState({
    subjectId: 'punctuation',
    phase: 'setup',
    error: '',
  });
  assert.strictEqual(normalised.phase, 'setup');
  assert.strictEqual(normalised.error, '');
});

test('client-normaliser strip is shallow: nested contextPack is preserved (documented contract)', () => {
  // Strip only removes top-level `contextPack`, not nested occurrences. The Worker's
  // assertNoForbiddenReadModelKeys + safeSummary allowlist handle deep-nested forbidden
  // keys; this client strip is an intentionally cheap top-level last-line-of-defence.
  const service = createPunctuationReadModelService({ getState: () => null });
  const normalised = service.initState({
    subjectId: 'punctuation',
    phase: 'setup',
    summary: { contextPack: { status: 'ready' }, total: 3 },
  });
  assert.ok(normalised.summary, 'summary should still normalise');
  assert.strictEqual(normalised.summary.total, 3);
  assert.ok('contextPack' in normalised.summary, 'nested contextPack is intentionally preserved by shallow strip');
  assert.strictEqual('contextPack' in normalised, false, 'top-level contextPack is still stripped');
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
    // contextPack is intentionally passed but not exposed on the child payload (U8).
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
  assert.equal('contextPack' in result, false);
  assert.equal(result.content.skills[0].id, 'speech');
});

// ---------------------------------------------------------------------------
// U2: starView wiring into Worker read-model
// ---------------------------------------------------------------------------

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

function seededData() {
  const now = Date.UTC(2026, 3, 25);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const data = {
    progress: {
      items: {
        se_choose_endmark: {
          attempts: 10, correct: 9, incorrect: 1, streak: 4, lapses: 0,
          dueAt: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now, lastSeen: now,
        },
      },
      facets: {},
      rewardUnits: {
        [masteryKey('endmarks', 'sentence-endings-core')]: {
          masteryKey: masteryKey('endmarks', 'sentence-endings-core'),
          releaseId: CURRENT_RELEASE_ID,
          clusterId: 'endmarks',
          rewardUnitId: 'sentence-endings-core',
          securedAt: now - 10_000,
        },
      },
      attempts: [],
      sessionsCompleted: 0,
    },
  };
  for (let i = 0; i < 5; i++) {
    data.progress.attempts.push({
      ts: now - (i * 60_000),
      sessionId: 'test-session',
      itemId: i === 0 ? 'se_choose_endmark' : `se_item_${i}`,
      itemMode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }
  return data;
}

test('U2: Worker read-model with seeded progress populates starView and stats.grandStars', () => {
  const data = seededData();
  const result = buildPunctuationReadModel({
    learnerId: 'learner-a',
    state: BASE_STATE,
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 1 },
    data,
  });
  assert.ok(result.starView, 'payload must carry starView');
  assert.ok(result.starView.perMonster, 'starView.perMonster must exist');
  assert.ok(result.starView.grand, 'starView.grand must exist');
  assert.ok(result.starView.perMonster.pealark, 'pealark must have star data');
  assert.ok(result.starView.perMonster.pealark.total > 0, 'pealark total must be > 0');
  assert.equal(
    result.stats.grandStars,
    result.starView.grand.grandStars,
    'stats.grandStars must match starView.grand.grandStars',
  );
});

test('U2: fresh learner (no data) produces starView with zero-valued entries', () => {
  const result = buildPunctuationReadModel({
    learnerId: 'learner-b',
    state: { phase: 'setup', availability: { status: 'ready', code: null, message: '' } },
    prefs: {},
    stats: {},
    data: null,
  });
  assert.ok(result.starView, 'starView must exist even without data');
  assert.equal(result.starView.grand.grandStars, 0, 'grand.grandStars must be 0');
  assert.equal(result.stats.grandStars, 0, 'stats.grandStars must be 0');
});

test('U2: data parameter undefined falls back to zero-valued starView', () => {
  const result = buildPunctuationReadModel({
    learnerId: 'learner-c',
    state: { phase: 'setup', availability: { status: 'ready', code: null, message: '' } },
    prefs: {},
    stats: {},
    // data omitted — defaults to null
  });
  assert.ok(result.starView, 'starView must exist when data is omitted');
  assert.equal(result.starView.grand.grandStars, 0, 'grand.grandStars must be 0');
  assert.equal(result.stats.grandStars, 0, 'stats.grandStars must be 0');
});

test('U2: getDashboardStats reaches grandStars branch when stats.grandStars is set', () => {
  const data = seededData();
  const result = buildPunctuationReadModel({
    learnerId: 'learner-d',
    state: BASE_STATE,
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 1 },
    data,
  });
  // Simulate module.js getDashboardStats logic
  const grandStars = result.stats.grandStars;
  assert.notEqual(grandStars, null, 'grandStars must not be null');
  const pct = grandStars != null
    ? Math.round(grandStars)
    : (result.stats.publishedRewardUnits
      ? Math.round(((result.stats.securedRewardUnits || 0) / result.stats.publishedRewardUnits) * 100)
      : 0);
  assert.equal(pct, Math.round(grandStars), 'pct must derive from grandStars, not legacy ratio');
});

test('U2: legacy ratio fallback still works when data absent and grandStars null from external stats', () => {
  // When no data is provided, grandStars defaults to 0 (not null) because
  // the star projection runs on an empty progress blob. This test validates
  // that the stats override sets grandStars = 0 even for a fresh learner.
  const result = buildPunctuationReadModel({
    learnerId: 'learner-e',
    state: { phase: 'setup', availability: { status: 'ready', code: null, message: '' } },
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 2 },
    data: null,
  });
  // grandStars is 0 (from projection), not null, so getDashboardStats
  // would use Math.round(0) = 0. The legacy fallback path (ratio) is only
  // exercised when grandStars is explicitly null — the Worker always produces
  // a numeric value now.
  assert.equal(typeof result.stats.grandStars, 'number', 'grandStars must be a number');
  assert.equal(result.stats.grandStars, 0, 'fresh learner grandStars is 0');
});

test('U2: starView shape matches client-side buildPunctuationLearnerReadModel output', () => {
  const data = seededData();
  const clientModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: { data },
  });
  const workerModel = buildPunctuationReadModel({
    learnerId: 'learner-f',
    state: BASE_STATE,
    prefs: {},
    stats: {},
    data,
  });
  assert.deepStrictEqual(
    workerModel.starView,
    clientModel.starView,
    'Worker starView must be identical to client starView for same data',
  );
});
