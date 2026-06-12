const VALID_SPELLING_POOLS = new Set(['core', 'extra']);
const DEFAULT_COVERAGE_BY_POOL = Object.freeze({
  core: 'statutory-core',
  extra: 'enrichment-extra',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function slugifyWord(value) {
  return normaliseString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueStrings(values, { lowerCase = false } = {}) {
  const source = Array.isArray(values)
    ? values
    : String(values ?? '')
      .split(/[\n,]+/);
  const seen = new Set();
  const output = [];
  for (const value of source) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const next = lowerCase ? trimmed.toLowerCase() : trimmed;
    if (seen.has(next)) continue;
    seen.add(next);
    output.push(next);
  }
  return output;
}

function hasExplicitList(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.some((entry) => typeof entry === 'string' && entry.trim());
  return typeof rawValue === 'string' && rawValue.trim().length > 0;
}

function normaliseSpellingPool(value, fallback = 'core') {
  const safeFallback = VALID_SPELLING_POOLS.has(fallback) ? fallback : 'core';
  const candidate = normaliseString(value).toLowerCase();
  return VALID_SPELLING_POOLS.has(candidate) ? candidate : safeFallback;
}

function normaliseCoverageTier(value, fallback, spellingPool) {
  return normaliseString(value, fallback || DEFAULT_COVERAGE_BY_POOL[spellingPool] || 'statutory-core');
}

function normaliseProvenance(rawValue = {}, fallback = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const safeFallback = isPlainObject(fallback) ? fallback : {};
  return {
    source: normaliseString(raw.source, safeFallback.source || ''),
    note: normaliseString(raw.note, safeFallback.note || ''),
    importedAt: Number.isFinite(Number(raw.importedAt)) && Number(raw.importedAt) >= 0
      ? Number(raw.importedAt)
      : (Number.isFinite(Number(safeFallback.importedAt)) ? Number(safeFallback.importedAt) : 0),
  };
}

function hasExplicitProvenance(input, existing = null) {
  const rawProvenance = isPlainObject(input?.provenance) ? input.provenance : {};
  const existingProvenance = isPlainObject(existing?.provenance) ? existing.provenance : {};
  return Boolean(
    normaliseString(input?.sourceNote)
      || normaliseString(rawProvenance.source)
      || normaliseString(rawProvenance.note)
      || normaliseString(existing?.sourceNote)
      || normaliseString(existingProvenance.source)
      || normaliseString(existingProvenance.note),
  );
}

function issue(field, message, code = 'invalid_word_operation') {
  return { code, field, message };
}

function validationResult(errors, warnings, word = null) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    word,
  };
}

function sentenceValidationResult(errors, warnings, sentence = null) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sentence,
  };
}

function wordListValidationResult(errors, warnings, wordList = null) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    wordList,
  };
}

function findWordList(wordLists, listId) {
  return (Array.isArray(wordLists) ? wordLists : []).find((entry) => entry?.id === listId) || null;
}

function findWord(words, slug) {
  return (Array.isArray(words) ? words : []).find((entry) => entry?.slug === slug) || null;
}

function normaliseAcceptedSpellings(rawValue, existingValue, defaultValue) {
  const rawList = hasExplicitList(rawValue)
    ? uniqueStrings(rawValue, { lowerCase: true })
    : uniqueStrings(existingValue, { lowerCase: true });
  const defaultSpelling = normaliseString(defaultValue).toLowerCase();
  if (defaultSpelling && !rawList.includes(defaultSpelling)) rawList.unshift(defaultSpelling);
  return rawList;
}

function normaliseVariantInput(rawVariant, existingVariant = null, index = 0) {
  const raw = isPlainObject(rawVariant) ? rawVariant : {};
  const existing = isPlainObject(existingVariant) ? existingVariant : {};
  const word = normaliseString(raw.word, existing.word);
  const accepted = normaliseAcceptedSpellings(raw.accepted, existing.accepted, word);
  const provenance = normaliseProvenance(raw.provenance, existing.provenance);
  const sourceNote = normaliseString(raw.sourceNote, existing.sourceNote);

  return {
    word,
    accepted,
    explanation: normaliseString(raw.explanation, existing.explanation),
    sentenceEntryIds: uniqueStrings(
      hasExplicitList(raw.sentenceEntryIds) ? raw.sentenceEntryIds : existing.sentenceEntryIds,
    ),
    sourceNote,
    provenance,
    progressKey: normaliseString(raw.progressKey, existing.progressKey || word),
    sortIndex: Number.isInteger(Number(raw.sortIndex)) && Number(raw.sortIndex) >= 0
      ? Number(raw.sortIndex)
      : (Number.isInteger(Number(existing.sortIndex)) ? Number(existing.sortIndex) : index),
  };
}

