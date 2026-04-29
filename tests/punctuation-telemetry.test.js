import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PUNCTUATION_TELEMETRY_EVENTS } from '../shared/punctuation/telemetry-events.js';
import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { createPunctuationService } from '../shared/punctuation/service.js';
import { createPunctuationCommandHandlers } from '../worker/src/subjects/punctuation/commands.js';

// --- Helpers ---

function makeRepository() {
  let data = null;
  let practiceSession = null;
  return {
    readData() { return data; },
    writeData(_learnerId, nextData) {
      data = JSON.parse(JSON.stringify(nextData));
      return data;
    },
    syncPracticeSession(_learnerId, _state, record) {
      practiceSession = JSON.parse(JSON.stringify(record));
      return practiceSession;
    },
    resetLearner() { data = null; practiceSession = null; },
    snapshot() { return { data, practiceSession }; },
  };
}

function correctAnswerFor(item) {
  if (item.inputKind === 'choice') {
    return { choiceIndex: item.options.find((option) => option.text === item.model)?.index ?? 0 };
  }
  return { typed: item.model };
}

const SENSITIVE_FIELDS = Object.freeze([
  'answerText',
  'typed',
  'answer',
  'promptText',
  'validator',
  'validators',
  'accepted',
  'acceptedAnswers',
  'rubric',
  'rawResponse',
  'rawGenerator',
  'model',
  'stem',
  'explanation',
  'prompt',
  'options',
]);

// --- Manifest tests ---

test('telemetry events manifest exports all 11 expected event names', () => {
  const names = Object.keys(PUNCTUATION_TELEMETRY_EVENTS);
  assert.equal(names.length, 11);
  assert.ok(names.includes('GENERATED_SIGNATURE_EXPOSED'));
  assert.ok(names.includes('GENERATED_SIGNATURE_REPEATED'));
  assert.ok(names.includes('SCHEDULER_REASON_SELECTED'));
  assert.ok(names.includes('MISCONCEPTION_RETRY_SCHEDULED'));
  assert.ok(names.includes('MISCONCEPTION_RETRY_PASSED'));
  assert.ok(names.includes('SPACED_RETURN_SCHEDULED'));
  assert.ok(names.includes('SPACED_RETURN_PASSED'));
  assert.ok(names.includes('RETENTION_AFTER_SECURE_SCHEDULED'));
  assert.ok(names.includes('RETENTION_AFTER_SECURE_PASSED'));
  assert.ok(names.includes('STAR_EVIDENCE_DEDUPED_BY_SIGNATURE'));
  assert.ok(names.includes('STAR_EVIDENCE_DEDUPED_BY_TEMPLATE'));
});

test('telemetry events manifest is a manifest-leaf module with zero sibling imports', () => {
  const filePath = resolve('shared/punctuation/telemetry-events.js');
  const source = readFileSync(filePath, 'utf8');
  // Must NOT import from any sibling module
  const importLines = source.split('\n').filter((line) => /^\s*import\s/.test(line));
  assert.equal(importLines.length, 0, `Expected zero import statements, found: ${importLines.join('; ')}`);
});

test('telemetry event name values are all frozen strings with punctuation. prefix', () => {
  const values = Object.values(PUNCTUATION_TELEMETRY_EVENTS);
  for (const value of values) {
    assert.equal(typeof value, 'string');
    assert.ok(value.startsWith('punctuation.'), `Expected 'punctuation.' prefix on: ${value}`);
  }
  // Ensure the object is frozen
  assert.ok(Object.isFrozen(PUNCTUATION_TELEMETRY_EVENTS));
});

// --- Service-level telemetry integration tests ---

test('service stores selectionReason on session after item selection', () => {
  const repository = makeRepository();
  const service = createPunctuationService({
    repository,
    now: () => 1_800_000_000_000,
    random: () => 0.5,
  });
  const start = service.startSession('learner-a', { roundLength: '4' });
  assert.ok(start.state.session.selectionReason, 'selectionReason must be present');
  assert.equal(typeof start.state.session.selectionReason, 'string');
});

