import {
  PUNCTUATION_CONTENT_MANIFEST,
} from './content.js';
import {
  contextPackTemplatesForFamily,
} from './context-packs.js';

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

function pickTemplate(templates, seed, familyId, variantIndex) {
  if (!templates.length) return null;
  const offset = hashString(`${seed}:${familyId}`) % templates.length;
  return templates[(offset + variantIndex) % templates.length];
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((entry) => typeof entry === 'string' && entry))];
}

const GENERATED_TEMPLATE_BANK = Object.freeze({
  gen_sentence_endings_insert: Object.freeze([
    {
      prompt: 'Add the capital letter and end punctuation.',
      stem: 'where is the tide bell',
      model: 'Where is the tide bell?',
      misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the capital letter and end punctuation.',
      stem: 'what a bright signal',
      model: 'What a bright signal!',
      misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
  gen_apostrophe_contractions_fix: Object.freeze([
    {
      prompt: 'Correct the apostrophes in the contractions.',
      stem: 'We cant start because its raining.',
      model: "We can't start because it's raining.",
      misconceptionTags: ['apostrophe.contraction_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Correct the apostrophes in the contractions.',
      stem: 'Theyre sure we wont be late.',
      model: "They're sure we won't be late.",
      misconceptionTags: ['apostrophe.contraction_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
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
  ]),
  gen_comma_clarity_insert: Object.freeze([
    {
      prompt: 'Add the comma that makes the meaning clear.',
      stem: 'In the evening the harbour was quiet.',
      model: 'In the evening, the harbour was quiet.',
      validator: {
        type: 'startsWithPhraseComma',
        phrase: 'In the evening',
      },
      misconceptionTags: ['comma.clarity_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the comma that makes the meaning clear.',
      stem: 'When the mist lifted the tower appeared.',
      model: 'When the mist lifted, the tower appeared.',
      validator: {
        type: 'startsWithPhraseComma',
        phrase: 'When the mist lifted',
      },
      misconceptionTags: ['comma.clarity_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
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
  ]),
  gen_dash_clause_fix: Object.freeze([
    {
      prompt: 'Add a dash between the related clauses.',
      stem: 'The gate was stuck we found another path.',
      model: 'The gate was stuck - we found another path.',
      validator: {
        type: 'requiresBoundaryBetweenClauses',
        left: 'The gate was stuck',
        right: 'we found another path',
        mark: '-',
      },
      misconceptionTags: ['boundary.dash_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add a dash between the related clauses.',
      stem: 'The bell rang everyone hurried inside.',
      model: 'The bell rang - everyone hurried inside.',
      validator: {
        type: 'requiresBoundaryBetweenClauses',
        left: 'The bell rang',
        right: 'everyone hurried inside',
        mark: '-',
      },
      misconceptionTags: ['boundary.dash_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
  gen_dash_clause_combine: Object.freeze([
    {
      prompt: 'Combine the two related clauses into one sentence with a dash.',
      stem: 'The gate was stuck.\nWe found another path.',
      model: 'The gate was stuck - we found another path.',
      validator: {
        type: 'combineBoundaryBetweenClauses',
        left: 'The gate was stuck',
        right: 'we found another path',
        mark: '-',
      },
      misconceptionTags: ['boundary.dash_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Combine the two related clauses into one sentence with a dash.',
      stem: 'The bell rang.\nEveryone hurried inside.',
      model: 'The bell rang - everyone hurried inside.',
      validator: {
        type: 'combineBoundaryBetweenClauses',
        left: 'The bell rang',
        right: 'everyone hurried inside',
        mark: '-',
      },
      misconceptionTags: ['boundary.dash_missing'],
      readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    },
  ]),
  gen_hyphen_insert: Object.freeze([
    {
      prompt: 'Add the hyphen that avoids ambiguity.',
      stem: 'The little used path was hidden.',
      model: 'The little-used path was hidden.',
      validator: {
        type: 'requiresHyphenatedPhrase',
        phrase: 'little-used path',
      },
      misconceptionTags: ['boundary.hyphen_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Add the hyphen that avoids ambiguity.',
      stem: 'The fast moving tide covered the rocks.',
      model: 'The fast-moving tide covered the rocks.',
      validator: {
        type: 'requiresHyphenatedPhrase',
        phrase: 'fast-moving tide',
      },
      misconceptionTags: ['boundary.hyphen_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    },
  ]),
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
  ]),
  gen_semicolon_list_fix: Object.freeze([
    {
      prompt: 'Use semi-colons to separate the complex list items.',
      stem: 'We visited Dover, England, Lyon, France and Porto, Portugal.',
      model: 'We visited Dover, England; Lyon, France; and Porto, Portugal.',
      validator: {
        type: 'requiresSemicolonList',
        items: ['Dover, England', 'Lyon, France', 'Porto, Portugal'],
      },
      misconceptionTags: ['structure.semicolon_list_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
    {
      prompt: 'Use semi-colons to separate the complex list items.',
      stem: 'The winners were Aria, Year 5, Noah, Year 6 and Sam, Year 4.',
      model: 'The winners were Aria, Year 5; Noah, Year 6; and Sam, Year 4.',
      validator: {
        type: 'requiresSemicolonList',
        items: ['Aria, Year 5', 'Noah, Year 6', 'Sam, Year 4'],
      },
      misconceptionTags: ['structure.semicolon_list_missing'],
      readiness: ['proofreading', 'misconception', 'negative_test'],
    },
  ]),
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
  ]),
});

function buildGeneratedItem({ family, skill, template, seed, variantIndex }) {
  const idSeed = `${seed}:${family.id}:${variantIndex}`;
  const model = typeof template.model === 'string' ? template.model : '';
  const templateSkillIds = uniqueStrings(template.skillIds);
  const skillIds = templateSkillIds.length ? templateSkillIds : [family.skillId];
  return {
    id: `${family.id}_${shortHash(idSeed)}_${variantIndex + 1}`,
    mode: family.mode,
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
      const template = pickTemplate(templates, seed, family.id, index);
      items.push(buildGeneratedItem({ family, skill, template, seed, variantIndex: index }));
    }
  }
  return items;
}

export function createPunctuationRuntimeManifest({
  manifest = PUNCTUATION_CONTENT_MANIFEST,
  seed = manifest.releaseId || 'punctuation',
  generatedPerFamily = 1,
  contextPack = null,
} = {}) {
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
