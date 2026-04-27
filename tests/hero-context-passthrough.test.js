import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerSubjectRuntime } from '../worker/src/subjects/runtime.js';

const SAMPLE_HERO_CONTEXT = Object.freeze({
  version: 1,
  source: 'hero-mode',
  phase: 'p1-launch',
  questId: 'quest-abc',
  taskId: 'hero-task-def',
  dateKey: '2026-04-27',
  timezone: 'Europe/London',
  schedulerVersion: 'hero-p1-launch-v1',
  questFingerprint: null,
  subjectId: 'spelling',
  intent: 'practice',
  launcher: 'smart-practice',
  effortTarget: 10,
  launchRequestId: 'req-001',
  launchedAt: 1_777_000_000_000,
});

function projectionInputStub() {
  return {
    mode: 'hit',
    projection: {
      version: 1,
      rewards: { systemId: 'monster-codex', state: {} },
      eventCounts: { domain: 0, reactions: 0, toasts: 0 },
      recentEventTokens: [],
    },
    sourceRevision: 0,
    rawRow: null,
  };
}

function baseContext() {
  return {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
      async readSpellingRuntimeContent() {
        const { SEEDED_SPELLING_CONTENT_BUNDLE } = await import(
          '../src/subjects/spelling/data/content-data.js'
        );
        const { resolveRuntimeSnapshot } = await import(
          '../src/subjects/spelling/content/model.js'
        );
        return {
          content: SEEDED_SPELLING_CONTENT_BUNDLE,
          snapshot: resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
            referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
          }),
        };
      },
    },
  };
}

// ── Spelling ─────────────────────────────────────────────────────────────

test('spelling start-session with heroContext stores it on persisted session state', async () => {
  const runtime = createWorkerSubjectRuntime({
    spelling: { now: () => 1_777_000_000_000, random: () => 0.5 },
  });
  const result = await runtime.dispatch({
    subjectId: 'spelling',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'spell-hero-1',
    correlationId: 'spell-hero-1',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart', heroContext: SAMPLE_HERO_CONTEXT },
  }, baseContext());

  assert.equal(result.subjectId, 'spelling');
  assert.equal(result.command, 'start-session');

  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.deepEqual(sessionState.heroContext, SAMPLE_HERO_CONTEXT);
});

test('spelling start-session without heroContext works normally — heroContext absent', async () => {
  const runtime = createWorkerSubjectRuntime({
    spelling: { now: () => 1_777_000_000_000, random: () => 0.5 },
  });
  const result = await runtime.dispatch({
    subjectId: 'spelling',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'spell-normal-1',
    correlationId: 'spell-normal-1',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart' },
  }, baseContext());

  assert.equal(result.subjectId, 'spelling');
  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.equal(sessionState.heroContext == null, true, 'heroContext must be null or undefined');
});

// ── Grammar ──────────────────────────────────────────────────────────────

test('grammar start-session with heroContext stores it on persisted session state', async () => {
  const heroCtx = { ...SAMPLE_HERO_CONTEXT, subjectId: 'grammar' };
  const runtime = createWorkerSubjectRuntime({
    grammar: { now: () => 1_777_000_000_000 },
  });
  const result = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'gram-hero-1',
    correlationId: 'gram-hero-1',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart', roundLength: 1, heroContext: heroCtx },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  assert.equal(result.subjectId, 'grammar');
  assert.equal(result.command, 'start-session');

  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.deepEqual(sessionState.heroContext, heroCtx);
});

test('grammar start-session without heroContext works normally', async () => {
  const runtime = createWorkerSubjectRuntime({
    grammar: { now: () => 1_777_000_000_000 },
  });
  const result = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'gram-normal-1',
    correlationId: 'gram-normal-1',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart', roundLength: 1 },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  assert.equal(result.subjectId, 'grammar');
  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.equal(sessionState.heroContext, null);
});

test('grammar satsset mode with heroContext stores it on persisted session state', async () => {
  const heroCtx = { ...SAMPLE_HERO_CONTEXT, subjectId: 'grammar', launcher: 'mini-test' };
  const runtime = createWorkerSubjectRuntime({
    grammar: { now: () => 1_777_000_000_000 },
  });
  const result = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'gram-hero-sats-1',
    correlationId: 'gram-hero-sats-1',
    expectedLearnerRevision: 0,
    payload: { mode: 'satsset', roundLength: 8, heroContext: heroCtx },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  assert.equal(result.subjectId, 'grammar');
  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.equal(sessionState.type, 'mini-set');
  assert.deepEqual(sessionState.heroContext, heroCtx);
});

