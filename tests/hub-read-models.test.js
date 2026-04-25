import test from 'node:test';
import assert from 'node:assert/strict';

import { buildParentHubReadModel } from '../src/platform/hubs/parent-read-model.js';
import {
  buildAdminHubReadModel,
  normaliseAccountOpsMetadataDirectory,
  normaliseDashboardKpis,
  normaliseErrorEventSummary,
  normaliseOpsActivityStream,
} from '../src/platform/hubs/admin-read-model.js';
import {
  applyAdminHubAccountOpsMetadataPatch,
  applyAdminHubDashboardKpisPatch,
  applyAdminHubErrorLogSummaryPatch,
  applyAdminHubOpsActivityPatch,
} from '../src/platform/hubs/admin-panel-patches.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { createPunctuationMasteryKey, PUNCTUATION_RELEASE_ID } from '../shared/punctuation/content.js';
import { createMemoryState, updateMemoryState } from '../shared/punctuation/scheduler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeLearner(id = 'learner-a', name = 'Ava') {
  return {
    id,
    name,
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1000,
  };
}

function makePunctuationSubjectState(now = 1_777_000_000_000) {
  const securedMasteryKey = createPunctuationMasteryKey({
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
  });
  return {
    data: {
      progress: {
        items: {
          sp_insert_question: updateMemoryState(createMemoryState(), false, now),
          sp_choose_reporting_comma: updateMemoryState(createMemoryState(), true, now - DAY_MS),
        },
        facets: {
          'speech::insert': updateMemoryState(createMemoryState(), false, now),
          'speech::choose': updateMemoryState(createMemoryState(), true, now - DAY_MS),
        },
        rewardUnits: {
          [securedMasteryKey]: {
            masteryKey: securedMasteryKey,
            releaseId: PUNCTUATION_RELEASE_ID,
            clusterId: 'speech',
            rewardUnitId: 'speech-core',
            securedAt: now - 5000,
          },
        },
        attempts: [
          {
            ts: now - DAY_MS,
            sessionId: 'punctuation-gps',
            itemId: 'sp_choose_reporting_comma',
            mode: 'choose',
            skillIds: ['speech'],
            rewardUnitId: 'speech-core',
            sessionMode: 'gps',
            testMode: 'gps',
            correct: true,
          },
          {
            ts: now,
            sessionId: 'punctuation-guided',
            itemId: 'sp_insert_question',
            mode: 'insert',
            itemMode: 'insert',
            skillIds: ['speech'],
            rewardUnitId: 'speech-core',
            sessionMode: 'guided',
            supportLevel: 2,
            supportKind: 'guided',
            correct: false,
            attemptedAnswer: 'Noah shouted we made it.',
            model: '"We made it!" shouted Noah.',
            displayCorrection: '"We made it!" shouted Noah.',
            misconceptionTags: ['speech.quote_missing'],
            facetOutcomes: [{ id: 'speech::insert', label: 'Speech - Insert punctuation', ok: false }],
          },
        ],
        sessionsCompleted: 2,
      },
    },
    updatedAt: now,
  };
}

function addUnknownPunctuationRewardUnits(subjectState, now = 1_777_000_000_000) {
  const rewardUnits = subjectState.data.progress.rewardUnits;
  const validUnit = rewardUnits[Object.keys(rewardUnits)[0]];
  rewardUnits['duplicate-speech-core'] = {
    ...validUnit,
    securedAt: now - 4000,
  };
  for (let index = 0; index < 15; index += 1) {
    const masteryKey = `punctuation:${PUNCTUATION_RELEASE_ID}:fake-cluster-${index}:fake-unit-${index}`;
    rewardUnits[masteryKey] = {
      masteryKey,
      releaseId: PUNCTUATION_RELEASE_ID,
      clusterId: `fake-cluster-${index}`,
      rewardUnitId: `fake-unit-${index}`,
      securedAt: now - index,
    };
  }
  return subjectState;
}

test('parent hub read model summarises due work, recent sessions, strengths, and misconception patterns', () => {
  const learner = makeLearner();
  const model = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'owner',
    subjectStates: {
      spelling: {
        ui: { phase: 'dashboard' },
        data: {
          prefs: { mode: 'trouble', yearFilter: 'all', roundLength: '20' },
          progress: {
            possess: { stage: 4, attempts: 4, correct: 4, wrong: 0, dueDay: 999999, lastDay: 200, lastResult: true },
            bicycle: { stage: 1, attempts: 3, correct: 1, wrong: 2, dueDay: 0, lastDay: 201, lastResult: false },
            ordinary: { stage: 2, attempts: 2, correct: 1, wrong: 1, dueDay: 0, lastDay: 202, lastResult: false },
          },
        },
        updatedAt: 2000,
      },
    },
    practiceSessions: [
      {
        id: 'sess-active',
        learnerId: learner.id,
        subjectId: 'spelling',
        sessionKind: 'learning',
        status: 'active',
        sessionState: { currentSlug: 'bicycle' },
        summary: null,
        createdAt: 3000,
        updatedAt: 4000,
      },
      {
        id: 'sess-complete',
        learnerId: learner.id,
        subjectId: 'spelling',
        sessionKind: 'learning',
        status: 'completed',
        sessionState: null,
        summary: {
          label: 'Trouble drill',
          cards: [{ label: 'Correct', value: '6/8' }],
          mistakes: [
            { slug: 'bicycle', word: 'bicycle', family: 'cycle', year: '5-6', yearLabel: 'Years 5-6', familyWords: [] },
          ],
        },
        createdAt: 2500,
        updatedAt: 3500,
      },
    ],
    eventLog: [
      {
        id: 'retry-1',
        type: 'spelling.retry-cleared',
        subjectId: 'spelling',
        learnerId: learner.id,
        family: 'cycle',
        yearBand: '5-6',
        createdAt: 3600,
      },
    ],
    runtimeSnapshots: {},
    now: () => 10 * 24 * 60 * 60 * 1000,
  });

  assert.equal(model.permissions.canViewParentHub, true);
  assert.equal(model.learnerOverview.secureWords, 1);
  assert.equal(model.learnerOverview.dueWords, 2);
  assert.equal(model.learnerOverview.troubleWords, 2);
  assert.match(model.dueWork[0].label, /Continue/i);
  assert.equal(model.recentSessions[0].id, 'sess-active');
  assert.ok(model.strengths.some((entry) => /possess/i.test(entry.label) || /family/i.test(entry.label)));
  assert.ok(model.weaknesses.some((entry) => /cycle/i.test(entry.label) || /family/i.test(entry.label)));
  assert.ok(model.misconceptionPatterns.some((entry) => /cycle/i.test(entry.label)));
});

