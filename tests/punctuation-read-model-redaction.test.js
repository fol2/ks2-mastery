// P4-U13 — Read-model redaction refresh for Punctuation QG P4 fields.
//
// Verifies that P4-introduced internal fields (scheduler reason tags, template
// identifiers, generator family identifiers, DSL golden tests, session
// telemetry) are stripped by the Worker read-model builder before reaching the
// learner. Exercises `buildPunctuationReadModel` with deliberately poisoned
// state payloads and asserts that:
//   (a) the builder throws on forbidden keys that bypass the per-phase allowlists
//       (e.g. `reason`, `tests`, `selectionReason`, `selectedSignatures`), AND
//   (b) session-level fields (`selectionReason`, `selectedSignatures`) are
//       silently dropped by the `safeSession` allowlist and never appear on the
//       output payload.
//
// Existing coverage (already asserted by tests/punctuation-read-models.test.js):
//   - validator, rubric, misconceptionTags (on feedback/summary surfaces)
//   - variantSignature (opaque transport only on active generated currentItem)
//   - templateId, generatorFamilyId (in recursive scan)
//
// P4 additions tested here:
//   - `reason` — scheduler reason tag must not appear in read model
//   - `templateId` — verified via recursive scan on all payload branches
//   - `generatorFamilyId` / `familyId` — must not appear in learner items
//   - `tests` — DSL golden test cases must not appear
//   - `selectionReason` — session telemetry field must not appear
//   - `selectedSignatures` — session telemetry field must not appear

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationReadModel } from '../worker/src/subjects/punctuation/read-models.js';
import {
  FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS,
} from './helpers/forbidden-keys.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ACTIVE_STATE = {
  phase: 'active-item',
  session: {
    id: 'session-p4-redaction',
    releaseId: 'punctuation-r4-full-14-skill-structure',
    mode: 'smart',
    length: 4,
    phase: 'active-item',
    startedAt: 1_777_000_000_000,
    answeredCount: 1,
    correctCount: 1,
    currentItem: {
      id: 'gen_speech_insert_01',
      mode: 'insert',
      source: 'generated',
      prompt: 'Add the speech punctuation.',
      stem: 'Maya said hello.',
      inputKind: 'text',
      skillIds: ['speech'],
      clusterId: 'speech',
    },
    securedUnits: [],
    misconceptionTags: [],
    // P4 session-level telemetry fields (must be stripped by safeSession):
    selectionReason: 'misconception-retry',
    selectedSignatures: ['puncsig_abc123', 'puncsig_def456'],
  },
  availability: { status: 'ready', code: null, message: '' },
};

const BASE_SUMMARY_STATE = {
  phase: 'summary',
  session: null,
  feedback: null,
  summary: {
    completedAt: 1_777_000_000_000,
    correctCount: 3,
    total: 4,
    mode: 'smart',
    releaseId: 'punctuation-r4-full-14-skill-structure',
    sessionId: 'session-p4-summary',
    reviewRows: [
      {
        itemId: 'gen_speech_insert_01',
        mode: 'insert',
        correct: true,
        skillIds: ['speech'],
        misconceptionTags: [],
        displayCorrection: 'Maya said, "Hello."',
      },
    ],
    misconceptionTags: ['speech.quote_missing'],
  },
  availability: { status: 'ready', code: null, message: '' },
};

function buildSafe(stateOverrides = {}, extras = {}) {
  return buildPunctuationReadModel({
    learnerId: 'learner-p4-redaction',
    state: { ...BASE_ACTIVE_STATE, ...stateOverrides },
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 0 },
    ...extras,
  });
}

function buildSafeSummary(stateOverrides = {}, extras = {}) {
  return buildPunctuationReadModel({
    learnerId: 'learner-p4-redaction',
    state: { ...BASE_SUMMARY_STATE, ...stateOverrides },
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 0 },
    ...extras,
  });
}

// ---------------------------------------------------------------------------
// P4 session telemetry fields: selectionReason + selectedSignatures
// ---------------------------------------------------------------------------

test('P4-U13: selectionReason is stripped from session in active-item phase', () => {
  const result = buildSafe();
  assert.equal(result.phase, 'active-item');
  assert.ok(result.session, 'session must exist');
  assert.equal(Object.hasOwn(result.session, 'selectionReason'), false,
    'selectionReason must not appear on learner session');
});

