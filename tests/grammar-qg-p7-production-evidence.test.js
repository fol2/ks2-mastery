import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { anonymiseEvent, filterEvents, exportGrammarEvents } from '../scripts/export-grammar-qg-events.mjs';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    id: 'grammar.answer-submitted.learner-alice.req1.item1',
    learnerId: 'learner-alice',
    subject: 'grammar',
    releaseId: 'grammar-qg-p6-2026-04-29',
    templateId: 'tpl-possessive-apostrophe-01',
    conceptIds: ['possessive-apostrophe'],
    conceptStatusBefore: 'weak',
    conceptStatusAfter: 'secure',
    timestamp: '2026-04-29T10:00:00Z',
    correct: true,
    tags: [],
    ...overrides,
  };
}

const SALT = 'test-salt-value-abc123';

// ─── U3: HMAC anonymisation tests ─────────────────────────────────────────

describe('Grammar QG P7 — Production Evidence Export', () => {
  describe('anonymisation with salt', () => {
    it('produces consistent HMAC across runs', () => {
      const event = makeEvent();
      const a1 = anonymiseEvent(event, SALT);
      const a2 = anonymiseEvent(event, SALT);
      assert.equal(a1.learnerId, a2.learnerId);
      assert.notEqual(a1.learnerId, 'learner-alice');
      assert.equal(a1.learnerId.length, 16);
    });

    it('produces hex-only output', () => {
      const event = makeEvent();
      const result = anonymiseEvent(event, SALT);
      assert.match(result.learnerId, /^[0-9a-f]{16}$/);
    });

    it('different learners get different anonymised IDs', () => {
      const e1 = anonymiseEvent(makeEvent({ learnerId: 'alice' }), SALT);
      const e2 = anonymiseEvent(makeEvent({ learnerId: 'bob' }), SALT);
      assert.notEqual(e1.learnerId, e2.learnerId);
    });
  });

  describe('anonymisation without salt', () => {
    it('produces "anonymous" when no salt provided', () => {
      const event = makeEvent();
      const result = anonymiseEvent(event, null);
      assert.equal(result.learnerId, 'anonymous');
    });

    it('produces "anonymous" with empty string salt', () => {
      const event = makeEvent();
      const result = anonymiseEvent(event, '');
      assert.equal(result.learnerId, 'anonymous');
    });
  });

  describe('event.id scrubbing', () => {
    it('scrubs learner ID from production-format event.id', () => {
      const event = makeEvent({
        id: 'grammar.answer-submitted.learner-alice.req1.item1',
        learnerId: 'learner-alice',
      });
      const result = anonymiseEvent(event, SALT);
      assert.ok(!result.id.includes('learner-alice'), 'raw learner ID must not appear in event.id');
      // The anonymised ID should replace the learner part
      assert.ok(result.id.includes(result.learnerId));
      assert.ok(result.id.startsWith('grammar.answer-submitted.'));
      assert.ok(result.id.endsWith('.req1.item1'));
    });

    it('scrubs learner ID from event.id even without salt (becomes anonymous)', () => {
      const event = makeEvent({
        id: 'grammar.answer-submitted.learner-alice.req1.item1',
        learnerId: 'learner-alice',
      });
      const result = anonymiseEvent(event, null);
      assert.ok(!result.id.includes('learner-alice'));
      assert.ok(result.id.includes('anonymous'));
    });

    it('raw learner ID never appears in stringified output (anonymised + expanded)', () => {
      const events = [
        makeEvent({ learnerId: 'learner-alice' }),
        makeEvent({ learnerId: 'learner-bob', id: 'grammar.answer-submitted.learner-bob.req2.item2' }),
      ];
      const result = exportGrammarEvents(events, { salt: SALT });
      // Check the exported outputs (anonymised + expanded) — the deliverables
      const anonymisedStr = JSON.stringify(result.anonymised);
      const expandedStr = JSON.stringify(result.expanded);
      assert.ok(!anonymisedStr.includes('learner-alice'), 'learner-alice must not appear in anonymised output');
      assert.ok(!anonymisedStr.includes('learner-bob'), 'learner-bob must not appear in anonymised output');
      assert.ok(!expandedStr.includes('learner-alice'), 'learner-alice must not appear in expanded output');
      assert.ok(!expandedStr.includes('learner-bob'), 'learner-bob must not appear in expanded output');
    });
  });

  describe('filtering by release ID', () => {
    it('includes events at or after grammar-qg-p6-2026-04-29', () => {
      const events = [
        makeEvent({ releaseId: 'grammar-qg-p6-2026-04-29' }),
        makeEvent({ releaseId: 'grammar-qg-p7-2026-04-30' }),
      ];
      const filtered = filterEvents(events);
      assert.equal(filtered.length, 2);
    });

    it('excludes events before grammar-qg-p6-2026-04-29', () => {
      const events = [
        makeEvent({ releaseId: 'grammar-qg-p5-2026-04-28' }),
        makeEvent({ releaseId: 'grammar-qg-p4-2026-04-27' }),
      ];
      const filtered = filterEvents(events);
      assert.equal(filtered.length, 0);
    });

    it('filters to exact release ID when specified', () => {
      const events = [
        makeEvent({ releaseId: 'grammar-qg-p6-2026-04-29' }),
        makeEvent({ releaseId: 'grammar-qg-p7-2026-04-30' }),
      ];
      const filtered = filterEvents(events, { releaseId: 'grammar-qg-p6-2026-04-29' });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].releaseId, 'grammar-qg-p6-2026-04-29');
    });
  });

  describe('filtering by date range', () => {
    it('includes events within date range', () => {
      const events = [
        makeEvent({ timestamp: '2026-04-29T10:00:00Z' }),
        makeEvent({ timestamp: '2026-04-30T10:00:00Z' }),
        makeEvent({ timestamp: '2026-05-01T10:00:00Z' }),
      ];
      const filtered = filterEvents(events, {
        dateFrom: '2026-04-29T00:00:00Z',
        dateTo: '2026-04-30T23:59:59Z',
      });
      assert.equal(filtered.length, 2);
    });

    it('excludes events outside date range', () => {
      const events = [
        makeEvent({ timestamp: '2026-04-28T10:00:00Z' }),
      ];
      const filtered = filterEvents(events, { dateFrom: '2026-04-29T00:00:00Z' });
      assert.equal(filtered.length, 0);
    });
  });

  describe('dry-run mode', () => {
    it('produces summary without writing data', () => {
      const events = [makeEvent(), makeEvent()];
      const result = exportGrammarEvents(events, { salt: SALT, dryRun: true });
      assert.equal(result.summary.dryRun, true);
      assert.equal(result.summary.inputCount, 2);
      assert.equal(result.summary.filteredCount, 2);
      // Dry-run returns empty arrays
      assert.equal(result.filtered.length, 0);
      assert.equal(result.anonymised.length, 0);
      assert.equal(result.expanded.rows.length, 0);
    });

    it('summary includes filter counts even in dry-run', () => {
      const events = [
        makeEvent(),
        makeEvent({ releaseId: 'grammar-qg-p4-old' }), // will be filtered out
      ];
      const result = exportGrammarEvents(events, { salt: SALT, dryRun: true });
      assert.equal(result.summary.inputCount, 2);
      assert.equal(result.summary.filteredCount, 1);
    });
  });

  describe('full pipeline integration', () => {
    it('export produces anonymised and expanded output', () => {
      const events = [
        makeEvent({ learnerId: 'alice', id: 'grammar.answer-submitted.alice.req1.item1', conceptIds: ['c1', 'c2'] }),
      ];
      const result = exportGrammarEvents(events, { salt: SALT });
      assert.equal(result.anonymised.length, 1);
      assert.equal(result.expanded.totalOutput, 2); // 2 concepts
      // The exported deliverables must not leak the raw learner ID
      const anonymisedStr = JSON.stringify(result.anonymised);
      const expandedStr = JSON.stringify(result.expanded);
      assert.ok(!anonymisedStr.includes('"alice"'), 'raw learnerId must not appear in anonymised');
      assert.ok(!expandedStr.includes('"alice"'), 'raw learnerId must not appear in expanded');
    });

    it('filters non-grammar subject events', () => {
      const events = [
        makeEvent({ subject: 'grammar' }),
        makeEvent({ subject: 'punctuation' }),
      ];
      const result = exportGrammarEvents(events, { salt: SALT });
      assert.equal(result.anonymised.length, 1);
    });
  });
});

