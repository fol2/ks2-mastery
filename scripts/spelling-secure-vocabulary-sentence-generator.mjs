export const BAD_TEMPLATE_FRAGMENT = 'on the board for secure vocabulary spelling practice';

const WEAK_FRAME_FRAGMENTS = Object.freeze([
  'helped the pupil explain the idea with more detail',
  'example to support the explanation',
  'the paragraph after reading the feedback',
  'before writing their final paragraph',
  'when connecting the lesson to a clear example',
  'behind the result clearly',
  'using evidence from the lesson',
  'the work and make it clearer',
  'used feedback apply',
  'used feedback family',
  'used feedback multiply',
  'used feedback tally',
  'civilise the answer',
  'accurate the answer',
  'clockwise the answer',
  'climate the answer',
  'showed acquire while',
  'showed adapt while',
  'showed advice while',
  'showed benefit while',
  'showed citizen while',
]);

const NAMES = Object.freeze([
  'Aisha', 'Ben', 'Cara', 'Dylan', 'Eleni', 'Finn', 'Grace', 'Hugo',
  'Iris', 'Jonah', 'Keira', 'Leo', 'Maya', 'Noah', 'Orla', 'Priya',
  'Ravi', 'Sofia', 'Theo', 'Una', 'Victor', 'Willow', 'Yasmin', 'Zara',
  'Amir', 'Beth', 'Caleb', 'Daisy', 'Ethan', 'Freya', 'Imran', 'Lina',
]);

const SHARED_TASKS = Object.freeze([
  'library research task', 'class debate', 'editing conference', 'mapwork enquiry',
  'science investigation', 'fraction challenge', 'timeline study', 'reading journal',
  'data-handling lesson', 'river survey', 'museum notebook', 'team presentation',
  'suffix workshop', 'pattern sort', 'fieldwork report', 'design review',
  'coding club task', 'homework reflection', 'peer feedback session', 'oral rehearsal',
  'plant-growth log', 'weather chart', 'scale-drawing task', 'history source study',
  'grammar clinic', 'vocabulary journal', 'performance review', 'problem-solving round',
  'assembly plan', 'habitat poster', 'measurement check', 'story-planning lesson',
  'book-club discussion', 'geography case study', 'labelling task', 'research summary',
  'survey report', 'proofreading round', 'model-building task', 'evidence board',
]);

const PROJECT_ADJECTIVES = Object.freeze([
  'amber', 'birch', 'cedar', 'dawn', 'elm', 'fern', 'gold', 'harbour',
  'ivy', 'juniper', 'kestrel', 'lime', 'meadow', 'north', 'oak', 'pearl',
  'quarry', 'river', 'silver', 'thistle', 'upland', 'valley', 'willow',
  'yew', 'zinc', 'atlas', 'brook', 'copper', 'delta', 'ember', 'frost',
  'granite', 'hazel', 'island', 'lantern', 'mosaic', 'orchard', 'summit',
  'tidal', 'voyage',
]);

const PROJECT_NOUNS = Object.freeze([
  'archive', 'bridge', 'case study', 'display', 'evidence board', 'field note',
  'garden', 'harbour map', 'index', 'journey', 'lab book', 'market survey',
  'notebook', 'observation', 'pattern file', 'question set', 'route plan',
  'source pack', 'timeline', 'weather log', 'workshop', 'zine', 'reading trail',
  'data grid', 'museum card', 'science tray', 'grammar wall', 'fraction route',
  'habitat guide', 'story map', 'coding path', 'survey page',
]);

const ARTEFACTS = Object.freeze([
  'notebook', 'diagram', 'draft', 'table', 'poster', 'map', 'timeline', 'chart',
  'report', 'paragraph', 'model', 'calculation', 'script', 'summary', 'glossary',
  'presentation', 'survey sheet', 'experiment log', 'planning grid', 'caption',
  'route card', 'data table', 'source card', 'story plan', 'method note', 'sketch',
  'revision page', 'index card', 'question sheet', 'reflection log', 'working wall',
  'class display', 'reading response', 'field note', 'word-family chart', 'checklist',
]);

