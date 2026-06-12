import {
  HERO_EXPOSURE_SURFACES,
  SPELLING_REWARD_TRACK_MONSTER_IDS,
  isKnownHeroExposureState,
  isKnownHeroExposureSurface,
  isValidRewardTrackId,
  normaliseHeroExposure,
  normaliseRewardTrackConfig,
  validateRewardTrackCollection,
} from '../../../platform/game/reward-track-config.js';
import {
  isKnownSpellingPoolVisibilityState,
  isSpellingPoolPotentiallyLearnerVisible,
  normalisePoolVisibility as normaliseContentPoolVisibility,
} from './pool-visibility.js';

const LEGACY_SPELLING_POOLS = new Set(['core', 'extra']);
const RESERVED_POOL_IDS = new Set(['all']);
const VALID_POOL_TYPES = new Set(['statutory', 'enrichment', 'extension', 'custom']);
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

function isValidPoolId(value) {
  return typeof value === 'string'
    && /^[a-z][a-z0-9-]{1,63}$/.test(value)
    && !RESERVED_POOL_IDS.has(value);
}

function normalisePoolIdCandidate(value, fallback = '') {
  const candidate = normaliseString(value).toLowerCase();
  return candidate || fallback;
}

function normaliseSpellingPool(value, fallback = 'core') {
  const safeFallback = isValidPoolId(fallback) ? fallback : 'core';
  const candidate = normaliseString(value).toLowerCase();
  return isValidPoolId(candidate) ? candidate : safeFallback;
}

function normaliseCoverageTier(value, fallback, spellingPool) {
  return normaliseString(value, fallback || DEFAULT_COVERAGE_BY_POOL[spellingPool] || 'statutory-core');
}

function defaultCoverageForPool(poolId, pool = null) {
  if (poolId === 'core') return 'statutory-core';
  if (poolId === 'extra' || pool?.type === 'enrichment') return 'enrichment-extra';
  return 'secure-extension';
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

function poolValidationResult(errors, warnings, pool = null) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    pool,
  };
}

function rewardTrackValidationResult(errors, warnings, rewardTrack = null) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rewardTrack,
  };
}

function heroExposureValidationResult(errors, warnings, heroExposure = null) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    heroExposure,
  };
}

function findWordList(wordLists, listId) {
  return (Array.isArray(wordLists) ? wordLists : []).find((entry) => entry?.id === listId) || null;
}

function findPool(pools, poolId) {
  return (Array.isArray(pools) ? pools : []).find((entry) => entry?.id === poolId) || null;
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
  pools = [],
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingWordList) ? existingWordList : {};
  const spellingPool = normaliseSpellingPool(raw.spellingPool, existing.spellingPool || 'core');
  const pool = findPool(pools, spellingPool);
  return {
    id: normaliseString(raw.id, existing.id),
    title: normaliseString(raw.title, existing.title),
    spellingPool,
    coverageTier: normaliseCoverageTier(raw.coverageTier, existing.coverageTier || defaultCoverageForPool(spellingPool, pool), spellingPool),
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
  const pool = findPool(options.pools, wordList.spellingPool);

  if (!wordList.id) errors.push(issue('id', 'Word-list id is required.', 'invalid_word_list_operation'));
  if (!wordList.title) errors.push(issue('title', 'Word-list title is required.', 'invalid_word_list_operation'));
  if (Array.isArray(options.pools) && !pool) {
    errors.push(issue('spellingPool', `Word-list pool "${wordList.spellingPool}" is not defined.`, 'invalid_word_list_operation'));
  } else if (pool && (pool.active === false || pool.retired)) {
    errors.push(issue('spellingPool', `Word-list pool "${wordList.spellingPool}" is retired.`, 'invalid_word_list_operation'));
  }
  if (wordList.spellingPool === 'core' && !wordList.yearGroups.length) {
    errors.push(issue('yearGroups', 'Core word lists require year-group metadata.', 'invalid_word_list_operation'));
  }
  if (wordList.spellingPool === 'extra' && wordList.coverageTier !== 'enrichment-extra') {
    errors.push(issue('coverageTier', 'Extra word lists must use enrichment-extra coverage.', 'invalid_word_list_operation'));
  }
  if (wordList.spellingPool === 'core' && wordList.coverageTier === 'enrichment-extra') {
    errors.push(issue('coverageTier', 'Core word lists cannot use enrichment-extra coverage.', 'invalid_word_list_operation'));
  }
  if (wordList.spellingPool !== 'core' && wordList.coverageTier === 'statutory-core') {
    errors.push(issue('coverageTier', 'Non-core word lists cannot use statutory-core coverage.', 'invalid_word_list_operation'));
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

function normalisePoolVisibility(rawValue = {}, existingVisibility = null) {
  return normaliseContentPoolVisibility(rawValue, existingVisibility);
}

function normaliseNoRewardException(rawValue = {}, existingException = null) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingException) ? existingException : {};
  const hasApprovedValue = Object.prototype.hasOwnProperty.call(raw, 'approved');
  return {
    approved: hasApprovedValue ? raw.approved === true : existing.approved === true,
    reason: normaliseString(raw.reason, existing.reason),
    approvedBy: normaliseString(raw.approvedBy, existing.approvedBy),
    approvedAt: Number.isFinite(Number(raw.approvedAt ?? existing.approvedAt)) && Number(raw.approvedAt ?? existing.approvedAt) >= 0
      ? Number(raw.approvedAt ?? existing.approvedAt)
      : 0,
  };
}

