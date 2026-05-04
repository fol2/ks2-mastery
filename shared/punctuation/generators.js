import {
  PUNCTUATION_CONTENT_MANIFEST,
} from './content.js';
import {
  contextPackTemplatesForFamily,
} from './context-packs.js';
import { expandDslTemplates } from './template-dsl.js';
import {
  manualExpansionTemplatesForFamily,
  PUNCTUATION_MANUAL_EXPANSION_TARGET_DEPTH,
} from './manual-expansion-bank.js';
import { manualP12QualityTemplatesForFamily } from './manual-p12-quality-bank.js';
import { sentenceEndingsInsertDsl } from './dsl-families/sentence-endings-insert.js';
import { apostropheContractionsDsl } from './dsl-families/apostrophe-contractions-fix.js';
import { commaClarityInsertDsl } from './dsl-families/comma-clarity-insert.js';
import { dashClauseFixDsl } from './dsl-families/dash-clause-fix.js';
import { dashClauseCombineDsl } from './dsl-families/dash-clause-combine.js';
import { hyphenInsertDsl } from './dsl-families/hyphen-insert.js';
import { semicolonListFixDsl } from './dsl-families/semicolon-list-fix.js';
import { apostrophePossessionInsertDsl } from './dsl-families/apostrophe-possession-insert.js';
import { apostropheMixParagraphDsl } from './dsl-families/apostrophe-mix-paragraph.js';
import { speechInsertDsl } from './dsl-families/speech-insert.js';
import { frontedSpeechParagraphDsl } from './dsl-families/fronted-speech-paragraph.js';
import { listCommasInsertDsl } from './dsl-families/list-commas-insert.js';
import { listCommasCombineDsl } from './dsl-families/list-commas-combine.js';
import { frontedAdverbialFixDsl } from './dsl-families/fronted-adverbial-fix.js';
import { frontedAdverbialCombineDsl } from './dsl-families/fronted-adverbial-combine.js';
import { parenthesisFixDsl } from './dsl-families/parenthesis-fix.js';
import { parenthesisCombineDsl } from './dsl-families/parenthesis-combine.js';
import { parenthesisSpeechParagraphDsl } from './dsl-families/parenthesis-speech-paragraph.js';
import { colonListInsertDsl } from './dsl-families/colon-list-insert.js';
import { colonListCombineDsl } from './dsl-families/colon-list-combine.js';
import { semicolonFixDsl } from './dsl-families/semicolon-fix.js';
import { semicolonCombineDsl } from './dsl-families/semicolon-combine.js';
import { colonSemicolonParagraphDsl } from './dsl-families/colon-semicolon-paragraph.js';
import { bulletPointsFixDsl } from './dsl-families/bullet-points-fix.js';
import { bulletPointsParagraphDsl } from './dsl-families/bullet-points-paragraph.js';
import {
  sentenceEndingsTransferDsl,
  listCommasTransferDsl,
  apostropheContractionsTransferDsl,
  apostrophePossessionTransferDsl,
  speechTransferDsl,
  frontedAdverbialTransferDsl,
  parenthesisTransferDsl,
  commaClarityTransferDsl,
  colonListTransferDsl,
  semicolonTransferDsl,
  dashClauseTransferDsl,
  semicolonListTransferDsl,
  bulletPointsTransferDsl,
  hyphenTransferDsl,
} from './dsl-families/transfer-bank.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shortHash(value) {
  return hashString(value).toString(36).padStart(6, '0').slice(0, 8);
}

function normaliseSignatureText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value)
    .sort()
    .map((key) => [key, stableJson(value[key])]));
}

/**
 * Strip `explanation`, `explanationRuleId`, and `preserveTokens` keys before hashing.
 * These are learner-feedback/preservation additions that must not alter template identity.
 */
function stripExplanationForHash(value) {
  if (Array.isArray(value)) return value.map(stripExplanationForHash);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'explanation' && key !== 'explanationRuleId' && key !== 'preserveTokens')
      .map(([key, v]) => [key, stripExplanationForHash(v)]),
  );
}