const OBJECTS = Object.freeze([
  'evidence', 'method', 'draft', 'diagram', 'answer', 'route', 'result', 'pattern',
  'source', 'measurement', 'paragraph', 'model', 'question', 'summary', 'example',
  'argument', 'caption', 'calculation', 'timeline', 'observation', 'prediction',
  'comparison', 'conclusion', 'definition', 'sequence', 'dataset', 'plan', 'survey',
]);

const ACTIONS = Object.freeze([
  'checked the evidence', 'revised the draft', 'tested the method', 'compared the results',
  'asked a clearer question', 'explained the pattern', 'labelled the diagram',
  'recorded the observation', 'shared the conclusion', 'improved the paragraph',
  'measured the distance', 'sorted the examples', 'read the source closely',
  'planned the route', 'updated the chart', 'summarised the idea',
]);

const ADJECTIVE_NOUNS = Object.freeze([
  'answer', 'method', 'description', 'choice', 'explanation', 'reason',
  'observation', 'draft', 'summary', 'comparison', 'design', 'plan',
]);

const ADJECTIVE_OBJECT_OVERRIDES = Object.freeze({
  behavioural: 'pattern',
  circular: 'route',
  diagonal: 'line',
  electric: 'circuit',
  electrical: 'circuit',
  frictional: 'force',
  geographic: 'feature',
  geometric: 'pattern',
  governmental: 'decision',
  historic: 'source',
  imperial: 'unit',
  informational: 'text',
  instructional: 'guide',
  instrumental: 'part',
  linguistic: 'feature',
  medical: 'report',
  methodical: 'approach',
  metric: 'unit',
  symmetrical: 'shape',
  vertical: 'line',
});

const ADJECTIVE_NOUN_VERBS = Object.freeze({
  answer: 'gave',
  choice: 'made',
  comparison: 'made',
  description: 'wrote',
  design: 'created',
  draft: 'revised',
  explanation: 'gave',
  method: 'used',
  observation: 'recorded',
  plan: 'made',
  reason: 'gave',
  summary: 'wrote',
});

const ADVERB_VERBS = Object.freeze([
  'checked the method', 'answered the question', 'read the source', 'explained the pattern',
  'revised the draft', 'shared the evidence', 'measured the result', 'responded to feedback',
]);

const BUCKET_TASKS = Object.freeze({
  school_academic_secure: ['class debate', 'learning journal', 'peer feedback session', 'research summary'],
  writing_grammar_secure: ['editing conference', 'grammar clinic', 'proofreading round', 'story-planning lesson'],
  maths_secure: ['fraction challenge', 'data-handling lesson', 'scale-drawing task', 'measurement check'],
  science_secure: ['science investigation', 'plant-growth log', 'experiment log', 'habitat poster'],
  geography_history_secure: ['mapwork enquiry', 'timeline study', 'fieldwork report', 'history source study'],
  spelling_pattern_secure: ['pattern sort', 'suffix workshop', 'word-family chart', 'vocabulary journal'],
  morphology_family_secure: ['word-family chart', 'suffix workshop', 'pattern sort', 'revision page'],
  tier_two_general_secure: ['class debate', 'reading journal', 'team presentation', 'oral rehearsal'],
  safe_subject_vocabulary_secure: ['research summary', 'field note', 'labelling task', 'evidence board'],
  derived_forms_candidate: ['word-family chart', 'proofreading round', 'suffix workshop', 'editing conference'],
});

const ARTICLELESS_NOUNS = new Set([
  'advice', 'accuracy', 'ambition', 'assistance', 'certainty', 'chemistry', 'courage',
  'democracy', 'evidence', 'forgiveness', 'friction', 'gravity', 'information',
  'knowledge', 'leadership', 'nutrition', 'pressure', 'responsibility', 'sincerity',
  'thoroughness', 'weather',
]);