test('parent hub read model keeps recently missed secure words in the trouble count', () => {
  const learner = makeLearner();
  const model = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'owner',
    subjectStates: {
      spelling: {
        ui: { phase: 'dashboard' },
        data: {
          prefs: { mode: 'smart', yearFilter: 'all', roundLength: '20' },
          progress: {
            accommodate: { stage: 5, attempts: 5, correct: 4, wrong: 1, dueDay: 0, lastDay: 201, lastResult: 'wrong' },
          },
        },
        updatedAt: 2000,
      },
    },
    practiceSessions: [],
    eventLog: [],
    runtimeSnapshots: {},
    now: () => 10 * 24 * 60 * 60 * 1000,
  });

  assert.equal(model.learnerOverview.troubleWords, 1);
  assert.equal(model.learnerOverview.dueWords, 0);
  assert.equal(model.dueWork[0].recommendedMode, 'trouble');
});

test('parent hub read model includes Grammar evidence without replacing Spelling', () => {
  const learner = makeLearner();
  const model = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'owner',
    subjectStates: {
      spelling: {
        data: {
          progress: {
            possess: { stage: 4, attempts: 4, correct: 4, wrong: 0, dueDay: 999999 },
          },
        },
      },
      grammar: {
        data: {
          mastery: {
            concepts: {
              adverbials: {
                attempts: 1,
                correct: 0,
                wrong: 1,
                strength: 0.1,
                dueAt: 1,
                lastSeenAt: '2026-04-24T10:00:00.000Z',
                lastWrongAt: '2026-04-24T10:00:00.000Z',
                correctStreak: 0,
              },
            },
            questionTypes: {
              choose: {
                attempts: 1,
                correct: 0,
                wrong: 1,
                strength: 0.1,
                dueAt: 1,
              },
            },
          },
          misconceptions: {
            fronted_adverbial_confusion: {
              count: 1,
              lastSeenAt: '2026-04-24T10:00:00.000Z',
            },
          },
          recentAttempts: [{
            templateId: 'fronted-adverbial-choice',
            itemId: 'fronted-adverbial-choice:101',
            seed: 101,
            questionType: 'choose',
            conceptIds: ['adverbials'],
            response: { answer: 'After lunch, we played outside.' },
            result: {
              correct: false,
              score: 0,
              maxScore: 1,
              answerText: 'After lunch, we played outside.',
              misconception: 'fronted_adverbial_confusion',
            },
            supportLevel: 0,
            attempts: 1,
            createdAt: 1_777_000_000_000,
          }],
        },
        ui: {
          aiEnrichment: {
            kind: 'parent-summary',
            status: 'ready',
            nonScored: true,
            generatedAt: 1_777_000_010_000,
            parentSummary: {
              title: 'Parent summary draft',
              body: 'Ava should revisit fronted adverbials before the next mixed review.',
              nextSteps: ['Practise two fronted adverbial choices', 'Check comma placement after the opener'],
            },
          },
        },
        updatedAt: 5000,
      },
    },
    practiceSessions: [
      {
        id: 'grammar-complete',
        learnerId: learner.id,
        subjectId: 'grammar',
        sessionKind: 'practice',
        status: 'completed',
        summary: { mode: 'smart', answered: 1, correct: 0 },
        createdAt: 6000,
        updatedAt: 7000,
      },
    ],
    eventLog: [],
    now: () => 1_777_000_000_000,
  });

  assert.equal(model.progressSnapshots[0].subjectId, 'spelling');
  assert.equal(model.progressSnapshots.some((snapshot) => snapshot.subjectId === 'grammar'), true);
  assert.equal(model.learnerOverview.weakGrammarConcepts, 1);
  assert.equal(model.dueWork[0].subjectId, 'grammar');
  const grammarDueWork = model.dueWork.find((entry) => entry.subjectId === 'grammar');
  assert.ok(grammarDueWork);
  assert.match(grammarDueWork.label, /Grammar/);
  assert.equal(grammarDueWork.recommendedMode, 'trouble');
  assert.equal(model.grammarEvidence.weakConcepts[0].id, 'adverbials');
  assert.equal(model.grammarEvidence.questionTypeSummary[0].id, 'choose');
  assert.equal(model.grammarEvidence.recentActivity[0].itemId, 'fronted-adverbial-choice:101');
  assert.equal(model.grammarEvidence.recentActivity[0].score, 0);
  assert.equal(Object.hasOwn(model.grammarEvidence.recentActivity[0], 'response'), false);
  assert.equal(Object.hasOwn(model.grammarEvidence.recentActivity[0], 'result'), false);
  assert.match(model.grammarEvidence.parentSummaryDraft.body, /fronted adverbials/i);
  assert.ok(model.misconceptionPatterns.some((entry) => entry.subjectId === 'grammar' && /Fronted Adverbial/.test(entry.label)));
  assert.ok(model.recentSessions.some((entry) => entry.subjectId === 'grammar' && entry.headline === '0/1'));
});