function templateIdFor(familyId, template) {
  const explicit = typeof template?.templateId === 'string' ? template.templateId.trim() : '';
  if (explicit) return explicit;
  const payload = {
    prompt: normaliseSignatureText(template.prompt || ''),
    stem: normaliseSignatureText(template.stem || ''),
    model: normaliseSignatureText(template.model || ''),
    accepted: Array.isArray(template.accepted)
      ? template.accepted.map(normaliseSignatureText).sort()
      : [],
    skillIds: uniqueStrings(template.skillIds).sort(),
    clusterId: template.clusterId || '',
    validator: stableJson(stripExplanationForHash(template.validator || {})),
    rubric: stableJson(template.rubric || {}),
  };
  return `${familyId}_template_${shortHash(JSON.stringify(stableJson(payload)))}`;
}

function variantSignatureFor({ family, template, templateId, model }) {
  const signaturePayload = {
    familyId: family.id,
    mode: family.mode,
    templateId,
    prompt: normaliseSignatureText(template.prompt || ''),
    stem: normaliseSignatureText(template.stem || ''),
    model: normaliseSignatureText(model || ''),
    skillIds: uniqueStrings(template.skillIds).sort(),
    clusterId: template.clusterId || '',
    validatorType: isPlainObject(template.validator) ? template.validator.type || '' : '',
    rubricType: isPlainObject(template.rubric) ? template.rubric.type || '' : '',
  };
  return `puncsig_${shortHash(JSON.stringify(stableJson(signaturePayload)))}`;
}

function pickTemplate(templates, seed, familyId, variantIndex, {
  legacyTemplateCount = 2,
  runtimeStableTemplateCount = legacyTemplateCount,
} = {}) {
  if (!templates.length) return null;
  const legacyCount = Math.max(0, Math.min(Number(legacyTemplateCount) || 0, templates.length));
  const stableCount = Math.max(
    legacyCount,
    Math.min(Number(runtimeStableTemplateCount) || legacyCount, templates.length),
  );
  const stableExpansionPool = templates.slice(legacyCount, stableCount);
  const capacityExpansionPool = templates.slice(stableCount);
  const pool = (() => {
    if (variantIndex < legacyCount) return templates.slice(0, legacyCount || templates.length);
    if (variantIndex < stableCount && stableExpansionPool.length) return stableExpansionPool;
    if (capacityExpansionPool.length) return capacityExpansionPool;
    if (stableExpansionPool.length) return stableExpansionPool;
    return templates.slice(0, legacyCount || templates.length);
  })();
  const offset = hashString(`${seed}:${familyId}`) % pool.length;
  const poolVariantIndex = (() => {
    if (variantIndex < legacyCount) return variantIndex;
    if (variantIndex < stableCount && stableExpansionPool.length) return variantIndex - legacyCount;
    if (capacityExpansionPool.length) return variantIndex - stableCount;
    if (stableExpansionPool.length) return variantIndex - legacyCount;
    return variantIndex;
  })();
  const poolIndex = (offset + poolVariantIndex) % pool.length;
  const template = pool[poolIndex];
  return {
    template,
    templateIndex: Math.max(0, templates.indexOf(template)),
  };
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((entry) => typeof entry === 'string' && entry))];
}

function withManualExpansion(familyId, templates) {
  const p12QualityTemplates = manualP12QualityTemplatesForFamily(familyId);
  if (p12QualityTemplates.length) return Object.freeze([...p12QualityTemplates]);
  return Object.freeze([
    ...templates,
    ...manualExpansionTemplatesForFamily(familyId),
  ]);
}


const GENERATED_TEMPLATE_QUALITY_FIX_FAMILIES = new Set([
  'gen_apostrophe_contractions_fix',
  'gen_apostrophe_mix_paragraph',
]);

