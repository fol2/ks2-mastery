/**
 * Grammar QG P8 — Content Review Register Validation
 *
 * Ensures the review register covers all 18 grammar concepts with
 * valid schema entries, no duplicates, and no pending reviews.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReviewRegister } from '../scripts/generate-grammar-qg-review-register.mjs';
import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CONCEPT_IDS = [
  'sentence_functions',
  'word_classes',
  'noun_phrases',
  'adverbials',
  'clauses',
  'relative_clauses',
  'tense_aspect',
  'standard_english',
  'pronouns_cohesion',
  'formality',
  'active_passive',
  'subject_object',
  'modal_verbs',
  'parenthesis_commas',
  'speech_punctuation',
  'apostrophes_possession',
  'boundary_punctuation',
  'hyphen_ambiguity',
];

const VALID_DECISIONS = ['accepted', 'rejected', 'watchlist'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// ---------------------------------------------------------------------------
// Build register once for all tests
// ---------------------------------------------------------------------------

const register = buildReviewRegister();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Grammar QG P8 Content Review Register', () => {
  it('register covers all 18 concepts', () => {
    const conceptsInRegister = new Set(register.map((e) => e.conceptId));
    for (const conceptId of ALL_CONCEPT_IDS) {
      assert.ok(
        conceptsInRegister.has(conceptId),
        `Missing concept in register: ${conceptId}`
      );
    }
    assert.equal(conceptsInRegister.size, 18, 'Expected exactly 18 unique concepts');
  });

  it('no concept has pending review decision', () => {
    const pending = register.filter((e) => e.reviewerDecision === 'pending');
    assert.equal(
      pending.length,
      0,
      `Found ${pending.length} entries with pending decision: ${pending.map((e) => e.templateId).join(', ')}`
    );
  });

  it('rejected items have severity and action', () => {
    const rejected = register.filter((e) => e.reviewerDecision === 'rejected');
    for (const entry of rejected) {
      assert.ok(
        entry.severity && /^S[0-3]$/.test(entry.severity),
        `Rejected entry ${entry.templateId} must have severity S0-S3, got: ${entry.severity}`
      );
      assert.ok(
        entry.notes && entry.notes.trim().length > 0,
        `Rejected entry ${entry.templateId} must have non-empty notes`
      );
    }
  });

  it('every template with feedbackLong has feedbackReviewed true', () => {
    const registerMap = new Map(register.map((e) => [e.templateId, e]));

    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      // Generate a question to check for feedbackLong on its answerSpec
      const question = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!question) continue;
      if (!question.answerSpec?.feedbackLong) continue;

      const entry = registerMap.get(template.id);
      assert.ok(entry, `Template ${template.id} has feedbackLong but no register entry`);
      assert.equal(
        entry.feedbackReviewed,
        true,
        `Template ${template.id} has feedbackLong but feedbackReviewed is not true`
      );
    }
  });

  it('register entries have valid schema', () => {
    for (const entry of register) {
      assert.equal(typeof entry.conceptId, 'string', `conceptId must be string`);
      assert.ok(entry.conceptId.length > 0, `conceptId must be non-empty`);

      assert.equal(typeof entry.templateId, 'string', `templateId must be string`);
      assert.ok(entry.templateId.length > 0, `templateId must be non-empty`);

      assert.ok(
        VALID_DECISIONS.includes(entry.reviewerDecision),
        `reviewerDecision must be one of ${VALID_DECISIONS.join('/')}, got: ${entry.reviewerDecision}`
      );

      assert.equal(
        typeof entry.feedbackReviewed,
        'boolean',
        `feedbackReviewed must be boolean`
      );

      assert.ok(
        ISO_DATE_RE.test(entry.reviewedAt),
        `reviewedAt must be ISO date string, got: ${entry.reviewedAt}`
      );
    }
  });

  it('register has no duplicate templateId entries', () => {
    const seen = new Set();
    const duplicates = [];
    for (const entry of register) {
      if (seen.has(entry.templateId)) {
        duplicates.push(entry.templateId);
      }
      seen.add(entry.templateId);
    }
    assert.equal(
      duplicates.length,
      0,
      `Duplicate templateIds found: ${duplicates.join(', ')}`
    );
  });
});