test('parent hub read model includes Punctuation analytics evidence without raw answers', () => {
  const learner = makeLearner();
  const now = 1_777_000_000_000;
  const punctuationSubjectState = addUnknownPunctuationRewardUnits(makePunctuationSubjectState(now), now);
  const model = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'owner',
    subjectStates: {
      punctuation: punctuationSubjectState,
    },
    practiceSessions: [
      {
        id: 'punctuation-complete',
        learnerId: learner.id,
        subjectId: 'punctuation',
        sessionKind: 'guided',
        status: 'completed',
        summary: { label: 'Guided punctuation', total: 2, correct: 1 },
        createdAt: now - 1000,
        updatedAt: now,
      },
    ],
    eventLog: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshots.some((snapshot) => snapshot.subjectId === 'punctuation'), true);
  assert.equal(model.learnerOverview.securePunctuationUnits, 1);
  assert.equal(model.punctuationEvidence.progressSnapshot.trackedRewardUnits, 1);
  assert.equal(model.punctuationEvidence.progressSnapshot.totalRewardUnits, 14);
  assert.equal(model.learnerOverview.weakPunctuationItems, 1);
  assert.equal(model.dueWork[0].subjectId, 'punctuation');
  assert.equal(model.punctuationEvidence.bySessionMode.find((entry) => entry.id === 'guided').wrong, 1);
  assert.equal(model.punctuationEvidence.byItemMode.find((entry) => entry.id === 'insert').attempts, 1);
  assert.equal(model.punctuationEvidence.weakestFacets[0].id, 'speech::insert');
  assert.equal(model.punctuationEvidence.recentMistakes[0].supportKind, 'guided');
  assert.equal(Object.hasOwn(model.punctuationEvidence.recentMistakes[0], 'attemptedAnswer'), false);
  assert.equal(Object.hasOwn(model.punctuationEvidence.recentMistakes[0], 'model'), false);
  assert.ok(model.misconceptionPatterns.some((entry) => entry.subjectId === 'punctuation' && /Speech Quote Missing/.test(entry.label)));
  assert.ok(model.recentSessions.some((entry) => entry.subjectId === 'punctuation' && entry.headline === '1/2'));
});

test('parent hub read model normalises malformed restored Grammar state safely', () => {
  const learner = makeLearner();
  const model = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'owner',
    subjectStates: {
      grammar: {
        data: { mastery: 'not-a-mastery-map' },
        ui: {
          aiEnrichment: {
            kind: 'parent-summary',
            status: 'ready',
            parentSummary: { body: 5 },
          },
        },
      },
    },
    practiceSessions: [],
    eventLog: [],
    now: () => 1_777_000_000_000,
  });

  assert.equal(model.grammarEvidence.progressSnapshot.totalConcepts, 18);
  assert.equal(model.grammarEvidence.progressSnapshot.trackedConcepts, 0);
  assert.equal(model.grammarEvidence.parentSummaryDraft, null);
  assert.equal(model.grammarEvidence.recentActivity.length, 0);
});

test('admin hub diagnostics use actionable Grammar focus before empty Spelling fallback', () => {
  const learner = makeLearner();
  const model = buildAdminHubReadModel({
    account: {
      id: 'adult-admin',
      selectedLearnerId: learner.id,
      platformRole: 'admin',
    },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [
      {
        learnerId: learner.id,
        learner,
        role: 'owner',
      },
    ],
    learnerBundles: {
      [learner.id]: {
        subjectStates: {
          grammar: {
            data: {
              mastery: {
                concepts: {
                  adverbials: {
                    attempts: 1,
                    correct: 0,
                    wrong: 1,
                    strength: 0.1,
                    dueAt: 1,
                    lastSeenAt: '2026-04-24T10:00:00.000Z',
                    lastWrongAt: '2026-04-24T10:00:00.000Z',
                    correctStreak: 0,
                  },
                },
              },
            },
          },
        },
      },
    },
    selectedLearnerId: learner.id,
    now: () => 1_777_000_000_000,
  });

  assert.equal(model.learnerSupport.selectedDiagnostics.currentFocus.subjectId, 'grammar');
  assert.match(model.learnerSupport.selectedDiagnostics.currentFocus.label, /Grammar/);
  assert.equal(model.learnerSupport.selectedDiagnostics.grammarEvidence.weakConcepts[0].id, 'adverbials');
});

