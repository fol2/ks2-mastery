import {
  normaliseSpellingContentBundle,
} from './model.js';
import {
  stableContentOperationStringify,
} from './operations-model.js';

const DEFAULT_BROWSE_LIMIT = 75;
const MAX_BROWSE_LIMIT = 250;
const WORD_AUDIO_PROFILES = Object.freeze(['male.natural', 'female.natural']);
const SENTENCE_AUDIO_PROFILES = Object.freeze([
  'male.normal',
  'male.slow',
  'female.normal',
  'female.slow',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normaliseLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_BROWSE_LIMIT;
  return Math.max(1, Math.min(MAX_BROWSE_LIMIT, Math.floor(limit)));
}

function normaliseFilters(filters = {}) {
  const safe = isPlainObject(filters) ? filters : {};
  const pool = asString(safe.pool || safe.spellingPool, 'all').toLowerCase();
  return {
    query: asString(safe.query || safe.q).toLowerCase(),
    pool: ['core', 'extra'].includes(pool) ? pool : 'all',
    listId: asString(safe.listId),
    limit: normaliseLimit(safe.limit),
  };
}

function validationSummary(validation = null) {
  const safe = isPlainObject(validation) ? validation : {};
  const errors = asArray(safe.errors);
  const warnings = asArray(safe.warnings);
  const ok = typeof safe.ok === 'boolean' ? safe.ok : errors.length === 0;
  return {
    status: ok ? 'passed' : 'blocked',
    ok,
    errorCount: Number(safe.errorCount ?? errors.length) || 0,
    warningCount: Number(safe.warningCount ?? warnings.length) || 0,
    errors,
    warnings,
  };
}

function draftMaps(bundle) {
  const wordListsById = new Map(bundle.draft.wordLists.map((entry) => [entry.id, entry]));
  const wordsBySlug = new Map(bundle.draft.words.map((entry) => [entry.slug, entry]));
  const sentencesById = new Map(bundle.draft.sentences.map((entry) => [entry.id, entry]));
  return { wordListsById, wordsBySlug, sentencesById };
}

function sentenceEntriesForWord(word, maps) {
  return asArray(word?.sentenceEntryIds)
    .map((id) => maps.sentencesById.get(id))
    .filter(Boolean)
    .sort((left, right) => left.sortIndex - right.sortIndex);
}

function variantSummaries(word, maps) {
  return asArray(word?.variants).map((variant) => {
    const sentences = asArray(variant.sentenceEntryIds)
      .map((id) => maps.sentencesById.get(id))
      .filter(Boolean)
      .sort((left, right) => left.sortIndex - right.sortIndex);
    return {
      word: variant.word,
      accepted: asArray(variant.accepted),
      explanation: variant.explanation || '',
      sentenceEntryIds: asArray(variant.sentenceEntryIds),
      sourceNote: variant.sourceNote || '',
      provenance: variant.provenance || null,
      progressKey: variant.progressKey || variant.word || '',
      sentenceCount: sentences.length,
      sentences: sentences.map(compactSentence),
    };
  });
}

function validationStateForPackageCandidate(
  packageCandidate = null,
  packageContent = null,
  { packageActive = false } = {},
) {
  if (!packageCandidate) {
    if (packageActive) {
      return {
        status: 'candidate_required',
        ok: false,
        errorCount: 1,
        warningCount: 0,
        errors: [{
          code: 'candidate_required',
          message: 'Package candidate must be validated before draft values can be browsed.',
        }],
        warnings: [],
      };
    }
    return {
      status: 'published',
      ok: true,
      errorCount: 0,
      warningCount: 0,
      errors: [],
      warnings: [],
    };
  }
  const validation = validationSummary(packageCandidate.validation);
  if (packageCandidate.isCurrent === false || (packageCandidate.staleReasons || []).length) {
    return {
      status: 'stale_candidate',
      ok: false,
      errorCount: Math.max(1, validation.errorCount),
      warningCount: validation.warningCount,
      errors: [
        ...validation.errors,
        {
          code: 'stale_candidate',
          message: 'Package candidate must be rebuilt before draft values can be browsed.',
          reasons: asArray(packageCandidate.staleReasons),
        },
      ],
      warnings: validation.warnings,
    };
  }
  if (!packageContent) {
    return {
      status: 'candidate_required',
      ok: false,
      errorCount: Math.max(1, validation.errorCount),
      warningCount: validation.warningCount,
      errors: [
        ...validation.errors,
        {
          code: 'candidate_required',
          message: 'Package candidate must be validated before draft values can be browsed.',
        },
      ],
      warnings: validation.warnings,
    };
  }
  return validation;
}

function familyMembersFor(word, bundle) {
  if (!word?.family) return [];
  return bundle.draft.words
    .filter((entry) => (
      entry.family === word.family
      && entry.spellingPool === word.spellingPool
      && entry.coverageTier === word.coverageTier
    ))
    .sort((left, right) => left.sortIndex - right.sortIndex || left.word.localeCompare(right.word))
    .map((entry) => ({
      slug: entry.slug,
      word: entry.word,
    }));
}

function compactSentence(sentence) {
  return {
    id: sentence.id,
    wordSlug: sentence.wordSlug,
    text: sentence.text,
    variantLabel: sentence.variantLabel || '',
    tags: asArray(sentence.tags),
  };
}

function compactWordList(list, wordCount, draftState = 'unchanged') {
  return {
    id: list.id,
    title: list.title,
    spellingPool: list.spellingPool,
    coverageTier: list.coverageTier,
    yearGroups: asArray(list.yearGroups),
    wordCount,
    draftState,
  };
}

function comparableWordList(list) {
  if (!list) return null;
  return {
    id: list.id,
    title: list.title,
    spellingPool: list.spellingPool,
    coverageTier: list.coverageTier,
    yearGroups: asArray(list.yearGroups),
    tags: asArray(list.tags),
    sourceNote: list.sourceNote || '',
  };
}

function comparableWord(bundle, maps, slug) {
  const word = maps.wordsBySlug.get(slug);
  if (!word) return null;
  const sentences = sentenceEntriesForWord(word, maps).map(compactSentence);
  const list = maps.wordListsById.get(word.listId) || null;
  return {
    word,
    list: comparableWordList(list),
    sentences,
    variants: variantSummaries(word, maps),
  };
}

function compareValue(left, right) {
  return stableContentOperationStringify(left) === stableContentOperationStringify(right);
}

function packageDraftState(currentValue, packageValue) {
  if (!packageValue && !currentValue) return 'missing';
  if (!currentValue && packageValue) return 'added';
  if (currentValue && !packageValue) return 'removed';
  return compareValue(currentValue, packageValue) ? 'unchanged' : 'modified';
}

function audioReadinessForWord(word, baseSentenceCount, variantSentenceCount) {
  const variantCount = asArray(word?.variants).length;
  const wordAudioRequired = (1 + variantCount) * WORD_AUDIO_PROFILES.length;
  const sentenceAudioRequired = (baseSentenceCount + variantSentenceCount) * SENTENCE_AUDIO_PROFILES.length;
  return {
    status: 'not_scanned',
    wordProfiles: [...WORD_AUDIO_PROFILES],
    sentenceProfiles: [...SENTENCE_AUDIO_PROFILES],
    wordAudioRequired,
    sentenceAudioRequired,
    totalRequired: wordAudioRequired + sentenceAudioRequired,
  };
}

function rewardImpactForWord(word, familySize) {
  return {
    status: 'not_mapped',
    spellingPool: word.spellingPool,
    coverageTier: word.coverageTier,
    familySize,
    wordListId: word.listId,
    monsterBinding: {
      mode: 'pool',
      poolId: word.spellingPool,
      assignment: 'unresolved',
    },
  };
}

function compactWordRow({
  word,
  bundle,
  maps,
  currentComparable,
  packageComparable,
  draftState,
  validationState,
}) {
  const list = maps.wordListsById.get(word.listId) || null;
  const sentences = sentenceEntriesForWord(word, maps);
  const variants = variantSummaries(word, maps);
  const variantSentenceCount = variants.reduce((sum, variant) => sum + variant.sentenceCount, 0);
  const familyMembers = familyMembersFor(word, bundle);
  return {
    slug: word.slug,
    word: word.word,
    family: word.family,
    listId: word.listId,
    listTitle: list?.title || '',
    spellingPool: word.spellingPool,
    coverageTier: word.coverageTier,
    yearGroups: asArray(word.yearGroups),
    tags: asArray(word.tags),
    patternIds: asArray(word.patternIds),
    acceptedCount: asArray(word.accepted).length,
    sentenceCount: sentences.length,
    variantCount: variants.length,
    variantSentenceCount,
    variantWords: variants.map((variant) => variant.word).filter(Boolean),
    variantAccepted: variants.flatMap((variant) => asArray(variant.accepted)),
    familySize: familyMembers.length,
    draftState,
    validationState,
    hasCurrent: Boolean(currentComparable),
    hasPackageDraft: Boolean(packageComparable),
    audioReadiness: audioReadinessForWord(word, sentences.length, variantSentenceCount),
    rewardImpact: rewardImpactForWord(word, familyMembers.length),
  };
}

function rowMatchesFilters(row, filters) {
  if (filters.pool !== 'all' && row.spellingPool !== filters.pool) return false;
  if (filters.listId && row.listId !== filters.listId) return false;
  if (!filters.query) return true;
  const haystack = [
    row.slug,
    row.word,
    row.family,
    row.listId,
    row.listTitle,
    row.coverageTier,
    ...row.tags,
    ...row.patternIds,
    ...asArray(row.variantWords),
    ...asArray(row.variantAccepted),
  ].join(' ').toLowerCase();
  return haystack.includes(filters.query);
}

function draftStateCounts(rows) {
  const counts = {
    added: 0,
    modified: 0,
    removed: 0,
    unchanged: 0,
  };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.draftState)) {
      counts[row.draftState] += 1;
    }
  }
  return counts;
}

