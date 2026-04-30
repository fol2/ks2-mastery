import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  validateMetaSchema,
  evaluateAuthorityGate,
  validateDecisionSchema,
  loadReviewerDecisions,
} from '../shared/punctuation/reviewer-decisions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures/punctuation-reviewer-decisions.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

// ─── v3 schema validation ────────────────────────────────────────────────────

test('v3 schema meta passes validation', () => {
  const result = validateMetaSchema(fixture._meta);
  assert.equal(result.valid, true, `v3 meta validation failed: ${result.errors.join('; ')}`);
});

test('v3 meta has ai_pre_review.status === "complete"', () => {
  assert.equal(fixture._meta.ai_pre_review.status, 'complete');
});

test('v3 fixture data passes decision schema validation', () => {
  const result = validateDecisionSchema(fixture);
  assert.equal(result.valid, true, `Decision schema validation failed: ${result.errors.join('; ')}`);
});

// ─── Authority gate evaluation ───────────────────────────────────────────────

test('ai_pre_review.status === "complete" gate check passes', () => {
  const result = evaluateAuthorityGate(fixture._meta);
  assert.equal(result.pass, true, `Authority gate failed: ${result.blockers.join('; ')}`);
});

test('human_acceptance.status: "complete" without reviewer fails validation', () => {
  const badMeta = {
    ...fixture._meta,
    human_acceptance: {
      status: 'complete',
      reviewer: null,
      role: 'teacher',
      reviewedAt: '2026-04-30',
    },
  };
  const result = validateMetaSchema(badMeta);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('reviewer')),
    `Expected error about missing reviewer, got: ${result.errors.join('; ')}`,
  );
});

test('production_certification "certified" while human_acceptance "not_started" fails gate', () => {
  const badMeta = {
    ...fixture._meta,
    production_certification: { status: 'certified' },
    human_acceptance: { status: 'not_started', reviewer: null, role: null, reviewedAt: null },
  };
  const result = evaluateAuthorityGate(badMeta);
  assert.equal(result.pass, false);
  assert.ok(
    result.blockers.some((b) => b.includes('certified') && b.includes('human_acceptance')),
    `Expected blocker about certification without human acceptance, got: ${result.blockers.join('; ')}`,
  );
});

// ─── Backward compatibility ──────────────────────────────────────────────────

test('v2 fixture still loads and passes validation', () => {
  const v2Data = {
    _meta: {
      generated: '2026-04-29',
      schema_version: 2,
      items_reviewed: 192,
      review_method: 'ai-multi-perspective (teacher/engineer/parent)',
    },
    decisions: {},
    itemDecisions: [
      {
        itemId: 'se_insert_question',
        decision: 'approved',
        reviewer: 'ai-multi-perspective-review',
        reviewedAt: '2026-04-29',
        rationale: 'Test rationale.',
      },
    ],
    clusterDecisions: [],
  };

  // loadReviewerDecisions should succeed with v2 data
  const loaded = loadReviewerDecisions(v2Data);
  assert.equal(loaded.valid, true, `v2 load failed: ${loaded.errors.join('; ')}`);

  // v2 meta passes meta validation
  const metaResult = validateMetaSchema(v2Data._meta);
  assert.equal(metaResult.valid, true, `v2 meta validation failed: ${metaResult.errors.join('; ')}`);

  // v2 authority gate passes (no authority fields required for v2)
  const gateResult = evaluateAuthorityGate(v2Data._meta);
  assert.equal(gateResult.pass, true, `v2 authority gate failed: ${gateResult.blockers.join('; ')}`);
});

test('v3 meta without ai_pre_review fails meta validation', () => {
  const badMeta = {
    generated: '2026-04-30',
    schema_version: 3,
    items_reviewed: 192,
    review_method: 'ai-multi-perspective',
  };
  const result = validateMetaSchema(badMeta);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('ai_pre_review')),
    `Expected error about missing ai_pre_review, got: ${result.errors.join('; ')}`,
  );
});

test('v3 meta without human_acceptance fails meta validation', () => {
  const badMeta = {
    generated: '2026-04-30',
    schema_version: 3,
    items_reviewed: 192,
    review_method: 'ai-multi-perspective',
    ai_pre_review: { status: 'complete', method: 'test', date: '2026-04-30' },
  };
  const result = validateMetaSchema(badMeta);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('human_acceptance')),
    `Expected error about missing human_acceptance, got: ${result.errors.join('; ')}`,
  );
});

test('v3 meta without production_certification fails meta validation', () => {
  const badMeta = {
    generated: '2026-04-30',
    schema_version: 3,
    items_reviewed: 192,
    review_method: 'ai-multi-perspective',
    ai_pre_review: { status: 'complete', method: 'test', date: '2026-04-30' },
    human_acceptance: { status: 'not_started', reviewer: null, role: null, reviewedAt: null },
  };
  const result = validateMetaSchema(badMeta);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('production_certification')),
    `Expected error about missing production_certification, got: ${result.errors.join('; ')}`,
  );
});