test('admin hub diagnostics expose Punctuation release and learner evidence', () => {
  const learner = makeLearner();
  const now = 1_777_000_000_000;
  const model = buildAdminHubReadModel({
    account: {
      id: 'adult-admin',
      selectedLearnerId: learner.id,
      platformRole: 'admin',
    },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [
      {
        learnerId: learner.id,
        learner,
        role: 'owner',
      },
    ],
    learnerBundles: {
      [learner.id]: {
        subjectStates: {
          punctuation: addUnknownPunctuationRewardUnits(makePunctuationSubjectState(now), now),
        },
        practiceSessions: [
          {
            id: 'punctuation-complete',
            learnerId: learner.id,
            subjectId: 'punctuation',
            sessionKind: 'guided',
            status: 'completed',
            summary: { label: 'Guided punctuation', total: 2, correct: 1 },
            createdAt: now - 1000,
            updatedAt: now,
          },
        ],
        eventLog: [],
        gameState: {},
      },
    },
    selectedLearnerId: learner.id,
    now: () => now,
  });

  const diagnostics = model.learnerSupport.selectedDiagnostics;
  assert.equal(diagnostics.currentFocus.subjectId, 'punctuation');
  assert.equal(diagnostics.punctuationEvidence.progressSnapshot.securedRewardUnits, 1);
  assert.equal(diagnostics.punctuationEvidence.weakestFacets[0].id, 'speech::insert');
  assert.equal(model.learnerSupport.punctuationReleaseDiagnostics.releaseId, PUNCTUATION_RELEASE_ID);
  assert.equal(model.learnerSupport.punctuationReleaseDiagnostics.trackedRewardUnitCount, 1);
  assert.equal(model.learnerSupport.punctuationReleaseDiagnostics.sessionCount, 1);
  assert.equal(model.learnerSupport.punctuationReleaseDiagnostics.productionExposureStatus, 'enabled');
  assert.equal(model.learnerSupport.entryPoints.some((entry) => entry.subjectId === 'punctuation' && entry.tab === 'analytics'), true);
});

test('admin hub read model reports published release status, validation state, audit stream, and learner diagnostics', () => {
  const learner = makeLearner();
  const model = buildAdminHubReadModel({
    account: {
      id: 'adult-admin',
      selectedLearnerId: learner.id,
      repoRevision: 7,
      platformRole: 'admin',
    },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [
      {
        learnerId: learner.id,
        role: 'owner',
        stateRevision: 3,
        learner,
      },
    ],
    learnerBundles: {
      [learner.id]: {
        subjectStates: { spelling: { data: { progress: { possess: { stage: 4, attempts: 3, correct: 3, wrong: 0, dueDay: 99999 } } } } },
        practiceSessions: [],
        eventLog: [],
        gameState: {},
      },
    },
    runtimeSnapshots: {},
    demoOperations: {
      sessionsCreated: 9,
      activeSessions: 2,
      conversions: 3,
      cleanupCount: 4,
      rateLimitBlocks: 5,
      ttsFallbacks: 1,
      updatedAt: 5500,
    },
    auditEntries: [
      {
        requestId: 'req-1',
        mutationKind: 'learners.write',
        scopeType: 'account',
        scopeId: 'adult-admin',
        correlationId: 'req-1',
        appliedAt: 5000,
        statusCode: 200,
      },
    ],
    auditAvailable: true,
    selectedLearnerId: learner.id,
    now: () => 6000,
  });

  assert.equal(model.permissions.canViewAdminHub, true);
  assert.equal(model.contentReleaseStatus.subjectId, 'spelling');
  assert.equal(model.contentReleaseStatus.publishedVersion, SEEDED_SPELLING_CONTENT_BUNDLE.publication.publishedVersion);
  assert.equal(model.importValidationStatus.ok, true);
  assert.equal(model.auditLogLookup.available, true);
  assert.equal(model.auditLogLookup.entries[0].requestId, 'req-1');
  assert.equal(model.demoOperations.sessionsCreated, 9);
  assert.equal(model.demoOperations.activeSessions, 2);
  assert.equal(model.demoOperations.ttsFallbacks, 1);
  assert.equal(model.learnerSupport.accessibleLearners[0].learnerName, 'Ava');
  assert.equal(model.learnerSupport.selectedDiagnostics.overview.secureWords, 1);
});

test('parent hub read model exposes readable learner choices and access mode labels', () => {
  const learner = makeLearner('learner-viewer', 'Vera');
  const model = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'viewer',
    accessibleLearners: [
      {
        learnerId: 'learner-owner',
        role: 'owner',
        learner: makeLearner('learner-owner', 'Owner'),
        stateRevision: 4,
      },
      {
        learnerId: learner.id,
        role: 'viewer',
        learner,
        stateRevision: 9,
      },
    ],
    selectedLearnerId: learner.id,
    subjectStates: {},
    now: () => 1000,
  });

  assert.equal(model.permissions.canMutateLearnerData, false);
  assert.equal(model.permissions.accessModeLabel, 'Read-only learner');
  assert.equal(model.selectedLearnerId, 'learner-viewer');
  assert.equal(model.accessibleLearners.length, 2);
  assert.deepEqual(model.accessibleLearners.map((entry) => [entry.learnerId, entry.writable, entry.accessModeLabel]), [
    ['learner-owner', true, 'Writable learner'],
    ['learner-viewer', false, 'Read-only learner'],
  ]);
});