function poolSummaries(rows) {
  return ['core', 'extra'].map((pool) => {
    const poolRows = rows.filter((row) => row.spellingPool === pool);
    return {
      pool,
      wordCount: poolRows.length,
      sentenceCount: poolRows.reduce((sum, row) => sum + row.sentenceCount + row.variantSentenceCount, 0),
      variantCount: poolRows.reduce((sum, row) => sum + row.variantCount, 0),
      draftStateCounts: draftStateCounts(poolRows),
    };
  });
}

function compactWordLists({ currentBundle, packageBundle, currentMaps, packageMaps }) {
  const displayBundle = packageBundle || currentBundle;
  const displayMaps = packageMaps || currentMaps;
  const listIds = new Set([
    ...currentBundle.draft.wordLists.map((entry) => entry.id),
    ...asArray(packageBundle?.draft?.wordLists).map((entry) => entry.id),
  ]);
  return [...listIds].map((id) => {
    const currentList = currentMaps.wordListsById.get(id) || null;
    const packageList = packageMaps?.wordListsById.get(id) || null;
    const display = packageList || currentList;
    const wordCount = displayBundle.draft.words.filter((word) => word.listId === id).length;
    return compactWordList(
      display,
      wordCount,
      packageBundle ? packageDraftState(currentList, packageList) : 'unchanged',
    );
  }).sort((left, right) => left.spellingPool.localeCompare(right.spellingPool) || left.title.localeCompare(right.title));
}

