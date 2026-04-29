/**
 * Grammar QG P9 — Adult Review Evidence Contract
 *
 * Validates that the P9 content review register contains genuine adult review
 * metadata, not auto-generated defaults. The register must demonstrate real
 * reviewer engagement with specific, diverse notes and complete metadata.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDraftRegister,
  finaliseRegister,
} from '../scripts/generate-grammar-qg-review-register.mjs';
import { GRAMMAR_TEMPLATE_METADATA } from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTER_PATH = path.resolve(
  __dirname,
  '..',
  'reports',
  'grammar',
  'grammar-qg-p9-content-review-register.json'
);

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

const MANUAL_REVIEW_ONLY_TEMPLATES = GRAMMAR_TEMPLATE_METADATA
  .filter((t) => t.answerSpecKind === 'manualReviewOnly')
  .map((t) => t.id);

const ALL_TEMPLATE_IDS = GRAMMAR_TEMPLATE_METADATA.map((t) => t.id);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// ---------------------------------------------------------------------------
// Load P9 register
// ---------------------------------------------------------------------------

const p9Register = JSON.parse(fs.readFileSync(REGISTER_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Tests — P9 register is NOT generator default output
// ---------------------------------------------------------------------------

describe('Grammar QG P9 Review Evidence Contract', () => {
  it('P9 register is NOT generator default output (identical generic notes detected)', () => {
    const allNotes = p9Register.map((e) => e.notes).filter(Boolean);
    const uniqueNotes = new Set(allNotes);
    assert.ok(
      uniqueNotes.size > 1,
      `All ${allNotes.length} entries have identical notes — this is auto-generated, not real review`
    );
    // Also reject the specific P8 auto-fill pattern
    const p8DefaultNote = 'Automated oracle pass - adult review confirmed';
    const matchingP8Default = allNotes.filter((n) => n === p8DefaultNote);
    assert.equal(
      matchingP8Default.length,
      0,
      `Found ${matchingP8Default.length} entries with P8 auto-fill notes — not evidence of adult review`
    );
  });

  it('every accepted entry has reviewerId, reviewMethod, reviewedSeedWindow, signedOffAt', () => {
    const accepted = p9Register.filter((e) => e.reviewerDecision === 'accepted');
    assert.ok(accepted.length > 0, 'Expected at least one accepted entry');

    for (const entry of accepted) {
      assert.ok(
        entry.reviewerId && typeof entry.reviewerId === 'string',
        `Entry ${entry.templateId}: reviewerId must be a non-empty string, got: ${entry.reviewerId}`
      );
      assert.ok(
        entry.reviewMethod && typeof entry.reviewMethod === 'string',
        `Entry ${entry.templateId}: reviewMethod must be a non-empty string, got: ${entry.reviewMethod}`
      );
      assert.ok(
        entry.reviewedSeedWindow && typeof entry.reviewedSeedWindow === 'string',
        `Entry ${entry.templateId}: reviewedSeedWindow must be a non-empty string, got: ${entry.reviewedSeedWindow}`
      );
      assert.ok(
        entry.signedOffAt && ISO_DATE_RE.test(entry.signedOffAt),
        `Entry ${entry.templateId}: signedOffAt must be ISO date, got: ${entry.signedOffAt}`
      );
    }
  });

  it('every rejected/watchlist entry has severity and notes', () => {
    const flagged = p9Register.filter(
      (e) => e.reviewerDecision === 'rejected' || e.reviewerDecision === 'watchlist'
    );
    for (const entry of flagged) {
      assert.ok(
        entry.severity && typeof entry.severity === 'string',
        `${entry.reviewerDecision} entry ${entry.templateId}: severity required, got: ${entry.severity}`
      );
      assert.ok(
        entry.notes && entry.notes.trim().length > 0,
        `${entry.reviewerDecision} entry ${entry.templateId}: notes must be non-empty`
      );
    }
  });

  it('all 18 concepts covered', () => {
    const conceptsInRegister = new Set(p9Register.map((e) => e.conceptId));
    for (const conceptId of ALL_CONCEPT_IDS) {
      assert.ok(
        conceptsInRegister.has(conceptId),
        `Missing concept in P9 register: ${conceptId}`
      );
    }
    assert.equal(conceptsInRegister.size, 18, 'Expected exactly 18 unique concepts');
  });

  it('all 78 templates appear in the register', () => {
    const templateIdsInRegister = new Set(p9Register.map((e) => e.templateId));
    for (const templateId of ALL_TEMPLATE_IDS) {
      assert.ok(
        templateIdsInRegister.has(templateId),
        `Missing template in P9 register: ${templateId}`
      );
    }
    assert.equal(templateIdsInRegister.size, 78, 'Expected exactly 78 template entries');
  });

  it('no duplicate templateId entries', () => {
    const seen = new Set();
    const duplicates = [];
    for (const entry of p9Register) {
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

  it('manual-review-only templates (4) are explicitly reviewed', () => {
    assert.equal(
      MANUAL_REVIEW_ONLY_TEMPLATES.length,
      4,
      `Expected 4 manual-review-only templates, found ${MANUAL_REVIEW_ONLY_TEMPLATES.length}`
    );

    const registerMap = new Map(p9Register.map((e) => [e.templateId, e]));
    for (const templateId of MANUAL_REVIEW_ONLY_TEMPLATES) {
      const entry = registerMap.get(templateId);
      assert.ok(entry, `Manual-review template "${templateId}" missing from register`);
      assert.ok(
        entry.reviewerId && entry.reviewMethod,
        `Manual-review template "${templateId}" must have explicit reviewer metadata`
      );
      assert.ok(
        entry.notes && entry.notes.length > 0,
        `Manual-review template "${templateId}" must have specific review notes`
      );
      // Manual-review templates should be marked in the notes
      assert.ok(
        entry.notes.toLowerCase().includes('manual'),
        `Manual-review template "${templateId}" notes should acknowledge manual-review nature`
      );
    }
  });

  it('notes are not all identical (diversity check)', () => {
    const allNotes = p9Register.map((e) => e.notes);
    const uniqueNotes = new Set(allNotes);
    // Require significant diversity — at least 50% unique
    const diversityRatio = uniqueNotes.size / allNotes.length;
    assert.ok(
      diversityRatio >= 0.5,
      `Note diversity too low: ${uniqueNotes.size}/${allNotes.length} unique (${(diversityRatio * 100).toFixed(1)}%). ` +
        'Expected at least 50% unique notes as evidence of genuine review.'
    );
  });

  it('draft-mode output has pending_review status (not accepted)', () => {
    const draft = buildDraftRegister();
    assert.ok(draft.length > 0, 'Draft register must not be empty');

    for (const entry of draft) {
      assert.equal(
        entry.reviewerDecision,
        'pending_review',
        `Draft entry ${entry.templateId}: expected pending_review, got: ${entry.reviewerDecision}`
      );
      // Draft entries should not have reviewer metadata filled
      assert.equal(
        entry.reviewerId,
        null,
        `Draft entry ${entry.templateId}: reviewerId should be null in draft mode`
      );
      assert.equal(
        entry.signedOffAt,
        null,
        `Draft entry ${entry.templateId}: signedOffAt should be null in draft mode`
      );
    }
  });

  it('finalise rejects register with all identical generic notes', () => {
    // Create a fake register with identical notes
    const fakeRegister = Array.from({ length: 5 }, (_, i) => ({
      conceptId: 'test',
      templateId: `template_${i}`,
      seed: 1,
      reviewerDecision: 'accepted',
      severity: null,
      notes: 'Automated oracle pass - adult review confirmed',
      feedbackReviewed: true,
      reviewedAt: '2026-04-29T00:00:00Z',
      reviewerId: 'james-to',
      reviewerRole: 'developer',
      reviewMethod: 'seed-sampling',
      reviewedSeedWindow: '1..10',
      reviewedPromptSurface: true,
      reviewedAnswerSpec: true,
      reviewedFeedback: true,
      signedOffAt: '2026-04-29T00:00:00Z',
    }));

    assert.throws(
      () => finaliseRegister(fakeRegister),
      /identical notes/i,
      'finalise must reject registers where all notes are identical'
    );
  });

  it('finalise rejects accepted entries missing reviewerId', () => {
    const fakeRegister = [
      {
        conceptId: 'test',
        templateId: 'template_1',
        seed: 1,
        reviewerDecision: 'accepted',
        severity: null,
        notes: 'Unique note one',
        feedbackReviewed: true,
        reviewedAt: '2026-04-29T00:00:00Z',
        reviewerId: null,
        reviewerRole: 'developer',
        reviewMethod: 'seed-sampling',
        reviewedSeedWindow: '1..10',
        reviewedPromptSurface: true,
        reviewedAnswerSpec: true,
        reviewedFeedback: true,
        signedOffAt: '2026-04-29T00:00:00Z',
      },
      {
        conceptId: 'test',
        templateId: 'template_2',
        seed: 1,
        reviewerDecision: 'accepted',
        severity: null,
        notes: 'Unique note two',
        feedbackReviewed: true,
        reviewedAt: '2026-04-29T00:00:00Z',
        reviewerId: 'james-to',
        reviewerRole: 'developer',
        reviewMethod: 'seed-sampling',
        reviewedSeedWindow: '1..10',
        reviewedPromptSurface: true,
        reviewedAnswerSpec: true,
        reviewedFeedback: true,
        signedOffAt: '2026-04-29T00:00:00Z',
      },
    ];

    assert.throws(
      () => finaliseRegister(fakeRegister),
      /reviewerId/i,
      'finalise must reject accepted entries without reviewerId'
    );
  });

  it('finalise rejects accepted entries missing reviewMethod', () => {
    const fakeRegister = [
      {
        conceptId: 'test',
        templateId: 'template_1',
        seed: 1,
        reviewerDecision: 'accepted',
        severity: null,
        notes: 'Unique note alpha',
        feedbackReviewed: true,
        reviewedAt: '2026-04-29T00:00:00Z',
        reviewerId: 'james-to',
        reviewerRole: 'developer',
        reviewMethod: null,
        reviewedSeedWindow: '1..10',
        reviewedPromptSurface: true,
        reviewedAnswerSpec: true,
        reviewedFeedback: true,
        signedOffAt: '2026-04-29T00:00:00Z',
      },
      {
        conceptId: 'test',
        templateId: 'template_2',
        seed: 1,
        reviewerDecision: 'accepted',
        severity: null,
        notes: 'Unique note beta',
        feedbackReviewed: true,
        reviewedAt: '2026-04-29T00:00:00Z',
        reviewerId: 'james-to',
        reviewerRole: 'developer',
        reviewMethod: 'seed-sampling',
        reviewedSeedWindow: '1..10',
        reviewedPromptSurface: true,
        reviewedAnswerSpec: true,
        reviewedFeedback: true,
        signedOffAt: '2026-04-29T00:00:00Z',
      },
    ];

    assert.throws(
      () => finaliseRegister(fakeRegister),
      /reviewMethod/i,
      'finalise must reject accepted entries without reviewMethod'
    );
  });

  it('P9 register passes finalise validation', () => {
    // The actual P9 register should pass finalise without throwing
    assert.doesNotThrow(
      () => finaliseRegister(p9Register),
      'P9 register must pass finalise validation'
    );
  });
});