test('admin hub marks selected readable learners without widening parent-hub access', () => {
  const learner = makeLearner('learner-viewer', 'Vera');
  const model = buildAdminHubReadModel({
    account: {
      id: 'adult-ops',
      selectedLearnerId: learner.id,
      repoRevision: 3,
      platformRole: 'ops',
    },
    platformRole: 'ops',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [
      {
        learnerId: learner.id,
        role: 'viewer',
        stateRevision: 2,
        learner,
      },
    ],
    learnerBundles: {
      [learner.id]: {
        subjectStates: {},
        practiceSessions: [],
        eventLog: [],
        gameState: {},
      },
    },
    selectedLearnerId: learner.id,
    now: () => 2000,
  });

  assert.equal(model.permissions.canViewAdminHub, true);
  assert.equal(model.permissions.canViewParentHub, false);
  assert.equal(model.permissions.canManageAccountRoles, false);
  assert.equal(model.learnerSupport.accessibleLearners[0].writable, false);
  assert.equal(model.learnerSupport.accessibleLearners[0].accessModeLabel, 'Read-only learner');
  assert.equal(model.learnerSupport.entryPoints.some((entry) => entry.action === 'open-parent-hub'), false);
});

test('admin hub can link to parent hub when the selected learner is readable', () => {
  const learner = makeLearner('learner-owner', 'Ava');
  const model = buildAdminHubReadModel({
    account: {
      id: 'adult-admin',
      selectedLearnerId: learner.id,
      repoRevision: 4,
      platformRole: 'admin',
    },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [
      {
        learnerId: learner.id,
        role: 'owner',
        stateRevision: 5,
        learner,
      },
    ],
    learnerBundles: {
      [learner.id]: {
        subjectStates: {},
        practiceSessions: [],
        eventLog: [],
        gameState: {},
      },
    },
    selectedLearnerId: learner.id,
    now: () => 3000,
  });

  assert.equal(model.permissions.canViewAdminHub, true);
  assert.equal(model.permissions.canViewParentHub, true);
  assert.equal(model.permissions.canManageAccountRoles, true);
  assert.equal(model.learnerSupport.entryPoints.some((entry) => entry.action === 'open-parent-hub'), true);
});

test('normaliseDashboardKpis keeps all numeric counters with a full payload', () => {
  const kpis = normaliseDashboardKpis({
    generatedAt: 1_777_000_000_000,
    accounts: { total: 42 },
    learners: { total: 17 },
    demos: { active: 5 },
    practiceSessions: { last7d: 12, last30d: 44 },
    eventLog: { last7d: 9 },
    mutationReceipts: { last7d: 3 },
    errorEvents: { byStatus: { open: 2, investigating: 1, resolved: 4, ignored: 0 } },
    accountOpsUpdates: { total: 6 },
  });

  assert.equal(kpis.generatedAt, 1_777_000_000_000);
  assert.equal(kpis.accounts.total, 42);
  assert.equal(kpis.learners.total, 17);
  assert.equal(kpis.demos.active, 5);
  assert.equal(kpis.practiceSessions.last7d, 12);
  assert.equal(kpis.practiceSessions.last30d, 44);
  assert.equal(kpis.eventLog.last7d, 9);
  assert.equal(kpis.mutationReceipts.last7d, 3);
  assert.equal(kpis.errorEvents.byStatus.open, 2);
  assert.equal(kpis.errorEvents.byStatus.investigating, 1);
  assert.equal(kpis.errorEvents.byStatus.resolved, 4);
  assert.equal(kpis.errorEvents.byStatus.ignored, 0);
  assert.equal(kpis.accountOpsUpdates.total, 6);
});

test('normaliseDashboardKpis returns a fully zeroed shape for null input', () => {
  const kpis = normaliseDashboardKpis(null);
  assert.equal(kpis.generatedAt, 0);
  assert.equal(kpis.accounts.total, 0);
  assert.equal(kpis.learners.total, 0);
  assert.equal(kpis.demos.active, 0);
  assert.equal(kpis.practiceSessions.last7d, 0);
  assert.equal(kpis.practiceSessions.last30d, 0);
  assert.equal(kpis.eventLog.last7d, 0);
  assert.equal(kpis.mutationReceipts.last7d, 0);
  assert.equal(kpis.errorEvents.byStatus.open, 0);
  assert.equal(kpis.errorEvents.byStatus.investigating, 0);
  assert.equal(kpis.errorEvents.byStatus.resolved, 0);
  assert.equal(kpis.errorEvents.byStatus.ignored, 0);
  assert.equal(kpis.accountOpsUpdates.total, 0);
});

test('normaliseDashboardKpis defaults byStatus to zero counters when null or malformed', () => {
  const kpis = normaliseDashboardKpis({ errorEvents: { byStatus: null } });
  assert.deepEqual(kpis.errorEvents.byStatus, {
    open: 0,
    investigating: 0,
    resolved: 0,
    ignored: 0,
  });
  const again = normaliseDashboardKpis({ errorEvents: 'nope' });
  assert.deepEqual(again.errorEvents.byStatus, {
    open: 0,
    investigating: 0,
    resolved: 0,
    ignored: 0,
  });
});