export function normaliseSpellingWordEditorInput(rawValue = {}, {
  existingWord = null,
  wordLists = [],
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingWord) ? existingWord : {};
  const word = normaliseString(raw.word, existing.word);
  const slug = normaliseString(raw.slug, existing.slug || slugifyWord(word));
  const listId = normaliseString(raw.listId, existing.listId);
  const wordList = findWordList(wordLists, listId);
  const spellingPool = normaliseSpellingPool(
    raw.spellingPool,
    existing.spellingPool || wordList?.spellingPool || 'core',
  );
  const coverageTier = normaliseCoverageTier(
    raw.coverageTier,
    existing.coverageTier || wordList?.coverageTier,
    spellingPool,
  );
  const accepted = normaliseAcceptedSpellings(raw.accepted, existing.accepted, word || slug);
  const sourceNote = normaliseString(raw.sourceNote, existing.sourceNote);
  const provenance = normaliseProvenance(raw.provenance, existing.provenance);
  const rawVariants = Array.isArray(raw.variants) ? raw.variants : existing.variants;
  const existingVariants = Array.isArray(existing.variants) ? existing.variants : [];
  const variants = (Array.isArray(rawVariants) ? rawVariants : [])
    .map((entry, index) => normaliseVariantInput(entry, existingVariants[index], index))
    .filter((variant) => variant.word || variant.explanation || variant.sentenceEntryIds.length);

  return {
    slug,
    word,
    family: normaliseString(raw.family, existing.family),
    listId,
    spellingPool,
    coverageTier,
    yearGroups: uniqueStrings(hasExplicitList(raw.yearGroups) ? raw.yearGroups : existing.yearGroups),
    tags: uniqueStrings(hasExplicitList(raw.tags) ? raw.tags : existing.tags, { lowerCase: true }),
    patternIds: uniqueStrings(hasExplicitList(raw.patternIds) ? raw.patternIds : existing.patternIds, { lowerCase: true }),
    accepted,
    ...(variants.length ? { variants } : {}),
    explanation: normaliseString(raw.explanation, existing.explanation),
    sentenceEntryIds: uniqueStrings(
      hasExplicitList(raw.sentenceEntryIds) ? raw.sentenceEntryIds : existing.sentenceEntryIds,
    ),
    sourceNote,
    provenance,
    progressKey: normaliseString(raw.progressKey, existing.progressKey || slug),
    sortIndex: Number.isInteger(Number(raw.sortIndex)) && Number(raw.sortIndex) >= 0
      ? Number(raw.sortIndex)
      : (Number.isInteger(Number(existing.sortIndex)) ? Number(existing.sortIndex) : 0),
  };
}