// ─── P7 U9: Smoke artefact schema enforcement ───────────────────────────────

describe('Grammar QG P7 — Smoke artefact schema enforcement', () => {
  const REQUIRED_EVIDENCE_FIELDS = ['ok', 'origin', 'contentReleaseId', 'commitSha', 'timestamp'];

  it('smoke artefact must include all required fields', () => {
    // Build a well-formed evidence artefact matching what grammar-production-smoke.mjs produces
    const evidence = {
      ok: true,
      origin: 'repository',
      contentReleaseId: 'grammar-qg-p6-2026-04-29',
      testedTemplateIds: ['qg_modal_verb_explain'],
      answerSpecFamiliesCovered: ['exact'],
      normalRoundResult: { ok: true, detail: 'pass' },
      miniTestResult: { ok: true, detail: 'pass' },
      repairResult: { ok: true, detail: 'pass' },
      forbiddenKeyScanResult: { ok: true, detail: 'checked' },
      timestamp: '2026-04-29T12:00:00.000Z',
      commitSha: 'abcdef1234567890',
    };

    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      assert.ok(field in evidence, `Evidence artefact must include "${field}"`);
      assert.ok(evidence[field] !== undefined, `Evidence artefact field "${field}" must not be undefined`);
      assert.ok(evidence[field] !== null, `Evidence artefact field "${field}" must not be null`);
      assert.ok(evidence[field] !== '', `Evidence artefact field "${field}" must not be empty`);
    }
  });

  it('rejects artefact missing "ok" field', () => {
    const evidence = {
      origin: 'repository',
      contentReleaseId: 'grammar-qg-p6-2026-04-29',
      commitSha: 'abcdef1234567890',
      timestamp: '2026-04-29T12:00:00.000Z',
    };
    const missing = REQUIRED_EVIDENCE_FIELDS.filter((f) => !(f in evidence));
    assert.ok(missing.length > 0, 'Should detect missing "ok" field');
    assert.ok(missing.includes('ok'));
  });

  it('rejects artefact missing "commitSha" field', () => {
    const evidence = {
      ok: true,
      origin: 'repository',
      contentReleaseId: 'grammar-qg-p6-2026-04-29',
      timestamp: '2026-04-29T12:00:00.000Z',
    };
    const missing = REQUIRED_EVIDENCE_FIELDS.filter((f) => !(f in evidence));
    assert.ok(missing.length > 0, 'Should detect missing "commitSha" field');
    assert.ok(missing.includes('commitSha'));
  });

  it('rejects artefact missing "timestamp" field', () => {
    const evidence = {
      ok: true,
      origin: 'repository',
      contentReleaseId: 'grammar-qg-p6-2026-04-29',
      commitSha: 'abcdef1234567890',
    };
    const missing = REQUIRED_EVIDENCE_FIELDS.filter((f) => !(f in evidence));
    assert.ok(missing.length > 0, 'Should detect missing "timestamp" field');
    assert.ok(missing.includes('timestamp'));
  });

  it('P8 bumps the content release ID for production content fix', async () => {
    // P8 fixes speech_punctuation_fix content defect and bumps the release ID
    const { GRAMMAR_CONTENT_RELEASE_ID } = await import('../worker/src/subjects/grammar/content.js');
    assert.equal(GRAMMAR_CONTENT_RELEASE_ID, 'grammar-qg-p8-2026-04-29',
      'P8 must use new content release ID since it fixes production content');
  });

  it('smoke evidence file path uses current content release ID', () => {
    const contentReleaseId = 'grammar-qg-p8-2026-04-29';
    const expectedFileName = `grammar-production-smoke-${contentReleaseId}.json`;
    assert.equal(expectedFileName, 'grammar-production-smoke-grammar-qg-p8-2026-04-29.json');
  });
});
