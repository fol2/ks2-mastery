/**
 * Grammar QG P9 U5 — Real-template explanation analytics repair
 *
 * Validates that expandEvent correctly detects explanation events using the
 * real tag/questionType conventions found in GRAMMAR_TEMPLATE_METADATA:
 *   - tags: ['explain']       (primary, used by all P1+ templates)
 *   - questionType: 'explain' (used alongside the tag)
 *   - tags: ['explanation']   (legacy, backwards compat)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expandEvent, expandEvents } from '../scripts/grammar-qg-expand-events.mjs';

// ─── Fixture factory ────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    id: 'evt-001',
    templateId: 'explain_reason_choice',
    conceptIds: ['adverbials'],
    timestamp: '2026-04-29T10:00:00Z',
    tags: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('P9-U5: expandEvent — real-template explanation detection', () => {
  it('event with tags: ["explain"] marks isExplanation: true', () => {
    const rows = expandEvent(makeEvent({ tags: ['explain'] }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isExplanation, true);
  });

  it('event with questionType: "explain" marks isExplanation: true', () => {
    const rows = expandEvent(makeEvent({ questionType: 'explain' }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isExplanation, true);
  });

  it('event with tags: ["explanation"] still works (backwards compat)', () => {
    const rows = expandEvent(makeEvent({ tags: ['explanation'] }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isExplanation, true);
  });

  it('event with tags: ["explain", "mixed-transfer"] sets both flags', () => {
    const rows = expandEvent(makeEvent({ tags: ['explain', 'mixed-transfer'] }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isExplanation, true);
    assert.equal(rows[0].isMixedTransfer, true);
  });

  it('event without explanation tags has isExplanation: false', () => {
    const rows = expandEvent(makeEvent({ tags: ['qg-p1'] }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isExplanation, false);
  });

  it('old implementation (only "explanation") would miss "explain" tag events', () => {
    // Simulate old logic: only checks tags.includes('explanation')
    const event = makeEvent({ tags: ['explain'], questionType: 'explain' });
    const oldLogic = event.tags.includes('explanation');
    assert.equal(oldLogic, false, 'old logic fails to detect real explain tags');

    // New logic catches it
    const rows = expandEvent(event);
    assert.equal(rows[0].isExplanation, true, 'new logic detects explain correctly');
  });

  it('multi-concept event expands all rows with correct isExplanation', () => {
    const event = makeEvent({
      conceptIds: ['adverbials', 'standard_english', 'modal_verbs'],
      tags: ['explain'],
      questionType: 'explain',
    });
    const rows = expandEvent(event);
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.isExplanation, true);
    }
  });

  it('expandEvents batch preserves explanation detection across all events', () => {
    const events = [
      makeEvent({ id: 'e1', tags: ['explain'] }),
      makeEvent({ id: 'e2', questionType: 'explain' }),
      makeEvent({ id: 'e3', tags: ['qg-p1'] }),
    ];
    const { rows, totalInput, totalOutput } = expandEvents(events);
    assert.equal(totalInput, 3);
    assert.equal(totalOutput, 3);
    assert.equal(rows[0].isExplanation, true);
    assert.equal(rows[1].isExplanation, true);
    assert.equal(rows[2].isExplanation, false);
  });
});
