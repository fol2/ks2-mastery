#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEMANTIC_SENTENCE_SOURCE_PATH,
  assertSecureVocabularySentenceQuality,
  collectSecureVocabularySentenceIssues,
  normaliseSentenceForAudit,
} from './spelling-secure-vocabulary-sentence-generator.mjs';
import { validateSpellingContentBundle } from '../src/subjects/spelling/content/model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_SLICE_DIR = path.join(rootDir, 'content', 'spelling-secure-vocabulary-semantic-slices');
const DEFAULT_INPUT_DIR = path.join(rootDir, 'tmp', 'secure-vocabulary-semantic-audit');
const DEFAULT_OUT = path.join(rootDir, SEMANTIC_SENTENCE_SOURCE_PATH);
const DEFAULT_REPORT_OUT = path.join(rootDir, 'reports', 'spelling', 'secure-vocabulary-semantic-audit-r10.json');
const DEFAULT_CONTENT_PATH = path.join(rootDir, 'content', 'spelling.seed.json');
const EXPECTED_SLICE_COUNT = 6;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        const wrapped = new Error(`Invalid JSONL in ${path.relative(rootDir, filePath)} at line ${index + 1}: ${error.message}`);
        wrapped.cause = error;
        throw wrapped;
      }
    });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function issue(code, pathValue, message, details = {}) {
  return { code, path: pathValue, message, ...details };
}

function isSecureVocabularyWord(wordEntry) {
  const tags = Array.isArray(wordEntry?.tags) ? wordEntry.tags : [];
  const provenanceText = `${normaliseString(wordEntry?.provenance?.source)} ${normaliseString(wordEntry?.sourceNote)}`;
  return wordEntry?.coverageTier === 'secure-extension'
    && (tags.includes('secure-extension') || provenanceText.includes('ks2-spelling-secure-vocabulary-source-v1'));
}

function currentSecureVocabularyWords(contentPath) {
  const rawBundle = readJson(contentPath);
  const validation = validateSpellingContentBundle(rawBundle);
  if (!validation.ok) {
    throw new Error(`Cannot read invalid spelling bundle: ${validation.errors.length} validation error(s).`);
  }
  const currentRelease = validation.bundle.releases.find((release) => (
    release.id === validation.bundle.publication.currentReleaseId
  )) || validation.bundle.releases.at(-1);
  return (currentRelease?.snapshot?.words || []).filter(isSecureVocabularyWord);
}

function sentenceLooksSingle(finalSentence) {
  const text = normaliseString(finalSentence);
  if (!/[.!?]$/.test(text)) return false;
  return (text.match(/[.!?]/g) || []).length === 1;
}

function wordIsLikelyNonCountFrameCandidate(inputRow) {
  const word = normaliseString(inputRow.word || inputRow.slug).toLowerCase();
  const tags = Array.isArray(inputRow.tags) ? inputRow.tags : [];
  return word.endsWith('ly')
    || word.endsWith('ed')
    || word.endsWith('ing')
    || word.endsWith('tion')
    || word.endsWith('sion')
    || word.endsWith('ment')
    || word.endsWith('ness')
    || word.endsWith('ity')
    || word.endsWith('ance')
    || word.endsWith('ence')
    || word.endsWith('able')
    || word.endsWith('ible')
    || word.endsWith('ous')
    || word.endsWith('ful')
    || word.endsWith('less')
    || tags.some((tag) => /^suffix-(?:ly|ed|ing|tion|sion|ment|ness|ity|ance|ence|able|ible|ous|ful|less)$/.test(tag));
}

function collectSemanticFrameIssues({ finalSentence, inputRow, outputPath }) {
  const issues = [];
  const word = normaliseSentenceForAudit(inputRow.word || inputRow.slug);
  const text = normaliseSentenceForAudit(finalSentence);

  if (text.includes('used the form')) {
    issues.push(issue(
      'lazy_form_description',
      outputPath,
      'Sentence describes the token form instead of using the word naturally.',
      { slug: inputRow.slug, sentence: finalSentence },
    ));
  }
  if (word && text.includes(`explained ${word} when`)) {
    issues.push(issue(
      'token_explained_as_concept',
      outputPath,
      'Sentence explains the target word as a token rather than using it naturally.',
      { slug: inputRow.slug, sentence: finalSentence },
    ));
  }
  if (word && wordIsLikelyNonCountFrameCandidate(inputRow) && text.includes(`added a ${word} to`)) {
    issues.push(issue(
      'weak_added_a_frame',
      outputPath,
      'Sentence keeps a weak generated "added a ..." frame for a form that is unlikely to be a natural count noun.',
      { slug: inputRow.slug, sentence: finalSentence },
    ));
  }
  if (word && wordIsLikelyNonCountFrameCandidate(inputRow) && text.includes(`added an ${word} to`)) {
    issues.push(issue(
      'weak_added_an_frame',
      outputPath,
      'Sentence keeps a weak generated "added an ..." frame for a form that is unlikely to be a natural count noun.',
      { slug: inputRow.slug, sentence: finalSentence },
    ));
  }
  if (word && wordIsLikelyNonCountFrameCandidate(inputRow) && text.includes(`compared the ${word}`)) {
    issues.push(issue(
      'weak_compared_the_frame',
      outputPath,
      'Sentence keeps a weak generated "compared the ..." frame for a form that is unlikely to be a natural noun phrase.',
      { slug: inputRow.slug, sentence: finalSentence },
    ));
  }

  return issues;
}