function sentenceCaseFirst(value) {
  const text = String(value ?? '');
  return text.replace(/^([\s"'“‘]*)([a-z])/, (_match, prefix, first) => `${prefix}${first.toUpperCase()}`);
}

function repairApostropheContractionGrammar(value) {
  return String(value ?? '')
    .replace(/\byouve ready to move\b/gi, 'youve moved')
    .replace(/\byou've ready to move\b/gi, "you've moved")
    .replace(/\bweve ready to move\b/gi, 'weve moved')
    .replace(/\bwe've ready to move\b/gi, "we've moved")
    .replace(/\btheyll ready to move\b/gi, 'theyll move')
    .replace(/\bthey'll ready to move\b/gi, "they'll move")
    .replace(/\bwell ready to move\b/gi, 'well move')
    .replace(/\bwe'll ready to move\b/gi, "we'll move")
    .replace(/\bit isnt move\b/gi, 'it isnt safe to move')
    .replace(/\bit isn't move\b/gi, "it isn't safe to move")
    .replace(/\bwe arent move\b/gi, 'we arent ready to move')
    .replace(/\bwe aren't move\b/gi, "we aren't ready to move")
    .replace(/\bit isnt forget\b/gi, 'it isnt safe to forget')
    .replace(/\bit isn't forget\b/gi, "it isn't safe to forget")
    .replace(/\bwe arent forget\b/gi, 'we arent ready to forget')
    .replace(/\bwe aren't forget\b/gi, "we aren't ready to forget");
}

function mapTemplateStrings(value, mapper) {
  if (typeof value === 'string') return mapper(value);
  if (Array.isArray(value)) return value.map((entry) => mapTemplateStrings(entry, mapper));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapTemplateStrings(entry, mapper)]));
}

function qualityNormalisedGeneratedTemplate(familyId, template) {
  if (!GENERATED_TEMPLATE_QUALITY_FIX_FAMILIES.has(familyId) || !isPlainObject(template)) return template;
  const clone = { ...template };
  const repair = (value) => repairApostropheContractionGrammar(value);
  const repairSentence = (value) => sentenceCaseFirst(repair(value));

  if (typeof clone.stem === 'string') clone.stem = repairSentence(clone.stem);
  if (typeof clone.model === 'string') clone.model = repairSentence(clone.model);
  if (Array.isArray(clone.accepted)) clone.accepted = clone.accepted.map(repairSentence);
  if (Array.isArray(clone.options)) clone.options = clone.options.map(repairSentence);
  if (isPlainObject(clone.tests)) clone.tests = mapTemplateStrings(clone.tests, repairSentence);
  if (isPlainObject(clone.validator)) clone.validator = mapTemplateStrings(clone.validator, repair);
  return clone;
}

function optionChoiceTemplate({
  templateId,
  skillIds,
  clusterId,
  prompt,
  stem,
  options,
  correctIndex,
  explanation,
  misconceptionTags,
  readiness = ['retrieve_discriminate', 'misconception', 'negative_test'],
  explanationRuleId,
}) {
  return {
    templateId,
    skillIds,
    clusterId,
    prompt,
    stem,
    options,
    correctIndex,
    model: options[correctIndex],
    explanation,
    misconceptionTags,
    readiness,
    explanationRuleId,
  };
}

function firstLower(value) {
  const text = String(value ?? '');
  return text ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
}

function sentenceEndingChooseTemplates() {
  const questions = [
    'Where did the green kite land',
    'Why was the library door locked',
    'When will the science club meet',
    'How did the team find the clue',
    'Which route leads to the museum',
    'Who left the lantern beside the path',
    'What made the old bell ring',
    'Where should the class plant the seeds',
    'Why did the bus stop early',
    'When does the rehearsal begin',
    'How can the robot cross the bridge',
    'Which shelf holds the atlases',
    'Who painted the scenery for the play',
    'What caused the lights to flicker',
    'Where will the choir stand',
    'Why is the river rising so quickly',
    'When should the laptops be returned',
    'How did the puppy open the gate',
    'Which captain chose the blue flag',
    'Who packed the emergency blanket',
    'What made the crowd cheer',
    'Where did the paper plane fall',
    'Why are the windows steamed up',
    'When will the ferry leave',
    'How should the clues be sorted',
    'Which drawer contains the scissors',
    'Who fixed the broken microphone',
    'What will the gardener water first',
    'Where can the badges be collected',
    'Why did the coach cancel practice',
    'When did the storm reach the harbour',
    'How will the class record the results',
    'Which path avoids the muddy field',
    'Who noticed the missing ticket',
    'What made the engine splutter',
    'Where should the visitors sign in',
    'Why is the playground closed today',
    'When can the team collect their medals',
    'How did the map get torn',
    'Which clue belongs in the final box',
  ];
  return questions.map((text, index) => optionChoiceTemplate({
    templateId: `gen_sentence_endings_choose_${index + 1}`,
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    prompt: 'Choose the correctly punctuated question.',
    stem: `Which version correctly punctuates "${text}"?`,
    options: [
      `${text}.`,
      `${text}?`,
      `${firstLower(text)}?`,
      text,
    ],
    correctIndex: 1,
    explanation: 'A question asks something, so it needs a capital letter and a question mark.',
    misconceptionTags: ['endmarks.mark_mismatch', 'endmarks.capitalisation_missing', 'endmarks.terminal_missing'],
    explanationRuleId: 'sentence-ending.terminal-mark',
  }));
}

function apostrophePossessionChooseTemplates() {
  const rows = [
    ['teachers', 'notes', 'desk'], ['girls', 'bags', 'bench'], ['boys', 'jackets', 'peg'], ['doctors', 'coats', 'hook'],
    ['parents', 'chairs', 'hall'], ['players', 'shirts', 'basket'], ['farmers', 'tools', 'shed'], ['visitors', 'tickets', 'table'],
    ['children', 'books', 'shelf'], ['artists', 'brushes', 'tray'], ['pilots', 'maps', 'folder'], ['sailors', 'boots', 'deck'],
    ['dancers', 'ribbons', 'box'], ['runners', 'numbers', 'desk'], ['neighbours', 'letters', 'porch'], ['helpers', 'badges', 'drawer'],
    ['captains', 'plans', 'clipboard'], ['drivers', 'keys', 'office'], ['scientists', 'samples', 'freezer'], ['gardeners', 'gloves', 'bucket'],
    ['musicians', 'stands', 'stage'], ['authors', 'drafts', 'folder'], ['nurses', 'forms', 'cabinet'], ['builders', 'helmets', 'van'],
    ['chefs', 'aprons', 'rail'], ['guides', 'flags', 'counter'], ['families', 'picnics', 'field'], ['classes', 'posters', 'wall'],
    ['teams', 'water bottles', 'crate'], ['clubs', 'notices', 'board'], ['foxes', 'tracks', 'snow'], ['horses', 'blankets', 'stable'],
    ['heroes', 'medals', 'case'], ['buses', 'mirrors', 'garage'], ['libraries', 'windows', 'courtyard'], ['companies', 'offices', 'city'],
    ['puppies', 'leads', 'basket'], ['babies', 'blankets', 'cot'], ['families', 'photos', 'album'], ['secretaries', 'folders', 'shelf'],
  ];
  return rows.map(([owner, noun, place], index) => {
    const pluralPossessive = owner.endsWith('s') ? `${owner}'` : `${owner}'s`;
    const singular = singularOwner(owner);
    const misplacedPlural = owner.endsWith('s') ? `${owner}'s` : `${owner}'`;
    return optionChoiceTemplate({
      templateId: `gen_apostrophe_possession_choose_${index + 1}`,
      skillIds: ['apostrophe_possession'],
      clusterId: 'apostrophe',
      prompt: 'Choose the sentence with the correct possessive apostrophe.',
      stem: `The ${noun} belong to more than one ${singular}.`,
      options: [
        `The ${owner} ${noun} were on the ${place}.`,
        `The ${pluralPossessive} ${noun} were on the ${place}.`,
        `The ${singular}'s ${noun} were on the ${place}.`,
        `The ${misplacedPlural} ${noun} were on the ${place}.`,
      ],
      correctIndex: 1,
      explanation: 'The apostrophe comes after the plural owner because the things belong to more than one person or group.',
      misconceptionTags: ['apostrophes.possession_missing', 'apostrophes.singular_plural_confusion'],
      explanationRuleId: 'apostrophe.plural-possession',
    });
  });
}

function singularOwner(owner) {
  const text = String(owner ?? '');
  if (text === 'children') return 'child';
  if (text.endsWith('ies')) return `${text.slice(0, -3)}y`;
  if (text.endsWith('ses') || text.endsWith('xes')) return text.slice(0, -2);
  if (text.endsWith('s')) return text.slice(0, -1);
  return text;
}

function listCommasChooseTemplates() {
  const rows = [
    ['The tray held', ['pens', 'pencils', 'rulers']], ['The picnic basket contained', ['rolls', 'apples', 'juice boxes']],
    ['The robot carried', ['wires', 'sensors', 'spare wheels']], ['The museum display showed', ['coins', 'maps', 'photographs']],
    ['The kit bag held', ['boots', 'shin pads', 'water bottles']], ['The shelf stored', ['glue sticks', 'card', 'scissors']],
    ['The pond contained', ['reeds', 'frogs', 'smooth stones']], ['The recipe needed', ['flour', 'eggs', 'milk']],
    ['The control panel showed', ['buttons', 'lights', 'switches']], ['The campsite had', ['tents', 'lanterns', 'folding chairs']],
    ['The garden produced', ['beans', 'carrots', 'radishes']], ['The drawer contained', ['paperclips', 'labels', 'stamps']],
    ['The sports hall stored', ['mats', 'hoops', 'cones']], ['The suitcase held', ['socks', 'jumpers', 'trainers']],
    ['The aquarium displayed', ['crabs', 'starfish', 'anemones']], ['The toolbox contained', ['screws', 'nails', 'pliers']],
    ['The stage crew moved', ['chairs', 'props', 'curtains']], ['The forest walk passed', ['oaks', 'ferns', 'bluebells']],
    ['The science table held', ['beakers', 'magnets', 'thermometers']], ['The classroom cupboard stored', ['paint', 'brushes', 'aprons']],
    ['The beach bag held', ['towels', 'goggles', 'sun hats']], ['The bakery sold', ['loaves', 'buns', 'pastries']],
    ['The orchestra tuned', ['violins', 'trumpets', 'cellos']], ['The farm grew', ['wheat', 'barley', 'peas']],
    ['The castle room contained', ['shields', 'flags', 'tapestries']], ['The weather station recorded', ['rainfall', 'wind speed', 'temperature']],
    ['The workshop displayed', ['models', 'plans', 'paint samples']], ['The bird table attracted', ['sparrows', 'robins', 'blackbirds']],
    ['The library trolley carried', ['novels', 'comics', 'atlases']], ['The rescue kit included', ['bandages', 'blankets', 'torches']],
    ['The art box held', ['chalks', 'charcoal', 'pastels']], ['The harbour contained', ['boats', 'buoys', 'ropes']],
    ['The rehearsal room needed', ['scripts', 'costumes', 'music stands']], ['The school office ordered', ['folders', 'pens', 'notebooks']],
    ['The hiking group packed', ['maps', 'snacks', 'waterproofs']], ['The nature table showed', ['shells', 'feathers', 'seed pods']],
    ['The lunch counter served', ['soup', 'sandwiches', 'fruit']], ['The repair team brought', ['ladders', 'cables', 'toolboxes']],
    ['The zoo enclosure had', ['rocks', 'logs', 'shallow pools']], ['The craft club used', ['thread', 'buttons', 'felt']],
  ];
  return rows.map(([opening, list], index) => {
    const [first, second, third] = list;
    const correct = `${opening} ${first}, ${second} and ${third}.`;
    return optionChoiceTemplate({
      templateId: `gen_list_commas_choose_${index + 1}`,
      skillIds: ['list_commas'],
      clusterId: 'comma_flow',
      prompt: 'Choose the sentence with commas used correctly in the list.',
      stem: `Pick the best punctuation for this list: ${first}; ${second}; ${third}.`,
      options: [
        correct,
        `${opening}, ${first}, ${second} and ${third}.`,
        `${opening} ${first} ${second} and ${third}.`,
        `${opening} ${first}, ${second}, and, ${third}.`,
      ],
      correctIndex: 0,
      explanation: 'Commas separate the first items in the list, while and joins the final item.',
      misconceptionTags: ['commas.list_separator_missing', 'commas.list_boundary_extra'],
      explanationRuleId: 'comma.list',
    });
  });
}

export const GENERATED_TEMPLATE_BANK = Object.freeze({
  gen_sentence_endings_choose: withManualExpansion('gen_sentence_endings_choose', sentenceEndingChooseTemplates()),
  gen_sentence_endings_insert: withManualExpansion('gen_sentence_endings_insert', expandDslTemplates(sentenceEndingsInsertDsl, { embedTemplateId: false })),
  gen_apostrophe_possession_choose: withManualExpansion('gen_apostrophe_possession_choose', apostrophePossessionChooseTemplates()),
  gen_apostrophe_contractions_fix: Object.freeze(
    withManualExpansion(
      'gen_apostrophe_contractions_fix',
      expandDslTemplates(apostropheContractionsDsl, { embedTemplateId: false }),
    ).map((template) => qualityNormalisedGeneratedTemplate('gen_apostrophe_contractions_fix', template)),
  ),
  gen_apostrophe_possession_insert: withManualExpansion('gen_apostrophe_possession_insert', expandDslTemplates(apostrophePossessionInsertDsl, { embedTemplateId: false })),
  gen_apostrophe_mix_paragraph: Object.freeze(
    withManualExpansion(
      'gen_apostrophe_mix_paragraph',
      expandDslTemplates(apostropheMixParagraphDsl, { embedTemplateId: false }),
    ).map((template) => qualityNormalisedGeneratedTemplate('gen_apostrophe_mix_paragraph', template)),
  ),
  gen_speech_insert: withManualExpansion('gen_speech_insert', expandDslTemplates(speechInsertDsl, { embedTemplateId: false })),
  gen_list_commas_choose: withManualExpansion('gen_list_commas_choose', listCommasChooseTemplates()),
  gen_list_commas_insert: withManualExpansion('gen_list_commas_insert', expandDslTemplates(listCommasInsertDsl, { embedTemplateId: false })),
  gen_list_commas_combine: withManualExpansion('gen_list_commas_combine', expandDslTemplates(listCommasCombineDsl, { embedTemplateId: false })),
  gen_fronted_adverbial_fix: withManualExpansion('gen_fronted_adverbial_fix', expandDslTemplates(frontedAdverbialFixDsl, { embedTemplateId: false })),
  gen_fronted_adverbial_combine: withManualExpansion('gen_fronted_adverbial_combine', expandDslTemplates(frontedAdverbialCombineDsl, { embedTemplateId: false })),
  gen_fronted_speech_paragraph: withManualExpansion('gen_fronted_speech_paragraph', expandDslTemplates(frontedSpeechParagraphDsl, { embedTemplateId: false })),
  gen_comma_clarity_insert: withManualExpansion('gen_comma_clarity_insert', expandDslTemplates(commaClarityInsertDsl, { embedTemplateId: false })),
  gen_semicolon_fix: withManualExpansion('gen_semicolon_fix', expandDslTemplates(semicolonFixDsl, { embedTemplateId: false })),
  gen_semicolon_combine: withManualExpansion('gen_semicolon_combine', expandDslTemplates(semicolonCombineDsl, { embedTemplateId: false })),
  gen_colon_semicolon_paragraph: withManualExpansion('gen_colon_semicolon_paragraph', expandDslTemplates(colonSemicolonParagraphDsl, { embedTemplateId: false })),
  gen_dash_clause_fix: withManualExpansion('gen_dash_clause_fix', expandDslTemplates(dashClauseFixDsl, { embedTemplateId: false })),
  gen_dash_clause_combine: withManualExpansion('gen_dash_clause_combine', expandDslTemplates(dashClauseCombineDsl, { embedTemplateId: false })),
  gen_hyphen_insert: withManualExpansion('gen_hyphen_insert', expandDslTemplates(hyphenInsertDsl, { embedTemplateId: false })),
  gen_parenthesis_fix: withManualExpansion('gen_parenthesis_fix', expandDslTemplates(parenthesisFixDsl, { embedTemplateId: false })),
  gen_parenthesis_combine: withManualExpansion('gen_parenthesis_combine', expandDslTemplates(parenthesisCombineDsl, { embedTemplateId: false })),
  gen_parenthesis_speech_paragraph: withManualExpansion('gen_parenthesis_speech_paragraph', expandDslTemplates(parenthesisSpeechParagraphDsl, { embedTemplateId: false })),
  gen_colon_list_insert: withManualExpansion('gen_colon_list_insert', expandDslTemplates(colonListInsertDsl, { embedTemplateId: false })),
  gen_colon_list_combine: withManualExpansion('gen_colon_list_combine', expandDslTemplates(colonListCombineDsl, { embedTemplateId: false })),
  gen_semicolon_list_fix: withManualExpansion('gen_semicolon_list_fix', expandDslTemplates(semicolonListFixDsl, { embedTemplateId: false })),
  gen_bullet_points_fix: withManualExpansion('gen_bullet_points_fix', expandDslTemplates(bulletPointsFixDsl, { embedTemplateId: false })),
  gen_bullet_points_paragraph: withManualExpansion('gen_bullet_points_paragraph', expandDslTemplates(bulletPointsParagraphDsl, { embedTemplateId: false })),
  // P14 Gate 4: 14 transfer-mode generator families (one per published skill).
  gen_sentence_endings_transfer: expandDslTemplates(sentenceEndingsTransferDsl, { embedTemplateId: false }),
  gen_list_commas_transfer: expandDslTemplates(listCommasTransferDsl, { embedTemplateId: false }),
  gen_apostrophe_contractions_transfer: expandDslTemplates(apostropheContractionsTransferDsl, { embedTemplateId: false }),
  gen_apostrophe_possession_transfer: expandDslTemplates(apostrophePossessionTransferDsl, { embedTemplateId: false }),
  gen_speech_transfer: expandDslTemplates(speechTransferDsl, { embedTemplateId: false }),
  gen_fronted_adverbial_transfer: expandDslTemplates(frontedAdverbialTransferDsl, { embedTemplateId: false }),
  gen_parenthesis_transfer: expandDslTemplates(parenthesisTransferDsl, { embedTemplateId: false }),
  gen_comma_clarity_transfer: expandDslTemplates(commaClarityTransferDsl, { embedTemplateId: false }),
  gen_colon_list_transfer: expandDslTemplates(colonListTransferDsl, { embedTemplateId: false }),
  gen_semicolon_transfer: expandDslTemplates(semicolonTransferDsl, { embedTemplateId: false }),
  gen_dash_clause_transfer: expandDslTemplates(dashClauseTransferDsl, { embedTemplateId: false }),
  gen_semicolon_list_transfer: expandDslTemplates(semicolonListTransferDsl, { embedTemplateId: false }),
  gen_bullet_points_transfer: expandDslTemplates(bulletPointsTransferDsl, { embedTemplateId: false }),
  gen_hyphen_transfer: expandDslTemplates(hyphenTransferDsl, { embedTemplateId: false }),
});

function buildGeneratedItem({ family, skill, template, templateIndex, seed, variantIndex }) {
  const idSeed = `${seed}:${family.id}:${variantIndex}`;
  const qualityTemplate = qualityNormalisedGeneratedTemplate(family.id, template);
  const model = typeof qualityTemplate.model === 'string' ? qualityTemplate.model : '';
  const templateSkillIds = uniqueStrings(qualityTemplate.skillIds);
  const skillIds = templateSkillIds.length ? templateSkillIds : [family.skillId];
  const templateId = templateIdFor(family.id, qualityTemplate, templateIndex);
  return {
    id: `${family.id}_${shortHash(idSeed)}_${variantIndex + 1}`,
    mode: family.mode,
    templateId,
    variantSignature: variantSignatureFor({ family, template: qualityTemplate, templateId, model }),
    skillIds,
    clusterId: qualityTemplate.clusterId || skill.clusterId,
    rewardUnitId: family.rewardUnitId,
    prompt: qualityTemplate.prompt || 'Practise this punctuation pattern.',
    stem: qualityTemplate.stem || '',
    ...(Array.isArray(qualityTemplate.options) ? { options: qualityTemplate.options } : {}),
    ...(Number.isInteger(Number(qualityTemplate.correctIndex)) ? {
      correctIndex: Number(qualityTemplate.correctIndex),
      inputKind: 'choice',
    } : {}),
    accepted: uniqueStrings([model, ...(Array.isArray(qualityTemplate.accepted) ? qualityTemplate.accepted : [])]),
    explanation: qualityTemplate.explanation || 'This generated item practises the same published punctuation skill.',
    ...(typeof qualityTemplate.explanationRuleId === 'string' ? { explanationRuleId: qualityTemplate.explanationRuleId } : {}),
    model,
    ...(isPlainObject(qualityTemplate.validator) ? { validator: qualityTemplate.validator } : {}),
    ...(isPlainObject(qualityTemplate.rubric) ? { rubric: qualityTemplate.rubric } : {}),
    misconceptionTags: uniqueStrings(qualityTemplate.misconceptionTags),
    readiness: uniqueStrings(qualityTemplate.readiness),
    source: 'generated',
    generatorFamilyId: family.id,
  };
}

/** Current production depth after manual content expansion. */
export const PRODUCTION_DEPTH = PUNCTUATION_MANUAL_EXPANSION_TARGET_DEPTH;

/** Maximum audited depth — used for capacity verification and 1000+ item pool checks. */
export const CAPACITY_DEPTH = Math.max(PRODUCTION_DEPTH, 40);

export function createPunctuationGeneratedItems({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.generatedSeed || manifest.releaseId || 'punctuation',
  perFamily = 1,
  depth,
  contextPack = null,
} = {}) {
  const effectiveDepth = depth != null ? depth : perFamily;
  const limit = Math.max(0, Math.floor(Number(effectiveDepth) || 0));
  if (limit === 0) return [];
  const skills = new Map((Array.isArray(manifest.skills) ? manifest.skills : []).map((skill) => [skill.id, skill]));
  const items = [];
  for (const family of Array.isArray(manifest.generatorFamilies) ? manifest.generatorFamilies : []) {
    if (!family?.published) continue;
    const skill = skills.get(family.skillId);
    const contextTemplates = contextPack
      ? contextPackTemplatesForFamily(family.id, contextPack)
      : [];
    const templates = contextTemplates.length ? contextTemplates : (GENERATED_TEMPLATE_BANK[family.id] || []);
    if (!skill || !templates.length) continue;
    // Per-family override for production depth — used by transfer-mode families
    // that intentionally cap at fewer items than the global PRODUCTION_DEPTH.
    const familyLimit = Number.isFinite(family.productionItemsLimit)
      ? Math.max(0, Math.floor(family.productionItemsLimit))
      : limit;
    const effectiveFamilyLimit = Math.min(limit, familyLimit);
    for (let index = 0; index < effectiveFamilyLimit; index += 1) {
      const picked = pickTemplate(templates, seed, family.id, index, {
        legacyTemplateCount: contextTemplates.length ? 1 : 2,
        runtimeStableTemplateCount: contextTemplates.length ? templates.length : 4,
      });
      if (!picked?.template) continue;
      items.push(buildGeneratedItem({
        family,
        skill,
        template: picked.template,
        templateIndex: picked.templateIndex,
        seed,
        variantIndex: index,
      }));
    }
  }
  return items;
}

export function createPunctuationRuntimeManifest({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.generatedSeed || manifest.releaseId || 'punctuation',
  generatedPerFamily = 1,
  depth,
  contextPack = null,
  allowContextPacks = false,
} = {}) {
  if (contextPack && allowContextPacks !== true) {
    throw new Error(
      'Context packs are teacher/admin-only in P3. Pass allowContextPacks: true for preview/admin paths.',
    );
  }
  const generatedItems = createPunctuationGeneratedItems({
    manifest,
    seed,
    perFamily: generatedPerFamily,
    depth,
    contextPack,
  });
  if (!generatedItems.length) return manifest;
  return Object.freeze({
    ...manifest,
    items: Object.freeze([
      ...(Array.isArray(manifest.items) ? manifest.items : []),
      ...generatedItems,
    ]),
  });
}