function packageDraftEnvelope({ packageId = '', packageRecord = null, packageCandidate = null, packageContent = null } = {}) {
  const validation = validationStateForPackageCandidate(packageCandidate, packageContent, {
    packageActive: Boolean(packageId),
  });
  if (!packageId) {
    return {
      active: false,
      status: 'inactive',
      packageId: '',
      candidateId: '',
      candidateHash: '',
      staleReasons: [],
      validation,
    };
  }
  const staleReasons = asArray(packageCandidate?.staleReasons);
  return {
    active: true,
    status: staleReasons.length || packageCandidate?.isCurrent === false
      ? 'stale_candidate'
      : (packageContent ? 'available' : 'candidate_required'),
    packageId,
    packageTitle: packageRecord?.title || '',
    packageState: packageRecord?.state || '',
    candidateId: packageCandidate?.candidateId || '',
    candidateHash: packageCandidate?.candidateHash || '',
    staleReasons,
    latestReleaseId: packageCandidate?.latestReleaseId || '',
    expectedOperationsHash: packageCandidate?.expectedOperationsHash || '',
    validation,
  };
}

function releaseEnvelope(releaseInfo = {}) {
  return {
    releaseId: releaseInfo?.releaseId || '',
    snapshotHash: releaseInfo?.snapshotHash || '',
    publishedAt: Number(releaseInfo?.publishedAt) || 0,
    source: releaseInfo?.source || (releaseInfo?.releaseId ? 'latest_release' : 'seeded_fallback'),
  };
}

