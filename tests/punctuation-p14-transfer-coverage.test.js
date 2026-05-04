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

test('P14 transfer requiresTokens validator rejects token-stuffed padding (adv-r2-004)', () => {
  // Adversarial r2-004: previously the apostrophe_contractions /
  // apostrophe_possession / comma_clarity transfer families shipped with
  // `minMeaningfulWords: 0`, so the marker accepted token-stuffed
  // nonsense like `Yes can't no can't yes can't.` as a valid open-
  // production answer. Floor lifted to 3.
  const tokenStuffingAttacks = [
    "Yes can't no can't yes can't.",
    "Bla can't bla bla bla bla.",
    "A B can't D E F.",
    "A B dogs' D E F.",
    "Yes indeed, no, yes, ok, ok.",
  ];
  const targetFamilies = ['gen_apostrophe_contractions_transfer', 'gen_apostrophe_possession_transfer', 'gen_comma_clarity_transfer'];
  const accepted = [];
  for (const familyId of targetFamilies) {
    const item = transferItems.find((entry) => entry.generatorFamilyId === familyId);
    if (!item) continue;
    for (const attack of tokenStuffingAttacks) {
      const result = markPunctuationAnswer({ item, answer: { typed: attack } });
      if (result.correct) accepted.push({ family: familyId, attack });
    }
  }
  assert.deepEqual(accepted, [], 'requiresTokens transfer families must reject token-stuffed padding');
});

test('P14 transfer requiresTokens validator still accepts genuine short sentences (adv-r2-004)', () => {
  // Counter-test: the floor must not block valid short sentences that
  // genuinely use the punctuated form. Each pair below has the target
  // family plus an answer with exactly the meaningful word count needed
  // to satisfy a minMeaningfulWords floor of 3.
  const cases = [
    { familyId: 'gen_apostrophe_contractions_transfer', answer: "We can't go yet today still." },
    { familyId: 'gen_apostrophe_possession_transfer', answer: "The dog's lead snapped on Monday." },
  ];
  for (const { familyId, answer } of cases) {
    const item = transferItems.find((entry) => entry.generatorFamilyId === familyId);
    if (!item) continue;
    const result = markPunctuationAnswer({ item, answer: { typed: answer } });
    // We only assert the meaningfulness floor isn't blocking — the
    // validator may still reject for other reasons (token mismatch).
    assert.ok(
      !Array.isArray(result.misconceptionTags) || !result.misconceptionTags.includes('transfer.sentence_fragment'),
      `${familyId} blocked genuine short sentence "${answer}" with transfer.sentence_fragment tag`,
    );
  }
});

test('P14 short-but-valid answers like "Stop!" are not blocked by the fragment guard', () => {
  // The fragment guard requires AND of three predicates (≤2 words, no
  // terminal, no capital). A capitalised exclamation should pass the guard
  // even though the validator may still reject it for not satisfying the
  // skill-specific shape — that's the validator's job, not the guard's.
  // This test EXPLICITLY asserts the guard does not fire — a false-accept
  // would surface as a missing misconception tag, not as a silent pass.
  const sample = transferItems.slice(0, 5);
  for (const item of sample) {
    const result = markPunctuationAnswer({ item, answer: { typed: 'Stop!' } });
    // "Stop!" is NOT a valid transfer answer for any skill (it lacks the
    // required punctuation structure), so it must be marked incorrect.
    // The key assertion: the rejection must NOT come from the fragment guard.
    assert.strictEqual(result.correct, false, `"Stop!" must be rejected by ${item.id} (lacks required punctuation structure)`);
    assert.ok(
      !Array.isArray(result.misconceptionTags) || !result.misconceptionTags.includes('transfer.fragment_only'),
      `${item.id} blocked "Stop!" with the fragment guard, expected validator-specific rejection`,
    );
  }
});

test('P14 transfer prompts use a single consistent apostrophe style (adv-r2-001 regression)', () => {
  // Adversarial r2-001: four apostrophe-possession transfer prompts shipped
  // garbled apostrophe sequences ('dogs'’, 'girls’', 'boys’', 'pupils’')
  // — the very prompts teaching plural-possessive apostrophes contained
  // mixed straight/curly quotes that rendered as visible nonsense to
  // learners. Guard: every transfer prompt's apostrophe characters must
  // come from a single style (all straight `'` or all curly `’`),
  // never a mix within one prompt.
  const offenders = [];
  for (const item of transferItems) {
    const prompt = String(item.prompt || '');
    const hasStraight = prompt.includes("'");
    const hasCurly = prompt.includes('’');
    if (hasStraight && hasCurly) {
      offenders.push({ id: item.id, prompt });
    }
  }
  assert.deepEqual(offenders.slice(0, 10), [], 'transfer prompts must not mix straight and curly apostrophes');
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

test('P14 transfer wrong-punctuation rejection: comma where semicolon is required', () => {
  // Primary false-accept path: a learner submits a well-formed sentence with
  // the correct words but the WRONG boundary punctuation mark (a comma instead
  // of a semicolon). The marker must reject this as incorrect — failing here
  // means the validator is not checking for the specific punctuation mark.
  const semicolonItem = transferItems.find(
    (item) => item.generatorFamilyId === 'gen_semicolon_transfer',
  );
  assert.ok(semicolonItem, 'must have at least one gen_semicolon_transfer item');

  // Replace the semicolon with a comma — the sentence is otherwise identical
  // to the model answer.
  const wrongMark = semicolonItem.model.replace(';', ',');
  assert.notEqual(wrongMark, semicolonItem.model, 'fixture must contain a semicolon to replace');

  const result = markPunctuationAnswer({ item: semicolonItem, answer: { typed: wrongMark } });
  assert.strictEqual(result.correct, false, 'comma where semicolon is required must be rejected');
  assert.ok(
    Array.isArray(result.misconceptionTags) && (
      result.misconceptionTags.includes('boundary.comma_splice') ||
      result.misconceptionTags.includes('boundary.semicolon_missing')
    ),
    `expected boundary misconception tag, got: ${JSON.stringify(result.misconceptionTags)}`,
  );
});