function normalisePoolRewardTrackApproval(rawValue = {}, existingTrack = null) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingTrack) ? existingTrack : {};
  const hasApprovedValue = Object.prototype.hasOwnProperty.call(raw, 'approved');
  return {
    id: normaliseString(raw.id || raw.rewardTrackId || raw.trackId, existing.id || existing.rewardTrackId || existing.trackId),
    approved: hasApprovedValue ? raw.approved === true : existing.approved === true,
    source: normaliseString(raw.source, existing.source),
    note: normaliseString(raw.note, existing.note),
    approvedBy: normaliseString(raw.approvedBy, existing.approvedBy),
    approvedAt: Number.isFinite(Number(raw.approvedAt ?? existing.approvedAt)) && Number(raw.approvedAt ?? existing.approvedAt) >= 0
      ? Number(raw.approvedAt ?? existing.approvedAt)
      : 0,
  };
}

function normaliseRewardTrackIds(rawValue, existingValue = [], { explicit = false } = {}) {
  return uniqueStrings(explicit ? rawValue : (hasExplicitList(rawValue) ? rawValue : existingValue), { lowerCase: true });
}

export function normaliseSpellingPoolEditorInput(rawValue = {}, {
  existingPool = null,
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(existingPool) ? existingPool : {};
  const id = normalisePoolIdCandidate(raw.id || raw.poolId || raw.spellingPool, existing.id || '');
  const type = VALID_POOL_TYPES.has(normaliseString(raw.type || raw.poolType, existing.type || 'custom').toLowerCase())
    ? normaliseString(raw.type || raw.poolType, existing.type || 'custom').toLowerCase()
    : 'custom';
  const sourceNote = normaliseString(raw.sourceNote, existing.sourceNote);
  const provenance = normaliseProvenance(raw.provenance, existing.provenance);
  const noRewardException = raw.noRewardException || existing.noRewardException
    ? normaliseNoRewardException(raw.noRewardException, existing.noRewardException)
    : null;
  const hasRewardTrackIds = Object.prototype.hasOwnProperty.call(raw, 'rewardTrackIds');
  const rewardTrackIds = normaliseRewardTrackIds(raw.rewardTrackIds, existing.rewardTrackIds, {
    explicit: hasRewardTrackIds,
  });
  const rewardTrack = raw.rewardTrack || existing.rewardTrack
    ? normalisePoolRewardTrackApproval(raw.rewardTrack, existing.rewardTrack)
    : null;
  return {
    id,
    title: normaliseString(raw.title, existing.title),
    type,
    sourceNote,
    provenance,
    visibility: normalisePoolVisibility(raw.visibility, existing.visibility),
    tags: uniqueStrings(hasExplicitList(raw.tags) ? raw.tags : existing.tags, { lowerCase: true }),
    active: raw.active === false ? false : (existing.active === false ? false : true),
    retired: Boolean(raw.retired || existing.retired),
    ...(raw.retirement || existing.retirement ? { retirement: raw.retirement || existing.retirement } : {}),
    ...(noRewardException ? { noRewardException } : {}),
    ...(rewardTrackIds.length ? { rewardTrackIds } : {}),
    ...(rewardTrack ? { rewardTrack } : {}),
    sortIndex: Number.isInteger(Number(raw.sortIndex)) && Number(raw.sortIndex) >= 0
      ? Number(raw.sortIndex)
      : (Number.isInteger(Number(existing.sortIndex)) ? Number(existing.sortIndex) : 0),
  };
}

export function validateSpellingPoolEditorInput(rawValue = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(options.existingPool) ? options.existingPool : null;
  const pool = normaliseSpellingPoolEditorInput(raw, options);
  const duplicate = (Array.isArray(options.pools) ? options.pools : [])
    .find((entry) => entry?.id === pool.id && entry?.id !== existing?.id);

  if (!pool.id || !isValidPoolId(pool.id)) errors.push(issue('id', 'Pool id must be a stable lowercase id.', 'invalid_pool_operation'));
  if (duplicate) errors.push(issue('id', `Pool id "${pool.id}" already exists.`, 'invalid_pool_operation'));
  if (!pool.title) errors.push(issue('title', 'Pool title is required.', 'invalid_pool_operation'));
  if (!VALID_POOL_TYPES.has(pool.type)) errors.push(issue('type', 'Pool type is required.', 'invalid_pool_operation'));
  if (!hasExplicitProvenance(raw, existing)) {
    errors.push(issue('provenance', 'Pool provenance or source notes are required.', 'invalid_pool_operation'));
  }
  if (raw.visibility?.state && !isKnownSpellingPoolVisibilityState(raw.visibility.state)) {
    errors.push(issue('visibility.state', 'Pool visibility state is invalid.', 'invalid_pool_operation'));
  }
  if (pool.retired && isSpellingPoolPotentiallyLearnerVisible(pool.visibility)) {
    errors.push(issue('visibility.state', 'Retired pools cannot be learner-visible.', 'invalid_pool_operation'));
  }
  if (pool.id !== 'core' && pool.type === 'statutory') {
    errors.push(issue('type', 'Only the core pool can use statutory type.', 'invalid_pool_operation'));
  }
  if (
    isSpellingPoolPotentiallyLearnerVisible(pool.visibility)
    && !LEGACY_SPELLING_POOLS.has(pool.id)
    && pool.noRewardException?.approved !== true
    && !(Array.isArray(pool.rewardTrackIds) && pool.rewardTrackIds.length > 0)
    && pool.rewardTrack?.approved !== true
  ) {
    errors.push(issue('visibility.state', 'Learner-visible future pools require a reward track or approved no-reward exception.', 'pool_reward_required'));
  }
  if (pool.visibility.state === 'scheduled' && !pool.visibility.scheduledAt) {
    errors.push(issue('visibility.scheduledAt', 'Scheduled pool visibility requires a timestamp.', 'pool_visibility_schedule_required'));
  }
  if (pool.visibility.state === 'rollout-flagged' && !pool.visibility.rolloutFlag) {
    errors.push(issue('visibility.rolloutFlag', 'Rollout-flagged pool visibility requires a rollout flag.', 'pool_visibility_flag_required'));
  }

  return poolValidationResult(errors, warnings, pool);
}

function rewardTrackIssueToEditorIssue(entry) {
  const field = normaliseString(entry.path).replace(/^rewardTracks\[\d+\]\.?/, '') || 'id';
  return issue(field, entry.message, entry.code);
}

export function normaliseSpellingRewardTrackEditorInput(rawValue = {}, {
  existingTrack = null,
  defaultPoolId = '',
} = {}) {
  return normaliseRewardTrackConfig(rawValue, { existingTrack, defaultPoolId });
}

export function validateSpellingRewardTrackEditorInput(rawValue = {}, options = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const existing = isPlainObject(options.existingTrack) ? options.existingTrack : null;
  const rewardTrack = normaliseSpellingRewardTrackEditorInput(raw, options);
  const rawHeroExposure = isPlainObject(raw.heroExposure)
    ? raw.heroExposure
    : (isPlainObject(raw.exposure) ? raw.exposure : null);
  const validationTrack = rawHeroExposure
    ? { ...rewardTrack, heroExposure: rawHeroExposure }
    : rewardTrack;
  const existingId = normaliseString(existing?.id);
  const peers = (Array.isArray(options.rewardTracks) ? options.rewardTracks : [])
    .filter((entry) => !existingId || entry?.id !== existingId);
  const validation = validateRewardTrackCollection([...peers, validationTrack], {
    pools: options.pools || [],
    poolWordCounts: options.poolWordCounts || null,
    learnerVisiblePoolIds: options.learnerVisiblePoolIds || null,
    allowedMonsterIds: options.allowedMonsterIds || SPELLING_REWARD_TRACK_MONSTER_IDS,
    enforceThresholdsForHiddenPools: options.enforceThresholdsForHiddenPools === true,
  });

  return rewardTrackValidationResult(
    validation.errors.map(rewardTrackIssueToEditorIssue),
    validation.warnings.map(rewardTrackIssueToEditorIssue),
    rewardTrack,
  );
}

export function normaliseSpellingHeroExposureEditorInput(rawValue = {}, {
  existingTrack = null,
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return normaliseHeroExposure(raw.heroExposure || raw.exposure || raw, existingTrack?.heroExposure);
}

export function validateSpellingHeroExposureEditorInput(rawValue = {}, options = {}) {
  const errors = [];
  const warnings = [];
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const exposureRaw = isPlainObject(raw.heroExposure)
    ? raw.heroExposure
    : (isPlainObject(raw.exposure) ? raw.exposure : raw);
  const heroExposure = normaliseSpellingHeroExposureEditorInput(exposureRaw, options);

  if (exposureRaw.state && !isKnownHeroExposureState(exposureRaw.state)) {
    errors.push(issue('heroExposure.state', 'Hero / Codex exposure state is invalid.', 'invalid_hero_exposure_state'));
  }
  const rawSurfaces = Array.isArray(exposureRaw.surfaces)
    ? exposureRaw.surfaces.map((surface) => String(surface || '').trim()).filter(Boolean)
    : (typeof exposureRaw.surfaces === 'string'
        ? exposureRaw.surfaces.split(/[\n,]+/).map((surface) => surface.trim()).filter(Boolean)
        : []);
  rawSurfaces.forEach((surface) => {
    if (!isKnownHeroExposureSurface(surface)) {
      errors.push(issue('heroExposure.surfaces', `Hero / Codex exposure surface "${surface}" is invalid.`, 'invalid_hero_exposure_surface'));
    }
  });
  if (!heroExposure.surfaces.length) {
    errors.push(issue('heroExposure.surfaces', 'At least one Hero / Codex surface is required.', 'hero_exposure_surface_required'));
  }
  if (heroExposure.state === 'scheduled' && !heroExposure.scheduledAt) {
    errors.push(issue('heroExposure.scheduledAt', 'Scheduled exposure requires a visibility timestamp.', 'hero_exposure_schedule_required'));
  }
  if (heroExposure.state === 'rollout-flagged' && !heroExposure.rolloutFlag) {
    errors.push(issue('heroExposure.rolloutFlag', 'Rollout-flagged exposure requires a rollout flag.', 'hero_exposure_flag_required'));
  }
  if (heroExposure.state === 'hidden' && heroExposure.surfaces.length === HERO_EXPOSURE_SURFACES.length) {
    warnings.push(issue('heroExposure.state', 'Hidden exposure keeps admin preview available but hides this track from learner Hero / Codex surfaces.', 'hero_exposure_hidden'));
  }

  return heroExposureValidationResult(errors, warnings, heroExposure);
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

export function buildSpellingPoolUpsertOperation(rawValue = {}, options = {}) {
  const validation = validateSpellingPoolEditorInput(rawValue, options);
  throwIfInvalid(validation);
  return {
    entityType: 'spelling.pool',
    entityId: validation.pool.id,
    fieldPath: '',
    action: 'upsert',
    payload: validation.pool,
  };
}

export function buildSpellingRewardTrackUpsertOperation(rawValue = {}, options = {}) {
  const validation = validateSpellingRewardTrackEditorInput(rawValue, options);
  throwIfInvalid(validation);
  return {
    entityType: 'spelling.rewardTrack',
    entityId: validation.rewardTrack.id,
    fieldPath: '',
    action: 'upsert',
    payload: validation.rewardTrack,
  };
}

export function buildSpellingHeroExposureUpsertOperation(rawValue = {}, options = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const id = normaliseString(raw.id || raw.entityId || raw.rewardTrackId || raw.trackId || options.existingTrack?.id).toLowerCase();
  if (!id) throw new TypeError('Reward track id is required.');
  if (!isValidRewardTrackId(id)) throw new TypeError('Reward track id must be a stable lowercase id.');
  const validation = validateSpellingHeroExposureEditorInput(raw.heroExposure || raw.exposure || raw, options);
  throwIfInvalid(validation);
  return {
    entityType: 'spelling.heroExposure',
    entityId: id,
    fieldPath: '',
    action: 'upsert',
    payload: validation.heroExposure,
  };
}

export function buildSpellingRewardTrackDeleteOrRetireOperation(rawValue = {}, {
  publishedRewardTrackIds = [],
  reason = '',
  now = () => Date.now(),
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const id = normaliseString(raw.id || raw.entityId || raw.rewardTrackId || raw.trackId).toLowerCase();
  if (!id) throw new TypeError('Reward track id is required.');
  if (!isValidRewardTrackId(id)) throw new TypeError('Reward track id must be a stable lowercase id.');
  const publishedSet = publishedRewardTrackIds instanceof Set
    ? publishedRewardTrackIds
    : new Set((Array.isArray(publishedRewardTrackIds) ? publishedRewardTrackIds : []).map((entry) => String(entry)));
  const published = Boolean(raw.published || raw.hasCurrent || publishedSet.has(id));
  if (!published) {
    return {
      entityType: 'spelling.rewardTrack',
      entityId: id,
      fieldPath: '',
      action: 'remove',
      payload: null,
    };
  }
  return {
    entityType: 'spelling.rewardTrack',
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

export function buildSpellingPoolDeleteOrRetireOperation(rawValue = {}, {
  publishedPoolIds = [],
  reason = '',
  now = () => Date.now(),
} = {}) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const id = normalisePoolIdCandidate(raw.id || raw.entityId || raw.poolId);
  if (!id) throw new TypeError('Pool id is required.');
  if (!isValidPoolId(id)) throw new TypeError('Pool id must be a stable lowercase id.');
  const publishedSet = publishedPoolIds instanceof Set
    ? publishedPoolIds
    : new Set((Array.isArray(publishedPoolIds) ? publishedPoolIds : []).map((entry) => String(entry)));
  const published = Boolean(raw.published || raw.hasCurrent || publishedSet.has(id));
  if (!published) {
    return {
      entityType: 'spelling.pool',
      entityId: id,
      fieldPath: '',
      action: 'remove',
      payload: null,
    };
  }
  return {
    entityType: 'spelling.pool',
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
