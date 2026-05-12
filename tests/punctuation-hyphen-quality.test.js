import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildHyphenCompoundQualityEvidence } from '../scripts/audit-punctuation-qg-p20-expansion.mjs';
import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';

const ADVERBIAL_LY_HYPHEN_PATTERN = /\b(?:newly|carefully|brightly|slowly|quickly|quietly|neatly|clearly|safely|happily|sadly|fully|partly|mostly|closely|easily|gently|roughly|smoothly|badly|fairly|highly|lightly|loudly|recently|warmly|widely)-[a-z]+\b/gi;
const MALFORMED_HYPHEN_DESIGN_PATTERN = /\b[a-z]+-[a-z]+design\b/gi;
const HYF_ARTICLE_PATTERN = /\ba (?:ice[- ]cold|open[- ]ended|up[- ]to[- ]date)\b/gi;
const SOURCE_BANKS = [
  'shared/punctuation/manual-expansion-bank.js',
  'shared/punctuation/manual-deep-expansion-bank.js',
  'shared/punctuation/manual-p12-quality-bank.js',
  'shared/punctuation/p20-systematic-expansion-bank.js',
];

function adverbialLyHyphenFindings(text) {
  return [...new Set(String(text).match(ADVERBIAL_LY_HYPHEN_PATTERN) || [])]
    .map((phrase) => phrase.toLowerCase())
    .sort();
}

function collectTextParts(value, parts = []) {
  if (value === null || value === undefined) return parts;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    parts.push(String(value));
    return parts;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectTextParts(entry, parts);
    return parts;
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value)) collectTextParts(entry, parts);
  }
  return parts;
}

test('Punctuation hyphen runtime avoids -ly compounds, no-space distractors, and article errors', () => {
  const runtime = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });

  const findings = {
    adverbialLy: [],
    malformedNoSpace: [],
    articleErrors: [],
  };
  for (const item of runtime.items) {
    if (!Array.isArray(item.skillIds) || !item.skillIds.includes('hyphen')) continue;
    const text = collectTextParts({
      prompt: item.prompt,
      stem: item.stem,
      options: item.options,
      model: item.model,
      accepted: item.accepted,
      validator: item.validator,
      rubric: item.rubric,
      explanation: item.explanation,
      tests: item.tests,
    }).join('\n');
    for (const phrase of adverbialLyHyphenFindings(text)) {
      findings.adverbialLy.push({ itemId: item.id, familyId: item.generatorFamilyId || '', mode: item.mode, phrase });
    }
    for (const surface of [...new Set(String(text).match(MALFORMED_HYPHEN_DESIGN_PATTERN) || [])]) {
      findings.malformedNoSpace.push({ itemId: item.id, familyId: item.generatorFamilyId || '', mode: item.mode, surface: surface.toLowerCase() });
    }
    for (const surface of [...new Set(String(text).match(HYF_ARTICLE_PATTERN) || [])]) {
      findings.articleErrors.push({ itemId: item.id, familyId: item.generatorFamilyId || '', mode: item.mode, surface: surface.toLowerCase() });
    }
  }

  assert.deepEqual(findings, { adverbialLy: [], malformedNoSpace: [], articleErrors: [] });
});

test('Punctuation manual and systematic hyphen banks stay free of -ly adverb hyphen examples', () => {
  const findings = [];
  for (const path of SOURCE_BANKS) {
    const phrases = adverbialLyHyphenFindings(readFileSync(path, 'utf8'));
    for (const phrase of phrases) findings.push({ path, phrase });
  }

  assert.deepEqual(findings, []);
});

test('P20 hyphen audit rejects explanation-only -ly compound examples', () => {
  const evidence = buildHyphenCompoundQualityEvidence([{
    id: 'explanation-only-hyphen-quality-regression',
    generatorFamilyId: 'unit',
    mode: 'insert',
    skillIds: ['hyphen'],
    explanation: 'The phrase newly-built is hyphenated so it describes the noun clearly.',
  }]);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.adverbialLyFindingCount, 1);
  assert.deepEqual(
    evidence.adverbialLyFindings.map((finding) => finding.phrase),
    ['newly-built'],
  );
});