test('normaliseDashboardKpis clamps negative or non-numeric counters to zero', () => {
  const kpis = normaliseDashboardKpis({
    accounts: { total: -5 },
    practiceSessions: { last7d: 'NaN', last30d: Number.NaN },
    errorEvents: { byStatus: { open: -3, investigating: 'bogus' } },
  });
  assert.equal(kpis.accounts.total, 0);
  assert.equal(kpis.practiceSessions.last7d, 0);
  assert.equal(kpis.practiceSessions.last30d, 0);
  assert.equal(kpis.errorEvents.byStatus.open, 0);
  assert.equal(kpis.errorEvents.byStatus.investigating, 0);
});

test('normaliseOpsActivityStream coerces a non-array entries field to an empty list', () => {
  const stream = normaliseOpsActivityStream({ generatedAt: 1000, entries: 'not an array' });
  assert.equal(stream.generatedAt, 1000);
  assert.deepEqual(stream.entries, []);
  const fromNull = normaliseOpsActivityStream(null);
  assert.equal(fromNull.generatedAt, 0);
  assert.deepEqual(fromNull.entries, []);
});

test('normaliseOpsActivityStream preserves entry fields and uses pre-masked scope ids', () => {
  const stream = normaliseOpsActivityStream({
    generatedAt: 2000,
    entries: [
      {
        requestId: 'req-1',
        accountIdMasked: '...abc123',
        mutationKind: 'admin.test',
        scopeType: 'learner',
        scopeId: 'abcd1234',
        correlationId: 'corr-1',
        statusCode: 200,
        appliedAt: 1234,
      },
      // Malformed entry still lands with defensive defaults.
      { mutationKind: 'noise', appliedAt: 'not-a-number' },
    ],
  });
  assert.equal(stream.entries.length, 2);
  assert.equal(stream.entries[0].requestId, 'req-1');
  assert.equal(stream.entries[0].scopeId, 'abcd1234');
  assert.equal(stream.entries[0].statusCode, 200);
  assert.equal(stream.entries[0].appliedAt, 1234);
  assert.equal(stream.entries[1].mutationKind, 'noise');
  assert.equal(stream.entries[1].appliedAt, 0);
  assert.equal(stream.entries[1].requestId, '');
});

test('normaliseAccountOpsMetadataDirectory parses tagsJson and preserves internalNotes for admin', () => {
  const directory = normaliseAccountOpsMetadataDirectory({
    generatedAt: 3000,
    accounts: [
      {
        accountId: 'a1',
        email: 'ops@example.com',
        displayName: 'Ops User',
        platformRole: 'ops',
        opsStatus: 'suspended',
        planLabel: 'Classroom',
        tagsJson: '["foo","bar"]',
        internalNotes: 'secret',
        updatedAt: 1000,
        updatedByAccountId: 'admin-id',
      },
    ],
  });
  assert.equal(directory.generatedAt, 3000);
  assert.equal(directory.accounts[0].accountId, 'a1');
  assert.deepEqual(directory.accounts[0].tags, ['foo', 'bar']);
  assert.equal(directory.accounts[0].internalNotes, 'secret');
  assert.equal(directory.accounts[0].opsStatus, 'suspended');
});

test('normaliseAccountOpsMetadataDirectory falls back to empty tags when tagsJson is malformed', () => {
  const directory = normaliseAccountOpsMetadataDirectory({
    accounts: [
      { accountId: 'a1', tagsJson: 'bad json [' },
      { accountId: 'a2', tagsJson: '{"not":"array"}' },
      { accountId: 'a3', tags: ['already', 'parsed'] },
    ],
  });
  assert.deepEqual(directory.accounts[0].tags, []);
  assert.deepEqual(directory.accounts[1].tags, []);
  assert.deepEqual(directory.accounts[2].tags, ['already', 'parsed']);
});

test('normaliseAccountOpsMetadataDirectory keeps internalNotes=null for ops-role payloads (R25)', () => {
  const directory = normaliseAccountOpsMetadataDirectory({
    accounts: [
      { accountId: 'a1', internalNotes: null },
      { accountId: 'a2' },
      { accountId: 'a3', internalNotes: 42 },
    ],
  });
  assert.equal(directory.accounts[0].internalNotes, null);
  assert.equal(directory.accounts[1].internalNotes, null);
  assert.equal(directory.accounts[2].internalNotes, null);
});

test('normaliseErrorEventSummary clamps malformed totals to zero', () => {
  const summary = normaliseErrorEventSummary({ totals: { all: 'NaN', open: -7 } });
  assert.equal(summary.totals.all, 0);
  assert.equal(summary.totals.open, 0);
  assert.equal(summary.totals.investigating, 0);
  assert.equal(summary.totals.resolved, 0);
  assert.equal(summary.totals.ignored, 0);
  assert.deepEqual(summary.entries, []);
});

