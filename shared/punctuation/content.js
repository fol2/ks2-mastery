import { PUNCTUATION_CURRENT_RELEASE_ID } from '../../src/subjects/punctuation/service-contract.js';

export const PUNCTUATION_SUBJECT_ID = 'punctuation';
export const PUNCTUATION_RELEASE_ID = PUNCTUATION_CURRENT_RELEASE_ID;

export const PUNCTUATION_READINESS_ROWS = Object.freeze([
  'retrieve_discriminate',
  'insertion',
  'proofreading',
  'constrained_transfer',
  'misconception',
  'negative_test',
]);

export const PUNCTUATION_SKILLS = Object.freeze([
  {
    id: 'sentence_endings',
    name: 'Capital letters and sentence endings',
    phase: 'KS1 foundation, consolidated through KS2',
    clusterId: 'endmarks',
    prereq: [],
    published: true,
    rule: 'Start each sentence with a capital letter and end it with the right mark: full stop, question mark or exclamation mark.',
    workedBad: 'where is my reading record',
    workedGood: 'Where is my reading record?',
    contrastBad: 'We won the match?',
    contrastGood: 'We won the match!',
  },
  {
    id: 'list_commas',
    name: 'Commas in lists',
    phase: 'KS2 review',
    clusterId: 'comma_flow',
    prereq: ['sentence_endings'],
    published: true,
    rule: 'Use commas to separate items in a list. In standard KS2 examples, the final comma before and is usually not needed.',
    workedBad: 'We packed torches maps and water.',
    workedGood: 'We packed torches, maps and water.',
    contrastBad: 'We packed, torches maps, and water.',
    contrastGood: 'We packed torches, maps and water.',
  },
  {
    id: 'apostrophe_contractions',
    name: 'Apostrophes for contraction',
    phase: 'KS2 review',
    clusterId: 'apostrophe',
    prereq: ['sentence_endings'],
    published: true,
    rule: "Use an apostrophe to show missing letters in contractions, such as can't, didn't and we're.",
    workedBad: 'We cant go because were late.',
    workedGood: "We can't go because we're late.",
    contrastBad: "We cant go because we're late.",
    contrastGood: "We can't go because we're late.",
  },
  {
    id: 'apostrophe_possession',
    name: 'Apostrophes for possession',
    phase: 'KS2 review and extension',
    clusterId: 'apostrophe',
    prereq: ['apostrophe_contractions'],
    published: true,
    rule: "Use apostrophes to show belonging: the girl's coat, the girls' coats, the children's books.",
    workedBad: 'The girls coat was on the bench.',
    workedGood: "The girl's coat was on the bench.",
    contrastBad: 'The girls coat was on the bench.',
    contrastGood: "The girls' coats were on the bench.",
  },
  {
    id: 'speech',
    name: 'Inverted commas and speech punctuation',
    phase: 'Year 3-4 core',
    clusterId: 'speech',
    prereq: ['sentence_endings'],
    published: true,
    rule: 'Put spoken words inside inverted commas. Use the correct punctuation inside the closing inverted comma when the punctuation belongs to the spoken words.',
    workedBad: 'Mia said "Come here".',
    workedGood: 'Mia said, "Come here."',
    contrastBad: '"Where are you going"? asked Zara.',
    contrastGood: '"Where are you going?" asked Zara.',
  },
  {
    id: 'fronted_adverbial',
    name: 'Commas after fronted adverbials',
    phase: 'Year 4 core',
    clusterId: 'comma_flow',
    prereq: ['sentence_endings'],
    published: true,
    rule: 'Put a comma after a starter phrase, such as At last, Before lunch, or Without warning.',
    workedBad: 'Before lunch we finished the poster.',
    workedGood: 'Before lunch, we finished the poster.',
    contrastBad: 'Before lunch we, finished the poster.',
    contrastGood: 'Before lunch, we finished the poster.',
  },
  {
    id: 'parenthesis',
    name: 'Parenthesis with commas, brackets or dashes',
    phase: 'Year 5 core',
    clusterId: 'structure',
    prereq: ['fronted_adverbial'],
    published: true,
    rule: 'Parenthesis adds extra information. It can be marked with commas, brackets or dashes.',
    workedBad: 'Mr Patel our coach arrived early.',
    workedGood: 'Mr Patel, our coach, arrived early.',
    contrastBad: 'Mr Patel our coach, arrived early.',
    contrastGood: 'Mr Patel (our coach) arrived early.',
  },
  {
    id: 'comma_clarity',
    name: 'Commas for clarity',
    phase: 'Year 5 core',
    clusterId: 'comma_flow',
    prereq: ['fronted_adverbial'],
    published: true,
    rule: 'A comma can make meaning clearer and avoid ambiguity.',
    workedBad: "Let's eat Grandma.",
    workedGood: "Let's eat, Grandma.",
    contrastBad: 'Most of the time travellers worry about delays.',
    contrastGood: 'Most of the time, travellers worry about delays.',
  },
  {
    id: 'colon_list',
    name: 'Colon before a list',
    phase: 'Year 6 core',
    clusterId: 'structure',
    prereq: ['list_commas'],
    published: true,
    rule: 'A colon can introduce a list after a complete opening idea.',
    workedBad: 'We needed three things, a torch, a map and a whistle.',
    workedGood: 'We needed three things: a torch, a map and a whistle.',
    contrastBad: 'We needed: three things a torch, a map and a whistle.',
    contrastGood: 'We needed three things: a torch, a map and a whistle.',
  },
  {
    id: 'semicolon',
    name: 'Semi-colons between related clauses',
    phase: 'Year 6 core',
    clusterId: 'boundary',
    prereq: ['sentence_endings'],
    published: true,
    rule: 'A semi-colon can join two closely related ideas.',
    workedBad: 'The rain had stopped, the pitch was still slippery.',
    workedGood: 'The rain had stopped; the pitch was still slippery.',
    contrastBad: 'The rain had stopped; and the pitch was still slippery.',
    contrastGood: 'The rain had stopped; the pitch was still slippery.',
  },
  {
    id: 'dash_clause',
    name: 'Dashes between related clauses',
    phase: 'Year 6 core',
    clusterId: 'boundary',
    prereq: ['sentence_endings'],
    published: true,
    rule: 'A dash can mark a sharp boundary between two closely related ideas.',
    workedBad: 'The path was flooded, we took the longer route.',
    workedGood: 'The path was flooded – we took the longer route.',
    contrastBad: 'The path was flooded –and we took the longer route.',
    contrastGood: 'The path was flooded – we took the longer route.',
  },
  {
    id: 'semicolon_list',
    name: 'Semi-colons within lists',
    phase: 'Year 6 core',
    clusterId: 'structure',
    prereq: ['colon_list', 'list_commas'],
    published: true,
    rule: 'Use semi-colons to separate list items when each item already contains commas.',
    workedBad: 'We visited York, England, Cardiff, Wales, and Belfast, Northern Ireland.',
    workedGood: 'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.',
    contrastBad: 'We visited York, England, Cardiff, Wales; and Belfast, Northern Ireland.',
    contrastGood: 'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.',
  },
  {
    id: 'bullet_points',
    name: 'Punctuation of bullet points',
    phase: 'Year 6 core',
    clusterId: 'structure',
    prereq: ['colon_list'],
    published: true,
    rule: 'Use a colon after the opening stem when appropriate, and punctuate bullets consistently.',
    workedBad: 'Bring:\n- a drink.\n- a hat\n- a sketchbook.',
    workedGood: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
    contrastBad: 'Bring\n- a drink\n- a hat\n- a sketchbook',
    contrastGood: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
  },
  {
    id: 'hyphen',
    name: 'Hyphens to avoid ambiguity',
    phase: 'Year 6 core',
    clusterId: 'boundary',
    prereq: ['sentence_endings'],
    published: true,
    rule: 'A hyphen can stop a phrase from being misunderstood, such as man-eating shark versus man eating shark.',
    workedBad: 'We saw a man eating shark.',
    workedGood: 'We saw a man-eating shark.',
    contrastBad: 'The little used room was locked.',
    contrastGood: 'The little-used room was locked.',
  },
]);

// Active Punctuation cluster -> direct monster mapping for the Phase 2
// roster reduction. Learning clusters stay the same six groupings; only
// reward projection collapses to 3 direct creatures + 1 grand.
//   Pealark  : endmarks, speech, boundary
//   Claspin  : apostrophe
//   Curlune  : comma_flow, structure
//   Quoral   : grand aggregate across all 14 reward units (see
//              PUNCTUATION_GRAND_MONSTER below)
export const PUNCTUATION_CLUSTERS = Object.freeze([
  {
    id: 'endmarks',
    name: 'Endmarks',
    monsterId: 'pealark',
    published: true,
    skillIds: ['sentence_endings'],
  },
  {
    id: 'apostrophe',
    name: 'Apostrophe',
    monsterId: 'claspin',
    published: true,
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
  },
  {
    id: 'speech',
    name: 'Speech',
    monsterId: 'pealark',
    published: true,
    skillIds: ['speech'],
  },
  {
    id: 'comma_flow',
    name: 'Comma / Flow',
    monsterId: 'curlune',
    published: true,
    skillIds: ['list_commas', 'fronted_adverbial', 'comma_clarity'],
  },
  {
    id: 'structure',
    name: 'List / Structure',
    monsterId: 'curlune',
    published: true,
    skillIds: ['parenthesis', 'colon_list', 'semicolon_list', 'bullet_points'],
  },
  {
    id: 'boundary',
    name: 'Boundary',
    monsterId: 'pealark',
    published: true,
    skillIds: ['semicolon', 'dash_clause', 'hyphen'],
  },
]);

export const PUNCTUATION_GRAND_MONSTER = Object.freeze({
  id: 'published_release',
  name: 'Published Punctuation release',
  monsterId: 'quoral',
});

export function createPunctuationMasteryKey({
  releaseId = PUNCTUATION_RELEASE_ID,
  clusterId,
  rewardUnitId,
} = {}) {
  return `${PUNCTUATION_SUBJECT_ID}:${releaseId}:${clusterId}:${rewardUnitId}`;
}