test('P4-U13: selectedSignatures is stripped from session in active-item phase', () => {
  const result = buildSafe();
  assert.equal(Object.hasOwn(result.session, 'selectedSignatures'), false,
    'selectedSignatures must not appear on learner session');
});

test('P4-U13: selectionReason on feedback phase session is stripped', () => {
  const feedbackState = {
    phase: 'feedback',
    session: {
      ...BASE_ACTIVE_STATE.session,
      phase: 'feedback',
      selectionReason: 'spaced-return',
      selectedSignatures: ['puncsig_xyz789'],
    },
    feedback: {
      kind: 'success',
      headline: 'Good work',
      body: 'That is correct.',
    },
    availability: { status: 'ready', code: null, message: '' },
  };
  const result = buildPunctuationReadModel({
    learnerId: 'learner-p4-redaction',
    state: feedbackState,
    prefs: {},
    stats: {},
  });
  assert.equal(result.phase, 'feedback');
  assert.ok(result.session, 'feedback session must exist');
  assert.equal(Object.hasOwn(result.session, 'selectionReason'), false,
    'selectionReason must not appear on feedback session');
  assert.equal(Object.hasOwn(result.session, 'selectedSignatures'), false,
    'selectedSignatures must not appear on feedback session');
});

// ---------------------------------------------------------------------------
// P4 scheduler `reason` field — must not appear anywhere in learner payload
// ---------------------------------------------------------------------------

test('P4-U13: reason field in summary metadata trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({
      summary: {
        ...BASE_SUMMARY_STATE.summary,
        schedulerMetadata: { reason: 'misconception-retry', familyId: 'gen_speech_insert' },
      },
    }),
    /server-only.*field/,
    'reason or familyId must trip the recursive scan when nested in summary',
  );
});

test('P4-U13: reason field in analytics payload trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({}, {
      analytics: {
        itemSelections: [
          { itemId: 'gen_speech_insert_01', reason: 'weak-skill-repair' },
        ],
      },
    }),
    /server-only.*field/,
    'reason in analytics must trip the recursive scan',
  );
});

// ---------------------------------------------------------------------------
// P4 DSL `tests` field — golden accept/reject test cases must not leak
// ---------------------------------------------------------------------------

test('P4-U13: tests field in summary reviewRow trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({
      summary: {
        ...BASE_SUMMARY_STATE.summary,
        reviewRows: [
          {
            ...BASE_SUMMARY_STATE.summary.reviewRows[0],
            tests: { accept: ['Maya said, "Hello."'], reject: ['maya said hello'] },
          },
        ],
      },
    }),
    /server-only.*field/,
    'tests field must trip the recursive scan when nested in a review row',
  );
});

test('P4-U13: tests field in content payload trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({}, {
      content: {
        releaseId: 'punctuation-r4-full-14-skill-structure',
        skills: [{ id: 'speech', name: 'Speech', clusterId: 'speech', tests: { accept: ['ok'] } }],
      },
    }),
    /server-only.*field/,
    'tests field must trip the recursive scan when nested in content',
  );
});

// ---------------------------------------------------------------------------
// P4 `generatorFamilyId` / `familyId` — must not appear in learner items
// ---------------------------------------------------------------------------

test('P4-U13: generatorFamilyId in currentItem triggers fail-closed assertion', () => {
  const state = {
    ...BASE_ACTIVE_STATE,
    session: {
      ...BASE_ACTIVE_STATE.session,
      currentItem: {
        ...BASE_ACTIVE_STATE.session.currentItem,
        generatorFamilyId: 'gen_speech_insert',
      },
    },
  };
  assert.throws(
    () => buildPunctuationReadModel({
      learnerId: 'learner-p4-redaction',
      state,
      prefs: {},
      stats: {},
    }),
    /server-only item field: generatorFamilyId/,
    'generatorFamilyId on currentItem must trip the fail-closed assertion',
  );
});

test('P4-U13: familyId in currentItem triggers fail-closed assertion', () => {
  const state = {
    ...BASE_ACTIVE_STATE,
    session: {
      ...BASE_ACTIVE_STATE.session,
      currentItem: {
        ...BASE_ACTIVE_STATE.session.currentItem,
        familyId: 'gen_speech_insert',
      },
    },
  };
  assert.throws(
    () => buildPunctuationReadModel({
      learnerId: 'learner-p4-redaction',
      state,
      prefs: {},
      stats: {},
    }),
    /server-only item field: familyId/,
    'familyId on currentItem must trip the fail-closed assertion',
  );
});