test('normaliseErrorEventSummary preserves entry fields with defensive defaults', () => {
  const summary = normaliseErrorEventSummary({
    generatedAt: 4000,
    totals: { open: 2, investigating: 0, resolved: 1, ignored: 0, all: 3 },
    entries: [
      {
        id: 'evt-1',
        errorKind: 'TypeError',
        messageFirstLine: 'x undef',
        firstFrame: 'at foo (bar.js:1)',
        routeName: '/demo',
        userAgent: 'ua-string',
        accountIdMasked: '...abc',
        occurrenceCount: 5,
        firstSeen: 1000,
        lastSeen: 2000,
        status: 'open',
      },
    ],
  });
  assert.equal(summary.generatedAt, 4000);
  assert.equal(summary.totals.all, 3);
  assert.equal(summary.entries[0].id, 'evt-1');
  assert.equal(summary.entries[0].occurrenceCount, 5);
  assert.equal(summary.entries[0].status, 'open');
});

test('buildAdminHubReadModel emits the four new sibling keys and preserves existing ones', () => {
  const model = buildAdminHubReadModel({
    account: { id: 'adult-admin', platformRole: 'admin' },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [],
    learnerBundles: {},
    dashboardKpis: {
      generatedAt: 500,
      accounts: { total: 3 },
      errorEvents: { byStatus: { open: 1, investigating: 0, resolved: 0, ignored: 0 } },
    },
    opsActivityStream: {
      generatedAt: 600,
      entries: [
        { requestId: 'r1', mutationKind: 'admin.test', scopeType: 'account', scopeId: '...abc', appliedAt: 100 },
      ],
    },
    accountOpsMetadata: {
      generatedAt: 700,
      accounts: [{ accountId: 'a1', internalNotes: 'admin-note', tags: ['priority'] }],
    },
    errorLogSummary: {
      generatedAt: 800,
      totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
      entries: [],
    },
    now: () => 900,
  });

  // All 4 new sibling keys
  assert.ok(model.dashboardKpis);
  assert.equal(model.dashboardKpis.accounts.total, 3);
  assert.equal(model.dashboardKpis.errorEvents.byStatus.open, 1);
  assert.ok(model.opsActivityStream);
  assert.equal(model.opsActivityStream.entries[0].requestId, 'r1');
  assert.ok(model.accountOpsMetadata);
  assert.equal(model.accountOpsMetadata.accounts[0].internalNotes, 'admin-note');
  assert.deepEqual(model.accountOpsMetadata.accounts[0].tags, ['priority']);
  assert.ok(model.errorLogSummary);
  assert.equal(model.errorLogSummary.totals.all, 1);

  // Existing keys still present and untouched in shape.
  assert.ok(model.permissions);
  assert.ok(model.account);
  assert.ok(model.contentReleaseStatus);
  assert.ok(model.importValidationStatus);
  assert.ok(model.auditLogLookup);
  assert.ok(model.demoOperations);
  assert.ok(model.monsterVisualConfig);
  assert.ok(model.learnerSupport);
  assert.ok(model.reality);
});

test('buildAdminHubReadModel defaults the four new sibling keys to empty shapes when unset', () => {
  const model = buildAdminHubReadModel({
    account: { id: 'adult-admin', platformRole: 'admin' },
    platformRole: 'admin',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [],
    learnerBundles: {},
    now: () => 1000,
  });
  assert.equal(model.dashboardKpis.accounts.total, 0);
  assert.deepEqual(model.opsActivityStream.entries, []);
  assert.deepEqual(model.accountOpsMetadata.accounts, []);
  assert.equal(model.errorLogSummary.totals.all, 0);
});

// PR #188 H1: narrow per-panel patch helpers. Each helper must replace only
// one sibling field, preserve all others, avoid mutating the input, and keep
// the U5 saving scalars (`savingAccountId` / `savingEventId`) intact so a
// refresh mid-save does not unmask the in-flight row.
function makeAdminHubFixture() {
  return {
    permissions: { platformRole: 'admin' },
    account: { id: 'adult-admin' },
    dashboardKpis: { accounts: { total: 1 }, errorEvents: { byStatus: { open: 1 } } },
    opsActivityStream: { generatedAt: 10, entries: [{ requestId: 'r0' }] },
    accountOpsMetadata: {
      generatedAt: 20,
      accounts: [{ accountId: 'a1', opsStatus: 'active', tags: ['flag'] }],
      savingAccountId: 'a1',
    },
    errorLogSummary: {
      generatedAt: 30,
      totals: { open: 1, investigating: 0, resolved: 0, ignored: 0, all: 1 },
      entries: [{ id: 'e1', status: 'open' }],
      savingEventId: 'e1',
    },
    monsterVisualConfig: { status: { schemaVersion: 2 } },
  };
}

test('applyAdminHubDashboardKpisPatch replaces KPIs and preserves every sibling', () => {
  const hub = makeAdminHubFixture();
  const snapshot = JSON.parse(JSON.stringify(hub));
  const next = applyAdminHubDashboardKpisPatch(hub, {
    generatedAt: 99,
    accounts: { total: 5 },
    errorEvents: { byStatus: { open: 2 } },
  });

  assert.notEqual(next, hub, 'must return a new adminHub object');
  assert.equal(next.dashboardKpis.accounts.total, 5);
  assert.equal(next.dashboardKpis.errorEvents.byStatus.open, 2);
  assert.equal(next.dashboardKpis.generatedAt, 99);
  // Siblings untouched.
  assert.equal(next.opsActivityStream, hub.opsActivityStream);
  assert.equal(next.accountOpsMetadata, hub.accountOpsMetadata);
  assert.equal(next.errorLogSummary, hub.errorLogSummary);
  assert.equal(next.monsterVisualConfig, hub.monsterVisualConfig);
  // Input not mutated.
  assert.deepEqual(hub, snapshot);
});

