import {
  PUNCTUATION_CONTENT_MANIFEST,
} from './content.js';
import {
  contextPackTemplatesForFamily,
} from './context-packs.js';
import { expandDslTemplates } from './template-dsl.js';
import { sentenceEndingsInsertDsl } from './dsl-families/sentence-endings-insert.js';
import { apostropheContractionsDsl } from './dsl-families/apostrophe-contractions-fix.js';
import { commaClarityInsertDsl } from './dsl-families/comma-clarity-insert.js';
import { dashClauseFixDsl } from './dsl-families/dash-clause-fix.js';
import { dashClauseCombineDsl } from './dsl-families/dash-clause-combine.js';
import { hyphenInsertDsl } from './dsl-families/hyphen-insert.js';
import { semicolonListFixDsl } from './dsl-families/semicolon-list-fix.js';

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
    validator: stableJson(template.validator || {}),
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

export const GENERATED_TEMPLATE_BANK = Object.freeze({
  gen_sentence_endings_insert: expandDslTemplates(sentenceEndingsInsertDsl, { embedTemplateId: false }),
  gen_apostrophe_contractions_fix: expandDslTemplates(apostropheContractionsDsl, { embedTemplateId: false }),
  gen_apostrophe_possession_insert: Object.freeze([
    {
      prompt: 'Add apostrophes to show possession.',
      stem: 'The captains whistle was beside the teams coats.',
      model: "The captain's whistle was beside the team's coats.",
      validator: {
        type: 'requiresTokens',
        tokens: ["captain's", "team's"],
      },
      misconceptionTags: ['apostrophe.possession_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add apostrophes to show possession.',
      stem: 'The childrens sketches covered the teachers desk.',
      model: "The children's sketches covered the teacher's desk.",
      validator: {
        type: 'requiresTokens',
        tokens: ["children's", "teacher's"],
      },
      misconceptionTags: ['apostrophe.possession_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add apostrophes to show possession.',
      stem: 'The artists brush was near the museums door.',
      model: "The artist's brush was near the museum's door.",
      validator: {
        type: 'requiresTokens',
        tokens: ["artist's", "museum's"],
      },
      misconceptionTags: ['apostrophe.possession_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add apostrophes to show possession.',
      stem: 'The sailors flag was near the harbours gate.',
      model: "The sailor's flag was near the harbour's gate.",
      validator: {
        type: 'requiresTokens',
        tokens: ["sailor's", "harbour's"],
      },
      misconceptionTags: ['apostrophe.possession_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
  gen_apostrophe_mix_paragraph: Object.freeze([
    {
      prompt: 'Repair the apostrophes in the short passage.',
      stem: 'We wont move the childrens paintings. The teachers notes are ready.',
      model: "We won't move the children's paintings. The teachers' notes are ready.",
      skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
      clusterId: 'apostrophe',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresApostropheForms',
            tokens: ["won't", "children's", "teachers' notes"],
            forbidden: ['wont', 'childrens', 'teachers notes'],
            misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
          },
        ],
      },
      misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the apostrophes in the short passage.',
      stem: 'I cant find the mens boots. The boys jackets are drying.',
      model: "I can't find the men's boots. The boys' jackets are drying.",
      skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
      clusterId: 'apostrophe',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresApostropheForms',
            tokens: ["can't", "men's", "boys' jackets"],
            forbidden: ['cant', 'mens', 'boys jackets'],
            misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
          },
        ],
      },
      misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the apostrophes in the short passage.',
      stem: 'Theyre checking the captains map. We dont know the teams plan.',
      model: "They're checking the captain's map. We don't know the team's plan.",
      skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
      clusterId: 'apostrophe',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresApostropheForms',
            tokens: ["they're", "captain's", "don't", "team's"],
            forbidden: ['theyre', 'captains', 'dont', 'teams plan'],
            misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
          },
        ],
      },
      misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the apostrophes in the short passage.',
      stem: 'She wont borrow the girls pencil. Its on the teachers shelf.',
      model: "She won't borrow the girl's pencil. It's on the teacher's shelf.",
      skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
      clusterId: 'apostrophe',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresApostropheForms',
            tokens: ["won't", "girl's", "it's", "teacher's"],
            forbidden: ['wont', 'girls pencil', 'its', 'teachers shelf'],
            misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
          },
        ],
      },
      misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_speech_insert: Object.freeze([
    {
      prompt: 'Add the direct-speech punctuation.',
      stem: 'Maya asked, can we start now?',
      model: 'Maya asked, "Can we start now?"',
      rubric: {
        type: 'speech',
        reportingPosition: 'before',
        spokenWords: 'can we start now',
        requiredTerminal: '?',
      },
      misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the direct-speech punctuation.',
      stem: 'Ravi said, the bell is ringing.',
      model: 'Ravi said, "The bell is ringing."',
      rubric: {
        type: 'speech',
        reportingPosition: 'before',
        spokenWords: 'the bell is ringing',
        requiredTerminal: '.',
      },
      misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the direct-speech punctuation.',
      stem: 'Lena whispered, keep the gate closed.',
      model: 'Lena whispered, "Keep the gate closed."',
      rubric: {
        type: 'speech',
        reportingPosition: 'before',
        spokenWords: 'keep the gate closed',
        requiredTerminal: '.',
      },
      misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the direct-speech punctuation.',
      stem: 'Tom asked, where did the map go?',
      model: 'Tom asked, "Where did the map go?"',
      rubric: {
        type: 'speech',
        reportingPosition: 'before',
        spokenWords: 'where did the map go',
        requiredTerminal: '?',
      },
      misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
  gen_list_commas_insert: Object.freeze([
    {
      prompt: 'Add commas to separate the list items.',
      stem: 'We packed ropes maps and snacks.',
      model: 'We packed ropes, maps and snacks.',
      validator: {
        type: 'requiresListCommas',
        items: ['ropes', 'maps', 'snacks'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add commas to separate the list items.',
      stem: 'The box held shells bells and chalk.',
      model: 'The box held shells, bells and chalk.',
      validator: {
        type: 'requiresListCommas',
        items: ['shells', 'bells', 'chalk'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add commas to separate the list items.',
      stem: 'The shelf held paints brushes and paper.',
      model: 'The shelf held paints, brushes and paper.',
      validator: {
        type: 'requiresListCommas',
        items: ['paints', 'brushes', 'paper'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add commas to separate the list items.',
      stem: 'We saw gulls seals and dolphins.',
      model: 'We saw gulls, seals and dolphins.',
      validator: {
        type: 'requiresListCommas',
        items: ['gulls', 'seals', 'dolphins'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
  gen_list_commas_combine: Object.freeze([
    {
      prompt: 'Combine the notes into one correctly punctuated sentence.',
      stem: 'The tray held\n- shells\n- feathers\n- pebbles',
      model: 'The tray held shells, feathers and pebbles.',
      validator: {
        type: 'combineListSentence',
        opening: 'The tray held',
        items: ['shells', 'feathers', 'pebbles'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the notes into one correctly punctuated sentence.',
      stem: 'We collected\n- leaves\n- twigs\n- acorns',
      model: 'We collected leaves, twigs and acorns.',
      validator: {
        type: 'combineListSentence',
        opening: 'We collected',
        items: ['leaves', 'twigs', 'acorns'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the notes into one correctly punctuated sentence.',
      stem: 'The bag contained\n- chalk\n- string\n- tape',
      model: 'The bag contained chalk, string and tape.',
      validator: {
        type: 'combineListSentence',
        opening: 'The bag contained',
        items: ['chalk', 'string', 'tape'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the notes into one correctly punctuated sentence.',
      stem: 'Our lunch included\n- apples\n- sandwiches\n- juice',
      model: 'Our lunch included apples, sandwiches and juice.',
      validator: {
        type: 'combineListSentence',
        opening: 'Our lunch included',
        items: ['apples', 'sandwiches', 'juice'],
      },
      misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_fronted_adverbial_fix: Object.freeze([
    {
      prompt: 'Correct the comma after the fronted adverbial.',
      stem: 'After the storm the path was muddy.',
      model: 'After the storm, the path was muddy.',
      validator: {
        type: 'startsWithPhraseComma',
        phrase: 'After the storm',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the comma after the fronted adverbial.',
      stem: 'Before sunrise the crew checked the ropes.',
      model: 'Before sunrise, the crew checked the ropes.',
      validator: {
        type: 'startsWithPhraseComma',
        phrase: 'Before sunrise',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the comma after the fronted adverbial.',
      stem: 'During the concert the hall became silent.',
      model: 'During the concert, the hall became silent.',
      validator: {
        type: 'startsWithPhraseComma',
        phrase: 'During the concert',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the comma after the fronted adverbial.',
      stem: 'At the edge of the field the coach waited.',
      model: 'At the edge of the field, the coach waited.',
      validator: {
        type: 'startsWithPhraseComma',
        phrase: 'At the edge of the field',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
  gen_fronted_adverbial_combine: Object.freeze([
    {
      prompt: 'Combine the adverbial and main clause into one sentence.',
      stem: 'Before sunrise\nThe crew checked the ropes.',
      model: 'Before sunrise, the crew checked the ropes.',
      validator: {
        type: 'combineFrontedAdverbial',
        phrase: 'Before sunrise',
        mainClause: 'the crew checked the ropes',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the adverbial and main clause into one sentence.',
      stem: 'After the rehearsal\nThe cast packed away the props.',
      model: 'After the rehearsal, the cast packed away the props.',
      validator: {
        type: 'combineFrontedAdverbial',
        phrase: 'After the rehearsal',
        mainClause: 'the cast packed away the props',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the adverbial and main clause into one sentence.',
      stem: 'During the concert\nThe hall became silent.',
      model: 'During the concert, the hall became silent.',
      validator: {
        type: 'combineFrontedAdverbial',
        phrase: 'During the concert',
        mainClause: 'the hall became silent',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the adverbial and main clause into one sentence.',
      stem: 'At the edge of the field\nThe coach waited.',
      model: 'At the edge of the field, the coach waited.',
      validator: {
        type: 'combineFrontedAdverbial',
        phrase: 'At the edge of the field',
        mainClause: 'the coach waited',
      },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_fronted_speech_paragraph: Object.freeze([
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'Before lunch Zara asked can we start now',
      model: 'Before lunch, Zara asked, "Can we start now?"',
      skillIds: ['fronted_adverbial', 'speech'],
      clusterId: 'speech',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'startsWithPhraseComma',
            phrase: 'Before lunch',
            misconceptionTags: ['comma.fronted_adverbial_missing'],
          },
          {
            type: 'speechWithWords',
            words: 'can we start now',
            requiredTerminal: '?',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'After rehearsal Omar said the props are packed',
      model: 'After rehearsal, Omar said, "The props are packed."',
      skillIds: ['fronted_adverbial', 'speech'],
      clusterId: 'speech',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'startsWithPhraseComma',
            phrase: 'After rehearsal',
            misconceptionTags: ['comma.fronted_adverbial_missing'],
          },
          {
            type: 'speechWithWords',
            words: 'the props are packed',
            requiredTerminal: '.',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'During assembly Lina whispered please sit down',
      model: 'During assembly, Lina whispered, "Please sit down."',
      skillIds: ['fronted_adverbial', 'speech'],
      clusterId: 'speech',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'startsWithPhraseComma',
            phrase: 'During assembly',
            misconceptionTags: ['comma.fronted_adverbial_missing'],
          },
          {
            type: 'speechWithWords',
            words: 'please sit down',
            requiredTerminal: '.',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'At the gate Ben asked are we late',
      model: 'At the gate, Ben asked, "Are we late?"',
      skillIds: ['fronted_adverbial', 'speech'],
      clusterId: 'speech',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'startsWithPhraseComma',
            phrase: 'At the gate',
            misconceptionTags: ['comma.fronted_adverbial_missing'],
          },
          {
            type: 'speechWithWords',
            words: 'are we late',
            requiredTerminal: '?',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_comma_clarity_insert: expandDslTemplates(commaClarityInsertDsl, { embedTemplateId: false }),
  gen_semicolon_fix: Object.freeze([
    {
      prompt: 'Replace the comma splice with a semi-colon.',
      stem: 'The lighthouse was bright, the boats still waited.',
      model: 'The lighthouse was bright; the boats still waited.',
      validator: {
        type: 'requiresBoundaryBetweenClauses',
        left: 'The lighthouse was bright',
        right: 'the boats still waited',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Replace the comma splice with a semi-colon.',
      stem: 'The rain eased, the match could continue.',
      model: 'The rain eased; the match could continue.',
      validator: {
        type: 'requiresBoundaryBetweenClauses',
        left: 'The rain eased',
        right: 'the match could continue',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Replace the comma splice with a semi-colon.',
      stem: 'The clock stopped, the class kept working.',
      model: 'The clock stopped; the class kept working.',
      validator: {
        type: 'requiresBoundaryBetweenClauses',
        left: 'The clock stopped',
        right: 'the class kept working',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Replace the comma splice with a semi-colon.',
      stem: 'The path was narrow, the hikers walked slowly.',
      model: 'The path was narrow; the hikers walked slowly.',
      validator: {
        type: 'requiresBoundaryBetweenClauses',
        left: 'The path was narrow',
        right: 'the hikers walked slowly',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
  gen_semicolon_combine: Object.freeze([
    {
      prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
      stem: 'The lighthouse was bright.\nThe boats still waited.',
      model: 'The lighthouse was bright; the boats still waited.',
      validator: {
        type: 'combineBoundaryBetweenClauses',
        left: 'The lighthouse was bright',
        right: 'the boats still waited',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
      stem: 'The rain eased.\nThe match could continue.',
      model: 'The rain eased; the match could continue.',
      validator: {
        type: 'combineBoundaryBetweenClauses',
        left: 'The rain eased',
        right: 'the match could continue',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
      stem: 'The clock stopped.\nThe class kept working.',
      model: 'The clock stopped; the class kept working.',
      validator: {
        type: 'combineBoundaryBetweenClauses',
        left: 'The clock stopped',
        right: 'the class kept working',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
      stem: 'The path was narrow.\nThe hikers walked slowly.',
      model: 'The path was narrow; the hikers walked slowly.',
      validator: {
        type: 'combineBoundaryBetweenClauses',
        left: 'The path was narrow',
        right: 'the hikers walked slowly',
        mark: ';',
      },
      misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_colon_semicolon_paragraph: Object.freeze([
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'We needed three tools, a lantern, a compass and a notebook. The tide rose, the group moved inland.',
      model: 'We needed three tools: a lantern, a compass and a notebook. The tide rose; the group moved inland.',
      skillIds: ['colon_list', 'semicolon'],
      clusterId: 'boundary',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresColonBeforeList',
            opening: 'We needed three tools',
            items: ['a lantern', 'a compass', 'a notebook'],
            allowTrailingText: true,
            misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
          },
          {
            type: 'requiresBoundaryBetweenClauses',
            mark: ';',
            left: 'The tide rose',
            right: 'the group moved inland',
            misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'The kit held three things, a torch, a rope and a map. The rain stopped, the match continued.',
      model: 'The kit held three things: a torch, a rope and a map. The rain stopped; the match continued.',
      skillIds: ['colon_list', 'semicolon'],
      clusterId: 'boundary',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresColonBeforeList',
            opening: 'The kit held three things',
            items: ['a torch', 'a rope', 'a map'],
            allowTrailingText: true,
            misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
          },
          {
            type: 'requiresBoundaryBetweenClauses',
            mark: ';',
            left: 'The rain stopped',
            right: 'the match continued',
            misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'The box contained three items, a scarf, a medal and a badge. The door opened, the crowd cheered.',
      model: 'The box contained three items: a scarf, a medal and a badge. The door opened; the crowd cheered.',
      skillIds: ['colon_list', 'semicolon'],
      clusterId: 'boundary',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresColonBeforeList',
            opening: 'The box contained three items',
            items: ['a scarf', 'a medal', 'a badge'],
            allowTrailingText: true,
            misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
          },
          {
            type: 'requiresBoundaryBetweenClauses',
            mark: ';',
            left: 'The door opened',
            right: 'the crowd cheered',
            misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'Our display needed three labels, rivers, mountains and coasts. The lights dimmed, the film began.',
      model: 'Our display needed three labels: rivers, mountains and coasts. The lights dimmed; the film began.',
      skillIds: ['colon_list', 'semicolon'],
      clusterId: 'boundary',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresColonBeforeList',
            opening: 'Our display needed three labels',
            items: ['rivers', 'mountains', 'coasts'],
            allowTrailingText: true,
            misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
          },
          {
            type: 'requiresBoundaryBetweenClauses',
            mark: ';',
            left: 'The lights dimmed',
            right: 'the film began',
            misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_dash_clause_fix: expandDslTemplates(dashClauseFixDsl, { embedTemplateId: false }),
  gen_dash_clause_combine: expandDslTemplates(dashClauseCombineDsl, { embedTemplateId: false }),
  gen_hyphen_insert: expandDslTemplates(hyphenInsertDsl, { embedTemplateId: false }),
  gen_parenthesis_fix: Object.freeze([
    {
      prompt: 'Correct the parenthesis punctuation.',
      stem: 'The harbour, an old fishing port was busy.',
      model: 'The harbour, an old fishing port, was busy.',
      validator: {
        type: 'requiresParentheticalPhrase',
        before: 'The harbour',
        phrase: 'an old fishing port',
        after: 'was busy',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the parenthesis punctuation.',
      stem: 'The tower a useful lookout stood above the bay.',
      model: 'The tower, a useful lookout, stood above the bay.',
      validator: {
        type: 'requiresParentheticalPhrase',
        before: 'The tower',
        phrase: 'a useful lookout',
        after: 'stood above the bay',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the parenthesis punctuation.',
      stem: 'The library a quiet room closed early.',
      model: 'The library, a quiet room, closed early.',
      validator: {
        type: 'requiresParentheticalPhrase',
        before: 'The library',
        phrase: 'a quiet room',
        after: 'closed early',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the parenthesis punctuation.',
      stem: 'Mr Patel our maths teacher smiled proudly.',
      model: 'Mr Patel, our maths teacher, smiled proudly.',
      validator: {
        type: 'requiresParentheticalPhrase',
        before: 'Mr Patel',
        phrase: 'our maths teacher',
        after: 'smiled proudly',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
  gen_parenthesis_combine: Object.freeze([
    {
      prompt: 'Combine the sentence and extra detail using parenthesis.',
      stem: 'The harbour was busy.\nExtra detail: an old fishing port',
      model: 'The harbour, an old fishing port, was busy.',
      validator: {
        type: 'combineParentheticalPhrase',
        before: 'The harbour',
        phrase: 'an old fishing port',
        after: 'was busy',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the sentence and extra detail using parenthesis.',
      stem: 'The tower stood above the bay.\nExtra detail: a useful lookout',
      model: 'The tower, a useful lookout, stood above the bay.',
      validator: {
        type: 'combineParentheticalPhrase',
        before: 'The tower',
        phrase: 'a useful lookout',
        after: 'stood above the bay',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the sentence and extra detail using parenthesis.',
      stem: 'The library closed early.\nExtra detail: a quiet room',
      model: 'The library, a quiet room, closed early.',
      validator: {
        type: 'combineParentheticalPhrase',
        before: 'The library',
        phrase: 'a quiet room',
        after: 'closed early',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the sentence and extra detail using parenthesis.',
      stem: 'Mr Patel smiled proudly.\nExtra detail: our maths teacher',
      model: 'Mr Patel, our maths teacher, smiled proudly.',
      validator: {
        type: 'combineParentheticalPhrase',
        before: 'Mr Patel',
        phrase: 'our maths teacher',
        after: 'smiled proudly',
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_parenthesis_speech_paragraph: Object.freeze([
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'The harbour an old fishing port was busy. Ravi said the bell is ringing',
      model: 'The harbour, an old fishing port, was busy. Ravi said, "The bell is ringing."',
      skillIds: ['parenthesis', 'speech'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresParentheticalPhrase',
            before: 'The harbour',
            phrase: 'an old fishing port',
            after: 'was busy',
            misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
          },
          {
            type: 'speechWithWords',
            words: 'the bell is ringing',
            requiredTerminal: '.',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'The tower a useful lookout stood above the bay. Mia asked where are the boats',
      model: 'The tower, a useful lookout, stood above the bay. Mia asked, "Where are the boats?"',
      skillIds: ['parenthesis', 'speech'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresParentheticalPhrase',
            before: 'The tower',
            phrase: 'a useful lookout',
            after: 'stood above the bay',
            misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
          },
          {
            type: 'speechWithWords',
            words: 'where are the boats',
            requiredTerminal: '?',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'The library a quiet room closed early. Nina said we can come back tomorrow',
      model: 'The library, a quiet room, closed early. Nina said, "We can come back tomorrow."',
      skillIds: ['parenthesis', 'speech'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresParentheticalPhrase',
            before: 'The library',
            phrase: 'a quiet room',
            after: 'closed early',
            misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
          },
          {
            type: 'speechWithWords',
            words: 'we can come back tomorrow',
            requiredTerminal: '.',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the punctuation in the short passage.',
      stem: 'Mr Patel our maths teacher smiled proudly. Leo asked did we win',
      model: 'Mr Patel, our maths teacher, smiled proudly. Leo asked, "Did we win?"',
      skillIds: ['parenthesis', 'speech'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresParentheticalPhrase',
            before: 'Mr Patel',
            phrase: 'our maths teacher',
            after: 'smiled proudly',
            misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
          },
          {
            type: 'speechWithWords',
            words: 'did we win',
            requiredTerminal: '?',
            misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
          },
        ],
      },
      misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_colon_list_insert: Object.freeze([
    {
      prompt: 'Add the colon before the list.',
      stem: 'We needed three tools a torch, a rope and a map.',
      model: 'We needed three tools: a torch, a rope and a map.',
      validator: {
        type: 'requiresColonBeforeList',
        opening: 'We needed three tools',
        items: ['a torch', 'a rope', 'a map'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the colon before the list.',
      stem: 'The kit included three things a lantern, a compass and a notebook.',
      model: 'The kit included three things: a lantern, a compass and a notebook.',
      validator: {
        type: 'requiresColonBeforeList',
        opening: 'The kit included three things',
        items: ['a lantern', 'a compass', 'a notebook'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the colon before the list.',
      stem: 'The drawer held three supplies pens, rulers and tape.',
      model: 'The drawer held three supplies: pens, rulers and tape.',
      validator: {
        type: 'requiresColonBeforeList',
        opening: 'The drawer held three supplies',
        items: ['pens', 'rulers', 'tape'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the colon before the list.',
      stem: 'We chose three activities swimming, cycling and climbing.',
      model: 'We chose three activities: swimming, cycling and climbing.',
      validator: {
        type: 'requiresColonBeforeList',
        opening: 'We chose three activities',
        items: ['swimming', 'cycling', 'climbing'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
  gen_colon_list_combine: Object.freeze([
    {
      prompt: 'Combine the opening clause and list using a colon.',
      stem: 'We needed three tools\na torch / a rope / a map',
      model: 'We needed three tools: a torch, a rope and a map.',
      validator: {
        type: 'combineColonList',
        opening: 'We needed three tools',
        items: ['a torch', 'a rope', 'a map'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the opening clause and list using a colon.',
      stem: 'The kit included three things\na lantern / a compass / a notebook',
      model: 'The kit included three things: a lantern, a compass and a notebook.',
      validator: {
        type: 'combineColonList',
        opening: 'The kit included three things',
        items: ['a lantern', 'a compass', 'a notebook'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the opening clause and list using a colon.',
      stem: 'The drawer held three supplies\npens / rulers / tape',
      model: 'The drawer held three supplies: pens, rulers and tape.',
      validator: {
        type: 'combineColonList',
        opening: 'The drawer held three supplies',
        items: ['pens', 'rulers', 'tape'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the opening clause and list using a colon.',
      stem: 'We chose three activities\nswimming / cycling / climbing',
      model: 'We chose three activities: swimming, cycling and climbing.',
      validator: {
        type: 'combineColonList',
        opening: 'We chose three activities',
        items: ['swimming', 'cycling', 'climbing'],
      },
      misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_semicolon_list_fix: expandDslTemplates(semicolonListFixDsl, { embedTemplateId: false }),
  gen_bullet_points_fix: Object.freeze([
    {
      prompt: 'Make the bullet punctuation consistent.',
      stem: 'Bring:\n- a coat.\n- a torch\n- a notebook.',
      model: 'Bring:\n- a coat.\n- a torch.\n- a notebook.',
      validator: {
        type: 'requiresBulletStemAndItems',
        stem: 'Bring',
        items: ['a coat', 'a torch', 'a notebook'],
      },
      misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Make the bullet punctuation consistent.',
      stem: 'Pack:\n- pencils\n- rulers.\n- glue sticks',
      model: 'Pack:\n- pencils\n- rulers\n- glue sticks',
      validator: {
        type: 'requiresBulletStemAndItems',
        stem: 'Pack',
        items: ['pencils', 'rulers', 'glue sticks'],
      },
      misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Make the bullet punctuation consistent.',
      stem: 'Take:\n- water\n- snacks.\n- a hat',
      model: 'Take:\n- water\n- snacks\n- a hat',
      validator: {
        type: 'requiresBulletStemAndItems',
        stem: 'Take',
        items: ['water', 'snacks', 'a hat'],
      },
      misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Make the bullet punctuation consistent.',
      stem: 'Check:\n- doors.\n- windows\n- lights.',
      model: 'Check:\n- doors.\n- windows.\n- lights.',
      validator: {
        type: 'requiresBulletStemAndItems',
        stem: 'Check',
        items: ['doors', 'windows', 'lights'],
      },
      misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
  gen_bullet_points_paragraph: Object.freeze([
    {
      prompt: 'Repair the bullet-list punctuation.',
      stem: 'Pack\n- pencils\n- rulers.\n- glue sticks',
      model: 'Pack:\n- pencils\n- rulers\n- glue sticks',
      accepted: [
        'Pack:\n- pencils.\n- rulers.\n- glue sticks.',
      ],
      skillIds: ['bullet_points'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresBulletStemAndItems',
            stem: 'Pack',
            items: ['pencils', 'rulers', 'glue sticks'],
            misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
          },
        ],
      },
      misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the bullet-list punctuation.',
      stem: 'Bring\n- a coat.\n- a torch\n- a notebook.',
      model: 'Bring:\n- a coat\n- a torch\n- a notebook',
      accepted: [
        'Bring:\n- a coat.\n- a torch.\n- a notebook.',
      ],
      skillIds: ['bullet_points'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresBulletStemAndItems',
            stem: 'Bring',
            items: ['a coat', 'a torch', 'a notebook'],
            misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
          },
        ],
      },
      misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the bullet-list punctuation.',
      stem: 'Take\n- water\n- snacks.\n- a hat',
      model: 'Take:\n- water\n- snacks\n- a hat',
      accepted: [
        'Take:\n- water.\n- snacks.\n- a hat.',
      ],
      skillIds: ['bullet_points'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresBulletStemAndItems',
            stem: 'Take',
            items: ['water', 'snacks', 'a hat'],
            misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
          },
        ],
      },
      misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Repair the bullet-list punctuation.',
      stem: 'Check\n- doors.\n- windows\n- lights.',
      model: 'Check:\n- doors.\n- windows.\n- lights.',
      accepted: [
        'Check:\n- doors\n- windows\n- lights',
      ],
      skillIds: ['bullet_points'],
      clusterId: 'structure',
      validator: {
        type: 'paragraphRepair',
        checks: [
          {
            type: 'requiresBulletStemAndItems',
            stem: 'Check',
            items: ['doors', 'windows', 'lights'],
            misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
          },
        ],
      },
      misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
});

function buildGeneratedItem({ family, skill, template, templateIndex, seed, variantIndex }) {
  const idSeed = `${seed}:${family.id}:${variantIndex}`;
  const model = typeof template.model === 'string' ? template.model : '';
  const templateSkillIds = uniqueStrings(template.skillIds);
  const skillIds = templateSkillIds.length ? templateSkillIds : [family.skillId];
  const templateId = templateIdFor(family.id, template, templateIndex);
  return {
    id: `${family.id}_${shortHash(idSeed)}_${variantIndex + 1}`,
    mode: family.mode,
    templateId,
    variantSignature: variantSignatureFor({ family, template, templateId, model }),
    skillIds,
    clusterId: template.clusterId || skill.clusterId,
    rewardUnitId: family.rewardUnitId,
    prompt: template.prompt || 'Practise this punctuation pattern.',
    stem: template.stem || '',
    accepted: uniqueStrings([model, ...(Array.isArray(template.accepted) ? template.accepted : [])]),
    explanation: template.explanation || 'This generated item practises the same published punctuation skill.',
    model,
    ...(isPlainObject(template.validator) ? { validator: template.validator } : {}),
    ...(isPlainObject(template.rubric) ? { rubric: template.rubric } : {}),
    misconceptionTags: uniqueStrings(template.misconceptionTags),
    readiness: uniqueStrings(template.readiness),
    source: 'generated',
    generatorFamilyId: family.id,
  };
}

export function createPunctuationGeneratedItems({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.releaseId || 'punctuation',
  perFamily = 1,
  contextPack = null,
} = {}) {
  const limit = Math.max(0, Math.floor(Number(perFamily) || 0));
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
    for (let index = 0; index < limit; index += 1) {
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
  seed = manifest.releaseId || 'punctuation',
  generatedPerFamily = 1,
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