export function buildSpellingContentBrowseModel({
  publishedContent,
  packageContent = null,
  packageCandidate = null,
  packageRecord = null,
  packageId = '',
  releaseInfo = {},
  filters = {},
} = {}) {
  const currentBundle = normaliseSpellingContentBundle(publishedContent);
  const packageBundle = packageContent ? normaliseSpellingContentBundle(packageContent) : null;
  const currentMaps = draftMaps(currentBundle);
  const packageMaps = packageBundle ? draftMaps(packageBundle) : null;
  const displayBundle = packageBundle || currentBundle;
  const normalisedFilters = normaliseFilters(filters);
  const validationState = validationStateForPackageCandidate(packageCandidate, packageBundle, {
    packageActive: Boolean(packageId),
  });
  const slugs = new Set([
    ...currentBundle.draft.words.map((word) => word.slug),
    ...asArray(packageBundle?.draft?.words).map((word) => word.slug),
  ]);
  const rows = [...slugs].map((slug) => {
    const currentComparable = comparableWord(currentBundle, currentMaps, slug);
    const packageComparable = packageBundle ? comparableWord(packageBundle, packageMaps, slug) : null;
    const displayWord = (packageComparable?.word || currentComparable?.word);
    const displayMapsForWord = packageComparable ? packageMaps : currentMaps;
    const displayBundleForWord = packageComparable ? packageBundle : currentBundle;
    return compactWordRow({
      word: displayWord,
      bundle: displayBundleForWord,
      maps: displayMapsForWord,
      currentComparable,
      packageComparable,
      draftState: packageBundle ? packageDraftState(currentComparable, packageComparable) : 'unchanged',
      validationState,
    });
  }).sort((left, right) => (
    left.spellingPool.localeCompare(right.spellingPool)
    || left.listTitle.localeCompare(right.listTitle)
    || left.word.localeCompare(right.word)
  ));
  const filteredRows = rows.filter((row) => rowMatchesFilters(row, normalisedFilters));
  const limitedRows = filteredRows.slice(0, normalisedFilters.limit);
  const sentenceCount = displayBundle.draft.sentences.length;
  const variantCount = displayBundle.draft.words.reduce((sum, word) => sum + asArray(word.variants).length, 0);
  return {
    subjectId: 'spelling',
    release: releaseEnvelope(releaseInfo),
    packageDraft: packageDraftEnvelope({
      packageId,
      packageRecord,
      packageCandidate,
      packageContent,
    }),
    filters: normalisedFilters,
    totals: {
      words: rows.length,
      displayedWords: limitedRows.length,
      matchedWords: filteredRows.length,
      wordLists: displayBundle.draft.wordLists.length,
      sentences: sentenceCount,
      variants: variantCount,
      families: new Set(displayBundle.draft.words.map((word) => `${word.spellingPool}:${word.coverageTier}:${word.family}`)).size,
    },
    draftStateCounts: draftStateCounts(rows),
    pools: poolSummaries(rows),
    wordLists: compactWordLists({
      currentBundle,
      packageBundle,
      currentMaps,
      packageMaps,
    }),
    words: limitedRows,
  };
}

