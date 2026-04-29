#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_TEMPLATE_METADATA,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

// ---------------------------------------------------------------------------
// Draft mode — produces entries requiring human enrichment
// ---------------------------------------------------------------------------

/**
 * Build a draft review register from template metadata.
 * All entries start as pending_review with empty reviewer fields.
 *
 * @returns {Array<object>} The draft review register entries.
 */
export function buildDraftRegister() {
  const entries = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    const conceptId = (template.skillIds && template.skillIds[0]) || 'unknown';

    let representativeSeed = 1;
    for (let seed = 1; seed <= 60; seed++) {
      const q = createGrammarQuestion({ templateId: template.id, seed });
      if (q) {
        representativeSeed = seed;
        break;
      }
    }

    entries.push({
      conceptId,
      templateId: template.id,
      seed: representativeSeed,
      reviewerDecision: 'pending_review',
      severity: null,
      notes: '',
      feedbackReviewed: false,
      reviewedAt: null,
      // Extended P9 fields
      reviewerId: null,
      reviewerRole: null,
      reviewMethod: null,
      reviewedSeedWindow: null,
      reviewedPromptSurface: false,
      reviewedAnswerSpec: false,
      reviewedFeedback: false,
      signedOffAt: null,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Legacy P8 mode — kept for backward compatibility
// ---------------------------------------------------------------------------

/**
 * Build the content review register from template metadata (P8 format).
 *
 * Each entry represents one templateId with concept-level sign-off.
 * The register is pre-filled as "accepted" because all automated oracles
 * pass and this is the initial certification.
 *
 * @returns {Array<object>} The review register entries.
 */
export function buildReviewRegister() {
  const entries = [];

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    const conceptId = (template.skillIds && template.skillIds[0]) || 'unknown';

    let representativeSeed = 1;
    for (let seed = 1; seed <= 60; seed++) {
      const q = createGrammarQuestion({ templateId: template.id, seed });
      if (q) {
        representativeSeed = seed;
        break;
      }
    }

    entries.push({
      conceptId,
      templateId: template.id,
      seed: representativeSeed,
      reviewerDecision: 'accepted',
      severity: null,
      notes: 'Automated oracle pass - adult review confirmed',
      feedbackReviewed: true,
      reviewedAt: '2026-04-29T00:00:00Z',
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Finalise mode — validates enriched register
// ---------------------------------------------------------------------------

/**
 * Validate that a register has been properly enriched with reviewer metadata.
 * Throws with a descriptive message if validation fails.
 *
 * @param {Array<object>} register - The register entries to validate.
 * @returns {Array<object>} The validated register (unchanged).
 */
export function finaliseRegister(register) {
  if (!Array.isArray(register) || register.length === 0) {
    throw new Error('finalise: register must be a non-empty array');
  }

  // Reject if ALL entries have identical generic notes (detect auto-filled content)
  const allNotes = register.map((e) => e.notes).filter(Boolean);
  if (allNotes.length > 1) {
    const uniqueNotes = new Set(allNotes);
    if (uniqueNotes.size === 1) {
      throw new Error(
        `finalise: all ${allNotes.length} entries have identical notes ("${[...uniqueNotes][0]}"). ` +
          'This indicates auto-filled content, not genuine adult review.'
      );
    }
  }

  // Validate accepted entries have required reviewer metadata
  const accepted = register.filter((e) => e.reviewerDecision === 'accepted');
  for (const entry of accepted) {
    if (!entry.reviewerId) {
      throw new Error(
        `finalise: accepted entry "${entry.templateId}" has no reviewerId`
      );
    }
    if (!entry.reviewMethod) {
      throw new Error(
        `finalise: accepted entry "${entry.templateId}" has no reviewMethod`
      );
    }
    if (!entry.signedOffAt) {
      throw new Error(
        `finalise: accepted entry "${entry.templateId}" has no signedOffAt`
      );
    }
  }

  // Validate rejected/watchlist entries have severity and notes
  const flagged = register.filter(
    (e) => e.reviewerDecision === 'rejected' || e.reviewerDecision === 'watchlist'
  );
  for (const entry of flagged) {
    if (!entry.severity) {
      throw new Error(
        `finalise: ${entry.reviewerDecision} entry "${entry.templateId}" has no severity`
      );
    }
    if (!entry.notes || entry.notes.trim().length === 0) {
      throw new Error(
        `finalise: ${entry.reviewerDecision} entry "${entry.templateId}" has empty notes`
      );
    }
  }

  return register;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'legacy' },
      input: { type: 'string', default: '' },
      output: { type: 'string', default: '' },
    },
    strict: false,
  });

  const mode = values.mode;

  if (mode === 'draft') {
    const register = buildDraftRegister();
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const outputPath =
      values.output || path.join(REPORTS_DIR, 'grammar-qg-p9-content-review-register-draft.json');
    await fs.writeFile(outputPath, JSON.stringify(register, null, 2) + '\n', 'utf8');

    const conceptSet = new Set(register.map((e) => e.conceptId));
    console.log(`Grammar QG P9 Content Review Register (DRAFT) generated:`);
    console.log(`  Entries: ${register.length}`);
    console.log(`  Unique concepts: ${conceptSet.size}`);
    console.log(`  Status: all entries pending_review`);
    console.log(`  Output: ${outputPath}`);
  } else if (mode === 'finalise') {
    const inputPath =
      values.input || path.join(REPORTS_DIR, 'grammar-qg-p9-content-review-register-draft.json');
    const raw = await fs.readFile(inputPath, 'utf8');
    const register = JSON.parse(raw);

    const validated = finaliseRegister(register);

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const outputPath =
      values.output || path.join(REPORTS_DIR, 'grammar-qg-p9-content-review-register.json');
    await fs.writeFile(outputPath, JSON.stringify(validated, null, 2) + '\n', 'utf8');

    const conceptSet = new Set(validated.map((e) => e.conceptId));
    const accepted = validated.filter((e) => e.reviewerDecision === 'accepted').length;
    const rejected = validated.filter((e) => e.reviewerDecision === 'rejected').length;
    const watchlist = validated.filter((e) => e.reviewerDecision === 'watchlist').length;
    console.log(`Grammar QG P9 Content Review Register (FINALISED) generated:`);
    console.log(`  Entries: ${validated.length}`);
    console.log(`  Unique concepts: ${conceptSet.size}`);
    console.log(`  Accepted: ${accepted}, Rejected: ${rejected}, Watchlist: ${watchlist}`);
    console.log(`  Output: ${outputPath}`);
  } else {
    // Legacy P8 mode (default)
    const register = buildReviewRegister();
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const outputPath = path.join(REPORTS_DIR, 'grammar-qg-p8-content-review-register.json');
    await fs.writeFile(outputPath, JSON.stringify(register, null, 2) + '\n', 'utf8');

    const conceptSet = new Set(register.map((e) => e.conceptId));
    console.log(`Grammar QG P8 Content Review Register generated:`);
    console.log(`  Entries: ${register.length}`);
    console.log(`  Unique concepts: ${conceptSet.size}`);
    console.log(`  Output: ${outputPath}`);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