// ── Punctuation ──────────────────────────────────────────────────────────

test('punctuation start-session with heroContext stores it on persisted session state', async () => {
  const heroCtx = { ...SAMPLE_HERO_CONTEXT, subjectId: 'punctuation' };
  const runtime = createWorkerSubjectRuntime({
    punctuation: { random: () => 0 },
  });
  const result = await runtime.dispatch({
    subjectId: 'punctuation',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'punc-hero-1',
    correlationId: 'punc-hero-1',
    expectedLearnerRevision: 0,
    payload: { roundLength: 1, heroContext: heroCtx },
  }, {
    session: { accountId: 'adult-a' },
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: {}, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  assert.equal(result.subjectId, 'punctuation');
  assert.equal(result.command, 'start-session');

  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.deepEqual(sessionState.heroContext, heroCtx);
});

test('punctuation start-session without heroContext works normally', async () => {
  const runtime = createWorkerSubjectRuntime({
    punctuation: { random: () => 0 },
  });
  const result = await runtime.dispatch({
    subjectId: 'punctuation',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'punc-normal-1',
    correlationId: 'punc-normal-1',
    expectedLearnerRevision: 0,
    payload: { roundLength: 1 },
  }, {
    session: { accountId: 'adult-a' },
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: {}, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  assert.equal(result.subjectId, 'punctuation');
  const sessionState = result.runtimeWrite.state?.session;
  assert.ok(sessionState, 'runtimeWrite.state.session must exist');
  assert.equal(sessionState.heroContext == null, true, 'heroContext must be absent');
});

// ── Edge: heroContext does not affect mode or scoring ─────────────────────

test('grammar mode and templateId are unaffected by heroContext in payload', async () => {
  const heroCtx = { ...SAMPLE_HERO_CONTEXT, subjectId: 'grammar' };
  const runtime = createWorkerSubjectRuntime({
    grammar: { now: () => 1_777_000_000_000 },
  });
  const withHero = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'gram-mode-hero-1',
    correlationId: 'gram-mode-hero-1',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'trouble',
      roundLength: 1,
      seed: 42,
      heroContext: heroCtx,
    },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  const withoutHero = await runtime.dispatch({
    subjectId: 'grammar',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'gram-mode-nohero-1',
    correlationId: 'gram-mode-nohero-1',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'trouble',
      roundLength: 1,
      seed: 42,
    },
  }, {
    session: { accountId: 'adult-a' },
    now: 1_777_000_000_000,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: null, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  assert.equal(withHero.runtimeWrite.state.session.mode, 'trouble');
  assert.equal(withoutHero.runtimeWrite.state.session.mode, 'trouble');
  assert.equal(
    withHero.runtimeWrite.state.session.currentItem?.templateId,
    withoutHero.runtimeWrite.state.session.currentItem?.templateId,
  );
});

test('punctuation prefs do not contain heroContext — whitelist normaliser discards it', async () => {
  const heroCtx = { ...SAMPLE_HERO_CONTEXT, subjectId: 'punctuation' };
  const runtime = createWorkerSubjectRuntime({
    punctuation: { random: () => 0 },
  });
  const result = await runtime.dispatch({
    subjectId: 'punctuation',
    command: 'start-session',
    learnerId: 'learner-a',
    requestId: 'punc-prefs-1',
    correlationId: 'punc-prefs-1',
    expectedLearnerRevision: 0,
    payload: { roundLength: 3, mode: 'smart', heroContext: heroCtx },
  }, {
    session: { accountId: 'adult-a' },
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: {}, data: {} }, latestSession: null };
      },
      async readLearnerProjectionState() {
        return { gameState: {}, events: [] };
      },
      async readLearnerProjectionInput() {
        return projectionInputStub();
      },
    },
  });

  const readModel = result.subjectReadModel;
  assert.ok(readModel, 'subjectReadModel must exist');
  assert.equal(readModel.prefs?.heroContext, undefined, 'prefs must not contain heroContext');
});