export function validateSpellingWordEditorInput(rawValue = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(options.existingWord) ? options.existingWord : null;
  const word = normaliseSpellingWordEditorInput(raw, options);
  const list = findWordList(options.wordLists, word.listId);

  if (!word.slug) errors.push(issue('slug', 'Word slug is required.'));
  if (!word.word) errors.push(issue('word', 'Word is required.'));
  if (!word.family) errors.push(issue('family', 'Word family is required.'));
  if (!word.listId || !list) errors.push(issue('listId', 'A valid word list is required.'));
  if (!word.accepted.length || (!hasExplicitList(raw.accepted) && !existing?.accepted?.length)) {
    errors.push(issue('accepted', 'Accepted spellings are required.'));
  }
  if (!word.explanation || word.explanation.length < 12) {
    errors.push(issue('explanation', 'A learner-facing explanation is required.'));
  }
  if (!word.sentenceEntryIds.length) {
    errors.push(issue('sentenceEntryIds', 'At least one sentence reference is required.'));
  }
  if (!hasExplicitProvenance(raw, existing)) {
    errors.push(issue('provenance', 'Provenance or source notes are required.'));
  }
  if (list && word.spellingPool !== list.spellingPool) {
    errors.push(issue('spellingPool', `Word pool must match list pool "${list.spellingPool}".`));
  }
  if (list && word.coverageTier !== list.coverageTier) {
    errors.push(issue('coverageTier', `Word coverage tier must match list tier "${list.coverageTier}".`));
  }
  if (word.spellingPool === 'core' && !word.yearGroups.length) {
    errors.push(issue('yearGroups', 'Core words require year-group metadata.'));
  }
  if (word.spellingPool === 'extra' && word.coverageTier !== 'enrichment-extra') {
    errors.push(issue('coverageTier', 'Extra words must use enrichment-extra coverage.'));
  }
  if (word.spellingPool === 'core' && Array.isArray(word.variants) && word.variants.length) {
    const allowed = Boolean(options.allowCoreVariantsWithParityTradeoff);
    const problem = issue('variants', 'Core word-family variants must stay as separate word rows.', 'core_variants_not_supported');
    if (allowed) warnings.push(problem);
    else errors.push(problem);
  }

  (Array.isArray(word.variants) ? word.variants : []).forEach((variant, index) => {
    const rawVariant = Array.isArray(raw.variants) ? raw.variants[index] : {};
    const existingVariant = Array.isArray(existing?.variants) ? existing.variants[index] : null;
    const prefix = `variants.${index}`;
    if (!variant.word) errors.push(issue(`${prefix}.word`, 'Variant word is required.'));
    if (!variant.accepted.length || (!hasExplicitList(rawVariant?.accepted) && !existingVariant?.accepted?.length)) {
      errors.push(issue(`${prefix}.accepted`, 'Variant accepted spellings are required.'));
    }
    if (!variant.explanation || variant.explanation.length < 12) {
      errors.push(issue(`${prefix}.explanation`, 'Variant learner-facing explanation is required.'));
    }
    if (!variant.sentenceEntryIds.length) {
      errors.push(issue(`${prefix}.sentenceEntryIds`, 'Variant sentence references are required.'));
    }
    if (!hasExplicitProvenance(rawVariant, existingVariant)) {
      errors.push(issue(`${prefix}.provenance`, 'Variant provenance or source notes are required.'));
    }
  });

  return validationResult(errors, warnings, word);
}

export function normaliseSpellingSentenceEditorInput(rawValue = {}, {
  existingSentence = null,
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingSentence) ? existingSentence : {};
  return {
    id: normaliseString(raw.id, existing.id),
    wordSlug: normaliseString(raw.wordSlug, existing.wordSlug).toLowerCase(),
    text: normaliseString(raw.text, existing.text),
    variantLabel: normaliseString(raw.variantLabel, existing.variantLabel || 'default'),
    tags: uniqueStrings(hasExplicitList(raw.tags) ? raw.tags : existing.tags, { lowerCase: true }),
    sourceNote: normaliseString(raw.sourceNote, existing.sourceNote),
    provenance: normaliseProvenance(raw.provenance, existing.provenance),
    sortIndex: Number.isInteger(Number(raw.sortIndex)) && Number(raw.sortIndex) >= 0
      ? Number(raw.sortIndex)
      : (Number.isInteger(Number(existing.sortIndex)) ? Number(existing.sortIndex) : 0),
  };
}

export function validateSpellingSentenceEditorInput(rawValue = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(options.existingSentence) ? options.existingSentence : null;
  const sentence = normaliseSpellingSentenceEditorInput(raw, options);
  const word = findWord(options.words, sentence.wordSlug);

  if (!sentence.id) errors.push(issue('id', 'Sentence id is required.', 'invalid_sentence_operation'));
  if (!sentence.wordSlug) {
    errors.push(issue('wordSlug', 'Sentence word slug is required.', 'invalid_sentence_operation'));
  } else if (Array.isArray(options.words) && !word) {
    errors.push(issue('wordSlug', `Sentence must point at an existing word slug "${sentence.wordSlug}".`, 'invalid_sentence_operation'));
  } else if (word && (word.active === false || word.retired)) {
    errors.push(issue('wordSlug', `Sentence cannot point at retired word "${sentence.wordSlug}".`, 'invalid_sentence_operation'));
  }
  if (!sentence.text || sentence.text.length < 12) {
    errors.push(issue('text', 'Sentence text is required.', 'invalid_sentence_operation'));
  }
  if (!hasExplicitProvenance(raw, existing)) {
    errors.push(issue('provenance', 'Sentence provenance or source notes are required.', 'invalid_sentence_operation'));
  }

  return sentenceValidationResult(errors, warnings, sentence);
}

