import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const runtime = createPunctuationRuntimeManifest({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  generatedPerFamily: PRODUCTION_DEPTH,
});

const PUBLISHED_SKILLS = [
  'sentence_endings',
  'list_commas',
  'apostrophe_contractions',
  'apostrophe_possession',
  'speech',
  'fronted_adverbial',
  'parenthesis',
  'comma_clarity',
  'colon_list',
  'semicolon',
  'dash_clause',
  'semicolon_list',
  'bullet_points',
  'hyphen',
];

const transferItems = runtime.items.filter((item) => item.mode === 'transfer');

test('P14 transfer pool meets the ≥250 runtime-item floor', () => {
  assert.ok(
    transferItems.length >= 250,
    `expected ≥250 transfer items, got ${transferItems.length}`,
  );
});

test('P14 transfer pool covers every published skill with ≥12 items', () => {
  const failures = [];
  for (const skill of PUBLISHED_SKILLS) {
    const skillTransfer = transferItems.filter(
      (item) => Array.isArray(item.skillIds) && item.skillIds.includes(skill),
    );
    if (skillTransfer.length < 12) {
      failures.push({ skill, count: skillTransfer.length });
    }
  }
  assert.deepEqual(failures, [], 'every published skill should have ≥12 transfer items');
});

test('P14 transfer model answers self-mark correctly', () => {
  const failures = [];
  for (const item of transferItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    if (!result.correct) {
      failures.push({ id: item.id, model: item.model, note: result.note });
    }
  }
  assert.deepEqual(
    failures.slice(0, 10),
    [],
    `every transfer model answer should self-mark correct (${failures.length} failed)`,
  );
});

test('P14 token-only fragments are rejected across every transfer family', () => {
  // Stratify by generator family so every transfer family is exercised at
  // least once. The earlier `slice(0, 50)` only hit 3 families (fixed +
  // sentence_endings + list_commas) — a regression in any other family's
  // validator would have escaped the test.
  const seenFamilies = new Map();
  for (const item of transferItems) {
    const familyId = item.generatorFamilyId || `(fixed)-${(item.skillIds || []).join(',')}`;
    if (!seenFamilies.has(familyId)) seenFamilies.set(familyId, item);
  }
  const sampleByFamily = [...seenFamilies.values()];
  // Cover the original lower-case fragment set plus the bypass cases the
  // adversarial review surfaced (capitalised, terminal-only, single-letter).
  const fragmentAttacks = ['yes', 'no', 'well', 'ok', 'maybe', 'sure', 'YES', 'OK', 'I', 'I.', '?', '!!', 'yes.', '   '];
  const acceptedFragments = [];
  for (const item of sampleByFamily) {
    for (const attack of fragmentAttacks) {
      const result = markPunctuationAnswer({ item, answer: { typed: attack } });
      if (result.correct) {
        acceptedFragments.push({ id: item.id, family: item.generatorFamilyId || '(fixed)', attack });
      }
    }
  }
  assert.deepEqual(acceptedFragments, [], 'token-only fragments must not pass any transfer family');
});

test('P14 short-but-valid answers like "Stop!" are not blocked by the fragment guard', () => {
  // The fragment guard requires AND of three predicates (≤2 words, no
  // terminal, no capital). A capitalised exclamation should pass the guard
  // even though the validator may still reject it for not satisfying the
  // skill-specific shape — that's the validator's job, not the guard's.
  const sample = transferItems.slice(0, 5);
  for (const item of sample) {
    const result = markPunctuationAnswer({ item, answer: { typed: 'Stop!' } });
    // We only assert that the failure (if any) is NOT due to the fragment
    // guard tag — i.e. the validator-specific tag won, not the guard.
    if (!result.correct) {
      assert.ok(
        !Array.isArray(result.misconceptionTags) || !result.misconceptionTags.includes('transfer.fragment_only'),
        `${item.id} blocked "Stop!" with the fragment guard, expected validator-specific rejection`,
      );
    }
  }
});

test('P14 transfer family count is 14 (one per published skill)', () => {
  const transferFamilies = runtime.generatorFamilies.filter((family) => family.mode === 'transfer');
  assert.equal(transferFamilies.length, 14);
  const skillIds = transferFamilies.map((family) => family.skillId).sort();
  assert.deepEqual(skillIds, [...PUBLISHED_SKILLS].sort());
});

test('P14 transfer items do not bleed into other modes (mode purity)', () => {
  // Every transfer-family item should have mode === 'transfer'.
  const offenders = runtime.items
    .filter((item) => /^gen_[a-z_]+_transfer/.test(item.generatorFamilyId || ''))
    .filter((item) => item.mode !== 'transfer');
  assert.deepEqual(offenders.map((item) => ({ id: item.id, mode: item.mode })), []);
});