function rewardUnit({ id, clusterId, skillIds, published = true, evidenceItemIds = [], generatorFamilyIds = [] }) {
  return Object.freeze({
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId,
    rewardUnitId: id,
    skillIds,
    published,
    evidenceItemIds,
    generatorFamilyIds,
    masteryKey: createPunctuationMasteryKey({ clusterId, rewardUnitId: id }),
  });
}

export const PUNCTUATION_ITEMS = Object.freeze([
  {
    id: 'se_choose_exclaim',
    mode: 'choose',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'What a fantastic goal.',
      'What a fantastic goal!',
      'what a fantastic goal!',
      'What a fantastic goal',
    ],
    correctIndex: 1,
    explanation: 'An exclamation mark fits a strong exclamation, and the sentence begins with a capital letter.',
    model: 'What a fantastic goal!',
    misconceptionTags: ['endmarks.capitalisation_missing', 'endmarks.mark_mismatch', 'endmarks.terminal_missing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_insert_question',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Punctuate the sentence accurately.',
    stem: 'why was the hall still locked',
    accepted: ['Why was the hall still locked?'],
    explanation: 'This is a direct question, so it needs a capital letter and a question mark.',
    model: 'Why was the hall still locked?',
    misconceptionTags: ['endmarks.capitalisation_missing', 'endmarks.question_mark_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_fix_statement',
    mode: 'fix',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Correct the punctuation in this sentence.',
    stem: 'do not forget your reading journal?',
    accepted: ['Do not forget your reading journal.'],
    explanation: 'This is a statement, not a question. It needs a capital letter and a full stop.',
    model: 'Do not forget your reading journal.',
    misconceptionTags: ['endmarks.mark_mismatch', 'endmarks.capitalisation_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_transfer_why',
    mode: 'transfer',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: "Write one question that begins with 'Why' and ends correctly.",
    stem: '',
    accepted: ['Why was the gate still open?'],
    explanation: 'A question should begin with a capital letter and end with a question mark.',
    model: 'Why was the gate still open?',
    validator: { type: 'startsWithWordQuestion', word: 'Why' },
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_choose_direct_question',
    mode: 'choose',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'Where is the science tray.',
      'where is the science tray?',
      'Where is the science tray?',
      'Where is the science tray',
    ],
    correctIndex: 2,
    explanation: 'A direct question starts with a capital letter and ends with a question mark.',
    model: 'Where is the science tray?',
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing', 'endmarks.terminal_missing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_insert_quiet_command',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Punctuate the instruction accurately.',
    stem: 'please close the classroom door',
    accepted: ['Please close the classroom door.'],
    explanation: 'An instruction starts with a capital letter and ends with a full stop.',
    model: 'Please close the classroom door.',
    misconceptionTags: ['endmarks.capitalisation_missing', 'endmarks.terminal_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_fix_excited_statement',
    mode: 'fix',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Correct the punctuation so the sentence shows excitement.',
    stem: 'what a clever idea.',
    accepted: ['What a clever idea!'],
    explanation: 'The sentence starts with a capital letter and uses an exclamation mark for excitement.',
    model: 'What a clever idea!',
    misconceptionTags: ['endmarks.mark_mismatch', 'endmarks.capitalisation_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'se_transfer_where',
    mode: 'transfer',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: "Write one question that begins with 'Where' and ends correctly.",
    stem: '',
    accepted: ['Where did the trail begin?'],
    explanation: 'A question should begin with a capital letter and end with a question mark.',
    model: 'Where did the trail begin?',
    validator: { type: 'startsWithWordQuestion', word: 'Where' },
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing', 'endmarks.question_starter_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'lc_choose_picnic',
    mode: 'choose',
    skillIds: ['list_commas'],
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'We packed torches maps and water.',
      'We packed torches, maps and water.',
      'We packed torches, maps, and water.',
      'We packed, torches maps and water.',
    ],
    correctIndex: 1,
    explanation: 'A comma separates the first two list items. In this KS2 example, no comma is needed before and.',
    model: 'We packed torches, maps and water.',
    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma', 'comma.comma_after_verb'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'lc_insert_supplies',
    mode: 'insert',
    skillIds: ['list_commas'],
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    prompt: 'Add the missing list punctuation.',
    stem: 'We needed pencils rulers and glue.',
    accepted: ['We needed pencils, rulers and glue.'],
    explanation: 'Use a comma between pencils and rulers to separate the list items.',
    model: 'We needed pencils, rulers and glue.',
    validator: {
      type: 'requiresListCommas',
      opening: 'We needed',
      items: ['pencils', 'rulers', 'glue'],
    },
    misconceptionTags: ['comma.list_separator_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'lc_fix_display',
    mode: 'fix',
    skillIds: ['list_commas'],
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    prompt: 'Correct the list punctuation in this sentence.',
    stem: 'The display showed shells pebbles, and fossils.',
    accepted: ['The display showed shells, pebbles and fossils.'],
    explanation: 'The comma belongs between shells and pebbles. A final comma before and is accepted here too.',
    model: 'The display showed shells, pebbles and fossils.',
    validator: {
      type: 'requiresListCommas',
      opening: 'The display showed',
      items: ['shells', 'pebbles', 'fossils'],
    },
    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'lc_transfer_trip',
    mode: 'transfer',
    skillIds: ['list_commas'],
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    prompt: 'Write one sentence that uses this exact list: torches, maps and water.',
    stem: '',
    accepted: ['For the trip, we packed torches, maps and water.'],
    explanation: 'The list keeps the three items in order and separates the first two with a comma.',
    model: 'For the trip, we packed torches, maps and water.',
    validator: { type: 'requiresListCommas', items: ['torches', 'maps', 'water'] },
    misconceptionTags: ['comma.list_separator_missing', 'comma.list_words_changed', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'lc_transfer_bake_sale',
    mode: 'transfer',
    skillIds: ['list_commas'],
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    prompt: 'Write one sentence using this exact stem and list: For the bake sale we needed eggs, flour, butter and sugar. For this question, do not put a comma before the final and.',
    stem: '',
    accepted: ['For the bake sale we needed eggs, flour, butter and sugar.'],
    explanation: 'The sentence keeps the exact stem and list items, with commas between the list items. For this question, there is no comma before the final and.',
    model: 'For the bake sale we needed eggs, flour, butter and sugar.',
    validator: {
      type: 'requiresListCommas',
      opening: 'For the bake sale we needed',
      items: ['eggs', 'flour', 'butter', 'sugar'],
      allowFinalComma: false,
    },
    misconceptionTags: ['comma.list_separator_missing', 'comma.list_words_changed', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'lc_combine_trip_list',
    mode: 'combine',
    skillIds: ['list_commas'],
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: 'We packed\n- torches\n- maps\n- water',
    accepted: ['We packed torches, maps and water.'],
    explanation: 'The list items stay in order, with a comma between torches and maps.',
    model: 'We packed torches, maps and water.',
    validator: {
      type: 'combineListSentence',
      opening: 'We packed',
      items: ['torches', 'maps', 'water'],
    },
    misconceptionTags: ['comma.list_separator_missing', 'comma.list_words_changed', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_choose_contractions',
    mode: 'choose',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      "She didnt know we'd already left.",
      "She didn't know we'd already left.",
      "She didn't know wed already left.",
      "She didnt know we'd already left",
    ],
    correctIndex: 1,
    explanation: "Both contractions need apostrophes: didn't and we'd.",
    model: "She didn't know we'd already left.",
    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.terminal_missing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_insert_contractions',
    mode: 'insert',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: 'Add the punctuation needed.',
    stem: 'Youll see that Im ready because Ive packed already.',
    accepted: ["You'll see that I'm ready because I've packed already."],
    explanation: 'Each contraction needs an apostrophe to show missing letters.',
    model: "You'll see that I'm ready because I've packed already.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_fix_contractions',
    mode: 'fix',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: 'Correct the punctuation in this sentence.',
    stem: 'I cant believe were nearly there.',
    accepted: ["I can't believe we're nearly there."],
    explanation: "The apostrophes show the missing letters in can't and we're.",
    model: "I can't believe we're nearly there.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_transfer_contractions',
    mode: 'transfer',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: "Write one sentence that includes both can't and we're.",
    stem: '',
    accepted: ["We can't leave yet because we're still tidying up."],
    explanation: 'Both contractions need apostrophes.',
    model: "We can't leave yet because we're still tidying up.",
    validator: { type: 'requiresTokens', tokens: ["can't", "we're"] },
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_choose_theyre_dont',
    mode: 'choose',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: 'Choose the sentence with both contractions punctuated correctly.',
    options: [
      'Theyre sure we dont need tickets.',
      "They're sure we don't need tickets.",
      "They're sure we dont need tickets.",
      "Theyre sure we don't need tickets.",
    ],
    correctIndex: 1,
    explanation: "The contractions are they're and don't.",
    model: "They're sure we don't need tickets.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_insert_well_youre',
    mode: 'insert',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: 'Add the apostrophes needed for the contractions.',
    stem: 'Well check that youre ready before we leave.',
    accepted: ["We'll check that you're ready before we leave."],
    explanation: "We'll and you're need apostrophes to show missing letters.",
    model: "We'll check that you're ready before we leave.",
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ac_transfer_dont_theyre',
    mode: 'transfer',
    skillIds: ['apostrophe_contractions'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    prompt: "Write one sentence that includes both don't and they're.",
    stem: '',
    accepted: ["Don't worry because they're on the way."],
    explanation: "Don't and they're both need apostrophes.",
    model: "Don't worry because they're on the way.",
    validator: { type: 'requiresTokens', tokens: ["don't", "they're"], minimumWordCount: 4 },
    misconceptionTags: ['apostrophe.contraction_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ap_choose_possession',
    mode: 'choose',
    skillIds: ['apostrophe_possession'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      "The teachers' room was next to the library.",
      "The teacher's room was next to the librarys.",
      'The teachers room was next to the library.',
      "The teachers' room was next to the library",
    ],
    correctIndex: 0,
    explanation: "Teachers' shows belonging to more than one teacher, and the sentence ends with a full stop.",
    model: "The teachers' room was next to the library.",
    misconceptionTags: ['apostrophe.possession_missing', 'apostrophe.possession_number', 'apostrophe.terminal_missing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ap_insert_singular',
    mode: 'insert',
    skillIds: ['apostrophe_possession'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    prompt: 'Add the missing punctuation.',
    stem: 'The girls coat was hanging on the peg.',
    accepted: ["The girl's coat was hanging on the peg."],
    explanation: 'One girl owns the coat, so the apostrophe goes before the s.',
    model: "The girl's coat was hanging on the peg.",
    misconceptionTags: ['apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ap_fix_irregular',
    mode: 'fix',
    skillIds: ['apostrophe_possession'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    prompt: 'Correct the punctuation in this sentence.',
    stem: 'The childrens boots were lined up by the door.',
    accepted: ["The children's boots were lined up by the door."],
    explanation: 'Children is an irregular plural, so the apostrophe comes before the s.',
    model: "The children's boots were lined up by the door.",
    misconceptionTags: ['apostrophe.possession_missing', 'apostrophe.irregular_plural'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'ap_transfer_possession',
    mode: 'transfer',
    skillIds: ['apostrophe_possession'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    prompt: "Write one sentence that includes both children's and teachers'.",
    stem: '',
    accepted: ["The children's paintings were hanging beside the teachers' notices."],
    explanation: "Children's and teachers' both need apostrophes for possession.",
    model: "The children's paintings were hanging beside the teachers' notices.",
    validator: { type: 'requiresTokens', tokens: ["children's", "teachers'"] },
    misconceptionTags: ['apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sp_choose_reporting_comma',
    mode: 'choose',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'Mum said, "Put your shoes by the door."',
      'Mum said "Put your shoes by the door".',
      'Mum said, "Put your shoes by the door".',
      'Mum said "Put your shoes by the door."',
    ],
    correctIndex: 0,
    explanation: 'The reporting clause is followed by a comma, and the full stop sits inside the inverted commas.',
    model: 'Mum said, "Put your shoes by the door."',
    misconceptionTags: ['speech.reporting_comma_missing', 'speech.punctuation_outside_quote'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sp_insert_question',
    mode: 'insert',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Punctuate the direct speech accurately.',
    stem: 'Ella asked can we start now',
    accepted: ['Ella asked, "Can we start now?"', "Ella asked, 'Can we start now?'"],
    explanation: 'This is a spoken question, so the question mark belongs inside the inverted commas.',
    model: 'Ella asked, "Can we start now?"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      reportingClause: 'Ella asked',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_outside_quote', 'speech.reporting_comma_missing', 'speech.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sp_fix_question',
    mode: 'fix',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Correct the punctuation in this sentence.',
    stem: '"Where are we meeting"? asked Zara.',
    accepted: ['"Where are we meeting?" asked Zara.', "'Where are we meeting?' asked Zara."],
    explanation: 'The question mark belongs inside the closing inverted comma because it is part of the spoken words.',
    model: '"Where are we meeting?" asked Zara.',
    rubric: {
      type: 'speech',
      reportingPosition: 'after',
      reportingClause: 'asked Zara',
      spokenWords: 'where are we meeting',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.punctuation_outside_quote', 'speech.quote_unmatched', 'speech.words_changed'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sp_transfer_question',
    mode: 'transfer',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Write one sentence of direct speech using these exact spoken words: Can we start now?',
    stem: '',
    accepted: ['Mia asked, "Can we start now?"', '"Can we start now?" asked Mia.'],
    explanation: 'Direct speech needs inverted commas, a capital letter, and a question mark inside the closing inverted comma.',
    model: 'Mia asked, "Can we start now?"',
    validator: { type: 'speechWithWords', words: 'can we start now', requiredTerminal: '?' },
    rubric: {
      type: 'speech',
      reportingPosition: 'any',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_outside_quote', 'speech.reporting_comma_missing', 'speech.capitalisation_missing', 'speech.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sp_fa_transfer_at_last_speech',
    mode: 'transfer',
    skillIds: ['speech', 'fronted_adverbial'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Write one sentence using this exact opening, reporting clause and spoken words: At last / Noah shouted / we made it!',
    stem: '',
    accepted: ['At last, Noah shouted, "We made it!"'],
    explanation: 'The fronted adverbial needs a comma, and the spoken words need inverted commas and correct end punctuation.',
    model: 'At last, Noah shouted, "We made it!"',
    validator: {
      type: 'frontedAdverbialWithSpeech',
      phrase: 'At last',
      reportingClause: 'Noah shouted',
      words: 'we made it',
      requiredTerminal: '!',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing', 'speech.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'fa_choose_before_lunch',
    mode: 'choose',
    skillIds: ['fronted_adverbial'],
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'Before lunch we finished the poster.',
      'Before lunch, we finished the poster.',
      'Before, lunch we finished the poster.',
      'Before lunch we, finished the poster.',
    ],
    correctIndex: 1,
    explanation: 'A comma follows the fronted adverbial Before lunch.',
    model: 'Before lunch, we finished the poster.',
    misconceptionTags: ['comma.fronted_adverbial_missing', 'comma.comma_inside_phrase', 'comma.comma_after_subject'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'fa_insert_without_warning',
    mode: 'insert',
    skillIds: ['fronted_adverbial'],
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
    prompt: 'Add the missing punctuation after the fronted adverbial.',
    stem: 'Without warning the bell began to ring.',
    accepted: ['Without warning, the bell began to ring.'],
    explanation: 'Without warning is a fronted adverbial, so it is followed by a comma.',
    model: 'Without warning, the bell began to ring.',
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'fa_fix_at_last',
    mode: 'fix',
    skillIds: ['fronted_adverbial'],
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
    prompt: 'Correct the punctuation in this sentence.',
    stem: 'At last we reached the harbour.',
    accepted: ['At last, we reached the harbour.'],
    explanation: 'At last comes before the main clause, so it needs a comma after it.',
    model: 'At last, we reached the harbour.',
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'fa_transfer_after_lunch',
    mode: 'transfer',
    skillIds: ['fronted_adverbial'],
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
    prompt: "Write one sentence that begins with 'After lunch,' and uses the comma correctly.",
    stem: '',
    accepted: ['After lunch, we practised our lines.'],
    explanation: 'The fronted adverbial After lunch is followed by a comma.',
    model: 'After lunch, we practised our lines.',
    validator: { type: 'startsWithPhraseComma', phrase: 'After lunch' },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'comma.capitalisation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'fa_combine_after_storm',
    mode: 'combine',
    skillIds: ['fronted_adverbial'],
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: 'After the storm\nThe playground gleamed.',
    accepted: ['After the storm, the playground gleamed.'],
    explanation: 'The fronted adverbial After the storm is followed by a comma.',
    model: 'After the storm, the playground gleamed.',
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: 'After the storm',
      mainClause: 'the playground gleamed',
    },
    misconceptionTags: ['comma.fronted_adverbial_missing', 'comma.opening_phrase_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_choose_grandma',
    mode: 'choose',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: 'Choose the sentence where the comma makes the meaning clear.',
    options: [
      "Let's eat Grandma.",
      "Let's eat, Grandma.",
      "Lets eat, Grandma.",
      "Let's, eat Grandma.",
    ],
    correctIndex: 1,
    explanation: 'The comma shows that Grandma is being spoken to.',
    model: "Let's eat, Grandma.",
    misconceptionTags: ['comma.clarity_missing', 'apostrophe.contraction_missing', 'comma.comma_after_subject'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_insert_time_travellers',
    mode: 'insert',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: 'Add the comma that makes the meaning clear.',
    stem: 'Most of the time travellers worry about delays.',
    accepted: ['Most of the time, travellers worry about delays.'],
    explanation: 'The comma shows that Most of the time describes when travellers worry.',
    model: 'Most of the time, travellers worry about delays.',
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_fix_when_rain_stopped',
    mode: 'fix',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: 'Correct the punctuation so the sentence is clear.',
    stem: 'When the rain stopped the children cheered.',
    accepted: ['When the rain stopped, the children cheered.'],
    explanation: 'The comma separates the opening clause from the main clause.',
    model: 'When the rain stopped, the children cheered.',
    misconceptionTags: ['comma.clarity_missing', 'comma.opening_clause_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_transfer_morning',
    mode: 'transfer',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: "Write one sentence that begins with 'In the morning,' and uses the comma to make the meaning clear.",
    stem: '',
    accepted: ['In the morning, the path was quiet.'],
    explanation: 'The comma marks the opening phrase and keeps the meaning clear.',
    model: 'In the morning, the path was quiet.',
    validator: { type: 'startsWithPhraseComma', phrase: 'In the morning' },
    misconceptionTags: ['comma.clarity_missing', 'comma.capitalisation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_choose_before_cooking',
    mode: 'choose',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: 'Choose the sentence where the comma makes the meaning clear.',
    options: [
      'Before cooking children wash their hands.',
      'Before cooking, children wash their hands.',
      'Before cooking children, wash their hands.',
      'Before, cooking children wash their hands.',
    ],
    correctIndex: 1,
    explanation: 'The comma shows that the children wash their hands before cooking.',
    model: 'Before cooking, children wash their hands.',
    misconceptionTags: ['comma.clarity_missing', 'comma.comma_inside_phrase', 'comma.comma_after_subject'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_insert_after_supper',
    mode: 'insert',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: 'Add the comma that makes the meaning clear.',
    stem: 'After supper we read quietly.',
    accepted: ['After supper, we read quietly.'],
    explanation: 'The comma marks the opening phrase and helps the sentence read clearly.',
    model: 'After supper, we read quietly.',
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_fix_if_lost',
    mode: 'fix',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: 'Correct the punctuation so the sentence is clear.',
    stem: 'If you get lost ask a helper.',
    accepted: ['If you get lost, ask a helper.'],
    explanation: 'The comma separates the opening idea from the instruction that follows.',
    model: 'If you get lost, ask a helper.',
    misconceptionTags: ['comma.clarity_missing', 'comma.opening_clause_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cc_transfer_after_the_match',
    mode: 'transfer',
    skillIds: ['comma_clarity'],
    clusterId: 'comma_flow',
    rewardUnitId: 'comma-clarity-core',
    prompt: "Write one sentence that begins with 'After the match,' and uses the comma to make the meaning clear.",
    stem: '',
    accepted: ['After the match, the team shook hands.'],
    explanation: 'The comma marks the opening phrase and keeps the timing clear.',
    model: 'After the match, the team shook hands.',
    validator: { type: 'startsWithPhraseComma', phrase: 'After the match' },
    misconceptionTags: ['comma.clarity_missing', 'comma.capitalisation_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sc_choose_rain_pitch',
    mode: 'choose',
    skillIds: ['semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'The rain had stopped, the pitch was still slippery.',
      'The rain had stopped; the pitch was still slippery.',
      'The rain had stopped; and the pitch was still slippery.',
      'The rain had stopped the pitch was still slippery.',
    ],
    correctIndex: 1,
    explanation: 'A semi-colon can join two closely related main clauses without adding and.',
    model: 'The rain had stopped; the pitch was still slippery.',
    misconceptionTags: ['boundary.comma_splice', 'boundary.extra_conjunction', 'boundary.semicolon_missing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sc_insert_lights_audience',
    mode: 'insert',
    skillIds: ['semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
    prompt: 'Add the punctuation between the related clauses.',
    stem: 'The lights dimmed the audience fell silent.',
    accepted: ['The lights dimmed; the audience fell silent.'],
    explanation: 'The semi-colon marks the boundary between two related main clauses.',
    model: 'The lights dimmed; the audience fell silent.',
    misconceptionTags: ['boundary.semicolon_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sc_fix_path_map',
    mode: 'fix',
    skillIds: ['semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
    prompt: 'Correct the punctuation between these related clauses.',
    stem: 'The path was narrow, the map showed a safer route.',
    accepted: ['The path was narrow; the map showed a safer route.'],
    explanation: 'A comma alone creates a comma splice; a semi-colon can join the related clauses.',
    model: 'The path was narrow; the map showed a safer route.',
    misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sc_transfer_rain_pitch',
    mode: 'transfer',
    skillIds: ['semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
    prompt: 'Write one sentence that links these clauses with a semi-colon: The rain had stopped / the pitch was still slippery.',
    stem: '',
    accepted: ['The rain had stopped; the pitch was still slippery.'],
    explanation: 'The semi-colon sits between the two related main clauses.',
    model: 'The rain had stopped; the pitch was still slippery.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      mark: ';',
      left: 'The rain had stopped',
      right: 'the pitch was still slippery',
    },
    misconceptionTags: ['boundary.semicolon_missing', 'boundary.comma_splice', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sc_combine_rain_pitch',
    mode: 'combine',
    skillIds: ['semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
    prompt: 'Combine the two related clauses into one sentence with a semi-colon.',
    stem: 'The rain had stopped.\nThe pitch was still slippery.',
    accepted: ['The rain had stopped; the pitch was still slippery.'],
    explanation: 'The semi-colon joins two closely related main clauses in one sentence.',
    model: 'The rain had stopped; the pitch was still slippery.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      mark: ';',
      left: 'The rain had stopped',
      right: 'the pitch was still slippery',
    },
    misconceptionTags: ['boundary.semicolon_missing', 'boundary.comma_splice', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_choose_flooded_route',
    mode: 'choose',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Choose the best punctuated sentence.',
    options: [
      'The path was flooded, we took the longer route.',
      'The path was flooded – we took the longer route.',
      'The path was flooded –and we took the longer route.',
      'The path was flooded we took the longer route.',
    ],
    correctIndex: 1,
    explanation: 'The dash marks a sharp boundary between two related clauses.',
    model: 'The path was flooded – we took the longer route.',
    misconceptionTags: ['boundary.comma_splice', 'boundary.dash_missing', 'boundary.dash_spacing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_insert_door_froze',
    mode: 'insert',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Add the punctuation between the related clauses.',
    stem: 'The door creaked open we froze.',
    accepted: [
      'The door creaked open – we froze.',
      'The door creaked open - we froze.',
      'The door creaked open — we froze.',
    ],
    explanation: 'The dash creates a clear break between the two related clauses.',
    model: 'The door creaked open – we froze.',
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_fix_signal_team',
    mode: 'fix',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Correct the dash punctuation in this sentence.',
    stem: 'The signal failed –and the team waited.',
    accepted: [
      'The signal failed – the team waited.',
      'The signal failed - the team waited.',
      'The signal failed — the team waited.',
    ],
    explanation: 'Leave a space either side of the dash and avoid attaching it to and.',
    model: 'The signal failed – the team waited.',
    misconceptionTags: ['boundary.dash_spacing', 'boundary.extra_conjunction'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_transfer_flooded_route',
    mode: 'transfer',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Write one sentence that links these clauses with a dash: The path was flooded / we took the longer route.',
    stem: '',
    accepted: [
      'The path was flooded – we took the longer route.',
      'The path was flooded - we took the longer route.',
      'The path was flooded — we took the longer route.',
    ],
    explanation: 'The dash sits between the two related clauses.',
    model: 'The path was flooded – we took the longer route.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      mark: ' - ',
      left: 'The path was flooded',
      right: 'we took the longer route',
    },
    misconceptionTags: ['boundary.dash_missing', 'boundary.comma_splice', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_combine_flooded_route',
    mode: 'combine',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Combine the two related clauses into one sentence with a dash.',
    stem: 'The path was flooded.\nWe took the longer route.',
    accepted: [
      'The path was flooded – we took the longer route.',
      'The path was flooded - we took the longer route.',
      'The path was flooded — we took the longer route.',
    ],
    explanation: 'A spaced dash marks the sharp boundary between the related clauses.',
    model: 'The path was flooded – we took the longer route.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      mark: '-',
      left: 'The path was flooded',
      right: 'we took the longer route',
    },
    misconceptionTags: ['boundary.dash_missing', 'boundary.comma_splice', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_choose_lights_out',
    mode: 'choose',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Choose the sentence where the dash marks a clear break between ideas.',
    options: [
      'The lights went out, everyone stayed still.',
      'The lights went out – everyone stayed still.',
      'The lights went out –and everyone stayed still.',
      'The lights went out everyone stayed still.',
    ],
    correctIndex: 1,
    explanation: 'The dash marks a sharp break between two closely related ideas.',
    model: 'The lights went out – everyone stayed still.',
    misconceptionTags: ['boundary.comma_splice', 'boundary.dash_missing', 'boundary.dash_spacing'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_insert_alarm_rang',
    mode: 'insert',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Add the dash between the related ideas.',
    stem: 'The alarm rang everyone lined up.',
    accepted: [
      'The alarm rang – everyone lined up.',
      'The alarm rang - everyone lined up.',
      'The alarm rang — everyone lined up.',
    ],
    explanation: 'The dash creates a clear break between the two ideas.',
    model: 'The alarm rang – everyone lined up.',
    misconceptionTags: ['boundary.dash_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'dc_transfer_curtain_rose',
    mode: 'transfer',
    skillIds: ['dash_clause'],
    clusterId: 'boundary',
    rewardUnitId: 'dash-clauses-core',
    prompt: 'Write one sentence that links these ideas with a dash: The curtain rose / the hall fell silent.',
    stem: '',
    accepted: [
      'The curtain rose – the hall fell silent.',
      'The curtain rose - the hall fell silent.',
      'The curtain rose — the hall fell silent.',
    ],
    explanation: 'The dash sits between the two related ideas.',
    model: 'The curtain rose – the hall fell silent.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      mark: '-',
      left: 'The curtain rose',
      right: 'the hall fell silent',
    },
    misconceptionTags: ['boundary.dash_missing', 'boundary.comma_splice', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_choose_shark',
    mode: 'choose',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Choose the sentence where the hyphen avoids ambiguity.',
    options: [
      'We saw a man eating shark.',
      'We saw a man-eating shark.',
      'We saw a man-eating, shark.',
      'We saw a man eating-shark.',
    ],
    correctIndex: 1,
    explanation: 'Man-eating describes the shark and avoids the unintended meaning that a man is eating.',
    model: 'We saw a man-eating shark.',
    misconceptionTags: ['boundary.hyphen_missing', 'boundary.hyphen_position'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_insert_little_used',
    mode: 'insert',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The little used room was locked.',
    accepted: ['The little-used room was locked.'],
    explanation: 'Little-used works together before room, so the hyphen makes the meaning clear.',
    model: 'The little-used room was locked.',
    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_fix_fast_moving',
    mode: 'fix',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Correct the hyphenation in this sentence.',
    stem: 'We watched a fast moving train.',
    accepted: ['We watched a fast-moving train.'],
    explanation: 'Fast-moving works together before train, so the hyphen keeps the phrase clear.',
    model: 'We watched a fast-moving train.',
    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_transfer_well_known',
    mode: 'transfer',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Write one sentence that includes this exact phrase: well-known author.',
    stem: '',
    accepted: ['The well-known author visited our class.'],
    explanation: 'Well-known is hyphenated because the words work together before author.',
    model: 'The well-known author visited our class.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'well-known author' },
    misconceptionTags: ['boundary.hyphen_missing', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_transfer_man_eating_shark',
    mode: 'transfer',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: "Write one sentence that includes this exact phrase: man-eating shark.",
    stem: '',
    accepted: ['The divers spotted a man-eating shark near the reef.'],
    explanation: 'The hyphen avoids ambiguity in the noun phrase.',
    model: 'The divers spotted a man-eating shark near the reef.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'man-eating shark' },
    misconceptionTags: ['boundary.hyphen_missing', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_choose_small_business',
    mode: 'choose',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Choose the sentence where the hyphen avoids ambiguity.',
    options: [
      'The small business owner thanked us.',
      'The small-business owner thanked us.',
      'The small business-owner thanked us.',
      'The small-business, owner thanked us.',
    ],
    correctIndex: 1,
    explanation: 'Small-business works together before owner, so the hyphen keeps the meaning clear.',
    model: 'The small-business owner thanked us.',
    misconceptionTags: ['boundary.hyphen_missing', 'boundary.hyphen_position'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_insert_well_behaved',
    mode: 'insert',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: 'The well behaved puppy waited by the gate.',
    accepted: ['The well-behaved puppy waited by the gate.'],
    explanation: 'Well-behaved works together before puppy, so the hyphen keeps the phrase clear.',
    model: 'The well-behaved puppy waited by the gate.',
    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'hy_transfer_part_time_job',
    mode: 'transfer',
    skillIds: ['hyphen'],
    clusterId: 'boundary',
    rewardUnitId: 'hyphens-core',
    prompt: 'Write one sentence that includes this exact phrase: part-time job.',
    stem: '',
    accepted: ['My sister found a part-time job at the library.'],
    explanation: 'Part-time is hyphenated because the words work together before job.',
    model: 'My sister found a part-time job at the library.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'part-time job', minimumWordCount: 5 },
    misconceptionTags: ['boundary.hyphen_missing', 'boundary.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pa_choose_coach',
    mode: 'choose',
    skillIds: ['parenthesis'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
    prompt: 'Choose the sentence where the parenthesis is marked correctly.',
    options: [
      'Mr Patel our coach arrived early.',
      'Mr Patel, our coach, arrived early.',
      'Mr Patel, our coach arrived early.',
      'Mr Patel our coach, arrived early.',
    ],
    correctIndex: 1,
    explanation: 'The extra information our coach is marked off with a pair of commas.',
    model: 'Mr Patel, our coach, arrived early.',
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pa_insert_museum',
    mode: 'insert',
    skillIds: ['parenthesis'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
    prompt: 'Add the punctuation for the parenthesis.',
    stem: 'The museum a former station was busy.',
    accepted: [
      'The museum, a former station, was busy.',
      'The museum (a former station) was busy.',
      'The museum - a former station - was busy.',
    ],
    explanation: 'The extra information a former station is marked off as parenthesis.',
    model: 'The museum, a former station, was busy.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The museum',
      phrase: 'a former station',
      after: 'was busy',
    },
    misconceptionTags: ['structure.parenthesis_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pa_fix_author',
    mode: 'fix',
    skillIds: ['parenthesis'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
    prompt: 'Correct the parenthesis punctuation in this sentence.',
    stem: 'The author, who won the prize smiled.',
    accepted: [
      'The author, who won the prize, smiled.',
      'The author (who won the prize) smiled.',
      'The author - who won the prize - smiled.',
    ],
    explanation: 'Both sides of the parenthesis need punctuation.',
    model: 'The author, who won the prize, smiled.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The author',
      phrase: 'who won the prize',
      after: 'smiled',
    },
    misconceptionTags: ['structure.parenthesis_unbalanced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pa_transfer_library',
    mode: 'transfer',
    skillIds: ['parenthesis'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
    prompt: 'Write one sentence using this exact frame and parenthesis: The library / which opened last year / is busy.',
    stem: '',
    accepted: ['The library, which opened last year, is busy.'],
    explanation: 'The parenthesis is marked before and after the extra information.',
    model: 'The library, which opened last year, is busy.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The library',
      phrase: 'which opened last year',
      after: 'is busy',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'structure.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pa_combine_lighthouse',
    mode: 'combine',
    skillIds: ['parenthesis'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: 'The lighthouse guided the boats.\nExtra detail: a useful lookout',
    accepted: [
      'The lighthouse, a useful lookout, guided the boats.',
      'The lighthouse (a useful lookout) guided the boats.',
      'The lighthouse - a useful lookout - guided the boats.',
    ],
    explanation: 'The extra detail a useful lookout is marked off clearly as parenthesis.',
    model: 'The lighthouse, a useful lookout, guided the boats.',
    validator: {
      type: 'combineParentheticalPhrase',
      before: 'The lighthouse',
      phrase: 'a useful lookout',
      after: 'guided the boats',
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'structure.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cl_choose_supplies',
    mode: 'choose',
    skillIds: ['colon_list'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
    prompt: 'Choose the sentence where the colon introduces the list correctly.',
    options: [
      'We needed three things, a torch, a map and a whistle.',
      'We needed three things: a torch, a map and a whistle.',
      'We needed: three things a torch, a map and a whistle.',
      'We needed three things a torch, a map and a whistle.',
    ],
    correctIndex: 1,
    explanation: 'The colon follows a complete opening clause and introduces the list.',
    model: 'We needed three things: a torch, a map and a whistle.',
    misconceptionTags: ['structure.colon_missing', 'structure.colon_after_incomplete_clause'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cl_insert_awards',
    mode: 'insert',
    skillIds: ['colon_list'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
    prompt: 'Add the colon before the list.',
    stem: 'The team won three awards player of the match, best defence and fair play.',
    accepted: ['The team won three awards: player of the match, best defence and fair play.'],
    explanation: 'The colon introduces the list of awards.',
    model: 'The team won three awards: player of the match, best defence and fair play.',
    misconceptionTags: ['structure.colon_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cl_fix_camp',
    mode: 'fix',
    skillIds: ['colon_list'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
    prompt: 'Correct the punctuation before the list.',
    stem: 'We packed three things, tents, food and torches.',
    accepted: ['We packed three things: tents, food and torches.'],
    explanation: 'A colon can introduce the list after the complete opening clause.',
    model: 'We packed three things: tents, food and torches.',
    misconceptionTags: ['structure.colon_missing', 'structure.comma_before_list'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cl_transfer_trip',
    mode: 'transfer',
    skillIds: ['colon_list'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
    prompt: 'Write one sentence using this exact opening and list: We needed three things / a torch, a map and a whistle.',
    stem: '',
    accepted: ['We needed three things: a torch, a map and a whistle.'],
    explanation: 'The colon introduces the list after a complete opening clause.',
    model: 'We needed three things: a torch, a map and a whistle.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'We needed three things',
      items: ['a torch', 'a map', 'a whistle'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_words_changed', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cl_lc_transfer_toolkit',
    mode: 'transfer',
    skillIds: ['colon_list', 'list_commas'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
    prompt: 'Write one sentence using this exact stem and list after a colon: Our toolkit contained three items / glue, card and scissors.',
    stem: '',
    accepted: ['Our toolkit contained three items: glue, card and scissors.'],
    explanation: 'A complete opening clause can be followed by a colon and a list.',
    model: 'Our toolkit contained three items: glue, card and scissors.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'Our toolkit contained three items',
      items: ['glue', 'card', 'scissors'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_words_changed', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'cl_combine_awards',
    mode: 'combine',
    skillIds: ['colon_list'],
    clusterId: 'structure',
    rewardUnitId: 'colons-core',
    prompt: 'Combine the opening clause and list using a colon.',
    stem: 'The team won three awards\nplayer of the match / best defence / fair play',
    accepted: ['The team won three awards: player of the match, best defence and fair play.'],
    explanation: 'The colon introduces the list after a complete opening clause.',
    model: 'The team won three awards: player of the match, best defence and fair play.',
    validator: {
      type: 'combineColonList',
      opening: 'The team won three awards',
      items: ['player of the match', 'best defence', 'fair play'],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_words_changed', 'structure.list_separator_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_choose_cities',
    mode: 'choose',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Choose the sentence where semi-colons separate complex list items.',
    options: [
      'We visited York, England, Cardiff, Wales, and Belfast, Northern Ireland.',
      'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.',
      'We visited York; England, Cardiff; Wales and Belfast; Northern Ireland.',
      'We visited York, England; Cardiff, Wales, and Belfast, Northern Ireland.',
    ],
    correctIndex: 1,
    explanation: 'Semi-colons separate the larger list items because each item already contains a comma.',
    model: 'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.',
    misconceptionTags: ['structure.semicolon_list_missing', 'structure.semicolon_list_misplaced'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_insert_cities',
    mode: 'insert',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Add semi-colons to separate the complex list items.',
    stem: 'We visited York, England Cardiff, Wales and Belfast, Northern Ireland.',
    accepted: ['We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.'],
    explanation: 'The semi-colons separate the places in the list.',
    model: 'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.',
    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_fix_captains',
    mode: 'fix',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Correct the punctuation in this complex list.',
    stem: 'Our captains were Sam, Year 5, Aisha, Year 6, and Noor, Year 6.',
    accepted: ['Our captains were Sam, Year 5; Aisha, Year 6; and Noor, Year 6.'],
    explanation: 'Semi-colons separate list items that already include commas.',
    model: 'Our captains were Sam, Year 5; Aisha, Year 6; and Noor, Year 6.',
    misconceptionTags: ['structure.semicolon_list_missing', 'structure.semicolon_list_misplaced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_transfer_places',
    mode: 'transfer',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Write one sentence that separates this complex list with semi-colons: York, England / Cardiff, Wales / Belfast, Northern Ireland.',
    stem: '',
    accepted: ['We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.'],
    explanation: 'The semi-colons separate the three larger list items.',
    model: 'We visited York, England; Cardiff, Wales; and Belfast, Northern Ireland.',
    validator: {
      type: 'requiresSemicolonList',
      items: ['York, England', 'Cardiff, Wales', 'Belfast, Northern Ireland'],
    },
    misconceptionTags: ['structure.semicolon_list_missing', 'structure.list_words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_choose_clubs',
    mode: 'choose',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Choose the sentence where semi-colons separate the larger list items.',
    options: [
      'The clubs met in Leeds, Yorkshire, Exeter, Devon, and Perth, Scotland.',
      'The clubs met in Leeds, Yorkshire; Exeter, Devon; and Perth, Scotland.',
      'The clubs met in Leeds; Yorkshire, Exeter; Devon and Perth; Scotland.',
      'The clubs met in Leeds, Yorkshire; Exeter, Devon, and Perth, Scotland.',
    ],
    correctIndex: 1,
    explanation: 'Semi-colons separate the larger list items because each item already contains a comma.',
    model: 'The clubs met in Leeds, Yorkshire; Exeter, Devon; and Perth, Scotland.',
    misconceptionTags: ['structure.semicolon_list_missing', 'structure.semicolon_list_misplaced'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_insert_helper_roles',
    mode: 'insert',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Add semi-colons to separate the larger list items.',
    stem: 'The helpers were Maya, register monitor Leo, equipment monitor and Aisha, line leader.',
    accepted: ['The helpers were Maya, register monitor; Leo, equipment monitor; and Aisha, line leader.'],
    explanation: 'Semi-colons separate the helpers because each list item already contains a comma.',
    model: 'The helpers were Maya, register monitor; Leo, equipment monitor; and Aisha, line leader.',
    misconceptionTags: ['structure.semicolon_list_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_fix_stalls',
    mode: 'fix',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Correct the punctuation in this complex list.',
    stem: 'The stalls were crafts, table one, games, table two, and snacks, table three.',
    accepted: ['The stalls were crafts, table one; games, table two; and snacks, table three.'],
    explanation: 'Semi-colons separate the larger list items because each item already contains a comma.',
    model: 'The stalls were crafts, table one; games, table two; and snacks, table three.',
    misconceptionTags: ['structure.semicolon_list_missing', 'structure.semicolon_list_misplaced'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'sl_transfer_event_stalls',
    mode: 'transfer',
    skillIds: ['semicolon_list'],
    clusterId: 'structure',
    rewardUnitId: 'semicolon-lists-core',
    prompt: 'Write one sentence that separates this complex list with semi-colons: crafts, table one / games, table two / snacks, table three.',
    stem: '',
    accepted: ['The stalls were crafts, table one; games, table two; and snacks, table three.'],
    explanation: 'The semi-colons separate the three larger list items.',
    model: 'The stalls were crafts, table one; games, table two; and snacks, table three.',
    validator: {
      type: 'requiresSemicolonList',
      items: ['crafts, table one', 'games, table two', 'snacks, table three'],
    },
    misconceptionTags: ['structure.semicolon_list_missing', 'structure.list_words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'bp_choose_bring',
    mode: 'choose',
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    rewardUnitId: 'bullet-points-core',
    prompt: 'Choose the correctly punctuated bullet list.',
    options: [
      'Bring:\n- a drink\n- a hat\n- a sketchbook',
      'Bring\n- a drink\n- a hat\n- a sketchbook',
      'Bring:\n- a drink.\n- a hat\n- a sketchbook.',
      'Bring:\n- a drink\n- a hat\n- a sketchbook.',
    ],
    correctIndex: 0,
    explanation: 'The stem uses a colon and the fragment bullets are punctuated consistently.',
    model: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['retrieve_discriminate', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'bp_insert_kit',
    mode: 'insert',
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    rewardUnitId: 'bullet-points-core',
    prompt: 'Add the punctuation needed before the bullet list.',
    stem: 'Bring\n- a drink\n- a hat\n- a sketchbook',
    accepted: ['Bring:\n- a drink\n- a hat\n- a sketchbook'],
    explanation: 'A colon introduces the bullet list.',
    model: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Bring',
      items: ['a drink', 'a hat', 'a sketchbook'],
    },
    misconceptionTags: ['structure.bullet_colon_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'bp_fix_consistency',
    mode: 'fix',
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    rewardUnitId: 'bullet-points-core',
    prompt: 'Make the bullet punctuation consistent.',
    stem: 'Bring:\n- a drink.\n- a hat\n- a sketchbook.',
    accepted: ['Bring:\n- a drink\n- a hat\n- a sketchbook'],
    explanation: 'The bullets are short fragments, so they can be left without full stops as long as the pattern is consistent.',
    model: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Bring',
      items: ['a drink', 'a hat', 'a sketchbook'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'bp_transfer_class',
    mode: 'transfer',
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    rewardUnitId: 'bullet-points-core',
    prompt: 'Write a bullet list with the stem Bring: and these exact items: a drink, a hat, a sketchbook.',
    stem: '',
    accepted: ['Bring:\n- a drink\n- a hat\n- a sketchbook'],
    explanation: 'The colon introduces the list and each item is written as a bullet.',
    model: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Bring',
      items: ['a drink', 'a hat', 'a sketchbook'],
    },
    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent', 'structure.list_words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pg_fronted_speech',
    mode: 'paragraph',
    skillIds: ['fronted_adverbial', 'speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'After lunch Mia asked can we start now',
    accepted: ['After lunch, Mia asked, "Can we start now?"'],
    explanation: 'The fronted adverbial needs a comma, and the spoken question needs inverted commas and a question mark inside the speech.',
    model: 'After lunch, Mia asked, "Can we start now?"',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'startsWithPhraseComma',
          phrase: 'After lunch',
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
    source: 'fixed',
  },
  {
    id: 'pg_parenthesis_speech',
    mode: 'paragraph',
    skillIds: ['parenthesis', 'speech'],
    clusterId: 'structure',
    rewardUnitId: 'parenthesis-core',
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The museum a former station was busy. Noor said the queue is moving',
    accepted: ['The museum, a former station, was busy. Noor said, "The queue is moving."'],
    explanation: 'The extra detail is marked as parenthesis, and the spoken sentence is punctuated inside inverted commas.',
    model: 'The museum, a former station, was busy. Noor said, "The queue is moving."',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresParentheticalPhrase',
          before: 'The museum',
          phrase: 'a former station',
          after: 'was busy',
          misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
        },
        {
          type: 'speechWithWords',
          words: 'the queue is moving',
          requiredTerminal: '.',
          misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced', 'speech.quote_missing', 'speech.reporting_comma_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pg_colon_semicolon',
    mode: 'paragraph',
    skillIds: ['colon_list', 'semicolon'],
    clusterId: 'boundary',
    rewardUnitId: 'semicolons-core',
    prompt: 'Repair the punctuation in the short passage.',
    stem: 'The kit included three tools, a torch, a rope and a map. The weather changed, the team packed quickly.',
    accepted: ['The kit included three tools: a torch, a rope and a map. The weather changed; the team packed quickly.'],
    explanation: 'A colon introduces the list, and a semi-colon joins the related clauses.',
    model: 'The kit included three tools: a torch, a rope and a map. The weather changed; the team packed quickly.',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresColonBeforeList',
          opening: 'The kit included three tools',
          items: ['a torch', 'a rope', 'a map'],
          allowTrailingText: true,
          misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing'],
        },
        {
          type: 'requiresBoundaryBetweenClauses',
          mark: ';',
          left: 'The weather changed',
          right: 'the team packed quickly',
          misconceptionTags: ['boundary.comma_splice', 'boundary.semicolon_missing'],
        },
      ],
    },
    misconceptionTags: ['structure.colon_missing', 'structure.list_separator_missing', 'boundary.comma_splice', 'boundary.semicolon_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pg_bullet_consistency',
    mode: 'paragraph',
    skillIds: ['bullet_points'],
    clusterId: 'structure',
    rewardUnitId: 'bullet-points-core',
    prompt: 'Repair the bullet-list punctuation.',
    stem: 'Bring\n- a drink.\n- a hat\n- a sketchbook.',
    accepted: [
      'Bring:\n- a drink\n- a hat\n- a sketchbook',
      'Bring:\n- a drink.\n- a hat.\n- a sketchbook.',
    ],
    explanation: 'The stem needs a colon, each bullet stays on its own line, and the bullet punctuation is consistent.',
    model: 'Bring:\n- a drink\n- a hat\n- a sketchbook',
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresBulletStemAndItems',
          stem: 'Bring',
          items: ['a drink', 'a hat', 'a sketchbook'],
          misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
        },
      ],
    },
    misconceptionTags: ['structure.bullet_colon_missing', 'structure.bullet_marker_missing', 'structure.bullet_punctuation_inconsistent'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
  {
    id: 'pg_apostrophe_mix',
    mode: 'paragraph',
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
    prompt: 'Repair the apostrophes in the short passage.',
    stem: 'We cant find the childrens coats. The girls bags are in the hall.',
    accepted: ["We can't find the children's coats. The girls' bags are in the hall."],
    explanation: "Can't is a contraction, children's is an irregular plural possession, and girls' shows possession by more than one girl.",
    model: "We can't find the children's coats. The girls' bags are in the hall.",
    validator: {
      type: 'paragraphRepair',
      checks: [
        {
          type: 'requiresApostropheForms',
          tokens: ["can't", "children's", "girls' bags"],
          forbidden: ['cant', 'childrens', 'girls bags'],
          misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
        },
      ],
    },
    misconceptionTags: ['apostrophe.contraction_missing', 'apostrophe.possession_missing', 'apostrophe.possession_number'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
]);

export const PUNCTUATION_REWARD_UNITS = Object.freeze([
  rewardUnit({
    id: 'sentence-endings-core',
    clusterId: 'endmarks',
    skillIds: ['sentence_endings'],
    evidenceItemIds: [
      'se_choose_exclaim',
      'se_insert_question',
      'se_fix_statement',
      'se_transfer_why',
      'se_choose_direct_question',
      'se_insert_quiet_command',
      'se_fix_excited_statement',
      'se_transfer_where',
    ],
  }),
  rewardUnit({
    id: 'apostrophe-contractions-core',
    clusterId: 'apostrophe',
    skillIds: ['apostrophe_contractions'],
    evidenceItemIds: [
      'ac_choose_contractions',
      'ac_insert_contractions',
      'ac_fix_contractions',
      'ac_transfer_contractions',
      'ac_choose_theyre_dont',
      'ac_insert_well_youre',
      'ac_transfer_dont_theyre',
    ],
  }),
  rewardUnit({
    id: 'apostrophe-possession-core',
    clusterId: 'apostrophe',
    skillIds: ['apostrophe_possession'],
    evidenceItemIds: ['ap_choose_possession', 'ap_insert_singular', 'ap_fix_irregular', 'ap_transfer_possession', 'pg_apostrophe_mix'],
  }),
  rewardUnit({
    id: 'speech-core',
    clusterId: 'speech',
    skillIds: ['speech'],
    evidenceItemIds: ['sp_choose_reporting_comma', 'sp_insert_question', 'sp_fix_question', 'sp_transfer_question', 'sp_fa_transfer_at_last_speech', 'pg_fronted_speech'],
  }),
  rewardUnit({
    id: 'list-commas-core',
    clusterId: 'comma_flow',
    skillIds: ['list_commas'],
    evidenceItemIds: ['lc_choose_picnic', 'lc_insert_supplies', 'lc_fix_display', 'lc_transfer_trip', 'lc_transfer_bake_sale', 'lc_combine_trip_list'],
  }),
  rewardUnit({
    id: 'fronted-adverbials-core',
    clusterId: 'comma_flow',
    skillIds: ['fronted_adverbial'],
    evidenceItemIds: ['fa_choose_before_lunch', 'fa_insert_without_warning', 'fa_fix_at_last', 'fa_transfer_after_lunch', 'fa_combine_after_storm'],
  }),
  rewardUnit({
    id: 'comma-clarity-core',
    clusterId: 'comma_flow',
    skillIds: ['comma_clarity'],
    evidenceItemIds: [
      'cc_choose_grandma',
      'cc_insert_time_travellers',
      'cc_fix_when_rain_stopped',
      'cc_transfer_morning',
      'cc_choose_before_cooking',
      'cc_insert_after_supper',
      'cc_fix_if_lost',
      'cc_transfer_after_the_match',
    ],
  }),
  rewardUnit({
    id: 'semicolons-core',
    clusterId: 'boundary',
    skillIds: ['semicolon'],
    evidenceItemIds: ['sc_choose_rain_pitch', 'sc_insert_lights_audience', 'sc_fix_path_map', 'sc_transfer_rain_pitch', 'sc_combine_rain_pitch', 'pg_colon_semicolon'],
  }),
  rewardUnit({
    id: 'dash-clauses-core',
    clusterId: 'boundary',
    skillIds: ['dash_clause'],
    evidenceItemIds: [
      'dc_choose_flooded_route',
      'dc_insert_door_froze',
      'dc_fix_signal_team',
      'dc_transfer_flooded_route',
      'dc_combine_flooded_route',
      'dc_choose_lights_out',
      'dc_insert_alarm_rang',
      'dc_transfer_curtain_rose',
    ],
  }),
  rewardUnit({
    id: 'hyphens-core',
    clusterId: 'boundary',
    skillIds: ['hyphen'],
    evidenceItemIds: [
      'hy_choose_shark',
      'hy_insert_little_used',
      'hy_fix_fast_moving',
      'hy_transfer_well_known',
      'hy_transfer_man_eating_shark',
      'hy_choose_small_business',
      'hy_insert_well_behaved',
      'hy_transfer_part_time_job',
    ],
  }),
  rewardUnit({
    id: 'parenthesis-core',
    clusterId: 'structure',
    skillIds: ['parenthesis'],
    evidenceItemIds: ['pa_choose_coach', 'pa_insert_museum', 'pa_fix_author', 'pa_transfer_library', 'pa_combine_lighthouse', 'pg_parenthesis_speech'],
  }),
  rewardUnit({
    id: 'colons-core',
    clusterId: 'structure',
    skillIds: ['colon_list'],
    evidenceItemIds: ['cl_choose_supplies', 'cl_insert_awards', 'cl_fix_camp', 'cl_transfer_trip', 'cl_lc_transfer_toolkit', 'cl_combine_awards'],
  }),
  rewardUnit({
    id: 'semicolon-lists-core',
    clusterId: 'structure',
    skillIds: ['semicolon_list'],
    evidenceItemIds: [
      'sl_choose_cities',
      'sl_insert_cities',
      'sl_fix_captains',
      'sl_transfer_places',
      'sl_choose_clubs',
      'sl_insert_helper_roles',
      'sl_fix_stalls',
      'sl_transfer_event_stalls',
    ],
  }),
  rewardUnit({
    id: 'bullet-points-core',
    clusterId: 'structure',
    skillIds: ['bullet_points'],
    evidenceItemIds: ['bp_choose_bring', 'bp_insert_kit', 'bp_fix_consistency', 'bp_transfer_class', 'pg_bullet_consistency'],
  }),
]);

export const PUNCTUATION_GENERATOR_FAMILIES = Object.freeze([
  {
    id: 'gen_sentence_endings_insert',
    skillId: 'sentence_endings',
    rewardUnitId: 'sentence-endings-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_apostrophe_contractions_fix',
    skillId: 'apostrophe_contractions',
    rewardUnitId: 'apostrophe-contractions-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_apostrophe_possession_insert',
    skillId: 'apostrophe_possession',
    rewardUnitId: 'apostrophe-possession-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_apostrophe_mix_paragraph',
    skillId: 'apostrophe_possession',
    rewardUnitId: 'apostrophe-possession-core',
    published: true,
    mode: 'paragraph',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_speech_insert',
    skillId: 'speech',
    rewardUnitId: 'speech-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_list_commas_insert',
    skillId: 'list_commas',
    rewardUnitId: 'list-commas-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_list_commas_combine',
    skillId: 'list_commas',
    rewardUnitId: 'list-commas-core',
    published: true,
    mode: 'combine',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_fronted_adverbial_fix',
    skillId: 'fronted_adverbial',
    rewardUnitId: 'fronted-adverbials-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_fronted_adverbial_combine',
    skillId: 'fronted_adverbial',
    rewardUnitId: 'fronted-adverbials-core',
    published: true,
    mode: 'combine',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_fronted_speech_paragraph',
    skillId: 'speech',
    rewardUnitId: 'speech-core',
    published: true,
    mode: 'paragraph',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_comma_clarity_insert',
    skillId: 'comma_clarity',
    rewardUnitId: 'comma-clarity-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_semicolon_fix',
    skillId: 'semicolon',
    rewardUnitId: 'semicolons-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_semicolon_combine',
    skillId: 'semicolon',
    rewardUnitId: 'semicolons-core',
    published: true,
    mode: 'combine',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_colon_semicolon_paragraph',
    skillId: 'semicolon',
    rewardUnitId: 'semicolons-core',
    published: true,
    mode: 'paragraph',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_dash_clause_fix',
    skillId: 'dash_clause',
    rewardUnitId: 'dash-clauses-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_dash_clause_combine',
    skillId: 'dash_clause',
    rewardUnitId: 'dash-clauses-core',
    published: true,
    mode: 'combine',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_hyphen_insert',
    skillId: 'hyphen',
    rewardUnitId: 'hyphens-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_parenthesis_fix',
    skillId: 'parenthesis',
    rewardUnitId: 'parenthesis-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_parenthesis_combine',
    skillId: 'parenthesis',
    rewardUnitId: 'parenthesis-core',
    published: true,
    mode: 'combine',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_parenthesis_speech_paragraph',
    skillId: 'parenthesis',
    rewardUnitId: 'parenthesis-core',
    published: true,
    mode: 'paragraph',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_colon_list_insert',
    skillId: 'colon_list',
    rewardUnitId: 'colons-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_colon_list_combine',
    skillId: 'colon_list',
    rewardUnitId: 'colons-core',
    published: true,
    mode: 'combine',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_semicolon_list_fix',
    skillId: 'semicolon_list',
    rewardUnitId: 'semicolon-lists-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_bullet_points_fix',
    skillId: 'bullet_points',
    rewardUnitId: 'bullet-points-core',
    published: true,
    mode: 'fix',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
  {
    id: 'gen_bullet_points_paragraph',
    skillId: 'bullet_points',
    rewardUnitId: 'bullet-points-core',
    published: true,
    mode: 'paragraph',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
]);

export const PUNCTUATION_CONTENT_MANIFEST = Object.freeze({
  subjectId: PUNCTUATION_SUBJECT_ID,
  releaseId: PUNCTUATION_RELEASE_ID,
  releaseName: 'Punctuation 14-skill production release',
  partialReleaseLabel: 'Published Punctuation release',
  fullSkillCount: PUNCTUATION_SKILLS.length,
  // Honest scope copy post-Phase-2. The learner engine covers the full
  // 14-skill progression through Smart Review, Guided focus, Weak Spots,
  // GPS, sentence combining, paragraph repair, and transfer validators —
  // which the behavioural smoke matrix (U9 + U10) proves end-to-end. The
  // phrasing deliberately avoids "complete KS2 Punctuation mastery" so
  // learners are not misled when content expansion lands in future releases.
  publishedScopeCopy: 'Punctuation covers the 14-skill KS2 progression with Smart Review, Guided focus, Weak Spots, GPS tests, sentence combining, paragraph repair, and transfer practice.',
  skills: PUNCTUATION_SKILLS,
  clusters: PUNCTUATION_CLUSTERS,
  grandMonster: PUNCTUATION_GRAND_MONSTER,
  rewardUnits: PUNCTUATION_REWARD_UNITS,
  generatorFamilies: PUNCTUATION_GENERATOR_FAMILIES,
  items: PUNCTUATION_ITEMS,
  readinessRows: PUNCTUATION_READINESS_ROWS,
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function assertNoDuplicates(values, label, errors) {
  const duplicates = duplicateValues(values.filter(Boolean));
  for (const duplicate of duplicates) {
    errors.push(`Duplicate ${label}: ${duplicate}`);
  }
}

function normaliseVisibleContractText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleContractIncludes(visibleText, requirement) {
  const required = normaliseVisibleContractText(requirement);
  return !required || visibleText.includes(required);
}

function transferValidatorRequirements(item) {
  if (item?.mode !== 'transfer') return [];
  const validator = item.validator || {};
  switch (validator.type) {
    case 'startsWithWordQuestion':
      return [validator.word];
    case 'requiresTokens':
      return asArray(validator.tokens);
    case 'requiresListCommas':
      return [
        validator.opening || validator.stem,
        ...asArray(validator.items),
      ];
    case 'startsWithPhraseComma':
      return [validator.phrase];
    case 'speechWithWords':
      return [
        validator.requiredTerminal
          ? `${validator.words || validator.spokenWords}${validator.requiredTerminal}`
          : (validator.words || validator.spokenWords),
      ];
    case 'frontedAdverbialWithSpeech':
      return [
        validator.phrase,
        validator.reportingClause,
        validator.requiredTerminal
          ? `${validator.words || validator.spokenWords}${validator.requiredTerminal}`
          : (validator.words || validator.spokenWords),
      ];
    case 'requiresBoundaryBetweenClauses':
      return [validator.left, validator.right];
    case 'requiresHyphenatedPhrase':
      return [validator.phrase];
    case 'requiresParentheticalPhrase':
      return [validator.before, validator.phrase, validator.after];
    case 'requiresColonBeforeList':
      return [
        validator.opening,
        ...asArray(validator.items),
      ];
    case 'requiresSemicolonList':
      return asArray(validator.items);
    case 'requiresBulletStemAndItems':
      return [
        validator.stem,
        ...asArray(validator.items),
      ];
    default:
      return [];
  }
}

const STRICT_FINAL_COMMA_VALIDATORS = new Set([
  'requiresListCommas',
  'combineListSentence',
  'requiresColonBeforeList',
  'combineColonList',
]);

function strictFinalCommaPolicyVisible(item) {
  const validator = item?.validator || {};
  if (validator.allowFinalComma !== false || !STRICT_FINAL_COMMA_VALIDATORS.has(validator.type)) {
    return true;
  }
  const visibleText = normaliseVisibleContractText(`${item.prompt || ''} ${item.explanation || ''}`);
  const mentionsComma = /\bcomma\b/.test(visibleText);
  const mentionsFinalAnd = /\bfinal\b.*\band\b|\bbefore\b.*\band\b/.test(visibleText);
  const forbidsComma = /\b(no|not|without|avoid|unneeded|unnecessary)\b|do not|not needed/.test(visibleText);
  return mentionsComma && mentionsFinalAnd && forbidsComma;
}

function dashClauseDisplayUsesEnDash(item) {
  if (!asArray(item?.skillIds).includes('dash_clause')) return true;
  const displayTexts = [
    item.model,
    item.mode === 'choose' ? asArray(item.options)[Number(item.correctIndex)] : '',
  ].filter((entry) => typeof entry === 'string' && entry.trim());
  return displayTexts.length > 0
    && displayTexts.every((text) => text.includes(' – ') && !text.includes(' - '));
}

function pushIndexed(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function createPunctuationContentIndexes(manifest = PUNCTUATION_CONTENT_MANIFEST) {
  const skills = asArray(manifest.skills);
  const clusters = asArray(manifest.clusters);
  const items = asArray(manifest.items);
  const rewardUnits = asArray(manifest.rewardUnits);
  const generatorFamilies = asArray(manifest.generatorFamilies);

  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rewardUnitById = new Map(rewardUnits.map((unit) => [unit.rewardUnitId, unit]));
  const rewardUnitByKey = new Map(rewardUnits.map((unit) => [unit.masteryKey, unit]));
  const generatorFamilyById = new Map(generatorFamilies.map((family) => [family.id, family]));
  const itemsBySkill = new Map();
  const itemsByMode = new Map();
  const itemsByRewardUnit = new Map();
  const rewardUnitsByCluster = new Map();
  const rewardUnitsBySkill = new Map();
  const generatorFamiliesBySkill = new Map();

  for (const item of items) {
    pushIndexed(itemsByMode, item.mode, item);
    pushIndexed(itemsByRewardUnit, item.rewardUnitId, item);
    for (const skillId of asArray(item.skillIds)) pushIndexed(itemsBySkill, skillId, item);
  }

  for (const unit of rewardUnits) {
    pushIndexed(rewardUnitsByCluster, unit.clusterId, unit);
    for (const skillId of asArray(unit.skillIds)) pushIndexed(rewardUnitsBySkill, skillId, unit);
  }

  for (const family of generatorFamilies) {
    pushIndexed(generatorFamiliesBySkill, family.skillId, family);
  }

  const publishedSkillIds = skills.filter((skill) => skill.published).map((skill) => skill.id);
  const publishedClusterIds = clusters.filter((cluster) => cluster.published).map((cluster) => cluster.id);
  const publishedRewardUnits = rewardUnits.filter((unit) => unit.published);

  return Object.freeze({
    skills,
    clusters,
    items,
    rewardUnits,
    generatorFamilies,
    skillById,
    clusterById,
    itemById,
    rewardUnitById,
    rewardUnitByKey,
    generatorFamilyById,
    itemsBySkill,
    itemsByMode,
    itemsByRewardUnit,
    rewardUnitsByCluster,
    rewardUnitsBySkill,
    generatorFamiliesBySkill,
    publishedSkillIds,
    publishedClusterIds,
    publishedRewardUnits,
  });
}

function skillReadinessRows(skillId, indexes) {
  const rows = new Set();
  for (const item of indexes.itemsBySkill.get(skillId) || []) {
    for (const row of asArray(item.readiness)) rows.add(row);
    if (asArray(item.misconceptionTags).length) rows.add('misconception');
  }
  return rows;
}

export function punctuationSkillReadiness(skillId, manifest = PUNCTUATION_CONTENT_MANIFEST) {
  const indexes = createPunctuationContentIndexes(manifest);
  const rows = skillReadinessRows(skillId, indexes);
  return Object.freeze({
    skillId,
    rows: Object.freeze([...rows].sort()),
    complete: PUNCTUATION_READINESS_ROWS.every((row) => rows.has(row)),
  });
}

export function validatePunctuationManifest(manifest = PUNCTUATION_CONTENT_MANIFEST) {
  const errors = [];
  const indexes = createPunctuationContentIndexes(manifest);
  const skillIds = indexes.skills.map((skill) => skill.id);
  const clusterIds = indexes.clusters.map((cluster) => cluster.id);
  const itemIds = indexes.items.map((item) => item.id);
  const rewardUnitIds = indexes.rewardUnits.map((unit) => unit.rewardUnitId);
  const rewardKeys = indexes.rewardUnits.map((unit) => unit.masteryKey);
  const familyIds = indexes.generatorFamilies.map((family) => family.id);

  assertNoDuplicates(skillIds, 'skill id', errors);
  assertNoDuplicates(clusterIds, 'cluster id', errors);
  assertNoDuplicates(itemIds, 'item id', errors);
  assertNoDuplicates(rewardUnitIds, 'reward-unit id', errors);
  assertNoDuplicates(rewardKeys, 'reward mastery key', errors);
  assertNoDuplicates(familyIds, 'generator-family id', errors);

  for (const skill of indexes.skills) {
    if (!indexes.clusterById.has(skill.clusterId)) {
      errors.push(`Skill ${skill.id} references missing cluster ${skill.clusterId}.`);
    }
  }

  const clusterSkillClaims = new Map();
  for (const cluster of indexes.clusters) {
    for (const skillId of asArray(cluster.skillIds)) {
      if (!indexes.skillById.has(skillId)) errors.push(`Cluster ${cluster.id} references missing skill ${skillId}.`);
      if (clusterSkillClaims.has(skillId)) errors.push(`Skill ${skillId} appears in multiple clusters.`);
      clusterSkillClaims.set(skillId, cluster.id);
    }
  }
  for (const skill of indexes.skills) {
    if (clusterSkillClaims.get(skill.id) !== skill.clusterId) {
      errors.push(`Skill ${skill.id} cluster ownership is inconsistent.`);
    }
  }

  for (const item of indexes.items) {
    if (!indexes.rewardUnitById.has(item.rewardUnitId)) {
      errors.push(`Item ${item.id} references missing reward unit ${item.rewardUnitId}.`);
    }
    for (const skillId of asArray(item.skillIds)) {
      if (!indexes.skillById.has(skillId)) errors.push(`Item ${item.id} references missing skill ${skillId}.`);
    }
    const visibleContract = normaliseVisibleContractText(`${item.prompt || ''} ${item.stem || ''}`);
    for (const requirement of transferValidatorRequirements(item)) {
      if (!visibleContractIncludes(visibleContract, requirement)) {
        errors.push(`Transfer item ${item.id} hides validator requirement ${requirement}.`);
      }
    }
    if (!strictFinalCommaPolicyVisible(item)) {
      errors.push(`List-comma item ${item.id} forbids the final comma without visible no-final-comma context.`);
    }
    if (!dashClauseDisplayUsesEnDash(item)) {
      errors.push(`Dash-clause item ${item.id} must use a spaced en dash in model display.`);
    }
  }

  for (const unit of indexes.rewardUnits) {
    if (!indexes.clusterById.has(unit.clusterId)) {
      errors.push(`Reward unit ${unit.rewardUnitId} references missing cluster ${unit.clusterId}.`);
    }
    const hasEvidenceItem = asArray(unit.evidenceItemIds).some((itemId) => indexes.itemById.has(itemId));
    const hasGenerator = asArray(unit.generatorFamilyIds).some((familyId) => indexes.generatorFamilyById.has(familyId));
    if (unit.published && !hasEvidenceItem && !hasGenerator) {
      errors.push(`Published reward unit ${unit.rewardUnitId} has no deterministic evidence.`);
    }
    for (const itemId of asArray(unit.evidenceItemIds)) {
      const item = indexes.itemById.get(itemId);
      if (!item) {
        errors.push(`Reward unit ${unit.rewardUnitId} lists missing evidence item ${itemId}.`);
        continue;
      }
      if (item.rewardUnitId !== unit.rewardUnitId) {
        errors.push(`Reward unit ${unit.rewardUnitId} lists evidence item ${itemId} from ${item.rewardUnitId}.`);
      }
    }
    const expectedKey = createPunctuationMasteryKey({
      releaseId: unit.releaseId,
      clusterId: unit.clusterId,
      rewardUnitId: unit.rewardUnitId,
    });
    if (unit.masteryKey !== expectedKey) {
      errors.push(`Reward unit ${unit.rewardUnitId} has unstable mastery key ${unit.masteryKey}.`);
    }
  }

  for (const family of indexes.generatorFamilies) {
    if (!indexes.skillById.has(family.skillId)) {
      errors.push(`Generator family ${family.id} references missing skill ${family.skillId}.`);
    }
    if (!indexes.rewardUnitById.has(family.rewardUnitId)) {
      errors.push(`Generator family ${family.id} references missing reward unit ${family.rewardUnitId}.`);
    }
  }

  for (const skillId of indexes.publishedSkillIds) {
    const readiness = skillReadinessRows(skillId, indexes);
    for (const row of PUNCTUATION_READINESS_ROWS) {
      if (!readiness.has(row)) {
        errors.push(`Published skill ${skillId} is missing readiness row ${row}.`);
      }
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    indexes,
  });
}

export const PUNCTUATION_CONTENT_INDEXES = createPunctuationContentIndexes();
export const PUNCTUATION_MANIFEST_VALIDATION = validatePunctuationManifest();