function loadSliceRows({ sliceDir, inputDir }) {
  const rows = [];
  const issues = [];
  const sourceFiles = [];

  for (let slice = 1; slice <= EXPECTED_SLICE_COUNT; slice += 1) {
    const inputFile = path.join(inputDir, `slice-${slice}.jsonl`);
    const outputFile = path.join(sliceDir, `slice-${slice}.final.json`);
    if (!existsSync(inputFile)) {
      issues.push(issue('missing_input_slice', `slice-${slice}.jsonl`, `Missing input slice ${path.relative(rootDir, inputFile)}.`));
      continue;
    }
    if (!existsSync(outputFile)) {
      issues.push(issue('missing_final_slice', `slice-${slice}.final.json`, `Missing final proofread slice ${path.relative(rootDir, outputFile)}.`));
      continue;
    }

    const inputRows = readJsonl(inputFile);
    const finalRows = readJson(outputFile);
    sourceFiles.push({
      slice,
      inputPath: path.relative(rootDir, inputFile),
      outputPath: path.relative(rootDir, outputFile),
      inputSha256: sha256(readFileSync(inputFile)),
      outputSha256: sha256(readFileSync(outputFile)),
      inputRows: inputRows.length,
      outputRows: Array.isArray(finalRows) ? finalRows.length : 0,
    });

    if (!Array.isArray(finalRows)) {
      issues.push(issue('malformed_final_slice', `slice-${slice}.final.json`, 'Final proofread slice must be a JSON array.'));
      continue;
    }
    if (finalRows.length !== inputRows.length) {
      issues.push(issue(
        'slice_row_count_mismatch',
        `slice-${slice}.final.json`,
        `Final proofread slice has ${finalRows.length} row(s), expected ${inputRows.length}.`,
      ));
    }

    inputRows.forEach((inputRow, position) => {
      const finalRow = finalRows[position];
      const outputPath = `slice-${slice}.final.json[${position}]`;
      if (!finalRow || typeof finalRow !== 'object' || Array.isArray(finalRow)) {
        issues.push(issue('malformed_final_row', outputPath, 'Final row must be an object.'));
        return;
      }

      for (const field of ['index', 'slug', 'word', 'finalSentence', 'changed', 'reviewNote']) {
        if (!Object.prototype.hasOwnProperty.call(finalRow, field)) {
          issues.push(issue('missing_final_row_field', `${outputPath}.${field}`, `Missing required field "${field}".`));
        }
      }

      if (Number(finalRow.index) !== Number(inputRow.index)
        || normaliseString(finalRow.slug) !== normaliseString(inputRow.slug)
        || normaliseString(finalRow.word) !== normaliseString(inputRow.word)) {
        issues.push(issue(
          'final_row_order_mismatch',
          outputPath,
          'Final row must preserve the input index, slug, word, and order.',
          { expected: { index: inputRow.index, slug: inputRow.slug, word: inputRow.word }, actual: finalRow },
        ));
      }

      const finalSentence = normaliseString(finalRow.finalSentence);
      if (!sentenceLooksSingle(finalSentence)) {
        issues.push(issue(
          'not_one_sentence',
          `${outputPath}.finalSentence`,
          'Final sentence must be one sentence ending with a sentence terminator.',
          { slug: inputRow.slug, sentence: finalSentence },
        ));
      }

      try {
        assertSecureVocabularySentenceQuality({
          sentence: finalSentence,
          wordEntry: {
            ...inputRow,
            accepted: Array.isArray(inputRow.accepted) ? inputRow.accepted : [inputRow.word],
          },
        });
      } catch (error) {
        issues.push(issue(
          'sentence_quality',
          `${outputPath}.finalSentence`,
          error.message,
          { slug: inputRow.slug, sentence: finalSentence },
        ));
      }

      issues.push(...collectSemanticFrameIssues({ finalSentence, inputRow, outputPath }));
      rows.push({
        index: Number(inputRow.index),
        slug: normaliseString(inputRow.slug),
        word: normaliseString(inputRow.word),
        accepted: Array.isArray(inputRow.accepted) ? inputRow.accepted : [normaliseString(inputRow.word)],
        sentence: finalSentence,
        previousSentence: normaliseString(inputRow.sentence),
        changed: finalSentence !== normaliseString(inputRow.sentence),
        reviewerChanged: Boolean(finalRow.changed),
        reviewNote: normaliseString(finalRow.reviewNote),
      });
    });
  }

  return { rows, issues, sourceFiles };
}