const LY_NOT_ADVERB = new Set([
  'apply', 'family', 'likely', 'multiply', 'tally', 'unlikely',
]);

const ATE_NOT_VERB = new Set([
  'accurate', 'affectionate', 'appropriate', 'climate', 'fortunate',
]);

const ISE_NOT_VERB = new Set([
  'anticlockwise', 'clockwise',
]);

const BASE_VERBS = new Set([
  'absorb', 'accuse', 'acquire', 'adapt', 'admit', 'advise', 'affect', 'appeal',
  'apply', 'approach', 'approve', 'argue', 'arrange', 'assist', 'attend', 'avoid',
  'believe', 'benefit', 'breathe', 'budget', 'calculate', 'capture', 'cause',
  'celebrate', 'classify', 'combine', 'command', 'compare', 'complete', 'compose',
  'concentrate', 'confirm', 'connect', 'consider', 'contain', 'continue',
  'contribute', 'cooperate', 'coordinate', 'create', 'damage', 'decide', 'decorate',
  'define', 'defend', 'delay', 'deliver', 'demand', 'demonstrate', 'depend',
  'describe', 'design', 'destroy', 'develop', 'differ', 'discover', 'divide',
  'educate', 'encourage', 'estimate', 'evaluate', 'exceed', 'excite', 'generate',
  'govern', 'guarantee', 'guide', 'identify', 'improve', 'include', 'inform',
  'instruct', 'investigate', 'judge', 'lengthen', 'manage', 'measure', 'modernise',
  'notice', 'observe', 'organise', 'persuade', 'position', 'prefer', 'prepare',
  'pressure', 'promise', 'pronounce', 'qualify', 'recognise', 'recommend',
  'recover', 'refer', 'repeat', 'separate', 'service', 'standardise', 'strengthen',
  'surface', 'symbolise', 'vary', 'volunteer',
]);

const VERB_OBJECT_OVERRIDES = Object.freeze({
  absorb: 'water in the sponge',
  accuse: 'the character in the debate',
  acquire: 'a new research skill',
  adapt: 'the plan',
  admit: 'a mistake',
  advise: 'the team',
  affect: 'the result',
  appeal: 'to the audience',
  apply: 'the rule',
  approve: 'the final plan',
  argue: 'the point clearly',
  attend: 'the rehearsal',
  breathe: 'slowly before reading aloud',
  calculate: 'the total',
  classify: 'the examples',
  compare: 'the two results',
  compete: 'fairly',
  concentrate: 'on the method',
  cooperate: 'with the group',
  depend: 'on the evidence',
  differ: 'from the first answer',
  divide: 'the total',
  exceed: 'the target',
  identify: 'the pattern',
  include: 'the evidence',
  investigate: 'the question',
  measure: 'the distance',
  modernise: 'the design',
  organise: 'the notes',
  persuade: 'the reader',
  qualify: 'for the final round',
  recognise: 'the pattern',
  refer: 'to the source',
  standardise: 'the measurements',
  volunteer: 'for the reading role',
});

const THIRD_PERSON_VERBS = new Set([
  'describes', 'estimates', 'improves', 'includes', 'qualifies', 'separates',
]);

const ING_ADJECTIVES = new Set([
  'absorbing', 'amazing', 'appealing', 'challenging', 'exciting', 'interesting',
]);

const INTRANSITIVE_PAST = new Set([
  'behaved', 'benefited', 'breathed', 'competed', 'cooperated', 'depended',
  'differed', 'surfaced', 'volunteered',
]);

const INTRANSITIVE_ING = new Set([
  'appearing', 'breathing', 'competing', 'cooperating', 'depending', 'differing',
  'surfacing',
]);

const DIRECTION_WORDS = new Set(['clockwise', 'anticlockwise']);

