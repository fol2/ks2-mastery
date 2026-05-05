import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { selectPunctuationItem } from '../shared/punctuation/scheduler.js';

const LEGACY_RUNTIME_GENERATED_FIXTURE = Object.freeze([
  {
    id: 'gen_sentence_endings_insert_2skj48_1',
    generatorFamilyId: 'gen_sentence_endings_insert',
    stem: 'where is the tide bell',
    model: 'Where is the tide bell?',
    templateId: 'gen_sentence_endings_insert_template_xsusve',
    variantSignature: 'puncsig_rqywyf',
  },
  {
    id: 'gen_apostrophe_contractions_fix_1lwc3r9_1',
    generatorFamilyId: 'gen_apostrophe_contractions_fix',
    stem: 'Theyre sure we wont be late.',
    model: "They're sure we won't be late.",
    templateId: 'gen_apostrophe_contractions_fix_template_vcqv1j',
    variantSignature: 'puncsig_1l2jy9t',
  },
  {
    id: 'gen_apostrophe_possession_insert_7pl3be_1',
    generatorFamilyId: 'gen_apostrophe_possession_insert',
    stem: 'The captains whistle was beside the teams coats.',
    model: "The captain's whistle was beside the team's coats.",
    templateId: 'gen_apostrophe_possession_insert_template_100dwn',
    variantSignature: 'puncsig_17nx2qt',
  },
  {
    id: 'gen_apostrophe_mix_paragraph_16ngaez_1',
    generatorFamilyId: 'gen_apostrophe_mix_paragraph',
    stem: 'I cant find the mens boots. The boys jackets are drying.',
    model: "I can't find the men's boots. The boys' jackets are drying.",
    templateId: 'gen_apostrophe_mix_paragraph_template_1l5nlo5',
    variantSignature: 'puncsig_aco1pd',
  },
  {
    id: 'gen_speech_insert_1yxvgr8_1',
    generatorFamilyId: 'gen_speech_insert',
    stem: 'Maya asked, can we start now?',
    model: 'Maya asked, "Can we start now?"',
    templateId: 'gen_speech_insert_template_1s39sn2',
    variantSignature: 'puncsig_xihz5d',
  },
  {
    id: 'gen_list_commas_insert_1ge2lrh_1',
    generatorFamilyId: 'gen_list_commas_insert',
    stem: 'The box held shells bells and chalk.',
    model: 'The box held shells, bells and chalk.',
    templateId: 'gen_list_commas_insert_template_1xvy2rf',
    variantSignature: 'puncsig_1aonvno',
  },
  {
    id: 'gen_list_commas_combine_16m0xx5_1',
    generatorFamilyId: 'gen_list_commas_combine',
    stem: 'We collected\n- leaves\n- twigs\n- acorns',
    model: 'We collected leaves, twigs and acorns.',
    templateId: 'gen_list_commas_combine_template_qmva3q',
    variantSignature: 'puncsig_1e11bmr',
  },
  {
    id: 'gen_fronted_adverbial_fix_c1486l_1',
    generatorFamilyId: 'gen_fronted_adverbial_fix',
    stem: 'Before sunrise the crew checked the ropes.',
    model: 'Before sunrise, the crew checked the ropes.',
    templateId: 'gen_fronted_adverbial_fix_template_18k5e78',
    variantSignature: 'puncsig_823nwf',
  },
  {
    id: 'gen_fronted_adverbial_combine_1p2zww7_1',
    generatorFamilyId: 'gen_fronted_adverbial_combine',
    stem: 'After the rehearsal\nThe cast packed away the props.',
    model: 'After the rehearsal, the cast packed away the props.',
    templateId: 'gen_fronted_adverbial_combine_template_7tnqjq',
    variantSignature: 'puncsig_5xqw3g',
  },
  {
    id: 'gen_fronted_speech_paragraph_54jzze_1',
    generatorFamilyId: 'gen_fronted_speech_paragraph',
    stem: 'Before lunch Zara asked can we start now',
    model: 'Before lunch, Zara asked, "Can we start now?"',
    templateId: 'gen_fronted_speech_paragraph_template_ey0omc',
    variantSignature: 'puncsig_145vp3p',
  },
  {
    id: 'gen_comma_clarity_insert_1ka6sw6_1',
    generatorFamilyId: 'gen_comma_clarity_insert',
    stem: 'In the evening the harbour was quiet.',
    model: 'In the evening, the harbour was quiet.',
    templateId: 'gen_comma_clarity_insert_template_i1jwnt',
    variantSignature: 'puncsig_1czkw5m',
  },
  {
    id: 'gen_semicolon_fix_cpxxn3_1',
    generatorFamilyId: 'gen_semicolon_fix',
    stem: 'The rain eased, the match could continue.',
    model: 'The rain eased; the match could continue.',
    templateId: 'gen_semicolon_fix_template_s0pvzh',
    variantSignature: 'puncsig_7av6n9',
  },
  {
    id: 'gen_semicolon_combine_1po28rx_1',
    generatorFamilyId: 'gen_semicolon_combine',
    stem: 'The rain eased.\nThe match could continue.',
    model: 'The rain eased; the match could continue.',
    templateId: 'gen_semicolon_combine_template_1dp84xe',
    variantSignature: 'puncsig_1n25ezp',
  },
  {
    id: 'gen_colon_semicolon_paragraph_16u70qu_1',
    generatorFamilyId: 'gen_colon_semicolon_paragraph',
    stem: 'We needed three tools, a lantern, a compass and a notebook. The tide rose, the group moved inland.',
    model: 'We needed three tools: a lantern, a compass and a notebook. The tide rose; the group moved inland.',
    templateId: 'gen_colon_semicolon_paragraph_template_1mtafqy',
    variantSignature: 'puncsig_1lx0h8v',
  },
  {
    id: 'gen_dash_clause_fix_kwbiay_1',
    generatorFamilyId: 'gen_dash_clause_fix',
    stem: 'The gate was stuck we found another path.',
    model: 'The gate was stuck – we found another path.',
    templateId: 'gen_dash_clause_fix_template_11ejvfc',
    variantSignature: 'puncsig_erog6d',
  },
  {
    id: 'gen_dash_clause_combine_n82560_1',
    generatorFamilyId: 'gen_dash_clause_combine',
    stem: 'The gate was stuck.\nWe found another path.',
    model: 'The gate was stuck – we found another path.',
    templateId: 'gen_dash_clause_combine_template_1o45ea6',
    variantSignature: 'puncsig_5qqk8w',
  },
  {
    id: 'gen_hyphen_insert_1hy8roa_1',
    generatorFamilyId: 'gen_hyphen_insert',
    stem: 'The little used path was hidden.',
    model: 'The little-used path was hidden.',
    templateId: 'gen_hyphen_insert_template_1cjtd6l',
    variantSignature: 'puncsig_1lmq2gq',
  },
  {
    id: 'gen_parenthesis_fix_9wagle_1',
    generatorFamilyId: 'gen_parenthesis_fix',
    stem: 'The harbour, an old fishing port was busy.',
    model: 'The harbour, an old fishing port, was busy.',
    templateId: 'gen_parenthesis_fix_template_1afsvei',
    variantSignature: 'puncsig_1c9v5hl',
  },
  {
    id: 'gen_parenthesis_combine_16f6gao_1',
    generatorFamilyId: 'gen_parenthesis_combine',
    stem: 'The harbour was busy.\nExtra detail: an old fishing port',
    model: 'The harbour, an old fishing port, was busy.',
    templateId: 'gen_parenthesis_combine_template_zw0cs4',
    variantSignature: 'puncsig_17xfcox',
  },
  {
    id: 'gen_parenthesis_speech_paragraph_1qpmi5o_1',
    generatorFamilyId: 'gen_parenthesis_speech_paragraph',
    stem: 'The harbour an old fishing port was busy. Ravi said the bell is ringing',
    model: 'The harbour, an old fishing port, was busy. Ravi said, "The bell is ringing."',
    templateId: 'gen_parenthesis_speech_paragraph_template_188l1dz',
    variantSignature: 'puncsig_1odmcb7',
  },
  {
    id: 'gen_colon_list_insert_1paxk8a_1',
    generatorFamilyId: 'gen_colon_list_insert',
    stem: 'We needed three tools a torch, a rope and a map.',
    model: 'We needed three tools: a torch, a rope and a map.',
    templateId: 'gen_colon_list_insert_template_drw7oh',
    variantSignature: 'puncsig_10m4u9s',
  },
  {
    id: 'gen_colon_list_combine_1whlzxk_1',
    generatorFamilyId: 'gen_colon_list_combine',
    stem: 'We needed three tools\na torch / a rope / a map',
    model: 'We needed three tools: a torch, a rope and a map.',
    templateId: 'gen_colon_list_combine_template_lti8wz',
    variantSignature: 'puncsig_k5t5fh',
  },
  {
    id: 'gen_semicolon_list_fix_nhuyyk_1',
    generatorFamilyId: 'gen_semicolon_list_fix',
    stem: 'We visited Dover, England, Lyon, France and Porto, Portugal.',
    model: 'We visited Dover, England; Lyon, France; and Porto, Portugal.',
    templateId: 'gen_semicolon_list_fix_template_zurnf7',
    variantSignature: 'puncsig_1gq3mzq',
  },
  {
    id: 'gen_bullet_points_fix_1rwpig0_1',
    generatorFamilyId: 'gen_bullet_points_fix',
    stem: 'Bring:\n- a coat.\n- a torch\n- a notebook.',
    model: 'Bring:\n- a coat.\n- a torch.\n- a notebook.',
    templateId: 'gen_bullet_points_fix_template_3tfe0s',
    variantSignature: 'puncsig_8wrlau',
  },
  {
    id: 'gen_bullet_points_paragraph_ovdjqh_1',
    generatorFamilyId: 'gen_bullet_points_paragraph',
    stem: 'Bring\n- a coat.\n- a torch\n- a notebook.',
    model: 'Bring:\n- a coat\n- a torch\n- a notebook',
    templateId: 'gen_bullet_points_paragraph_template_1pn0ihi',
    variantSignature: 'puncsig_1n9pc7n',
  },
]);