export function normaliseSpellingWordListEditorInput(rawValue = {}, {
  existingWordList = null,
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingWordList) ? existingWordList : {};
  const spellingPool = normaliseSpellingPool(raw.spellingPool, existing.spellingPool || 'core');
  return {
    id: normaliseString(raw.id, existing.id),
    title: normaliseString(raw.title, existing.title),
    spellingPool,
    coverageTier: normaliseCoverageTier(raw.coverageTier, existing.coverageTier, spellingPool),
    yearGroups: uniqueStrings(hasExplicitList(raw.yearGroups) ? raw.yearGroups : existing.yearGroups),
    tags: uniqueStrings(hasExplicitList(raw.tags) ? raw.tags : existing.tags, { lowerCase: true }),
    wordSlugs: uniqueStrings(hasExplicitList(raw.wordSlugs) ? raw.wordSlugs : existing.wordSlugs, { lowerCase: true }),
    sourceNote: normaliseString(raw.sourceNote, existing.sourceNote),
    provenance: normaliseProvenance(raw.provenance, existing.provenance),
    sortIndex: Number.isInteger(Number(raw.sortIndex)) && Number(raw.sortIndex) >= 0
      ? Number(raw.sortIndex)
      : (Number.isInteger(Number(existing.sortIndex)) ? Number(existing.sortIndex) : 0),
  };
}

export function validateSpellingWordListEditorInput(rawValue = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(options.existingWordList) ? options.existingWordList : null;
  const wordList = normaliseSpellingWordListEditorInput(raw, options);
  const wordsBySlug = new Map((Array.isArray(options.words) ? options.words : []).map((entry) => [entry.slug, entry]));

  if (!wordList.id) errors.push(issue('id', 'Word-list id is required.', 'invalid_word_list_operation'));
  if (!wordList.title) errors.push(issue('title', 'Word-list title is required.', 'invalid_word_list_operation'));
  if (wordList.spellingPool === 'core' && !wordList.yearGroups.length) {
    errors.push(issue('yearGroups', 'Core word lists require year-group metadata.', 'invalid_word_list_operation'));
  }
  if (wordList.spellingPool === 'extra' && wordList.coverageTier !== 'enrichment-extra') {
    errors.push(issue('coverageTier', 'Extra word lists must use enrichment-extra coverage.', 'invalid_word_list_operation'));
  }
  if (wordList.spellingPool === 'core' && wordList.coverageTier === 'enrichment-extra') {
    errors.push(issue('coverageTier', 'Core word lists cannot use enrichment-extra coverage.', 'invalid_word_list_operation'));
  }
  if (!hasExplicitProvenance(raw, existing)) {
    errors.push(issue('provenance', 'Word-list provenance or source notes are required.', 'invalid_word_list_operation'));
  }
  if (Array.isArray(options.words)) {
    wordList.wordSlugs.forEach((slug) => {
      const word = wordsBySlug.get(slug);
      if (!word) {
        errors.push(issue('wordSlugs', `Word-list membership references missing word slug "${slug}".`, 'invalid_word_list_operation'));
        return;
      }
      if (word.active === false || word.retired) {
        errors.push(issue('wordSlugs', `Word-list membership references retired word "${slug}".`, 'invalid_word_list_operation'));
        return;
      }
      if (word.spellingPool !== wordList.spellingPool) {
        errors.push(issue('wordSlugs', `Word "${slug}" uses pool "${word.spellingPool}", not "${wordList.spellingPool}".`, 'invalid_word_list_operation'));
      }
      if (word.coverageTier !== wordList.coverageTier) {
        errors.push(issue('wordSlugs', `Word "${slug}" uses coverage "${word.coverageTier}", not "${wordList.coverageTier}".`, 'invalid_word_list_operation'));
      }
    });
  }

  return wordListValidationResult(errors, warnings, wordList);
}

function throwIfInvalid(validation) {
  if (validation.ok) return;
  const error = new TypeError(validation.errors[0]?.message || 'Spelling word operation is invalid.');
  error.validation = validation;
  throw error;
}