const SPECIAL_SENTENCES = Object.freeze({
  ability: 'Maya showed her ability by explaining the hardest step clearly.',
  able: 'Noah was able to solve the final question after checking each clue.',
  absence: "The register recorded Sam's absence when he was away from school.",
  absent: 'The evidence was absent from the report, so Cara checked the source again.',
  access: 'The library card gave Ben access to the research books.',
  accurate: 'The scale drawing was accurate because every measurement matched the plan.',
  acid: 'The science test showed acid reacting with the metal strip.',
  activity: 'The lunchtime activity helped pupils practise teamwork in the hall.',
  advice: 'Priya used the advice from her partner to improve the final paragraph.',
  aloud: 'The group read the poem aloud so everyone could hear the rhythm.',
  angle: 'The pupil measured the angle before drawing the triangle.',
  animal: 'The habitat poster showed how each animal depends on its environment.',
  anticlockwise: 'The arrow turned anticlockwise around the compass rose.',
  apply: 'Sofia learned to apply the rule before solving the next problem.',
  automatic: 'The automatic door opened when the sensor detected movement.',
  balance: 'Ravi kept his balance while crossing the stepping stones.',
  basic: 'The basic method worked before the class tried a harder version.',
  belief: 'The character held a strong belief about fairness in the story.',
  brief: 'The brief note gave just enough detail for the group to begin.',
  calculate: 'The pupil needed to calculate the total before checking the answer.',
  capacity: 'The bottle had enough capacity to hold the measured water.',
  careless: 'A careless mistake changed the answer, so Freya checked each digit.',
  certainty: 'The class wanted certainty before choosing the final conclusion.',
  chemistry: 'The chemistry investigation tested how the powder changed in water.',
  circular: 'The circular table helped every pupil see the shared model.',
  citizen: 'A responsible citizen helps the community and follows fair rules.',
  civilise: 'The history discussion asked whether laws can civilise a growing settlement.',
  climate: 'The climate chart showed warmer summers and wetter winters.',
  clockwise: 'The minute hand moved clockwise around the classroom clock.',
  code: 'The class wrote code to make the robot follow a route.',
  comma: 'The comma separated two items in the list.',
  family: 'The family tree showed how each person was connected.',
  likely: 'The result seemed likely after three groups found the same pattern.',
  moist: 'The soil felt moist after rain fell overnight.',
  multiply: 'The class learned to multiply the two numbers before estimating the answer.',
  tally: 'The team kept a tally of every vote during the survey.',
  unlikely: 'The prediction seemed unlikely after the first test failed.',
  watershed: 'The watershed carried rainwater from the hills into the river system.',
  weather: 'The weather chart recorded sunshine, wind, and rainfall for the week.',
});

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hashText(value) {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function pick(values, index, salt = 0) {
  return values[(index + salt) % values.length];
}

function sourceBucketFor(wordEntry) {
  const tags = Array.isArray(wordEntry?.tags) ? wordEntry.tags : [];
  const bucketTag = tags.find((tag) => String(tag).endsWith('-secure'));
  if (bucketTag) return bucketTag.replace(/-/g, '_');

  const listId = String(wordEntry?.listId || '');
  if (listId.includes('maths-secure')) return 'maths_secure';
  if (listId.includes('science-secure')) return 'science_secure';
  if (listId.includes('geography-history-secure')) return 'geography_history_secure';
  if (listId.includes('writing-grammar-secure')) return 'writing_grammar_secure';
  if (listId.includes('spelling-pattern-secure')) return 'spelling_pattern_secure';
  if (listId.includes('morphology-family-secure')) return 'morphology_family_secure';
  if (listId.includes('derived-forms-candidate')) return 'derived_forms_candidate';
  if (listId.includes('tier-two-general-secure')) return 'tier_two_general_secure';
  if (listId.includes('safe-subject-vocabulary-secure')) return 'safe_subject_vocabulary_secure';
  return 'school_academic_secure';
}

function contextFor(wordEntry, sentenceIndex) {
  const word = normaliseString(wordEntry?.word || wordEntry?.slug).toLowerCase();
  const bucket = sourceBucketFor(wordEntry);
  const seed = hashText(`${word}:${bucket}:${sentenceIndex}`);
  const bucketTasks = BUCKET_TASKS[bucket] || BUCKET_TASKS.school_academic_secure;
  const project = `${pick(PROJECT_ADJECTIVES, sentenceIndex)} ${pick(PROJECT_NOUNS, Math.floor(sentenceIndex / PROJECT_ADJECTIVES.length))}`;
  const task = pick(bucketTasks, seed, sentenceIndex * 3);
  const sharedTask = pick(SHARED_TASKS, seed, sentenceIndex * 5);
  return {
    bucket,
    name: pick(NAMES, seed, sentenceIndex),
    task: `${task} for the ${project} project`,
    sharedTask: `${sharedTask} for the ${project} project`,
    artefact: pick(ARTEFACTS, seed, sentenceIndex * 7),
    object: pick(OBJECTS, seed, sentenceIndex * 11),
    action: pick(ACTIONS, seed, sentenceIndex * 13),
    adverbVerb: pick(ADVERB_VERBS, seed, sentenceIndex * 17),
  };
}

function startsWithVowelSound(word) {
  return /^[aeiou]/i.test(word) && !/^u[bcdfghjklmnpqrstvwxyz]/i.test(word);
}

function articleFor(word) {
  return startsWithVowelSound(word) ? 'an' : 'a';
}

function hasTag(wordEntry, tag) {
  return Array.isArray(wordEntry?.tags) && wordEntry.tags.includes(tag);
}

function isAdverb(word) {
  return word.endsWith('ly') && word.length > 4 && !LY_NOT_ADVERB.has(word);
}

function isVerb(word) {
  if (BASE_VERBS.has(word)) return true;
  if (word.endsWith('ate') && !ATE_NOT_VERB.has(word)) return true;
  if (word.endsWith('ise') && !ISE_NOT_VERB.has(word)) return true;
  return word.endsWith('ify');
}

function isAbstractNoun(wordEntry, word) {
  return hasTag(wordEntry, 'suffix-ity')
    || hasTag(wordEntry, 'suffix-tion')
    || hasTag(wordEntry, 'suffix-sion')
    || hasTag(wordEntry, 'suffix-ment')
    || hasTag(wordEntry, 'suffix-ness')
    || hasTag(wordEntry, 'suffix-ance')
    || hasTag(wordEntry, 'suffix-ence')
    || /(tion|sion|ment|ness|ity|ance|ence|acy|ship)$/.test(word);
}

function isAdjective(wordEntry, word) {
  return hasTag(wordEntry, 'suffix-able')
    || hasTag(wordEntry, 'suffix-ible')
    || hasTag(wordEntry, 'suffix-ous')
    || hasTag(wordEntry, 'suffix-ful')
    || hasTag(wordEntry, 'suffix-less')
    || Object.prototype.hasOwnProperty.call(ADJECTIVE_OBJECT_OVERRIDES, word)
    || /(able|ible|ous|ful|less|ive|ant|ent)$/.test(word);
}

function sentenceForBaseVerb(word, context) {
  const override = VERB_OBJECT_OVERRIDES[word];
  if (override) {
    return `${context.name} needed to ${word} ${override} during the ${context.task}.`;
  }
  return `${context.name} needed to ${word} the ${context.object} during the ${context.task}.`;
}

function sentenceForPast(word, context) {
  if (INTRANSITIVE_PAST.has(word)) {
    if (word === 'depended') {
      return `The result depended on the ${context.object} during the ${context.task}.`;
    }
    if (word === 'differed') {
      return `The two answers differed after ${context.name} checked the ${context.object}.`;
    }
    return `${context.name} ${word} carefully during the ${context.task} with the group.`;
  }
  return `${context.name} used the form ${word} in the ${context.artefact} during the ${context.task}.`;
}

function sentenceForIng(word, context) {
  if (ING_ADJECTIVES.has(word)) {
    return `The ${context.artefact} felt ${word} when ${context.name} ${context.action}.`;
  }
  if (INTRANSITIVE_ING.has(word)) {
    if (word === 'depending') {
      return `${context.name} was depending on the ${context.object} during the ${context.task}.`;
    }
    if (word === 'differing') {
      return `${context.name} compared differing answers during the ${context.task}.`;
    }
    return `${context.name} was ${word} steadily during the ${context.task} with the group.`;
  }
  return `${context.name} used the form ${word} in the ${context.artefact} during the ${context.task}.`;
}

function sentenceForAbstractNoun(word, context) {
  return `The ${context.artefact} explained ${word} when ${context.name} ${context.action} during the ${context.task}.`;
}

function sentenceForAdjective(word, context) {
  const overrideNoun = ADJECTIVE_OBJECT_OVERRIDES[word];
  if (overrideNoun) {
    return `${context.name} used ${articleFor(word)} ${word} ${overrideNoun} during the ${context.task}.`;
  }
  const noun = pick(ADJECTIVE_NOUNS, hashText(word), context.name.length);
  const verb = ADJECTIVE_NOUN_VERBS[noun] || 'used';
  return `${context.name} ${verb} ${articleFor(word)} ${word} ${noun} during the ${context.task}.`;
}

function sentenceForPlural(word, context) {
  return `${context.name} compared the ${word} in the ${context.artefact} during the ${context.task}.`;
}

function sentenceForFallbackNoun(word, context) {
  if (ARTICLELESS_NOUNS.has(word)) {
    return `${context.name} added ${word} to the ${context.artefact} during the ${context.task}.`;
  }
  return `${context.name} added ${articleFor(word)} ${word} to the ${context.artefact} during the ${context.task}.`;
}

export function secureVocabularySentenceFor(wordEntry, sentenceIndex = 0) {
  const word = normaliseString(wordEntry?.word || wordEntry?.slug).toLowerCase();
  if (!word) throw new Error('Cannot generate a secure vocabulary sentence without a word.');
  if (SPECIAL_SENTENCES[word]) return SPECIAL_SENTENCES[word];

  const context = contextFor(wordEntry, sentenceIndex);
  if (DIRECTION_WORDS.has(word)) {
    return `The arrow moved ${word} around the ${context.artefact} during the ${context.task}.`;
  }
  if (isAdverb(word)) {
    return `${context.name} ${context.adverbVerb} ${word} during the ${context.task}.`;
  }
  if (THIRD_PERSON_VERBS.has(word)) {
    return `The ${context.artefact} ${word} the ${context.object} before ${context.name} shared the conclusion.`;
  }
  if (word.endsWith('ing')) {
    return sentenceForIng(word, context);
  }
  if (word.endsWith('ed') && word !== 'exceed' && word !== 'watershed') {
    return sentenceForPast(word, context);
  }
  if (isAbstractNoun(wordEntry, word)) {
    return sentenceForAbstractNoun(word, context);
  }
  if (isAdjective(wordEntry, word)) {
    return sentenceForAdjective(word, context);
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return sentenceForPlural(word, context);
  }
  if (isVerb(word)) {
    return sentenceForBaseVerb(word, context);
  }
  return sentenceForFallbackNoun(word, context);
}

export function normaliseSentenceForAudit(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function sentenceFrameForAudit({ sentence, wordEntry }) {
  let frame = ` ${normaliseSentenceForAudit(sentence)} `;
  const accepted = Array.isArray(wordEntry?.accepted) && wordEntry.accepted.length
    ? wordEntry.accepted
    : [wordEntry?.word, wordEntry?.slug];
  const terms = [...new Set([
    wordEntry?.word,
    wordEntry?.slug,
    ...accepted,
  ].map(normaliseSentenceForAudit).filter(Boolean).sort((a, b) => b.length - a.length))];
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    frame = frame.replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' __ ');
  }
  return frame.trim().replace(/\s+/g, ' ');
}

