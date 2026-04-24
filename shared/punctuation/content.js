export const PUNCTUATION_SUBJECT_ID = 'punctuation';
export const PUNCTUATION_RELEASE_ID = 'punctuation-r1-endmarks-apostrophe-speech';

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
    published: false,
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
    published: false,
    rule: 'Put a comma after a fronted adverbial, such as At last, Before lunch, or Without warning.',
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
    published: false,
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
    published: false,
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
    published: false,
    rule: 'A colon can introduce a list after a complete opening clause.',
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
    published: false,
    rule: 'A semi-colon can join two closely related main clauses.',
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
    published: false,
    rule: 'A dash can mark a sharp boundary between two closely related main clauses.',
    workedBad: 'The path was flooded, we took the longer route.',
    workedGood: 'The path was flooded - we took the longer route.',
    contrastBad: 'The path was flooded -and we took the longer route.',
    contrastGood: 'The path was flooded - we took the longer route.',
  },
  {
    id: 'semicolon_list',
    name: 'Semi-colons within lists',
    phase: 'Year 6 core',
    clusterId: 'structure',
    prereq: ['colon_list', 'list_commas'],
    published: false,
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
    published: false,
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
    published: false,
    rule: 'A hyphen can stop a phrase from being misunderstood, such as man-eating shark versus man eating shark.',
    workedBad: 'We saw a man eating shark.',
    workedGood: 'We saw a man-eating shark.',
    contrastBad: 'The little used room was locked.',
    contrastGood: 'The little-used room was locked.',
  },
]);

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
    monsterId: 'quoral',
    published: true,
    skillIds: ['speech'],
  },
  {
    id: 'comma_flow',
    name: 'Comma / Flow',
    monsterId: 'curlune',
    published: false,
    skillIds: ['list_commas', 'fronted_adverbial', 'comma_clarity'],
  },
  {
    id: 'structure',
    name: 'List / Structure',
    monsterId: 'colisk',
    published: false,
    skillIds: ['parenthesis', 'colon_list', 'semicolon_list', 'bullet_points'],
  },
  {
    id: 'boundary',
    name: 'Boundary',
    monsterId: 'hyphang',
    published: false,
    skillIds: ['semicolon', 'dash_clause', 'hyphen'],
  },
]);

export const PUNCTUATION_GRAND_MONSTER = Object.freeze({
  id: 'published_release',
  name: 'Published Punctuation release',
  monsterId: 'carillon',
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
    prompt: 'Write one sentence of direct speech using these exact spoken words: can we start now',
    stem: '',
    accepted: ['Mia asked, "Can we start now?"'],
    explanation: 'Direct speech needs inverted commas, a capital letter, and a question mark inside the closing inverted comma.',
    model: 'Mia asked, "Can we start now?"',
    validator: { type: 'speechWithWords', words: 'can we start now', requiredTerminal: '?' },
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_outside_quote', 'speech.reporting_comma_missing', 'speech.capitalisation_missing', 'speech.words_changed'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
    source: 'fixed',
  },
]);

export const PUNCTUATION_REWARD_UNITS = Object.freeze([
  rewardUnit({
    id: 'sentence-endings-core',
    clusterId: 'endmarks',
    skillIds: ['sentence_endings'],
    evidenceItemIds: ['se_choose_exclaim', 'se_insert_question', 'se_fix_statement', 'se_transfer_why'],
  }),
  rewardUnit({
    id: 'apostrophe-contractions-core',
    clusterId: 'apostrophe',
    skillIds: ['apostrophe_contractions'],
    evidenceItemIds: ['ac_choose_contractions', 'ac_insert_contractions', 'ac_fix_contractions', 'ac_transfer_contractions'],
  }),
  rewardUnit({
    id: 'apostrophe-possession-core',
    clusterId: 'apostrophe',
    skillIds: ['apostrophe_possession'],
    evidenceItemIds: ['ap_choose_possession', 'ap_insert_singular', 'ap_fix_irregular', 'ap_transfer_possession'],
  }),
  rewardUnit({
    id: 'speech-core',
    clusterId: 'speech',
    skillIds: ['speech'],
    evidenceItemIds: ['sp_choose_reporting_comma', 'sp_insert_question', 'sp_fix_question', 'sp_transfer_question'],
  }),
  rewardUnit({ id: 'comma-flow-future', clusterId: 'comma_flow', skillIds: ['list_commas', 'fronted_adverbial', 'comma_clarity'], published: false }),
  rewardUnit({ id: 'structure-future', clusterId: 'structure', skillIds: ['parenthesis', 'colon_list', 'semicolon_list', 'bullet_points'], published: false }),
  rewardUnit({ id: 'boundary-future', clusterId: 'boundary', skillIds: ['semicolon', 'dash_clause', 'hyphen'], published: false }),
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
    id: 'gen_speech_insert',
    skillId: 'speech',
    rewardUnitId: 'speech-core',
    published: true,
    mode: 'insert',
    deterministicSeedFields: ['learnerId', 'sessionId', 'itemIndex'],
  },
]);

export const PUNCTUATION_CONTENT_MANIFEST = Object.freeze({
  subjectId: PUNCTUATION_SUBJECT_ID,
  releaseId: PUNCTUATION_RELEASE_ID,
  releaseName: 'Endmarks, Apostrophe and Speech',
  partialReleaseLabel: 'Published Punctuation release',
  fullSkillCount: PUNCTUATION_SKILLS.length,
  publishedScopeCopy: 'This published Punctuation release covers Endmarks, Apostrophe and Speech. More KS2 punctuation skills remain planned.',
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