const P2_PRIORITY_CAPACITY_FAMILIES = Object.freeze([
  'gen_sentence_endings_insert',
  'gen_apostrophe_contractions_fix',
  'gen_comma_clarity_insert',
  'gen_dash_clause_fix',
  'gen_dash_clause_combine',
  'gen_hyphen_insert',
  'gen_semicolon_list_fix',
]);

const GENERATED_CHOICE_FAMILIES = new Set([
  'gen_sentence_endings_choose',
  'gen_apostrophe_possession_choose',
  'gen_list_commas_choose',
]);
const LEGACY_RUNTIME_GENERATED_FAMILY_IDS = new Set(
  LEGACY_RUNTIME_GENERATED_FIXTURE.map((item) => item.generatorFamilyId),
);

const P12_RELEASE_PRIORITY_RUNTIME_FOUR = Object.freeze({
  gen_sentence_endings_insert: [
    ['p12q_gen_sentence_endings_insert_001', 'puncsig_1fqwqxb'],
    ['p12q_gen_sentence_endings_insert_002', 'puncsig_12hpz3b'],
    ['p12q_gen_sentence_endings_insert_003', 'puncsig_1kvvo5w'],
    ['p12q_gen_sentence_endings_insert_004', 'puncsig_nk735c'],
  ],
  gen_apostrophe_contractions_fix: [
    ['p12q_gen_apostrophe_contractions_fix_002', 'puncsig_1klylj'],
    ['p12q_gen_apostrophe_contractions_fix_001', 'puncsig_dc33fm'],
    ['p12q_gen_apostrophe_contractions_fix_004', 'puncsig_4tzz83'],
    ['p12q_gen_apostrophe_contractions_fix_003', 'puncsig_1p4ngwo'],
  ],
  gen_comma_clarity_insert: [
    ['p12q_gen_comma_clarity_insert_001', 'puncsig_1fxbgh6'],
    ['p12q_gen_comma_clarity_insert_002', 'puncsig_1n5zamj'],
    ['p12q_gen_comma_clarity_insert_003', 'puncsig_1n27lls'],
    ['p12q_gen_comma_clarity_insert_004', 'puncsig_1ovldlr'],
  ],
  gen_dash_clause_fix: [
    ['p12q_gen_dash_clause_fix_001', 'puncsig_76nbmk'],
    ['p12q_gen_dash_clause_fix_002', 'puncsig_1lm3x71'],
    ['p12q_gen_dash_clause_fix_003', 'puncsig_1ne8czi'],
    ['p12q_gen_dash_clause_fix_004', 'puncsig_d8cc7n'],
  ],
  gen_dash_clause_combine: [
    ['p12q_gen_dash_clause_combine_001', 'puncsig_g3q0sw'],
    ['p12q_gen_dash_clause_combine_002', 'puncsig_9aq95l'],
    ['p12q_gen_dash_clause_combine_003', 'puncsig_kw2j20'],
    ['p12q_gen_dash_clause_combine_004', 'puncsig_198u5j5'],
  ],
  gen_hyphen_insert: [
    ['p12q_gen_hyphen_insert_001', 'puncsig_10mpidv'],
    ['p12q_gen_hyphen_insert_002', 'puncsig_jlmdg0'],
    ['p12q_gen_hyphen_insert_003', 'puncsig_1ahd9jt'],
    ['p12q_gen_hyphen_insert_004', 'puncsig_vwd4og'],
  ],
  gen_semicolon_list_fix: [
    ['p12q_gen_semicolon_list_fix_001', 'puncsig_1jirmig'],
    ['p12q_gen_semicolon_list_fix_002', 'puncsig_h14lpp'],
    ['p12q_gen_semicolon_list_fix_003', 'puncsig_rdu5kk'],
    ['p12q_gen_semicolon_list_fix_004', 'puncsig_1tncz97'],
  ],
});

function correctAnswerForGeneratedItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    return { choiceIndex: item.correctIndex };
  }
  return { typed: item.model };
}

test('generated punctuation items are deterministic, unique, and family-scoped', () => {
  const first = createPunctuationGeneratedItems({ seed: 'release-a', perFamily: 2 });
  const second = createPunctuationGeneratedItems({ seed: 'release-a', perFamily: 2 });
  const differentSeed = createPunctuationGeneratedItems({ seed: 'release-b', perFamily: 2 });

  assert.deepEqual(second, first);
  assert.equal(first.length, PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length * 2);
  assert.equal(new Set(first.map((item) => item.id)).size, first.length);
  assert.equal(first.every((item) => item.source === 'generated'), true);
  assert.equal(first.every((item) => item.generatorFamilyId), true);
  assert.equal(first.every((item) => item.templateId), true);
  assert.equal(first.every((item) => /^puncsig_[a-z0-9]+$/.test(item.variantSignature)), true);
  assert.notDeepEqual(differentSeed.map((item) => item.id), first.map((item) => item.id));
});

test('generated punctuation first variants use the reviewed P12 surface bank', () => {
  const generated = createPunctuationGeneratedItems({ seed: 'legacy-runtime', perFamily: 1 });
  // P20: filter to the original non-choice, non-transfer legacy families so
  // the comparable surface still matches the frozen first-variant fixture.
  const legacyComparable = generated
    .filter((item) => LEGACY_RUNTIME_GENERATED_FAMILY_IDS.has(item.generatorFamilyId));

  assert.equal(legacyComparable.length, LEGACY_RUNTIME_GENERATED_FIXTURE.length);
  assert.equal(generated.length, PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length);
  assert.equal(generated.every((item) => !/_template_\\d+$/.test(item.templateId)), true);
  // Baseline templates use p12q_ prefix; transfer DSL templates use a generic
  // hash prefix from the DSL framework.
  assert.equal(legacyComparable.every((item) => item.templateId.startsWith('p12q_')), true);
  assert.equal(new Set(generated.map((item) => item.variantSignature)).size, generated.length);
  for (const item of generated.filter((entry) => GENERATED_CHOICE_FAMILIES.has(entry.generatorFamilyId))) {
    assert.equal(item.mode, 'choose', item.id);
    assert.equal(item.inputKind, 'choice', item.id);
    assert.ok(Array.isArray(item.options), item.id);
    assert.equal(Number.isInteger(item.correctIndex), true, item.id);
  }
});