export function assertSecureVocabularySentenceQuality({ sentence, wordEntry }) {
  const text = normaliseString(sentence);
  const slug = normaliseString(wordEntry?.slug || wordEntry?.word) || 'unknown';
  if (!text) throw new Error(`Missing secure vocabulary sentence for ${slug}.`);
  if (text.includes(BAD_TEMPLATE_FRAGMENT)) {
    throw new Error(`Secure vocabulary sentence still uses the board-practice placeholder for ${slug}.`);
  }
  for (const fragment of WEAK_FRAME_FRAGMENTS) {
    if (normaliseSentenceForAudit(text).includes(normaliseSentenceForAudit(fragment))) {
      throw new Error(`Secure vocabulary sentence keeps a weak generated frame for ${slug}: ${text}`);
    }
  }
  const accepted = Array.isArray(wordEntry?.accepted) && wordEntry.accepted.length
    ? wordEntry.accepted
    : [wordEntry?.word, wordEntry?.slug];
  const hasAcceptedWord = accepted.some((entry) => {
    const escaped = normaliseString(entry).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped && new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  });
  if (!hasAcceptedWord) {
    throw new Error(`Secure vocabulary sentence does not include ${slug}: ${text}`);
  }
  const wrongA = /\ba\s+([a-z]+)/i.exec(text);
  if (wrongA && startsWithVowelSound(wrongA[1])) {
    throw new Error(`Secure vocabulary sentence has a likely article error for ${slug}: ${text}`);
  }
  const wrongAn = /\ban\s+([a-z]+)/i.exec(text);
  if (wrongAn && !startsWithVowelSound(wrongAn[1])) {
    throw new Error(`Secure vocabulary sentence has a likely article error for ${slug}: ${text}`);
  }
  if (normaliseSentenceForAudit(text).split(' ').length < 8) {
    throw new Error(`Secure vocabulary sentence is too thin for ${slug}: ${text}`);
  }
}