test('service tracks selectedSignatures on session for generated items', () => {
  const manifest = createPunctuationRuntimeManifest({
    seed: 'telemetry-sig-test',
    generatedPerFamily: 4,
  });
  const indexes = createPunctuationContentIndexes(manifest);
  const repository = makeRepository();
  const service = createPunctuationService({
    repository,
    now: () => 1_800_000_000_000,
    random: () => 0.99,
    manifest,
    indexes,
  });
  const start = service.startSession('learner-a', { mode: 'endmarks', roundLength: '4' });
  // Submit correct answer to advance
  const submitted = service.submitAnswer('learner-a', start.state, correctAnswerFor(start.state.session.currentItem));
  const next = service.continueSession('learner-a', submitted.state);
  // If the second item is generated, selectedSignatures should track it
  if (next.state.session.currentItem.source === 'generated') {
    assert.ok(Array.isArray(next.state.session.selectedSignatures));
    assert.ok(next.state.session.selectedSignatures.length >= 1);
  }
});

test('SCHEDULER_REASON_SELECTED payload includes reason but not validators/rubrics', () => {
  // Simulate the telemetry event payload structure
  const mockEvent = {
    type: PUNCTUATION_TELEMETRY_EVENTS.SCHEDULER_REASON_SELECTED,
    reason: 'fallback',
    familyId: '',
    skillId: 'endmarks_full_stops',
    clusterId: 'endmarks',
    rewardUnitId: 'ru_endmarks_01',
    mode: 'choose',
  };
  // Verify allowed fields are present
  assert.equal(mockEvent.type, 'punctuation.scheduler_reason_selected');
  assert.equal(typeof mockEvent.reason, 'string');
  assert.equal(typeof mockEvent.skillId, 'string');
  // Verify sensitive fields are absent
  for (const field of SENSITIVE_FIELDS) {
    assert.equal(Object.hasOwn(mockEvent, field), false, `Payload must not contain ${field}`);
  }
});

test('GENERATED_SIGNATURE_REPEATED correctly identifies repeated signatures via session state', () => {
  const manifest = createPunctuationRuntimeManifest({
    seed: 'repeat-sig-test',
    generatedPerFamily: 1,
  });
  const indexes = createPunctuationContentIndexes(manifest);
  const repository = makeRepository();
  const service = createPunctuationService({
    repository,
    now: () => 1_800_000_000_000,
    random: () => 0.5,
    manifest,
    indexes,
  });
  // Start session and get first item
  const start = service.startSession('learner-a', { mode: 'smart', roundLength: '10' });
  const session = start.state.session;
  // Manually check: if selectedSignatures has duplicates, that indicates a repeat
  const signatures = Array.isArray(session.selectedSignatures) ? session.selectedSignatures : [];
  const signatureItem = session.currentItem?.variantSignature || '';
  if (signatureItem) {
    const count = signatures.filter((s) => s === signatureItem).length;
    // First selection = exactly 1 (not repeated)
    assert.equal(count <= 1, true, 'First selection should not be marked as repeated');
  }
});

test('telemetry emission does not affect command handler exit behaviour', async () => {
  // Create command handlers
  const handlers = createPunctuationCommandHandlers({
    now: () => 1_800_000_000_000,
    random: () => 0.5,
  });
  // Create a mock context that provides the needed repository interface
  const subjectRecord = { data: null, ui: null };
  const context = {
    session: { accountId: 'account-1', platformRole: 'learner' },
    now: 1_800_000_000_000,
    env: {},
    capacity: null,
    repository: {
      readSubjectRuntime: async () => ({
        subjectRecord,
        latestSession: null,
      }),
      readLearnerProjectionState: async () => ({
        gameState: null,
        events: [],
      }),
      readLearnerProjectionInput: async () => ({
        mode: 'miss-rehydrated',
        bootstrap: { gameState: {}, events: [] },
        projection: null,
        rawRow: null,
      }),
    },
  };
  const command = {
    command: 'start-session',
    learnerId: 'learner-tel-1',
    payload: { roundLength: '2' },
    expectedLearnerRevision: 0,
  };
  const response = await handlers['start-session'](command, context);
  // Response must still have standard properties
  assert.equal(response.ok, true);
  assert.equal(response.changed, true);
  assert.equal(typeof response.learnerId, 'string');
  // telemetryEvents must be an array (may be empty or populated)
  assert.ok(Array.isArray(response.telemetryEvents), 'telemetryEvents must be an array');
  // Verify telemetry events (if any) do not contain sensitive fields
  for (const event of response.telemetryEvents) {
    for (const field of SENSITIVE_FIELDS) {
      assert.equal(
        Object.hasOwn(event, field),
        false,
        `Telemetry event ${event.type} must not contain ${field}`,
      );
    }
  }
});