test('applyAdminHubOpsActivityPatch replaces only the activity stream', () => {
  const hub = makeAdminHubFixture();
  const snapshot = JSON.parse(JSON.stringify(hub));
  const next = applyAdminHubOpsActivityPatch(hub, {
    generatedAt: 111,
    entries: [
      { requestId: 'r1', mutationKind: 'admin.test', scopeType: 'account', scopeId: 'x', appliedAt: 200 },
    ],
  });

  assert.equal(next.opsActivityStream.entries.length, 1);
  assert.equal(next.opsActivityStream.entries[0].requestId, 'r1');
  assert.equal(next.dashboardKpis, hub.dashboardKpis);
  assert.equal(next.accountOpsMetadata, hub.accountOpsMetadata);
  assert.equal(next.errorLogSummary, hub.errorLogSummary);
  assert.deepEqual(hub, snapshot);
});

test('applyAdminHubErrorLogSummaryPatch preserves savingEventId across a narrow refresh', () => {
  const hub = makeAdminHubFixture();
  const next = applyAdminHubErrorLogSummaryPatch(hub, {
    generatedAt: 500,
    totals: { open: 3, investigating: 0, resolved: 0, ignored: 0, all: 3 },
    entries: [
      { id: 'e2', status: 'open' },
      { id: 'e3', status: 'open' },
      { id: 'e4', status: 'open' },
    ],
  });

  assert.equal(next.errorLogSummary.totals.open, 3);
  assert.equal(next.errorLogSummary.entries.length, 3);
  // U5 saving scalar preserved so mid-save PUT is not unmasked.
  assert.equal(next.errorLogSummary.savingEventId, 'e1');
  // Sibling panels untouched.
  assert.equal(next.dashboardKpis, hub.dashboardKpis);
  assert.equal(next.opsActivityStream, hub.opsActivityStream);
  assert.equal(next.accountOpsMetadata, hub.accountOpsMetadata);
});

test('applyAdminHubAccountOpsMetadataPatch preserves savingAccountId across a narrow refresh', () => {
  const hub = makeAdminHubFixture();
  const next = applyAdminHubAccountOpsMetadataPatch(hub, {
    generatedAt: 600,
    accounts: [{ accountId: 'a2', opsStatus: 'suspended', tags: ['trial'] }],
  });

  assert.equal(next.accountOpsMetadata.accounts.length, 1);
  assert.equal(next.accountOpsMetadata.accounts[0].accountId, 'a2');
  // U5 saving scalar preserved so mid-save PUT is not unmasked.
  assert.equal(next.accountOpsMetadata.savingAccountId, 'a1');
  assert.equal(next.dashboardKpis, hub.dashboardKpis);
  assert.equal(next.opsActivityStream, hub.opsActivityStream);
  assert.equal(next.errorLogSummary, hub.errorLogSummary);
});

test('narrow-patch helpers drop the saving scalar when it was empty in the previous hub', () => {
  const hub = makeAdminHubFixture();
  hub.accountOpsMetadata = { ...hub.accountOpsMetadata, savingAccountId: '' };
  hub.errorLogSummary = { ...hub.errorLogSummary, savingEventId: '' };

  const nextOps = applyAdminHubAccountOpsMetadataPatch(hub, { accounts: [] });
  const nextErrors = applyAdminHubErrorLogSummaryPatch(hub, { totals: {}, entries: [] });

  assert.equal(Object.prototype.hasOwnProperty.call(nextOps.accountOpsMetadata, 'savingAccountId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(nextErrors.errorLogSummary, 'savingEventId'), false);
});

test('narrow-patch helpers no-op when adminHub is not a plain object', () => {
  for (const patch of [
    applyAdminHubDashboardKpisPatch,
    applyAdminHubOpsActivityPatch,
    applyAdminHubErrorLogSummaryPatch,
    applyAdminHubAccountOpsMetadataPatch,
  ]) {
    assert.equal(patch(null, { accounts: [] }), null);
    assert.equal(patch(undefined, {}), undefined);
  }
});

test('narrow-patch helpers strip the Worker ok envelope before writing to the model', () => {
  const hub = makeAdminHubFixture();
  const next = applyAdminHubDashboardKpisPatch(hub, { ok: true, generatedAt: 42, accounts: { total: 9 } });
  assert.equal(Object.prototype.hasOwnProperty.call(next.dashboardKpis, 'ok'), false);
  assert.equal(next.dashboardKpis.generatedAt, 42);
  assert.equal(next.dashboardKpis.accounts.total, 9);
});

test('narrow-patch helpers reject malformed (non-object) responses without mutating adminHub', () => {
  const hub = makeAdminHubFixture();
  assert.equal(applyAdminHubDashboardKpisPatch(hub, null).dashboardKpis, hub.dashboardKpis);
  assert.equal(applyAdminHubOpsActivityPatch(hub, 'oops').opsActivityStream, hub.opsActivityStream);
  assert.equal(applyAdminHubErrorLogSummaryPatch(hub, 42).errorLogSummary, hub.errorLogSummary);
  assert.equal(applyAdminHubAccountOpsMetadataPatch(hub, [1, 2]).accountOpsMetadata, hub.accountOpsMetadata);
});
