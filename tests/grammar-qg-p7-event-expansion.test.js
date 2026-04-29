import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { expandEvent, expandEvents } from '../scripts/grammar-qg-expand-events.mjs';

function buildEvent(overrides = {}) {
  return {
    id: 'grammar.answer.learner1.req1.item1',
    type: 'grammar.answer-submitted',
    templateId: 'tpl_modal_verb',
    conceptIds: ['concept_modal_verb'],
    timestamp: '2026-04-29T10:00:00.000Z',
    createdAt: 1745920800000,
    tags: [],
    mode: 'smart',
    correct: true,
    score: 1,
    maxScore: 1,
    conceptStatusBefore: { concept_modal_verb: 'developing' },
    conceptStatusAfter: { concept_modal_verb: 'secured' },
    result: { correct: true, manualReviewOnly: false },
    ...overrides,
  };
}

describe('P7 U2: Event Expansion — expandEvent', () => {
  it('single-concept event -> 1 row', () => {
    const event = buildEvent({ conceptIds: ['concept_a'] });
    const rows = expandEvent(event);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].conceptId, 'concept_a');
    assert.equal(rows[0].rowId, 'grammar.answer.learner1.req1.item1:concept_a');
  });

  it('multi-concept event (3 concepts) -> 3 rows', () => {
    const event = buildEvent({
      conceptIds: ['concept_a', 'concept_b', 'concept_c'],
      conceptStatusBefore: { concept_a: 'new', concept_b: 'developing', concept_c: 'secured' },
      conceptStatusAfter: { concept_a: 'developing', concept_b: 'secured', concept_c: 'secured' },
    });
    const rows = expandEvent(event);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].conceptId, 'concept_a');
    assert.equal(rows[0].conceptStatusBefore, 'new');
    assert.equal(rows[0].conceptStatusAfter, 'developing');
    assert.equal(rows[1].conceptId, 'concept_b');
    assert.equal(rows[1].conceptStatusBefore, 'developing');
    assert.equal(rows[1].conceptStatusAfter, 'secured');
    assert.equal(rows[2].conceptId, 'concept_c');
    assert.equal(rows[2].conceptStatusBefore, 'secured');
    assert.equal(rows[2].conceptStatusAfter, 'secured');
  });

  it('mixed-transfer tagged -> isMixedTransfer: true', () => {
    const event = buildEvent({ tags: ['mixed-transfer', 'other-tag'] });
    const rows = expandEvent(event);
    assert.equal(rows[0].isMixedTransfer, true);
    assert.equal(rows[0].isExplanation, false);
  });

  it('explanation tagged -> isExplanation: true', () => {
    const event = buildEvent({ tags: ['explanation'] });
    const rows = expandEvent(event);
    assert.equal(rows[0].isExplanation, true);
    assert.equal(rows[0].isMixedTransfer, false);
  });

  it('surgery mode -> isSurgery: true', () => {
    const event = buildEvent({ mode: 'surgery' });
    const rows = expandEvent(event);
    assert.equal(rows[0].isSurgery, true);
  });

  it('manualReviewOnly result -> isManualReviewOnly: true', () => {
    const event = buildEvent({ result: { correct: false, manualReviewOnly: true } });
    const rows = expandEvent(event);
    assert.equal(rows[0].isManualReviewOnly, true);
  });

  it('empty conceptIds -> 0 rows (malformed)', () => {
    const event = buildEvent({ conceptIds: [] });
    const rows = expandEvent(event);
    assert.equal(rows.length, 0);
  });

  it('conceptStatusBefore as string (legacy) -> correct extraction', () => {
    const event = buildEvent({
      conceptIds: ['concept_x', 'concept_y'],
      conceptStatusBefore: 'developing',
      conceptStatusAfter: 'secured',
    });
    const rows = expandEvent(event);
    assert.equal(rows[0].conceptStatusBefore, 'developing');
    assert.equal(rows[1].conceptStatusBefore, 'developing');
    assert.equal(rows[0].conceptStatusAfter, 'secured');
  });

  it('conceptStatusBefore as object (P6) -> per-concept extraction', () => {
    const event = buildEvent({
      conceptIds: ['concept_x', 'concept_y'],
      conceptStatusBefore: { concept_x: 'new', concept_y: 'secured' },
      conceptStatusAfter: { concept_x: 'developing', concept_y: 'secured' },
    });
    const rows = expandEvent(event);
    assert.equal(rows[0].conceptStatusBefore, 'new');
    assert.equal(rows[1].conceptStatusBefore, 'secured');
    assert.equal(rows[0].conceptStatusAfter, 'developing');
    assert.equal(rows[1].conceptStatusAfter, 'secured');
  });

  it('rowId is deterministic', () => {
    const event = buildEvent({ id: 'evt-123', conceptIds: ['concept_a'] });
    const rows1 = expandEvent(event);
    const rows2 = expandEvent(event);
    assert.equal(rows1[0].rowId, rows2[0].rowId);
    assert.equal(rows1[0].rowId, 'evt-123:concept_a');
  });
});

describe('P7 U2: Event Expansion — expandEvents (batch)', () => {
  it('malformed (no templateId) -> skipped', () => {
    const events = [
      buildEvent(),
      { conceptIds: ['a'], timestamp: '2026-04-29T10:00:00.000Z' }, // no templateId
    ];
    const { rows, totalInput, totalOutput, malformedCount } = expandEvents(events);
    assert.equal(totalInput, 2);
    assert.equal(totalOutput, 1);
    assert.equal(malformedCount, 1);
    assert.equal(rows.length, 1);
  });

  it('malformed (no createdAt/timestamp) -> skipped', () => {
    const events = [
      { templateId: 'tpl_a', conceptIds: ['a'] }, // no timestamp
    ];
    const { rows, malformedCount } = expandEvents(events);
    assert.equal(rows.length, 0);
    assert.equal(malformedCount, 1);
  });

  it('malformed (empty conceptIds) -> skipped and counted', () => {
    const events = [
      buildEvent({ conceptIds: [] }),
    ];
    const { rows, malformedCount } = expandEvents(events);
    assert.equal(rows.length, 0);
    assert.equal(malformedCount, 1);
  });

  it('idempotency: same input -> same output', () => {
    const events = [
      buildEvent({ conceptIds: ['a', 'b'] }),
      buildEvent({ id: 'evt2', conceptIds: ['c'] }),
    ];
    const result1 = expandEvents(events);
    const result2 = expandEvents(events);
    assert.deepEqual(result1.rows, result2.rows);
    assert.equal(result1.totalInput, result2.totalInput);
    assert.equal(result1.totalOutput, result2.totalOutput);
    assert.equal(result1.malformedCount, result2.malformedCount);
  });
});