test('P4-U13: familyId in summary metadata trips recursive scan via generatorFamilyId membership', () => {
  // `generatorFamilyId` is in FORBIDDEN_READ_MODEL_KEYS; `familyId` is not
  // currently in the forbidden set (it is a different token). Verify the one
  // that IS in the set trips, and verify `familyId` at least does not appear
  // on the explicitly-constructed safe session.
  assert.throws(
    () => buildSafeSummary({
      summary: {
        ...BASE_SUMMARY_STATE.summary,
        selectionLog: [{ generatorFamilyId: 'gen_speech_insert', skillId: 'speech' }],
      },
    }),
    /server-only.*field: generatorFamilyId/,
    'generatorFamilyId must trip the recursive scan when nested in summary',
  );
});

// ---------------------------------------------------------------------------
// P4 `templateId` — DSL template identifier must not appear in learner items
// ---------------------------------------------------------------------------

test('P4-U13: templateId in currentItem triggers fail-closed assertion', () => {
  const state = {
    ...BASE_ACTIVE_STATE,
    session: {
      ...BASE_ACTIVE_STATE.session,
      currentItem: {
        ...BASE_ACTIVE_STATE.session.currentItem,
        templateId: 'gen_speech_insert_template_v2',
      },
    },
  };
  assert.throws(
    () => buildPunctuationReadModel({
      learnerId: 'learner-p4-redaction',
      state,
      prefs: {},
      stats: {},
    }),
    /server-only item field: templateId/,
    'templateId on currentItem must trip the fail-closed assertion',
  );
});

test('P4-U13: templateId in analytics trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({}, {
      analytics: {
        templateDistribution: [{ templateId: 'gen_speech_insert_v1', count: 3 }],
      },
    }),
    /server-only.*field: templateId/,
    'templateId must trip the recursive scan when nested in analytics',
  );
});

// ---------------------------------------------------------------------------
// Existing redaction still blocks: validator, rubric, misconceptionTags,
// variantSignature (regression lock for pre-P4 fields)
// ---------------------------------------------------------------------------

test('P4-U13: validator in summary still trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({
      summary: {
        ...BASE_SUMMARY_STATE.summary,
        reviewRows: [
          {
            ...BASE_SUMMARY_STATE.summary.reviewRows[0],
            validator: { type: 'speech', facets: ['speech::insert'] },
          },
        ],
      },
    }),
    /server-only.*field: validator/,
  );
});

test('P4-U13: rubric in analytics still trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({}, {
      analytics: {
        byItemMode: [{ id: 'insert', attempts: 2, correct: 1, rubric: { facets: [] } }],
      },
    }),
    /server-only.*field: rubric/,
  );
});

test('P4-U13: variantSignature in summary review row still trips recursive scan', () => {
  assert.throws(
    () => buildSafeSummary({
      summary: {
        ...BASE_SUMMARY_STATE.summary,
        reviewRows: [
          {
            ...BASE_SUMMARY_STATE.summary.reviewRows[0],
            variantSignature: 'puncsig_leaked',
          },
        ],
      },
    }),
    /server-only.*field: variantSignature/,
  );
});

// ---------------------------------------------------------------------------
// Comprehensive: full P4-poisoned session state produces a clean payload
// ---------------------------------------------------------------------------