function duplicateGroups(entries, keyFn) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFn(entry);
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function collectSecureVocabularySentenceIssues(entries) {
  const rows = entries.map((entry) => ({
    ...entry,
    sentence: normaliseString(entry.sentence),
  }));
  const issues = [];
  for (const row of rows) {
    try {
      assertSecureVocabularySentenceQuality({ sentence: row.sentence, wordEntry: row });
    } catch (error) {
      issues.push({
        type: 'quality',
        slug: row.slug,
        word: row.word,
        sentence: row.sentence,
        message: error.message,
      });
    }
  }

  const exactDuplicates = duplicateGroups(rows, (row) => row.sentence);
  const normalisedDuplicates = duplicateGroups(rows, (row) => normaliseSentenceForAudit(row.sentence));
  const frameDuplicates = duplicateGroups(rows, (row) => sentenceFrameForAudit({
    sentence: row.sentence,
    wordEntry: row,
  }));

  for (const [type, groups] of [
    ['duplicate-exact', exactDuplicates],
    ['duplicate-normalised', normalisedDuplicates],
    ['duplicate-frame', frameDuplicates],
  ]) {
    for (const group of groups) {
      issues.push({
        type,
        frame: type === 'duplicate-frame'
          ? sentenceFrameForAudit({ sentence: group[0].sentence, wordEntry: group[0] })
          : undefined,
        entries: group.map(({ slug, word, sentence }) => ({ slug, word, sentence })),
      });
    }
  }

  return issues;
}

export function assertSecureVocabularySentenceSet(entries) {
  const issues = collectSecureVocabularySentenceIssues(entries);
  if (issues.length > 0) {
    const preview = JSON.stringify(issues.slice(0, 5), null, 2);
    throw new Error(`Secure vocabulary sentence audit found ${issues.length} issue(s): ${preview}`);
  }
}
