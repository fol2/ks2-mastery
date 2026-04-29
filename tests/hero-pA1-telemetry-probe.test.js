import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  probeHeroTelemetry,
  stripPrivacyFields,
  PRIVACY_STRIP_FIELDS,
} from '../worker/src/hero/telemetry-probe.js';

// ── Mock D1 helpers ─────────────────────────────────────────────────

function createMockDb(rows = []) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              return { results: rows };
            },
          };
        },
      };
    },
  };
}

function createThrowingDb(error = new Error('table not found')) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              throw error;
            },
          };
        },
      };
    },
  };
}

// ── probeHeroTelemetry ──────────────────────────────────────────────

describe('probeHeroTelemetry', () => {
  it('returns structured array from mock D1 data', async () => {
    const mockRows = [
      {
        id: 'hero-evt-req1-hero-task-completed',
        learner_id: 'learner-1',
        subject_id: 'grammar',
        system_id: 'hero-mode',
        event_type: 'hero.task.completed',
        event_json: JSON.stringify({ questId: 'q1', taskId: 't1', subjectId: 'grammar' }),
        created_at: 1714400000000,
      },
      {
        id: 'hero-evt-req2-hero-daily-completed',
        learner_id: 'learner-1',
        subject_id: null,
        system_id: 'hero-mode',
        event_type: 'hero.daily.completed',
        event_json: JSON.stringify({ questId: 'q1', dateKey: '2026-04-29' }),
        created_at: 1714400001000,
      },
    ];

    const db = createMockDb(mockRows);
    const result = await probeHeroTelemetry({ db, limit: 20 });

    assert.equal(result.count, 2);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].id, 'hero-evt-req1-hero-task-completed');
    assert.equal(result.events[0].eventType, 'hero.task.completed');
    assert.equal(result.events[0].systemId, 'hero-mode');
    assert.deepEqual(result.events[0].data, { questId: 'q1', taskId: 't1', subjectId: 'grammar' });
    assert.equal(typeof result.probedAt, 'string');
  });

  it('strips privacy fields from event data', async () => {
    const mockRows = [
      {
        id: 'hero-evt-req3-hero-task-completed',
        learner_id: 'learner-2',
        subject_id: 'spelling',
        system_id: 'hero-mode',
        event_type: 'hero.task.completed',
        event_json: JSON.stringify({
          questId: 'q2',
          rawAnswer: 'secret child answer',
          rawPrompt: 'secret prompt',
          childFreeText: 'free text from child',
          childInput: 'input from child',
          answerText: 'answer text',
          rawText: 'raw text content',
          childContent: 'child content data',
          subjectId: 'spelling',
        }),
        created_at: 1714400002000,
      },
    ];

    const db = createMockDb(mockRows);
    const result = await probeHeroTelemetry({ db, limit: 20 });

    assert.equal(result.count, 1);
    const eventData = result.events[0].data;

    // Privacy fields must be stripped
    for (const field of PRIVACY_STRIP_FIELDS) {
      assert.equal(field in eventData, false, `field "${field}" should be stripped`);
    }

    // Non-privacy fields must remain
    assert.equal(eventData.questId, 'q2');
    assert.equal(eventData.subjectId, 'spelling');
  });

  it('returns empty result when db is null/undefined', async () => {
    const result = await probeHeroTelemetry({ db: null });

    assert.deepEqual(result.events, []);
    assert.equal(result.count, 0);
    assert.equal(typeof result.probedAt, 'string');
  });

  it('returns empty result when db is not provided', async () => {
    const result = await probeHeroTelemetry({});

    assert.deepEqual(result.events, []);
    assert.equal(result.count, 0);
    assert.equal(typeof result.probedAt, 'string');
  });

  it('returns empty result when db query throws (table missing)', async () => {
    const db = createThrowingDb(new Error('no such table: event_log'));
    const result = await probeHeroTelemetry({ db });

    assert.deepEqual(result.events, []);
    assert.equal(result.count, 0);
    assert.equal(typeof result.probedAt, 'string');
  });

  it('respects limit parameter (returns max N events)', async () => {
    const mockRows = Array.from({ length: 5 }, (_, i) => ({
      id: `hero-evt-req${i}-hero-task-completed`,
      learner_id: `learner-${i}`,
      subject_id: 'grammar',
      system_id: 'hero-mode',
      event_type: 'hero.task.completed',
      event_json: JSON.stringify({ questId: `q${i}` }),
      created_at: 1714400000000 + i * 1000,
    }));

    // The mock returns all rows, but the function passes limit to the query.
    // We simulate that the DB already respected the limit by returning 5 rows.
    const db = createMockDb(mockRows);
    const result = await probeHeroTelemetry({ db, limit: 5 });

    assert.equal(result.count, 5);
    assert.equal(result.events.length, 5);
  });

  it('caps limit at 100', async () => {
    // Verify that an absurd limit is capped — the DB must receive 100 as
    // the bound parameter, not the raw 9999 input.
    const mockRows = [
      {
        id: 'hero-evt-single',
        learner_id: 'learner-x',
        subject_id: null,
        system_id: 'hero-mode',
        event_type: 'hero.daily.completed',
        event_json: JSON.stringify({ dateKey: '2026-04-29' }),
        created_at: 1714400000000,
      },
    ];
    let capturedBindArg;
    const db = {
      prepare() {
        return {
          bind(...args) {
            capturedBindArg = args[0];
            return {
              async all() {
                return { results: mockRows };
              },
            };
          },
        };
      },
    };
    const result = await probeHeroTelemetry({ db, limit: 9999 });

    // Function still works — does not blow up with high limit
    assert.equal(result.count, 1);
    assert.equal(typeof result.probedAt, 'string');
    // The bound parameter must be capped at 100, not the raw 9999
    assert.equal(capturedBindArg, 100, 'bind() must receive capped limit of 100');
  });

  it('defaults limit to 20 when not provided', async () => {
    const db = createMockDb([]);
    const result = await probeHeroTelemetry({ db });

    assert.equal(result.count, 0);
    assert.equal(typeof result.probedAt, 'string');
  });

  it('probedAt is a valid ISO 8601 timestamp', async () => {
    const db = createMockDb([]);
    const result = await probeHeroTelemetry({ db });

    // ISO 8601: must parse to a valid Date and round-trip
    const parsed = new Date(result.probedAt);
    assert.ok(!isNaN(parsed.getTime()), 'probedAt must parse to a valid Date');
    assert.equal(result.probedAt, parsed.toISOString());
  });

  it('handles malformed event_json gracefully', async () => {
    const mockRows = [
      {
        id: 'hero-evt-bad-json',
        learner_id: 'learner-3',
        subject_id: null,
        system_id: 'hero-mode',
        event_type: 'hero.task.completed',
        event_json: 'not-valid-json{{{',
        created_at: 1714400003000,
      },
    ];

    const db = createMockDb(mockRows);
    const result = await probeHeroTelemetry({ db });

    assert.equal(result.count, 1);
    assert.equal(result.events[0].data, null);
    assert.equal(result.events[0].eventType, 'hero.task.completed');
  });

  it('handles null event_json gracefully', async () => {
    const mockRows = [
      {
        id: 'hero-evt-null-json',
        learner_id: 'learner-4',
        subject_id: 'punctuation',
        system_id: 'hero-mode',
        event_type: 'hero.daily.completed',
        event_json: null,
        created_at: 1714400004000,
      },
    ];

    const db = createMockDb(mockRows);
    const result = await probeHeroTelemetry({ db });

    assert.equal(result.count, 1);
    assert.equal(result.events[0].data, null);
  });
});