function detailedWord(bundle, maps, slug) {
  const word = maps.wordsBySlug.get(slug);
  if (!word) return null;
  const list = maps.wordListsById.get(word.listId) || null;
  const sentences = sentenceEntriesForWord(word, maps).map(compactSentence);
  const variants = variantSummaries(word, maps);
  const variantSentenceCount = variants.reduce((sum, variant) => sum + variant.sentenceCount, 0);
  const familyMembers = familyMembersFor(word, bundle);
  return {
    slug: word.slug,
    word: word.word,
    family: word.family,
    list: list ? compactWordList(list, list.wordSlugs.length) : null,
    spellingPool: word.spellingPool,
    coverageTier: word.coverageTier,
    yearGroups: asArray(word.yearGroups),
    tags: asArray(word.tags),
    patternIds: asArray(word.patternIds),
    accepted: asArray(word.accepted),
    explanation: word.explanation || '',
    sentenceEntryIds: asArray(word.sentenceEntryIds),
    sourceNote: word.sourceNote || '',
    provenance: word.provenance || null,
    progressKey: word.progressKey || word.slug,
    active: word.active !== false,
    retired: Boolean(word.retired),
    retirement: word.retirement || null,
    sentences,
    variants,
    familyMembers,
    audioReadiness: audioReadinessForWord(word, sentences.length, variantSentenceCount),
    rewardImpact: rewardImpactForWord(word, familyMembers.length),
  };
}

export function buildSpellingContentWordDetail({
  publishedContent,
  packageContent = null,
  packageCandidate = null,
  packageRecord = null,
  packageId = '',
  releaseInfo = {},
  slug = '',
} = {}) {
  const safeSlug = asString(slug).toLowerCase();
  const currentBundle = normaliseSpellingContentBundle(publishedContent);
  const packageBundle = packageContent ? normaliseSpellingContentBundle(packageContent) : null;
  const currentMaps = draftMaps(currentBundle);
  const packageMaps = packageBundle ? draftMaps(packageBundle) : null;
  const current = detailedWord(currentBundle, currentMaps, safeSlug);
  const packageDraft = packageBundle ? detailedWord(packageBundle, packageMaps, safeSlug) : null;
  return {
    type: 'word',
    slug: safeSlug,
    found: Boolean(current || packageDraft),
    release: releaseEnvelope(releaseInfo),
    packageDraft: packageDraftEnvelope({
      packageId,
      packageRecord,
      packageCandidate,
      packageContent,
    }),
    draftState: packageBundle
      ? packageDraftState(
        comparableWord(currentBundle, currentMaps, safeSlug),
        comparableWord(packageBundle, packageMaps, safeSlug),
      )
      : 'unchanged',
    current,
    packageValue: packageDraft,
    validationState: validationStateForPackageCandidate(packageCandidate, packageBundle, {
      packageActive: Boolean(packageId),
    }),
  };
}

function sentenceDetail(bundle, maps, sentenceId) {
  const sentence = maps.sentencesById.get(sentenceId);
  if (!sentence) return null;
  const word = maps.wordsBySlug.get(sentence.wordSlug) || null;
  return {
    ...compactSentence(sentence),
    word: word ? {
      slug: word.slug,
      word: word.word,
      family: word.family,
      spellingPool: word.spellingPool,
      coverageTier: word.coverageTier,
    } : null,
  };
}

export function buildSpellingContentSentenceDetail({
  publishedContent,
  packageContent = null,
  packageCandidate = null,
  packageRecord = null,
  packageId = '',
  releaseInfo = {},
  sentenceId = '',
} = {}) {
  const safeSentenceId = asString(sentenceId);
  const currentBundle = normaliseSpellingContentBundle(publishedContent);
  const packageBundle = packageContent ? normaliseSpellingContentBundle(packageContent) : null;
  const currentMaps = draftMaps(currentBundle);
  const packageMaps = packageBundle ? draftMaps(packageBundle) : null;
  const current = sentenceDetail(currentBundle, currentMaps, safeSentenceId);
  const packageValue = packageBundle ? sentenceDetail(packageBundle, packageMaps, safeSentenceId) : null;
  return {
    type: 'sentence',
    sentenceId: safeSentenceId,
    found: Boolean(current || packageValue),
    release: releaseEnvelope(releaseInfo),
    packageDraft: packageDraftEnvelope({
      packageId,
      packageRecord,
      packageCandidate,
      packageContent,
    }),
    draftState: packageBundle
      ? packageDraftState(current, packageValue)
      : 'unchanged',
    current,
    packageValue,
    validationState: validationStateForPackageCandidate(packageCandidate, packageBundle, {
      packageActive: Boolean(packageId),
    }),
  };
}