export function buildSpellingWordUpsertOperation(rawValue = {}, options = {}) {
  const validation = validateSpellingWordEditorInput(rawValue, options);
  throwIfInvalid(validation);
  return {
    entityType: 'spelling.word',
    entityId: validation.word.slug,
    fieldPath: '',
    action: 'upsert',
    payload: validation.word,
  };
}

export function buildSpellingSentenceUpsertOperation(rawValue = {}, options = {}) {
  const validation = validateSpellingSentenceEditorInput(rawValue, options);
  throwIfInvalid(validation);
  return {
    entityType: 'spelling.sentenceEntry',
    entityId: validation.sentence.id,
    fieldPath: '',
    action: 'upsert',
    payload: validation.sentence,
  };
}

export function buildSpellingWordListUpsertOperation(rawValue = {}, options = {}) {
  const validation = validateSpellingWordListEditorInput(rawValue, options);
  throwIfInvalid(validation);
  return {
    entityType: 'spelling.wordList',
    entityId: validation.wordList.id,
    fieldPath: '',
    action: 'upsert',
    payload: validation.wordList,
  };
}

export function buildSpellingWordDeleteOrRetireOperation(rawValue = {}, {
  publishedSlugs = [],
  reason = '',
  now = () => Date.now(),
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const slug = normaliseString(raw.slug || raw.entityId || raw.wordSlug, slugifyWord(raw.word));
  if (!slug) throw new TypeError('Word slug is required.');
  const publishedSet = publishedSlugs instanceof Set
    ? publishedSlugs
    : new Set((Array.isArray(publishedSlugs) ? publishedSlugs : []).map((entry) => String(entry)));
  const published = Boolean(raw.published || raw.hasCurrent || publishedSet.has(slug));
  if (!published) {
    return {
      entityType: 'spelling.word',
      entityId: slug,
      fieldPath: '',
      action: 'remove',
      payload: null,
    };
  }
  return {
    entityType: 'spelling.word',
    entityId: slug,
    fieldPath: '',
    action: 'retire',
    payload: {
      reason: normaliseString(reason, normaliseString(raw.reason, 'Retired through Content Operations Centre.')),
      retiredAt: Number(now()),
      source: 'content-operations-centre',
    },
  };
}

export function buildSpellingSentenceDeleteOrRetireOperation(rawValue = {}, {
  publishedSentenceIds = [],
  reason = '',
  now = () => Date.now(),
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const id = normaliseString(raw.id || raw.entityId || raw.sentenceId);
  if (!id) throw new TypeError('Sentence id is required.');
  const publishedSet = publishedSentenceIds instanceof Set
    ? publishedSentenceIds
    : new Set((Array.isArray(publishedSentenceIds) ? publishedSentenceIds : []).map((entry) => String(entry)));
  const published = Boolean(raw.published || raw.hasCurrent || publishedSet.has(id));
  if (!published) {
    return {
      entityType: 'spelling.sentenceEntry',
      entityId: id,
      fieldPath: '',
      action: 'remove',
      payload: null,
    };
  }
  return {
    entityType: 'spelling.sentenceEntry',
    entityId: id,
    fieldPath: '',
    action: 'retire',
    payload: {
      reason: normaliseString(reason, normaliseString(raw.reason, 'Retired through Content Operations Centre.')),
      retiredAt: Number(now()),
      source: 'content-operations-centre',
    },
  };
}

export function buildSpellingWordListDeleteOrRetireOperation(rawValue = {}, {
  publishedWordListIds = [],
  reason = '',
  now = () => Date.now(),
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const id = normaliseString(raw.id || raw.entityId || raw.listId);
  if (!id) throw new TypeError('Word-list id is required.');
  const publishedSet = publishedWordListIds instanceof Set
    ? publishedWordListIds
    : new Set((Array.isArray(publishedWordListIds) ? publishedWordListIds : []).map((entry) => String(entry)));
  const published = Boolean(raw.published || raw.hasCurrent || publishedSet.has(id));
  if (!published) {
    return {
      entityType: 'spelling.wordList',
      entityId: id,
      fieldPath: '',
      action: 'remove',
      payload: null,
    };
  }
  return {
    entityType: 'spelling.wordList',
    entityId: id,
    fieldPath: '',
    action: 'retire',
    payload: {
      reason: normaliseString(reason, normaliseString(raw.reason, 'Retired through Content Operations Centre.')),
      retiredAt: Number(now()),
      source: 'content-operations-centre',
    },
  };
}