// ── stripPrivacyFields ──────────────────────────────────────────────

describe('stripPrivacyFields', () => {
  it('strips all defined privacy fields from flat object', () => {
    const input = {
      questId: 'q1',
      rawAnswer: 'secret',
      rawPrompt: 'prompt',
      childFreeText: 'text',
      childInput: 'input',
      answerText: 'answer',
      rawText: 'raw',
      childContent: 'content',
      subjectId: 'grammar',
    };

    const result = stripPrivacyFields(input);
    assert.equal(result.questId, 'q1');
    assert.equal(result.subjectId, 'grammar');
    for (const field of PRIVACY_STRIP_FIELDS) {
      assert.equal(field in result, false);
    }
  });

  it('strips privacy fields from nested objects recursively', () => {
    const input = {
      data: {
        rawAnswer: 'nested secret',
        taskId: 't1',
        nested: {
          childFreeText: 'deeply nested',
          value: 42,
        },
      },
    };

    const result = stripPrivacyFields(input);
    assert.equal(result.data.taskId, 't1');
    assert.equal('rawAnswer' in result.data, false);
    assert.equal(result.data.nested.value, 42);
    assert.equal('childFreeText' in result.data.nested, false);
  });

  it('handles arrays correctly', () => {
    const input = [
      { rawAnswer: 'a', questId: 'q1' },
      { childInput: 'b', taskId: 't1' },
    ];

    const result = stripPrivacyFields(input);
    assert.ok(Array.isArray(result));
    assert.equal(result[0].questId, 'q1');
    assert.equal('rawAnswer' in result[0], false);
    assert.equal(result[1].taskId, 't1');
    assert.equal('childInput' in result[1], false);
  });

  it('returns primitives unchanged', () => {
    assert.equal(stripPrivacyFields(null), null);
    assert.equal(stripPrivacyFields(undefined), undefined);
    assert.equal(stripPrivacyFields(42), 42);
    assert.equal(stripPrivacyFields('hello'), 'hello');
    assert.equal(stripPrivacyFields(true), true);
  });

  it('does not mutate the original object', () => {
    const input = { rawAnswer: 'secret', questId: 'q1' };
    const result = stripPrivacyFields(input);

    assert.equal(input.rawAnswer, 'secret'); // original untouched
    assert.equal('rawAnswer' in result, false);
  });
});
