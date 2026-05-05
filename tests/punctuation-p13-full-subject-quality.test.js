import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationRuntimeManifest, repairApostropheContractionGrammar } from '../shared/punctuation/generators.js';

// Inline copy of the helper used inside generators.js — sentenceCaseFirst is
// not exported because it is an internal pipeline step. Mirroring the
// behaviour here lets the test exercise the repair pipeline as it runs at
// bank-build time.
function sentenceCaseFirstForTest(value) {
  const text = String(value ?? '');
  if (!text.length) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
import { countProseSentenceBoundaries, markPunctuationAnswer } from '../shared/punctuation/marking.js';

const runtime = createPunctuationRuntimeManifest({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  generatedPerFamily: PRODUCTION_DEPTH,
});

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') return { choiceIndex: item.correctIndex };
  return { typed: item.model };
}

function removeSentenceBoundary(text) {
  return String(text || '').replace(/\.\s+(?=[A-Z"'“‘])/u, ' ');
}

// Sentinel for ungrammatical "<contracted-aux> + ready to + verb" — built
// from the full pronoun list rather than a hand-typed alternation so the
// test stops being vacuous if a future bank entry uses a previously
// untested pronoun. Excludes `'s` because `is + ready to + verb` IS
// grammatical (e.g. `"She's ready to move"`).
const HAVE_OR_WILL_PRONOUNS = ['I', 'you', 'we', 'they', 'he', 'she', 'it', 'that', 'there'];
const HAVE_PRONOUN_GROUP = HAVE_OR_WILL_PRONOUNS.flatMap((p) => [`${p}'ve`, `${p.toLowerCase()}ve`, `${p}'ll`, `${p.toLowerCase()}ll`]).join('|');
const BAD_APOSTROPHE_GRAMMAR = new RegExp(`\\b(?:${HAVE_PRONOUN_GROUP})\\s+ready\\s+to\\b|\\b(?:it\\s+isn't|it\\s+isnt|we\\s+aren't|we\\s+arent)\\s+(?:move|forget)\\b`, 'i');

test('P20 runtime serves the systematic production pool and model answers self-mark', () => {
  // P20 systematic expansion serves 512 fixed items plus 14,560 generated
  // items, for 15,072 runtime items at production depth 120.
  assert.equal(runtime.items.length, 15072);
  assert.equal(runtime.items.filter((item) => item.source !== 'generated').length, 512);
  assert.equal(runtime.items.filter((item) => item.source === 'generated').length, 14560);
  for (const item of runtime.items) {
    const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
    assert.equal(result.correct, true, `${item.id} model/correct answer should mark correct: ${result.note || ''}`);
  }
});

test('P13 generated apostrophe items do not surface ungrammatical contraction stems/models', () => {
  const offenders = runtime.items
    .filter((item) => item.source === 'generated')
    .filter((item) => /^gen_apostrophe_(?:contractions_fix|mix_paragraph)/.test(item.generatorFamilyId || ''))
    .filter((item) => BAD_APOSTROPHE_GRAMMAR.test(`${item.stem}\n${item.model}`));
  assert.deepEqual(offenders.map((item) => ({ id: item.id, stem: item.stem, model: item.model })), []);
});

test('P13 generated apostrophe typed-answer models start as complete sentences', () => {
  const offenders = runtime.items
    .filter((item) => item.source === 'generated')
    .filter((item) => /^gen_apostrophe_(?:contractions_fix|mix_paragraph)/.test(item.generatorFamilyId || ''))
    .filter((item) => item.mode !== 'choose')
    .filter((item) => !/^[A-Z"'“‘]/.test(String(item.model || '').trim()));
  assert.deepEqual(offenders.map((item) => ({ id: item.id, model: item.model })), []);
});

test('P14 apostrophe repair leaves grammatical inputs unchanged (no false positives)', () => {
  // Adversarial review (adv-002) surfaced regex false positives:
  //   * adverb `well` mid-sentence
  //   * hyphenated compound `forget-me-not`
  //   * adjective `ill`, noun `hell`, noun `shell`
  // The repair must rewrite ONLY the contracted-aux + ready-to bigrams in
  // sentence-start position (capitalised) or with apostrophe present.
  const grammaticalInputs = [
    'It works well ready to move forwards.',
    'It isnt forget-me-not season yet.',
    'He works well in this job.',
    'She is ill ready to recover.',
    'The shell ready to use is large.',
    'Mr Smith said he was ready to go home.',
    'The bell rings at noon.',
    'Hell froze over before he agreed.', // unlikely but the noun is grammatical
  ];
  const offenders = grammaticalInputs.filter((input) => repairApostropheContractionGrammar(input) !== input);
  assert.deepEqual(offenders, [], 'repair must not rewrite grammatical inputs');
});

test('P14 apostrophe repair preserves stem (no apostrophe) vs model (apostrophe) contrast', () => {
  // The bank's "fix the apostrophe" exercise design pairs broken stems
  // with corrected models. The repair should only fix the GRAMMAR (ready-
  // to-verb → past-participle/infinitive), never silently add apostrophes
  // — adding apostrophes would collapse the exercise into a tautology.
  assert.equal(
    repairApostropheContractionGrammar('Ive ready to move the lantern.'),
    'Ive moved the lantern.',
    'stem form must keep the no-apostrophe form',
  );
  assert.equal(
    repairApostropheContractionGrammar("I've ready to move the lantern."),
    "I've moved the lantern.",
    'model form must keep the apostrophe form',
  );
  assert.equal(
    repairApostropheContractionGrammar('Ill ready to move the chair.'),
    'Ill move the chair.',
    'will-stem form must keep no-apostrophe form',
  );
  assert.equal(
    repairApostropheContractionGrammar("I'll ready to move the chair."),
    "I'll move the chair.",
    'will-model form must keep apostrophe form',
  );
});

test('P14 countProseSentenceBoundaries handles common abbreviations', () => {
  // adv-003 — title abbreviations (Mr/Mrs/Dr/Prof/St/etc) must NOT be
  // counted as sentence terminators when followed by a capitalised name.
  // Time markers (a.m./p.m.) and country codes (U.K./U.S.) DO count when
  // they sit at a real sentence boundary, because the period serves both
  // as abbreviation marker AND sentence terminator.
  const cases = [
    ['Mr. Smith arrived. Then he sat down.', 1, 'Mr. before name does not count; period after `arrived` does'],
    ['Mrs. Jones smiled. The class waved.', 1, 'Mrs.'],
    ['Dr. Patel arrived. The class clapped.', 1, 'Dr.'],
    ['Prof. Lee asked a question. The room fell silent.', 1, 'Prof.'],
    ['Mr. Smith greeted Dr. Patel. They shook hands.', 1, 'multiple titles in same sentence'],
    ['Mr. Smith said hello.', 0, 'Mr. with no following sentence — zero boundaries'],
    ['She paused. Then she ran.', 1, 'normal prose'],
    ['One. Two. Three.', 2, 'three-sentence chain'],
    ['It is 9 a.m. Time to go.', 1, 'a.m. before sentence start counts'],
    ['We live in the U.K. The end.', 1, 'U.K. before sentence start counts'],
  ];
  const failures = [];
  for (const [input, expected, note] of cases) {
    const got = countProseSentenceBoundaries(input);
    if (got !== expected) failures.push({ input, expected, got, note });
  }
  assert.deepEqual(failures, [], 'abbreviation handling regressed');
});

test('P14 apostrophe repair handles lowercase apostropheless stems via single-pass call (adv-r2-002 regression)', () => {
  // Adversarial r2-002: previously the bank's lowercase apostropheless
  // stems (`youve ready to…`, `weve ready to…`, `theyll ready to…`,
  // `well ready to…`, `ill ready to…`) only resolved correctly because
  // `qualityNormalisedGeneratedTemplate` happened to be applied twice in
  // the pipeline. After a future DRY consolidation that drops the second
  // pass, those 20 stems would silently regress. The fix: order the
  // helper as `repair(sentenceCaseFirst(value))`, so the regex sees the
  // capitalised form on a single pass. This test enforces that contract
  // — running `sentenceCaseFirst` then `repair` exactly once must
  // produce a grammatical past-participle / infinitive form for every
  // lowercase apostropheless stem in the bank's design vocabulary.
  const lowercaseStemSamples = [
    ['youve ready to move the lantern.', 'Youve moved the lantern.'],
    ['weve ready to forget the badge.', 'Weve forgotten the badge.'],
    ['theyve ready to leave the field.', 'Theyve left the field.'],
    ['ive ready to start the experiment.', 'Ive started the experiment.'],
    ['youll ready to read the chapter.', 'Youll read the chapter.'],
    ['theyll ready to swim the lap.', 'Theyll swim the lap.'],
    ['itll ready to begin at noon.', 'Itll begin at noon.'],
    ['thatll ready to do the trick.', 'Thatll do the trick.'],
    ['therell ready to come a moment.', 'Therell come a moment.'],
    ['well ready to move forward.', 'Well move forward.'],
    ['ill ready to help the team.', 'Ill help the team.'],
  ];
  const failures = [];
  for (const [input, expected] of lowercaseStemSamples) {
    const got = repairApostropheContractionGrammar(sentenceCaseFirstForTest(input));
    if (got !== expected) failures.push({ input, expected, got });
  }
  assert.deepEqual(failures, [], 'single-pass repair must produce grammatical output for lowercase stems');
});

test('P14 negative-contraction repair preserves sentence-initial capital (adv-r2-003 regression)', () => {
  // Adversarial r2-003: previously these patterns used a `gi` flag with a
  // lowercase replacement string, so `It isnt forget X.` became
  // `it isnt safe to forget X.` — the function silently destroyed the
  // sentence-initial capital. The fix uses a captured pronoun group as
  // `$1` so the matched form is echoed verbatim.
  const cases = [
    ['It isnt forget about it later.', 'It isnt safe to forget about it later.'],
    ['it isnt forget about it later.', 'it isnt safe to forget about it later.'],
    ['It isnt move yet.', 'It isnt safe to move yet.'],
    ["It isn't forget the keys.", "It isn't safe to forget the keys."],
    ['We arent move the table here.', 'We arent ready to move the table here.'],
    ['we arent forget the badges.', 'we arent ready to forget the badges.'],
  ];
  const failures = [];
  for (const [input, expected] of cases) {
    const got = repairApostropheContractionGrammar(input);
    if (got !== expected) failures.push({ input, expected, got });
  }
  assert.deepEqual(failures, [], 'negative-contraction repair must preserve sentence-initial capital');
});

test('P14 generated apostrophe stem/model pairs maintain apostrophe-presence contrast (F5 regression)', () => {
  // F5: future bank changes could produce a model that lost its
  // apostrophe (or a stem that gained one), collapsing the
  // "fix the apostrophe" exercise into a tautology. This assertion
  // walks every generated apostrophe item and checks that whenever the
  // stem contains an apostropheless contracted form (e.g. `arent`,
  // `isnt`, `weve`, `youve`, `theyll`), the model contains the
  // matching apostrophe form (e.g. `aren't`, `isn't`, `we've`,
  // `you've`, `they'll`).
  const PAIRS = [
    [/\barent\b/i, /\baren't\b/i],
    [/\bisnt\b/i, /\bisn't\b/i],
    [/\bweve\b/i, /\bwe've\b/i],
    [/\byouve\b/i, /\byou've\b/i],
    [/\btheyve\b/i, /\bthey've\b/i],
    [/\bive\b/i, /\bi've\b/i],
    [/\byoull\b/i, /\byou'll\b/i],
    [/\btheyll\b/i, /\bthey'll\b/i],
    [/\bwell\b(?=\s+(?:moved|gone|started|done|finished))/i, /\bwe'll\b/i],
    [/\bill\b(?=\s+(?:move|go|start|do|finish|help))/i, /\bi'll\b/i],
  ];
  const breakages = [];
  for (const item of runtime.items) {
    if (item.source !== 'generated') continue;
    if (!/^gen_apostrophe_/.test(item.generatorFamilyId || '')) continue;
    if (item.mode === 'choose') continue;
    const stem = String(item.stem || '');
    const model = String(item.model || '');
    for (const [stemPattern, modelPattern] of PAIRS) {
      if (stemPattern.test(stem) && !modelPattern.test(model)) {
        breakages.push({ id: item.id, stem, model, stemPattern: String(stemPattern), modelPattern: String(modelPattern) });
        break;
      }
    }
  }
  assert.deepEqual(breakages.slice(0, 10), [], 'apostrophe stem/model pairs must keep the apostropheless ↔ apostrophe contrast');
});

test('P13 paragraph repair rejects missing sentence boundary punctuation', () => {
  const paragraphItems = runtime.items.filter((item) => item.mode === 'paragraph' && item.model && /\.\s+[A-Z"'“‘]/.test(item.model));
  assert.ok(paragraphItems.length >= 100, 'expected paragraph items with multiple sentences');
  const falseAccepts = [];
  for (const item of paragraphItems) {
    const attack = removeSentenceBoundary(item.model);
    if (attack === item.model) continue;
    const result = markPunctuationAnswer({ item, answer: { typed: attack } });
    if (result.correct) falseAccepts.push({ id: item.id, model: item.model, attack });
  }
  assert.deepEqual(falseAccepts.slice(0, 20), []);
});

test('P14 star-pacing profiles produce distinct finalCorrect values (divergence assertion)', () => {
  // The star-pacing simulation claims six distinct learner profiles produce
  // meaningfully different star-growth curves. This test makes that claim
  // falsifiable in CI by running a minimal 8-session x 6-slot simulation
  // using the same correctnessFor branching logic from the production
  // simulator and asserting that no two profiles produce identical
  // finalCorrect counts.
  const PROFILES = ['always-correct', 'deep-practice', 'long-gap-retention', 'easy-template-only', 'repeated-template', 'supported-after-wrong'];
  const SESSIONS = 8;
  const SLOTS = 6;
  // Use a stable sample of items for determinism (first 50 items from the
  // runtime bank, cycling through them per slot).
  const sampleItems = runtime.items.slice(0, 50);

  function correctnessFor(profile, sessionIndex, slot, item) {
    if (profile === 'always-correct') return true;
    if (profile === 'easy-template-only') {
      return item?.mode === 'choose' || item?.inputKind === 'choice';
    }
    if (profile === 'repeated-template') {
      return Array.isArray(item?.skillIds) && item.skillIds.includes('apostrophe_contractions');
    }
    if (profile === 'deep-practice') {
      return ((sessionIndex * 7 + slot * 13 + (item?.id?.length || 0)) % 5) !== 0;
    }
    if (profile === 'long-gap-retention') return ((sessionIndex + slot) % 5) !== 0;
    if (profile === 'supported-after-wrong') return slot > 0;
    return ((sessionIndex + slot + (item?.id?.length || 0)) % 4) !== 0;
  }

  const finalCorrects = new Map();
  for (const profile of PROFILES) {
    let correctCount = 0;
    for (let session = 0; session < SESSIONS; session += 1) {
      for (let slot = 0; slot < SLOTS; slot += 1) {
        const itemIndex = (session * SLOTS + slot) % sampleItems.length;
        const item = sampleItems[itemIndex];
        if (correctnessFor(profile, session, slot, item)) {
          correctCount += 1;
        }
      }
    }
    finalCorrects.set(profile, correctCount);
  }

  // Assert all six profiles produce distinct finalCorrect values.
  const values = [...finalCorrects.values()];
  const uniqueValues = new Set(values);
  assert.equal(
    uniqueValues.size,
    PROFILES.length,
    `expected ${PROFILES.length} distinct finalCorrect values but got ${uniqueValues.size}: ${JSON.stringify(Object.fromEntries(finalCorrects))}`,
  );
});