test('generated punctuation signatures detect duplicate learner-visible surfaces', () => {
  const items = createPunctuationGeneratedItems({ seed: 'signature', perFamily: 3 });
  const clone = {
    ...items[0],
    id: `${items[0].id}_copy`,
  };

  assert.equal(clone.variantSignature, items[0].variantSignature);
});

test('expanded priority generated banks add spare distinct capacity after runtime variants', () => {
  const items = createPunctuationGeneratedItems({ seed: 'expanded-bank', perFamily: 8 });

  for (const familyId of P2_PRIORITY_CAPACITY_FAMILIES) {
    const familyItems = items.filter((item) => item.generatorFamilyId === familyId);
    assert.equal(familyItems.length, 8, familyId);
    assert.equal(new Set(familyItems.map((item) => item.variantSignature)).size, 8, familyId);
    assert.equal(new Set(familyItems.map((item) => item.templateId)).size, 8, familyId);
  }
});

test('generated punctuation model answers pass deterministic marking', () => {
  const generatedItems = createPunctuationGeneratedItems({ seed: 'marking-smoke', perFamily: 8 });
  for (const item of generatedItems) {
    const result = markPunctuationAnswer({ item, answer: correctAnswerForGeneratedItem(item) });
    assert.equal(result.correct, true, item.id);
  }
});