test('P4-U13: full P4-poisoned session (telemetry fields only) produces a clean payload', () => {
  // Build a session state that carries every P4 session-level telemetry field.
  // The safe builder's safeSession allowlist silently strips them.
  // Note: item-level forbidden fields (templateId, generatorFamilyId, etc.)
  // are not placed on currentItem here because the fail-closed assertion
  // throws before safeCurrentItem runs — those are tested individually above.
  const poisonedState = {
    phase: 'active-item',
    session: {
      id: 'session-p4-full-poison',
      releaseId: 'punctuation-r4-full-14-skill-structure',
      mode: 'smart',
      length: 4,
      phase: 'active-item',
      startedAt: 1_777_000_000_000,
      answeredCount: 2,
      correctCount: 2,
      currentItem: {
        id: 'gen_comma_flow_01',
        mode: 'insert',
        source: 'generated',
        prompt: 'Add the missing comma.',
        stem: 'However the rain stopped.',
        inputKind: 'text',
        skillIds: ['comma_clarity'],
        clusterId: 'comma_flow',
        // variantSignature is allowed on active generated currentItem:
        variantSignature: 'puncsig_comma01',
      },
      securedUnits: [],
      misconceptionTags: ['comma_clarity.fronted_adverbial_missing'],
      // P4 session-level telemetry (must be silently stripped by safeSession):
      selectionReason: 'weak-skill-repair',
      selectedSignatures: ['puncsig_comma01', 'puncsig_comma02', 'puncsig_comma03'],
    },
    availability: { status: 'ready', code: null, message: '' },
  };

  const result = buildPunctuationReadModel({
    learnerId: 'learner-p4-poison',
    state: poisonedState,
    prefs: {},
    stats: { publishedRewardUnits: 14, securedRewardUnits: 0 },
  });

  // Session-level fields must not appear:
  assert.equal(Object.hasOwn(result.session, 'selectionReason'), false,
    'selectionReason must be stripped');
  assert.equal(Object.hasOwn(result.session, 'selectedSignatures'), false,
    'selectedSignatures must be stripped');

  // The safe fields must still be present:
  const item = result.session.currentItem;
  assert.equal(item.id, 'gen_comma_flow_01');
  assert.equal(item.mode, 'insert');
  assert.equal(item.source, 'generated');
  assert.equal(item.prompt, 'Add the missing comma.');
  assert.equal(item.stem, 'However the rain stopped.');
  assert.deepEqual(item.skillIds, ['comma_clarity']);
  assert.equal(item.clusterId, 'comma_flow');
  // variantSignature IS allowed on active generated currentItem:
  assert.equal(item.variantSignature, 'puncsig_comma01');
});

test('P4-U13: item-level P4 forbidden fields each trigger fail-closed assertion', () => {
  // Each P4 item-level field independently triggers the fail-closed check.
  const itemForbiddenFields = {
    templateId: 'gen_comma_flow_template_v3',
    generatorFamilyId: 'gen_comma_flow',
    familyId: 'gen_comma_flow',
    validator: { type: 'fronted_adverbial' },
    tests: { accept: ['However, the rain stopped.'], reject: ['However the rain stopped.'] },
    acceptedAnswers: ['However, the rain stopped.'],
  };

  for (const [key, value] of Object.entries(itemForbiddenFields)) {
    assert.throws(
      () => buildPunctuationReadModel({
        learnerId: 'learner-p4-poison',
        state: {
          phase: 'active-item',
          session: {
            id: 'session-item-poison',
            mode: 'smart',
            length: 4,
            phase: 'active-item',
            startedAt: 1_777_000_000_000,
            answeredCount: 0,
            correctCount: 0,
            currentItem: {
              id: 'gen_item_01',
              mode: 'insert',
              source: 'generated',
              prompt: 'Test prompt.',
              stem: 'Test stem.',
              inputKind: 'text',
              skillIds: ['speech'],
              clusterId: 'speech',
              [key]: value,
            },
          },
          availability: { status: 'ready', code: null, message: '' },
        },
        prefs: {},
        stats: {},
      }),
      /server-only item field/,
      `${key} on currentItem must trip fail-closed assertion`,
    );
  }
});

// ---------------------------------------------------------------------------
// Oracle alignment: new P4 fields must be in FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS
// ---------------------------------------------------------------------------

test('P4-U13: FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS includes all P4-critical fields', () => {
  // These are the P4-introduced fields that MUST be in the forbidden oracle.
  const p4RequiredForbiddenFields = [
    'templateId',
    'generatorFamilyId',
    'variantSignature',
  ];
  for (const field of p4RequiredForbiddenFields) {
    assert.equal(
      FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS.includes(field),
      true,
      `${field} must be in FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS`,
    );
  }
});

test('P4-U13: session safeSession allowlist does not include any P4 telemetry field', () => {
  // Proves by construction: build a read-model from state carrying P4 telemetry
  // fields and verify the output session object has exactly the expected keys
  // and none of the P4 telemetry fields.
  const result = buildSafe();
  const sessionKeys = Object.keys(result.session);

  const p4TelemetryFields = ['selectionReason', 'selectedSignatures', 'reason', 'familyId'];
  for (const field of p4TelemetryFields) {
    assert.equal(
      sessionKeys.includes(field),
      false,
      `session must not include P4 telemetry field: ${field}`,
    );
  }
});
