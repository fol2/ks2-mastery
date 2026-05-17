#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH =
  'secure_vocabulary_review_pack_word_metadata_mismatch';

function normaliseIdentity(value) {
  return String(value ?? '').trim().toLowerCase();
}

function wordIdentity(word) {
  if (!word || typeof word !== 'object') return '';
  return normaliseIdentity(word.slug || word.id || word.word);
}

function wordsFromPayload(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.[label]?.words)) return payload[label].words;
  return [];
}

function valueAt(word, path) {
  let current = word;
  for (const part of path.split('.')) {
    current = current?.[part];
  }
  return current;
}

function metadataField(name, reviewPackPath, sourcePath) {
  return { name, reviewPackPath, sourcePath };
}

const REVIEW_PACK_WORD_METADATA_FIELDS = Object.freeze([
  metadataField('reviewer', 'reviewer', 'review.reviewer'),
  metadataField('reviewedAt', 'reviewedAt', 'review.reviewedAt'),
  metadataField('provenanceSource', 'provenanceSource', 'provenance.source'),
  metadataField('safetyStatus', 'safetyStatus', 'safety.status'),
]);

function buildAuditedSourceIndex(auditedSourceWords) {
  const index = new Map();
  for (const sourceWord of auditedSourceWords) {
    const identity = wordIdentity(sourceWord);
    if (identity && !index.has(identity)) {
      index.set(identity, sourceWord);
    }
  }
  return index;
}

function mismatchDetail(field, actual, expected) {
  return { field, actual: actual ?? null, expected: expected ?? null };
}

function reviewStatusMismatches(reviewPackWord, sourceWord) {
  const actual = reviewPackWord?.reviewStatus;
  const expected = sourceWord?.review?.status;
  if (actual === 'approved' && actual === expected) return [];

  return [mismatchDetail('reviewStatus', actual, expected)];
}

function wordMetadataMismatches(reviewPackWord, sourceWord) {
  if (!sourceWord) {
    return [mismatchDetail('sourceWord', null, 'audited source word')];
  }

  const mismatches = reviewStatusMismatches(reviewPackWord, sourceWord);
  for (const field of REVIEW_PACK_WORD_METADATA_FIELDS) {
    const actual = valueAt(reviewPackWord, field.reviewPackPath);
    const expected = valueAt(sourceWord, field.sourcePath);
    if (actual !== expected) {
      mismatches.push(mismatchDetail(field.name, actual, expected));
    }
  }
  return mismatches;
}

export function verifySecureVocabularyRelease({ auditedSource, reviewPack } = {}) {
  const auditedSourceWords = wordsFromPayload(auditedSource, 'auditedSource');
  const reviewPackWords = wordsFromPayload(reviewPack, 'reviewPack');
  const auditedSourceIndex = buildAuditedSourceIndex(auditedSourceWords);
  const issues = [];

  reviewPackWords.forEach((reviewPackWord, index) => {
    const identity = wordIdentity(reviewPackWord);
    const sourceWord = auditedSourceIndex.get(identity);
    const mismatches = wordMetadataMismatches(reviewPackWord, sourceWord);

    if (mismatches.length > 0) {
      issues.push({
        code: SECURE_VOCABULARY_REVIEW_PACK_WORD_METADATA_MISMATCH,
        path: `reviewPack.words[${index}]`,
        wordIdentity: identity || null,
        fields: mismatches.map((entry) => entry.field),
        mismatches,
      });
    }
  });

  return {
    ok: issues.length === 0,
    issueCount: issues.length,
    checkedReviewPackWords: reviewPackWords.length,
    checkedAuditedSourceWords: auditedSourceWords.length,
    issues,
  };
}

function parseArgs(argv) {
  const options = {
    auditedSourcePath: null,
    reviewPackPath: null,
    outPath: null,
    json: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if ((arg === '--audited-source' || arg === '--source') && argv[index + 1]) {
      options.auditedSourcePath = argv[++index];
    } else if (arg.startsWith('--audited-source=')) {
      options.auditedSourcePath = arg.slice('--audited-source='.length);
    } else if (arg.startsWith('--source=')) {
      options.auditedSourcePath = arg.slice('--source='.length);
    } else if (arg === '--review-pack' && argv[index + 1]) {
      options.reviewPackPath = argv[++index];
    } else if (arg.startsWith('--review-pack=')) {
      options.reviewPackPath = arg.slice('--review-pack='.length);
    } else if (arg === '--out' && argv[index + 1]) {
      options.outPath = argv[++index];
    } else if (arg.startsWith('--out=')) {
      options.outPath = arg.slice('--out='.length);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-spelling-secure-vocabulary-release.mjs --audited-source <source.json> --review-pack <review-pack.json> [--json] [--out <report.json>]',
    '',
    'The gate compares reviewPack.words metadata against the audited source word matched by slug, id, or word.',
  ].join('\n');
}

function readJsonFile(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`JSON file not found: ${path}`);
  }
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function emitReport(report, options) {
  const payload = JSON.stringify(report, null, 2);
  if (options.outPath) {
    writeFileSync(resolve(options.outPath), `${payload}\n`);
  }
  if (options.json || !options.outPath) {
    console.log(payload);
  } else {
    console.log(`Secure vocabulary release verification ${report.ok ? 'passed' : 'failed'}: ${report.issueCount} issue(s)`);
  }
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!options.auditedSourcePath || !options.reviewPackPath) {
      console.error(usage());
      process.exit(2);
    }

    const report = verifySecureVocabularyRelease({
      auditedSource: readJsonFile(options.auditedSourcePath),
      reviewPack: readJsonFile(options.reviewPackPath),
    });
    emitReport(report, options);
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exit(1);
  }
}