test('priority capacity expansion pins the first four P12 generated surfaces', () => {
  const generatedItems = createPunctuationGeneratedItems({
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed,
    perFamily: 4,
  });
  const generatedRuntime = generatedItems.filter((item) => item.source === 'generated');
  const runtimeManifest = createPunctuationRuntimeManifest({
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed,
    generatedPerFamily: 4,
  });
  const runtimeIndexes = createPunctuationContentIndexes(runtimeManifest);

  assert.equal(generatedRuntime.length, PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length * 4);
  assert.equal(
    runtimeIndexes.items.length,
    PUNCTUATION_CONTENT_MANIFEST.items.length + (PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length * 4),
  );
  assert.equal(
    runtimeIndexes.items.filter((item) => item.source === 'generated').length,
    PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length * 4,
  );

  for (const [familyId, expected] of Object.entries(P12_RELEASE_PRIORITY_RUNTIME_FOUR)) {
    const actual = generatedItems
      .filter((item) => item.generatorFamilyId === familyId)
      .map((item) => [item.templateId, item.variantSignature])
      .sort(([a], [b]) => a.localeCompare(b));
    const sortedExpected = [...expected].sort(([a], [b]) => a.localeCompare(b));
    assert.deepEqual(actual, sortedExpected, familyId);
  }
});

test('generated dash and list-comma model answers stay aligned with deterministic marking', () => {
  const generatedItems = createPunctuationGeneratedItems({ seed: 'dash-list-policy', perFamily: 4 });
  const policyItems = generatedItems.filter((item) => [
    'gen_dash_clause_fix',
    'gen_dash_clause_combine',
    'gen_list_commas_insert',
    'gen_list_commas_combine',
  ].includes(item.generatorFamilyId));

  assert.equal(policyItems.length, 16);
  for (const item of policyItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true, item.id);
  }

  const dashItems = policyItems.filter((item) => item.generatorFamilyId.startsWith('gen_dash_clause_'));
  for (const item of dashItems) {
    assert.match(item.model, /\s–\s/, item.id);
    assert.doesNotMatch(item.model, /\s-\s/, item.id);
    for (const typed of [
      item.model.replace(' – ', ' - '),
      item.model,
      item.model.replace(' – ', ' — '),
    ]) {
      const result = markPunctuationAnswer({ item, answer: { typed } });
      assert.equal(result.correct, true, `${item.id}: ${typed}`);
    }
  }
});

test('runtime manifest adds generated practice without changing reward denominators', () => {
  const baseIndexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
  const runtimeManifest = createPunctuationRuntimeManifest({ seed: 'runtime', generatedPerFamily: 1 });
  const runtimeIndexes = createPunctuationContentIndexes(runtimeManifest);

  assert.equal(runtimeIndexes.items.length, baseIndexes.items.length + PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length);
  assert.deepEqual(
    runtimeIndexes.publishedRewardUnits.map((unit) => unit.masteryKey),
    baseIndexes.publishedRewardUnits.map((unit) => unit.masteryKey),
  );
});

test('scheduler can select generated practice inside the bounded candidate window', () => {
  const indexes = createPunctuationContentIndexes(createPunctuationRuntimeManifest({
    seed: 'scheduler',
    generatedPerFamily: 1,
  }));
  const result = selectPunctuationItem({
    indexes,
    progress: { items: {} },
    session: { answeredCount: 1, recentItemIds: [] },
    prefs: { mode: 'endmarks' },
    now: 0,
    random: () => 0.99,
    candidateWindow: 8,
  });

  assert.equal(result.targetMode, 'insert');
  assert.equal(result.item.source, 'generated');
  assert.equal(result.item.generatorFamilyId, 'gen_p20_sentence_endings_insert');
});
