export const CONTEXT_PACK_POLICY = 'teacher_admin_only';

const MAX_ATOM_LENGTH = 48;
const MAX_ATOMS_PER_KIND = 6;
const MAX_TOTAL_ATOMS = 32;
const MAX_CONTEXT_TEMPLATE_VARIANTS = 2;

const STRING_ATOM_KINDS = Object.freeze([
  'names',
  'places',
  'listNouns',
  'frontedAdverbialPhrases',
  'speechCommands',
  'speechQuestions',
  'parenthesisPhrases',
  'stems',
]);

const ROW_ATOM_KINDS = Object.freeze([
  'hyphenCompoundRows',
]);

const CONTEXT_PACK_KINDS = Object.freeze([
  ...STRING_ATOM_KINDS,
  ...ROW_ATOM_KINDS,
]);

const PUNCTUATION_BEARING = /[.,;:?!()[\]{}"“”‘’'`~@#$%^&*_+=<>/\\|-]/;
const SAFE_WORDS = /^[a-z0-9 ]+$/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitaliseSentence(value) {
  const clean = cleanText(value).toLowerCase();
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function reject(kind, index, reason) {
  return { kind, index, reason };
}

function emptyAcceptedAtoms() {
  return Object.fromEntries(CONTEXT_PACK_KINDS.map((kind) => [kind, []]));
}

function parseContextPackInput(input) {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normaliseStringAtom(value, { kind }) {
  const clean = cleanText(value);
  if (!clean) return { ok: false, reason: 'empty' };
  if (clean.length > MAX_ATOM_LENGTH) return { ok: false, reason: 'too_long' };
  if (PUNCTUATION_BEARING.test(clean)) return { ok: false, reason: 'punctuation_bearing' };
  if (!SAFE_WORDS.test(clean)) return { ok: false, reason: 'unsafe_characters' };
  if (kind === 'names') return { ok: true, value: titleCase(clean) };
  return { ok: true, value: clean.toLowerCase() };
}

function normaliseHyphenRow(value) {
  if (!isPlainObject(value)) return { ok: false, reason: 'invalid_shape' };
  const left = normaliseStringAtom(value.left, { kind: 'hyphenCompoundRows' });
  const right = normaliseStringAtom(value.right, { kind: 'hyphenCompoundRows' });
  const noun = normaliseStringAtom(value.noun, { kind: 'hyphenCompoundRows' });
  if (!left.ok) return { ok: false, reason: `left_${left.reason}` };
  if (!right.ok) return { ok: false, reason: `right_${right.reason}` };
  if (!noun.ok) return { ok: false, reason: `noun_${noun.reason}` };
  return {
    ok: true,
    value: {
      left: left.value,
      right: right.value,
      noun: noun.value,
    },
  };
}

function atomKey(value) {
  return typeof value === 'string'
    ? value.toLowerCase()
    : `${value.left}:${value.right}:${value.noun}`.toLowerCase();
}

function pushAccepted({ acceptedAtoms, rejectedAtoms, totalAccepted, kind, index, atom }) {
  if (acceptedAtoms[kind].length >= MAX_ATOMS_PER_KIND) {
    rejectedAtoms.push(reject(kind, index, 'too_many_for_kind'));
    return totalAccepted;
  }
  if (totalAccepted >= MAX_TOTAL_ATOMS) {
    rejectedAtoms.push(reject(kind, index, 'too_many_total'));
    return totalAccepted;
  }
  acceptedAtoms[kind].push(atom);
  return totalAccepted + 1;
}

export function normalisePunctuationContextPack(input = {}) {
  const raw = parseContextPackInput(input);
  const acceptedAtoms = emptyAcceptedAtoms();
  const rejectedAtoms = [];
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      acceptedAtoms,
      rejectedAtoms: [reject('contextPack', 0, 'invalid_json_object')],
      summary: {
        acceptedCount: 0,
        rejectedCount: 1,
        atomKinds: [],
        affectedGeneratorFamilies: [],
      },
    };
  }

  let totalAccepted = 0;
  for (const kind of Object.keys(raw)) {
    if (!CONTEXT_PACK_KINDS.includes(kind)) {
      rejectedAtoms.push(reject(kind, 0, 'unknown_kind'));
      continue;
    }
    if (!Array.isArray(raw[kind])) {
      rejectedAtoms.push(reject(kind, 0, 'invalid_shape'));
      continue;
    }
    const seen = new Set();
    raw[kind].forEach((entry, index) => {
      const result = kind === 'hyphenCompoundRows'
        ? normaliseHyphenRow(entry)
        : normaliseStringAtom(entry, { kind });
      if (!result.ok) {
        rejectedAtoms.push(reject(kind, index, result.reason));
        return;
      }
      const key = atomKey(result.value);
      if (seen.has(key)) {
        rejectedAtoms.push(reject(kind, index, 'duplicate'));
        return;
      }
      seen.add(key);
      totalAccepted = pushAccepted({
        acceptedAtoms,
        rejectedAtoms,
        totalAccepted,
        kind,
        index,
        atom: result.value,
      });
    });
  }

  const atomKinds = CONTEXT_PACK_KINDS.filter((kind) => acceptedAtoms[kind].length > 0);
  const normalised = {
    ok: true,
    acceptedAtoms,
    rejectedAtoms,
    summary: {
      acceptedCount: totalAccepted,
      rejectedCount: rejectedAtoms.length,
      atomKinds,
      affectedGeneratorFamilies: [],
    },
  };
  normalised.summary.affectedGeneratorFamilies = affectedGeneratorFamiliesForContextPack(normalised);
  return normalised;
}

function asNormalisedPack(pack = {}) {
  return isPlainObject(pack?.acceptedAtoms) ? pack : normalisePunctuationContextPack(pack);
}

function valueAt(values, index, fallback) {
  return Array.isArray(values) && values.length ? values[index % values.length] : fallback;
}

function templateVariants(pack, builder) {
  const seen = new Set();
  const templates = [];
  for (let index = 0; index < MAX_CONTEXT_TEMPLATE_VARIANTS; index += 1) {
    const template = builder(pack, index);
    if (!template) continue;
    const key = `${template.prompt || ''}\n${template.stem || ''}\n${template.model || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push(template);
  }
  return templates;
}

function listItems(pack, variantIndex = 0) {
  const nouns = pack.acceptedAtoms.listNouns || [];
  if (nouns.length < 3) return null;
  const start = Math.min(variantIndex * 3, Math.max(0, nouns.length - 3));
  return nouns.slice(start, start + 3);
}

function mainClause(pack, fallback = 'the crew checked the ropes', variantIndex = 0) {
  return valueAt(pack.acceptedAtoms.stems, variantIndex, fallback).toLowerCase();
}

function clausePair(pack, fallbackLeft = 'the crew checked the ropes', fallbackRight = 'we found another path', variantIndex = 0) {
  const stems = Array.isArray(pack.acceptedAtoms.stems) ? pack.acceptedAtoms.stems : [];
  const left = (stems[variantIndex * 2] || fallbackLeft).toLowerCase();
  const rightCandidate = (stems[(variantIndex * 2) + 1] || '').toLowerCase();
  const right = rightCandidate && rightCandidate !== left ? rightCandidate : fallbackRight;
  return { left, right };
}

function placeSubject(pack, fallback = 'harbour', variantIndex = 0) {
  const place = valueAt(pack.acceptedAtoms.places, variantIndex, fallback);
  return `The ${place}`;
}

function listInsertTemplate(pack, variantIndex = 0) {
  const items = listItems(pack, variantIndex);
  if (!items) return null;
  const [firstItem, secondItem, thirdItem] = items;
  return {
    prompt: 'Add commas to separate the list items.',
    stem: `The tray held ${firstItem} ${secondItem} and ${thirdItem}.`,
    model: `The tray held ${firstItem}, ${secondItem} and ${thirdItem}.`,
    validator: {
      type: 'requiresListCommas',
      items,
    },
    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  };
}

function listCombineTemplate(pack, variantIndex = 0) {
  const items = listItems(pack, variantIndex);
  if (!items) return null;
  const [firstItem, secondItem, thirdItem] = items;
  return {
    prompt: 'Combine the notes into one correctly punctuated sentence.',
    stem: `The tray held\n- ${firstItem}\n- ${secondItem}\n- ${thirdItem}`,
    model: `The tray held ${firstItem}, ${secondItem} and ${thirdItem}.`,
    validator: {
      type: 'combineListSentence',
      opening: 'The tray held',
      items,
    },
    misconceptionTags: ['comma.list_separator_missing', 'comma.unnecessary_final_comma'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  };
}

function frontedFixTemplate(pack, variantIndex = 0) {
  const phrase = valueAt(pack.acceptedAtoms.frontedAdverbialPhrases, variantIndex, null);
  if (!phrase) return null;
  const clause = mainClause(pack, 'the crew checked the ropes', variantIndex);
  return {
    prompt: 'Correct the comma after the fronted adverbial.',
    stem: `${capitaliseSentence(phrase)} ${clause}.`,
    model: `${capitaliseSentence(phrase)}, ${clause}.`,
    validator: {
      type: 'startsWithPhraseComma',
      phrase: capitaliseSentence(phrase),
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  };
}

function frontedCombineTemplate(pack, variantIndex = 0) {
  const phrase = valueAt(pack.acceptedAtoms.frontedAdverbialPhrases, variantIndex, null);
  if (!phrase) return null;
  const clause = mainClause(pack, 'the crew checked the ropes', variantIndex);
  return {
    prompt: 'Combine the adverbial and main clause into one sentence.',
    stem: `${capitaliseSentence(phrase)}\n${capitaliseSentence(clause)}.`,
    model: `${capitaliseSentence(phrase)}, ${clause}.`,
    validator: {
      type: 'combineFrontedAdverbial',
      phrase: capitaliseSentence(phrase),
      mainClause: clause,
    },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  };
}

function commaClarityTemplate(pack, variantIndex = 0) {
  const phrase = valueAt(pack.acceptedAtoms.frontedAdverbialPhrases, variantIndex, null);
  if (!phrase) return null;
  const clause = clausePair(pack, 'the harbour was quiet', 'the harbour was quiet', variantIndex).right;
  return {
    prompt: 'Add the comma that makes the meaning clear.',
    stem: `${capitaliseSentence(phrase)} ${clause}.`,
    model: `${capitaliseSentence(phrase)}, ${clause}.`,
    validator: {
      type: 'startsWithPhraseComma',
      phrase: capitaliseSentence(phrase),
    },
    misconceptionTags: ['comma.clarity_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  };
}

function modelJoinForBoundaryMark(mark) {
  return mark === ';' ? '; ' : ` ${mark === '-' ? '–' : mark} `;
}

function boundaryFixTemplate(pack, mark, prompt, misconceptionTag, variantIndex = 0) {
  const { left, right } = clausePair(pack, 'the crew checked the ropes', 'we found another path', variantIndex);
  const unpunctuatedJoin = mark === ';' ? ', ' : ' ';
  const modelJoin = modelJoinForBoundaryMark(mark);
  return {
    prompt,
    stem: `${capitaliseSentence(left)}${unpunctuatedJoin}${right}.`,
    model: `${capitaliseSentence(left)}${modelJoin}${right}.`,
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: capitaliseSentence(left),
      right,
      mark,
    },
    misconceptionTags: [misconceptionTag],
    readiness: ['proofreading', 'misconception', 'negative_test'],
  };
}

function boundaryCombineTemplate(pack, mark, prompt, misconceptionTag, variantIndex = 0) {
  const { left, right } = clausePair(pack, 'the crew checked the ropes', 'we found another path', variantIndex);
  const modelJoin = modelJoinForBoundaryMark(mark);
  return {
    prompt,
    stem: `${capitaliseSentence(left)}.\n${capitaliseSentence(right)}.`,
    model: `${capitaliseSentence(left)}${modelJoin}${right}.`,
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: capitaliseSentence(left),
      right,
      mark,
    },
    misconceptionTags: [misconceptionTag],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  };
}

function speechTemplate(pack, variantIndex = 0) {
  const name = valueAt(pack.acceptedAtoms.names, variantIndex, 'Maya');
  const question = valueAt(pack.acceptedAtoms.speechQuestions, variantIndex, null);
  if (question) {
    return {
      prompt: 'Add the direct-speech punctuation.',
      stem: `${name} asked, ${question}?`,
      model: `${name} asked, "${capitaliseSentence(question)}?"`,
      rubric: {
        type: 'speech',
        reportingPosition: 'before',
        spokenWords: question,
        requiredTerminal: '?',
      },
      misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    };
  }
  const command = valueAt(pack.acceptedAtoms.speechCommands, variantIndex, null);
  if (!command) return null;
  return {
    prompt: 'Add the direct-speech punctuation.',
    stem: `${name} said, ${command}.`,
    model: `${name} said, "${capitaliseSentence(command)}."`,
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: command,
      requiredTerminal: '.',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.reporting_comma_missing', 'speech.punctuation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  };
}

function sentenceEndingTemplate(pack, variantIndex = 0) {
  const question = valueAt(pack.acceptedAtoms.speechQuestions, variantIndex, null);
  if (question) {
    return {
      prompt: 'Add the capital letter and end punctuation.',
      stem: question,
      model: `${capitaliseSentence(question)}?`,
      misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
      readiness: ['insertion', 'misconception', 'negative_test'],
    };
  }
  const stem = valueAt(pack.acceptedAtoms.stems, variantIndex, null);
  if (!stem) return null;
  return {
    prompt: 'Add the capital letter and end punctuation.',
    stem,
    model: `${capitaliseSentence(stem)}.`,
    misconceptionTags: ['endmarks.terminal_missing', 'endmarks.capitalisation_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  };
}

function parenthesisCombineTemplate(pack, variantIndex = 0) {
  const phrase = valueAt(pack.acceptedAtoms.parenthesisPhrases, variantIndex, null);
  if (!phrase) return null;
  const before = placeSubject(pack, 'harbour', variantIndex);
  const after = 'was busy';
  return {
    prompt: 'Combine the sentence and extra detail using parenthesis.',
    stem: `${before} ${after}.\nExtra detail: ${phrase}`,
    model: `${before}, ${phrase}, ${after}.`,
    validator: {
      type: 'combineParentheticalPhrase',
      before,
      phrase,
      after,
    },
    misconceptionTags: ['structure.parenthesis_missing', 'structure.parenthesis_unbalanced'],
    readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  };
}

function hyphenTemplate(pack, variantIndex = 0) {
  const row = valueAt(pack.acceptedAtoms.hyphenCompoundRows, variantIndex, null);
  if (!row) return null;
  const openPhrase = `${row.left} ${row.right} ${row.noun}`;
  const hyphenatedPhrase = `${row.left}-${row.right} ${row.noun}`;
  return {
    prompt: 'Add the hyphen that avoids ambiguity.',
    stem: `The ${openPhrase} was clear.`,
    model: `The ${hyphenatedPhrase} was clear.`,
    validator: {
      type: 'requiresHyphenatedPhrase',
      phrase: hyphenatedPhrase,
    },
    misconceptionTags: ['boundary.hyphen_missing'],
    readiness: ['insertion', 'misconception', 'negative_test'],
  };
}

export function contextPackTemplatesForFamily(familyId, contextPack = {}) {
  const pack = asNormalisedPack(contextPack);
  if (!pack.summary.acceptedCount) return [];
  const templates = {
    gen_sentence_endings_insert: () => templateVariants(pack, sentenceEndingTemplate),
    gen_speech_insert: () => templateVariants(pack, speechTemplate),
    gen_list_commas_insert: () => templateVariants(pack, listInsertTemplate),
    gen_list_commas_combine: () => templateVariants(pack, listCombineTemplate),
    gen_fronted_adverbial_fix: () => templateVariants(pack, frontedFixTemplate),
    gen_fronted_adverbial_combine: () => templateVariants(pack, frontedCombineTemplate),
    gen_comma_clarity_insert: () => templateVariants(pack, commaClarityTemplate),
    gen_semicolon_fix: () => templateVariants(pack, (normalisedPack, variantIndex) => boundaryFixTemplate(
      normalisedPack,
      ';',
      'Replace the comma splice with a semi-colon.',
      'boundary.semicolon_missing',
      variantIndex,
    )),
    gen_semicolon_combine: () => templateVariants(pack, (normalisedPack, variantIndex) => boundaryCombineTemplate(
      normalisedPack,
      ';',
      'Combine the two related clauses into one sentence with a semi-colon.',
      'boundary.semicolon_missing',
      variantIndex,
    )),
    gen_dash_clause_fix: () => templateVariants(pack, (normalisedPack, variantIndex) => boundaryFixTemplate(
      normalisedPack,
      '-',
      'Add a dash between the related clauses.',
      'boundary.dash_missing',
      variantIndex,
    )),
    gen_dash_clause_combine: () => templateVariants(pack, (normalisedPack, variantIndex) => boundaryCombineTemplate(
      normalisedPack,
      '-',
      'Combine the two related clauses into one sentence with a dash.',
      'boundary.dash_missing',
      variantIndex,
    )),
    gen_parenthesis_combine: () => templateVariants(pack, parenthesisCombineTemplate),
    gen_hyphen_insert: () => templateVariants(pack, hyphenTemplate),
  }[familyId]?.();
  return Array.isArray(templates) ? templates : [];
}

export function affectedGeneratorFamiliesForContextPack(contextPack = {}) {
  const pack = asNormalisedPack(contextPack);
  return [
    'gen_sentence_endings_insert',
    'gen_speech_insert',
    'gen_list_commas_insert',
    'gen_list_commas_combine',
    'gen_fronted_adverbial_fix',
    'gen_fronted_adverbial_combine',
    'gen_comma_clarity_insert',
    'gen_semicolon_fix',
    'gen_semicolon_combine',
    'gen_dash_clause_fix',
    'gen_dash_clause_combine',
    'gen_parenthesis_combine',
    'gen_hyphen_insert',
  ].filter((familyId) => contextPackTemplatesForFamily(familyId, pack).length > 0);
}

export const PUNCTUATION_CONTEXT_PACK_LIMITS = Object.freeze({
  maxAtomLength: MAX_ATOM_LENGTH,
  maxAtomsPerKind: MAX_ATOMS_PER_KIND,
  maxTotalAtoms: MAX_TOTAL_ATOMS,
  kinds: CONTEXT_PACK_KINDS,
});