function validateCoverage({ rows, contentPath }) {
  const issues = [];
  const secureWords = currentSecureVocabularyWords(contentPath);
  const expected = new Set(secureWords.map((word) => word.slug));
  const actual = new Set(rows.map((row) => row.slug));

  for (const slug of expected) {
    if (!actual.has(slug)) {
      issues.push(issue('missing_secure_vocabulary_slug', 'sentences', `Missing proofread sentence for secure-extension slug "${slug}".`));
    }
  }
  for (const row of rows) {
    if (!expected.has(row.slug)) {
      issues.push(issue('unexpected_secure_vocabulary_slug', `sentences.${row.slug}`, `Unexpected proofread slug "${row.slug}".`));
    }
  }
  if (rows.length !== secureWords.length) {
    issues.push(issue(
      'secure_vocabulary_count_mismatch',
      'sentences',
      `Proofread source has ${rows.length} row(s), expected ${secureWords.length}.`,
    ));
  }

  return { issues, expectedSecureVocabularyCount: secureWords.length };
}

function validateDuplicates(rows) {
  return collectSecureVocabularySentenceIssues(rows.map((row) => ({
    slug: row.slug,
    word: row.word,
    accepted: row.accepted,
    sentence: row.sentence,
  }))).map((entry, index) => issue(
    `sentence_${entry.type}`,
    `sentences[${index}]`,
    `Secure vocabulary sentence audit reported ${entry.type}.`,
    entry,
  ));
}

const sliceDir = path.resolve(rootDir, argValue('slice-dir', DEFAULT_SLICE_DIR));
const inputDir = path.resolve(rootDir, argValue('input-dir', DEFAULT_INPUT_DIR));
const outPath = path.resolve(rootDir, argValue('out', DEFAULT_OUT));
const reportPath = path.resolve(rootDir, argValue('report-out', DEFAULT_REPORT_OUT));
const contentPath = path.resolve(rootDir, argValue('content', DEFAULT_CONTENT_PATH));
const checkOnly = process.argv.includes('--check');

const loaded = loadSliceRows({ sliceDir, inputDir });
const rows = loaded.rows.sort((a, b) => a.index - b.index);
const rowIssues = [];
rows.forEach((row, index) => {
  if (row.index !== index + 1) {
    rowIssues.push(issue('non_contiguous_index', `sentences[${index}]`, `Expected proofread index ${index + 1}, found ${row.index}.`));
  }
});

const coverage = validateCoverage({ rows, contentPath });
const duplicateIssues = validateDuplicates(rows);
const issues = [
  ...loaded.issues,
  ...rowIssues,
  ...coverage.issues,
  ...duplicateIssues,
];
const changedRows = rows.filter((row) => row.changed);

const sourcePayload = {
  kind: 'ks2-spelling-secure-vocabulary-semantic-sentences',
  version: 1,
  generatedAt: '2026-06-05T21:30:00.000Z',
  review: {
    method: 'Six slice one-by-one semantic proofread; every secure-extension sentence reviewed before publication.',
    expectedSecureVocabularyCount: coverage.expectedSecureVocabularyCount,
    rowCount: rows.length,
    changedCount: changedRows.length,
    sourceSlices: loaded.sourceFiles,
  },
  sentences: rows,
};
const report = {
  ok: issues.length === 0,
  generatedAt: sourcePayload.generatedAt,
  rowCount: rows.length,
  expectedSecureVocabularyCount: coverage.expectedSecureVocabularyCount,
  changedCount: changedRows.length,
  issueCount: issues.length,
  sourcePath: path.relative(rootDir, outPath),
  reportPath: path.relative(rootDir, reportPath),
  issues,
  sourceSlices: loaded.sourceFiles,
  changedPreview: changedRows.slice(0, 20).map((row) => ({
    index: row.index,
    slug: row.slug,
    previousSentence: row.previousSentence,
    sentence: row.sentence,
  })),
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (!report.ok) {
  console.error(JSON.stringify({
    ok: false,
    rowCount: rows.length,
    issueCount: issues.length,
    reportPath: path.relative(rootDir, reportPath),
    issuePreview: issues.slice(0, 10),
  }, null, 2));
  process.exitCode = 1;
} else {
  if (!checkOnly) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(sourcePayload, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    ok: true,
    rowCount: rows.length,
    changedCount: changedRows.length,
    sourcePath: path.relative(rootDir, outPath),
    reportPath: path.relative(rootDir, reportPath),
    checkOnly,
  }, null, 2));
}
