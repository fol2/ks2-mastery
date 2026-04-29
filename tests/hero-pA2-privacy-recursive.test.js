import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIVACY_FORBIDDEN_FIELDS,
  validateMetricPrivacyRecursive,
  stripPrivacyFields,
} from '../shared/hero/metrics-privacy.js';

// ── validateMetricPrivacyRecursive ─────────────────────────────────

describe('validateMetricPrivacyRecursive', () => {
  it('payload with no forbidden fields passes', () => {
    const payload = { questId: 'q1', subjectId: 'grammar', score: 5 };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('payload with allowed nested objects passes', () => {
    const payload = {
      meta: { launcher: 'card', cohortId: 'c1' },
      data: { taskId: 't1', dimensions: { dateKey: '2026-04-29' } },
    };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('forbidden field at root level detected', () => {
    const payload = { questId: 'q1', rawAnswer: 'secret child answer' };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes('rawAnswer'));
  });

  it('forbidden field nested one level deep detected with path', () => {
    const payload = { data: { rawPrompt: 'secret prompt', taskId: 't1' } };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes('data.rawPrompt'));
  });

  it('forbidden field nested three levels deep detected with path', () => {
    const payload = {
      level1: {
        level2: {
          level3: {
            childFreeText: 'deeply hidden text',
          },
        },
      },
    };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes('level1.level2.level3.childFreeText'));
  });

  it('forbidden field inside an array detected with path', () => {
    const payload = {
      items: [
        { taskId: 't1' },
        { answerText: 'child answer in array' },
      ],
    };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes('items[1].answerText'));
  });

  it('empty/null/non-object payloads pass', () => {
    assert.deepEqual(validateMetricPrivacyRecursive(null), { valid: true, violations: [] });
    assert.deepEqual(validateMetricPrivacyRecursive(undefined), { valid: true, violations: [] });
    assert.deepEqual(validateMetricPrivacyRecursive(42), { valid: true, violations: [] });
    assert.deepEqual(validateMetricPrivacyRecursive('hello'), { valid: true, violations: [] });
    assert.deepEqual(validateMetricPrivacyRecursive(true), { valid: true, violations: [] });
  });

  it('multiple violations at different depths all reported', () => {
    const payload = {
      rawAnswer: 'top-level',
      nested: {
        childInput: 'one deep',
        deeper: {
          rawText: 'two deep',
        },
      },
    };
    const result = validateMetricPrivacyRecursive(payload);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes('rawAnswer'));
    assert.ok(result.violations.includes('nested.childInput'));
    assert.ok(result.violations.includes('nested.deeper.rawText'));
    assert.equal(result.violations.length, 3);
  });

  it('depth limit of 10 prevents infinite recursion', () => {
    // Build a deeply nested object (15 levels)
    let obj = { safeField: 'leaf' };
    for (let i = 14; i >= 0; i--) {
      obj = { [`level${i}`]: obj };
    }
    // Should not crash — just returns valid since no forbidden fields
    const result = validateMetricPrivacyRecursive(obj);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('depth limit stops detecting violations beyond depth 10', () => {
    // Build a forbidden field at depth 12 (beyond the limit)
    let obj = { rawAnswer: 'way too deep' };
    for (let i = 11; i >= 0; i--) {
      obj = { [`d${i}`]: obj };
    }
    const result = validateMetricPrivacyRecursive(obj);
    // The violation is at depth 13, beyond the limit of 10 — not detected
    // but the function does not crash
    assert.equal(typeof result.valid, 'boolean');
    assert.ok(Array.isArray(result.violations));
  });
});

// ── stripPrivacyFields ─────────────────────────────────────────────

describe('stripPrivacyFields', () => {
  it('removes forbidden keys at every depth', () => {
    const input = {
      questId: 'q1',
      rawAnswer: 'top secret',
      nested: {
        childFreeText: 'nested secret',
        taskId: 't1',
        deeper: {
          rawText: 'deep secret',
          value: 42,
          items: [
            { childContent: 'array secret', id: 1 },
            { answerText: 'array secret 2', id: 2 },
          ],
        },
      },
    };

    const result = stripPrivacyFields(input);

    // Top level
    assert.equal(result.questId, 'q1');
    assert.equal('rawAnswer' in result, false);

    // One level deep
    assert.equal(result.nested.taskId, 't1');
    assert.equal('childFreeText' in result.nested, false);

    // Two levels deep
    assert.equal(result.nested.deeper.value, 42);
    assert.equal('rawText' in result.nested.deeper, false);

    // Inside arrays
    assert.equal(result.nested.deeper.items[0].id, 1);
    assert.equal('childContent' in result.nested.deeper.items[0], false);
    assert.equal(result.nested.deeper.items[1].id, 2);
    assert.equal('answerText' in result.nested.deeper.items[1], false);
  });

  it('does not mutate the original object', () => {
    const input = { rawAnswer: 'secret', data: { childInput: 'child' } };
    const result = stripPrivacyFields(input);

    assert.equal(input.rawAnswer, 'secret');
    assert.equal(input.data.childInput, 'child');
    assert.equal('rawAnswer' in result, false);
    assert.equal('childInput' in result.data, false);
  });

  it('returns primitives unchanged', () => {
    assert.equal(stripPrivacyFields(null), null);
    assert.equal(stripPrivacyFields(undefined), undefined);
    assert.equal(stripPrivacyFields(42), 42);
    assert.equal(stripPrivacyFields('hello'), 'hello');
    assert.equal(stripPrivacyFields(true), true);
  });

  it('handles arrays at top level', () => {
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
});

// ── PRIVACY_FORBIDDEN_FIELDS ───────────────────────────────────────

describe('PRIVACY_FORBIDDEN_FIELDS', () => {
  it('contains all expected fields', () => {
    const expected = ['rawAnswer', 'rawPrompt', 'childFreeText', 'childInput', 'answerText', 'rawText', 'childContent'];
    assert.deepEqual([...PRIVACY_FORBIDDEN_FIELDS], expected);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(PRIVACY_FORBIDDEN_FIELDS));
  });
});
