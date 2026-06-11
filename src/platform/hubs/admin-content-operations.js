const PACKAGE_STATE_LABELS = Object.freeze({
  draft: 'Draft',
  ready_for_approval: 'Ready for approval',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  blocked: 'Blocked',
  reverted: 'Reverted',
  superseded: 'Superseded',
});

const PACKAGE_STATE_CHIP_CLASS = Object.freeze({
  draft: '',
  ready_for_approval: 'warn',
  approved: 'good',
  published: 'good',
  rejected: 'bad',
  blocked: 'bad',
  reverted: 'warn',
  superseded: '',
});

export const CONTENT_OPERATION_LANES = Object.freeze([
  {
    key: 'blocked',
    label: 'Blocked',
    emptyLabel: 'No blocked packages',
    chipClass: 'bad',
  },
  {
    key: 'readyForApproval',
    label: 'Ready for approval',
    emptyLabel: 'Nothing waiting for approval',
    chipClass: 'warn',
  },
  {
    key: 'approvedPendingPublish',
    label: 'Approved pending publish',
    emptyLabel: 'Nothing approved for publish',
    chipClass: 'good',
  },
  {
    key: 'drafts',
    label: 'Open drafts',
    emptyLabel: 'No open draft packages',
    chipClass: '',
  },
]);

export const CONTENT_OPERATION_DETAIL_TABS = Object.freeze([
  { key: 'spelling', label: 'Spelling' },
  { key: 'audio', label: 'Audio' },
  { key: 'poolsRewards', label: 'Pools & Rewards' },
  { key: 'monstersAssets', label: 'Monsters & Assets' },
  { key: 'heroCodex', label: 'Hero / Codex' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'audit', label: 'Audit' },
]);

const BLOCKER_SECTION_KEYS = Object.freeze([
  'validation',
  'conflicts',
  'audio',
  'assets',
  'rewards',
  'visibility',
  'exposure',
  'publishReadiness',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value ? value : fallback;
}

function asNullableString(value) {
  return typeof value === 'string' && value ? value : null;
}

function asTs(value) {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normaliseBlockerSection(section = null) {
  const safe = isPlainObject(section) ? section : {};
  const blockers = asArray(safe.blockers);
  const warnings = asArray(safe.warnings);
  const errors = asArray(safe.errors);
  const validationErrors = Number(safe.errorCount ?? errors.length) || 0;
  const conflictCount = Number(safe.count) || 0;
  const count = blockers.length + validationErrors + conflictCount;
  return {
    status: asString(safe.status, 'not_run'),
    count,
    blockers,
    warnings,
    errors,
    errorCount: validationErrors,
    warningCount: Number(safe.warningCount ?? warnings.length) || 0,
    items: asArray(safe.items),
  };
}

export function normaliseContentOperationBlockers(blockers = null) {
  const safe = isPlainObject(blockers) ? blockers : {};
  const sections = Object.fromEntries(
    BLOCKER_SECTION_KEYS.map((key) => [key, normaliseBlockerSection(safe[key])]),
  );
  const blockingSections = BLOCKER_SECTION_KEYS.filter((key) => sections[key].count > 0);
  const warningSections = BLOCKER_SECTION_KEYS.filter((key) => (
    sections[key].warningCount > 0 || sections[key].warnings.length > 0
  ));
  return {
    ...sections,
    blockingSections,
    warningSections,
    blockerCount: blockingSections.length,
    warningCount: warningSections.length,
  };
}

export function packageStateLabel(state) {
  return PACKAGE_STATE_LABELS[state] || 'Unknown';
}

export function packageStateChipClass(state) {
  return PACKAGE_STATE_CHIP_CLASS[state] || '';
}

export function normaliseContentOperationActor(actor = null) {
  const safe = isPlainObject(actor) ? actor : {};
  const capabilities = isPlainObject(safe.capabilities) ? safe.capabilities : {};
  return {
    accountId: asNullableString(safe.accountId),
    platformRole: asString(safe.platformRole, 'parent'),
    capabilities: { ...capabilities },
  };
}

export function normaliseContentOperationCandidate(entry = null) {
  const safe = isPlainObject(entry) ? entry : {};
  const validation = normaliseBlockerSection(safe.validation);
  if (!safe.validation?.status && typeof safe.validation?.ok === 'boolean') {
    validation.status = safe.validation.ok ? 'passed' : 'blocked';
  }
  return {
    candidateId: asString(safe.candidateId),
    packageId: asString(safe.packageId),
    baseReleaseId: asNullableString(safe.baseReleaseId),
    currentReleaseId: asNullableString(safe.currentReleaseId),
    operationsHash: asString(safe.operationsHash),
    candidateHash: asString(safe.candidateHash),
    validation,
    blockers: normaliseContentOperationBlockers(safe.blockers),
    conflicts: asArray(safe.conflicts),
    createdAt: asTs(safe.createdAt),
  };
}

export function normaliseContentOperationPackage(entry = null) {
  const safe = isPlainObject(entry) ? entry : {};
  const state = asString(safe.state, 'draft');
  const operations = asArray(safe.operations);
  const explicitOperationCount = Number(safe.operationCount);
  const hasExplicitOperationCount = safe.operationCount !== null && safe.operationCount !== undefined;
  const operationCount = hasExplicitOperationCount && Number.isFinite(explicitOperationCount) && explicitOperationCount >= 0
    ? Math.floor(explicitOperationCount)
    : (operations.length ? operations.length : null);
  return {
    packageId: asString(safe.packageId),
    subjectId: asString(safe.subjectId, 'spelling'),
    templateId: asString(safe.templateId, 'general'),
    title: asString(safe.title, 'Untitled package'),
    description: asString(safe.description),
    baseReleaseId: asNullableString(safe.baseReleaseId),
    baseReleaseHash: asNullableString(safe.baseReleaseHash),
    state,
    stateLabel: packageStateLabel(state),
    chipClass: packageStateChipClass(state),
    createdByAccountId: asNullableString(safe.createdByAccountId),
    updatedByAccountId: asNullableString(safe.updatedByAccountId),
    createdAt: asTs(safe.createdAt),
    updatedAt: asTs(safe.updatedAt),
    approvedAt: asTs(safe.approvedAt),
    publishedAt: asTs(safe.publishedAt),
    supersededByPackageId: asNullableString(safe.supersededByPackageId),
    operationCount,
    operations,
    latestCandidate: safe.latestCandidate ? normaliseContentOperationCandidate(safe.latestCandidate) : null,
    blockers: normaliseContentOperationBlockers(safe.blockers),
  };
}

export function normaliseContentOperationRelease(entry = null) {
  const safe = isPlainObject(entry) ? entry : {};
  return {
    releaseId: asString(safe.releaseId),
    subjectId: asString(safe.subjectId, 'spelling'),
    status: asString(safe.status, 'unknown'),
    snapshotHash: asString(safe.snapshotHash),
    baseReleaseId: asNullableString(safe.baseReleaseId),
    packageId: asNullableString(safe.packageId),
    publishedAt: asTs(safe.publishedAt),
    publishedByAccountId: asNullableString(safe.publishedByAccountId),
    rollbackOfReleaseId: asNullableString(safe.rollbackOfReleaseId),
    proof: safe.proof ?? null,
    createdAt: asTs(safe.createdAt),
  };
}

function normaliseLanePackages(lanes, key) {
  return asArray(lanes?.[key]).map(normaliseContentOperationPackage);
}

export function normaliseContentOperationsOverview(payload = null) {
  const overview = isPlainObject(payload?.overview) ? payload.overview : payload;
  const safe = isPlainObject(overview) ? overview : {};
  const lanes = isPlainObject(safe.lanes) ? safe.lanes : {};
  const normalisedLanes = Object.fromEntries(
    CONTENT_OPERATION_LANES.map((lane) => [lane.key, normaliseLanePackages(lanes, lane.key)]),
  );
  const latestRelease = safe.latestRelease ? normaliseContentOperationRelease(safe.latestRelease) : null;
  const recentReleases = asArray(lanes.recentReleases).map(normaliseContentOperationRelease);
  const packageCounts = isPlainObject(safe.packageCounts) ? { ...safe.packageCounts } : {};
  const actor = normaliseContentOperationActor(safe.actor || payload?.actor);
  const laneCounts = Object.fromEntries(
    CONTENT_OPERATION_LANES.map((lane) => [lane.key, normalisedLanes[lane.key].length]),
  );
  return {
    subjectId: asString(safe.subjectId, 'spelling'),
    latestRelease,
    packageCounts,
    lanes: normalisedLanes,
    laneCounts,
    recentReleases,
    actor,
    sections: asArray(safe.sections),
    openPackageCount: CONTENT_OPERATION_LANES
      .reduce((sum, lane) => sum + normalisedLanes[lane.key].length, 0),
  };
}

export function normaliseContentOperationsPackageList(payload = null) {
  const list = Array.isArray(payload) ? payload : payload?.packages;
  return asArray(list).map(normaliseContentOperationPackage);
}

export function normaliseContentOperationsReleaseList(payload = null) {
  const list = Array.isArray(payload) ? payload : payload?.releases;
  return asArray(list).map(normaliseContentOperationRelease);
}

export function normaliseContentOperationsPackageDetail(payload = null) {
  const safe = isPlainObject(payload) ? payload : {};
  const contentPackage = safe.package || (safe.packageId ? safe : null);
  return {
    package: contentPackage ? normaliseContentOperationPackage(contentPackage) : null,
    events: asArray(safe.events),
    actor: normaliseContentOperationActor(safe.actor),
  };
}

function normaliseAudioReadiness(value = null) {
  const safe = isPlainObject(value) ? value : {};
  return {
    status: asString(safe.status, 'not_scanned'),
    profiles: asArray(safe.profiles),
    wordProfiles: asArray(safe.wordProfiles),
    sentenceProfiles: asArray(safe.sentenceProfiles),
    wordAudioRequired: Number(safe.wordAudioRequired) || 0,
    sentenceAudioRequired: Number(safe.sentenceAudioRequired) || 0,
    totalRequired: Number(safe.totalRequired) || 0,
  };
}

function normaliseRewardImpact(value = null) {
  const safe = isPlainObject(value) ? value : {};
  return {
    status: asString(safe.status, 'not_mapped'),
    spellingPool: asString(safe.spellingPool, 'core'),
    coverageTier: asString(safe.coverageTier),
    familySize: Number(safe.familySize) || 0,
    wordListId: asString(safe.wordListId),
    monsterBinding: isPlainObject(safe.monsterBinding) ? { ...safe.monsterBinding } : null,
  };
}

function normaliseSpellingBrowseWord(row = null) {
  const safe = isPlainObject(row) ? row : {};
  return {
    slug: asString(safe.slug),
    word: asString(safe.word),
    family: asString(safe.family),
    listId: asString(safe.listId),
    listTitle: asString(safe.listTitle),
    spellingPool: asString(safe.spellingPool, 'core'),
    coverageTier: asString(safe.coverageTier),
    yearGroups: asArray(safe.yearGroups),
    tags: asArray(safe.tags),
    patternIds: asArray(safe.patternIds),
    acceptedCount: Number(safe.acceptedCount) || 0,
    sentenceCount: Number(safe.sentenceCount) || 0,
    variantCount: Number(safe.variantCount) || 0,
    variantSentenceCount: Number(safe.variantSentenceCount) || 0,
    variantWords: asArray(safe.variantWords),
    variantAccepted: asArray(safe.variantAccepted),
    familySize: Number(safe.familySize) || 0,
    draftState: asString(safe.draftState, 'unchanged'),
    validationState: normaliseBlockerSection(safe.validationState),
    hasCurrent: safe.hasCurrent !== false,
    hasPackageDraft: Boolean(safe.hasPackageDraft),
    audioReadiness: normaliseAudioReadiness(safe.audioReadiness),
    rewardImpact: normaliseRewardImpact(safe.rewardImpact),
  };
}

function normaliseSpellingWordList(row = null) {
  const safe = isPlainObject(row) ? row : {};
  return {
    id: asString(safe.id),
    title: asString(safe.title),
    spellingPool: asString(safe.spellingPool, 'core'),
    coverageTier: asString(safe.coverageTier),
    yearGroups: asArray(safe.yearGroups),
    wordCount: Number(safe.wordCount) || 0,
    draftState: asString(safe.draftState, 'unchanged'),
  };
}

function normaliseSpellingPoolSummary(row = null) {
  const safe = isPlainObject(row) ? row : {};
  return {
    pool: asString(safe.pool, 'core'),
    wordCount: Number(safe.wordCount) || 0,
    sentenceCount: Number(safe.sentenceCount) || 0,
    variantCount: Number(safe.variantCount) || 0,
    draftStateCounts: isPlainObject(safe.draftStateCounts) ? { ...safe.draftStateCounts } : {},
  };
}

function normaliseSpellingPackageDraft(value = null) {
  const safe = isPlainObject(value) ? value : {};
  return {
    active: Boolean(safe.active),
    status: asString(safe.status, 'inactive'),
    packageId: asString(safe.packageId),
    packageTitle: asString(safe.packageTitle),
    packageState: asString(safe.packageState),
    candidateId: asString(safe.candidateId),
    candidateHash: asString(safe.candidateHash),
    staleReasons: asArray(safe.staleReasons),
    latestReleaseId: asString(safe.latestReleaseId),
    expectedOperationsHash: asString(safe.expectedOperationsHash),
    validation: normaliseBlockerSection(safe.validation),
  };
}

export function normaliseContentOperationsSpellingBrowse(payload = null) {
  const browse = isPlainObject(payload?.browse) ? payload.browse : payload;
  const safe = isPlainObject(browse) ? browse : {};
  const filters = isPlainObject(safe.filters) ? safe.filters : {};
  const totals = isPlainObject(safe.totals) ? safe.totals : {};
  const release = isPlainObject(safe.release) ? safe.release : {};
  return {
    subjectId: asString(safe.subjectId, 'spelling'),
    release: {
      releaseId: asString(release.releaseId),
      snapshotHash: asString(release.snapshotHash),
      publishedAt: asTs(release.publishedAt),
      source: asString(release.source, 'seeded_fallback'),
    },
    packageDraft: normaliseSpellingPackageDraft(safe.packageDraft),
    filters: {
      query: asString(filters.query),
      pool: asString(filters.pool, 'all'),
      listId: asString(filters.listId),
      limit: Number(filters.limit) || 75,
    },
    totals: {
      words: Number(totals.words) || 0,
      displayedWords: Number(totals.displayedWords) || 0,
      matchedWords: Number(totals.matchedWords) || 0,
      wordLists: Number(totals.wordLists) || 0,
      sentences: Number(totals.sentences) || 0,
      variants: Number(totals.variants) || 0,
      families: Number(totals.families) || 0,
    },
    draftStateCounts: isPlainObject(safe.draftStateCounts) ? { ...safe.draftStateCounts } : {},
    pools: asArray(safe.pools).map(normaliseSpellingPoolSummary),
    wordLists: asArray(safe.wordLists).map(normaliseSpellingWordList),
    words: asArray(safe.words).map(normaliseSpellingBrowseWord),
    actor: normaliseContentOperationActor(payload?.actor),
  };
}

function normaliseSpellingSentence(sentence = null) {
  const safe = isPlainObject(sentence) ? sentence : {};
  return {
    id: asString(safe.id),
    wordSlug: asString(safe.wordSlug),
    text: asString(safe.text),
    variantLabel: asString(safe.variantLabel),
    tags: asArray(safe.tags),
    word: isPlainObject(safe.word) ? { ...safe.word } : null,
  };
}

function normaliseSpellingSentenceValue(sentence = null) {
  return isPlainObject(sentence) ? normaliseSpellingSentence(sentence) : null;
}

function normaliseSpellingWordDetailValue(value = null) {
  const safe = isPlainObject(value) ? value : null;
  if (!safe) return null;
  return {
    slug: asString(safe.slug),
    word: asString(safe.word),
    family: asString(safe.family),
    list: isPlainObject(safe.list) ? normaliseSpellingWordList(safe.list) : null,
    spellingPool: asString(safe.spellingPool, 'core'),
    coverageTier: asString(safe.coverageTier),
    yearGroups: asArray(safe.yearGroups),
    tags: asArray(safe.tags),
    patternIds: asArray(safe.patternIds),
    accepted: asArray(safe.accepted),
    explanation: asString(safe.explanation),
    sentenceEntryIds: asArray(safe.sentenceEntryIds),
    sentences: asArray(safe.sentences).map(normaliseSpellingSentence),
    variants: asArray(safe.variants),
    familyMembers: asArray(safe.familyMembers),
    audioReadiness: normaliseAudioReadiness(safe.audioReadiness),
    rewardImpact: normaliseRewardImpact(safe.rewardImpact),
  };
}

export function normaliseContentOperationsSpellingItemDetail(payload = null) {
  const detail = isPlainObject(payload?.detail) ? payload.detail : payload;
  const safe = isPlainObject(detail) ? detail : {};
  const release = isPlainObject(safe.release) ? safe.release : {};
  return {
    type: asString(safe.type),
    slug: asString(safe.slug),
    sentenceId: asString(safe.sentenceId),
    found: Boolean(safe.found),
    draftState: asString(safe.draftState, 'unchanged'),
    release: {
      releaseId: asString(release.releaseId),
      snapshotHash: asString(release.snapshotHash),
      publishedAt: asTs(release.publishedAt),
      source: asString(release.source, 'seeded_fallback'),
    },
    packageDraft: normaliseSpellingPackageDraft(safe.packageDraft),
    validationState: normaliseBlockerSection(safe.validationState),
    current: safe.type === 'sentence'
      ? normaliseSpellingSentenceValue(safe.current)
      : normaliseSpellingWordDetailValue(safe.current),
    packageValue: safe.type === 'sentence'
      ? normaliseSpellingSentenceValue(safe.packageValue)
      : normaliseSpellingWordDetailValue(safe.packageValue),
    actor: normaliseContentOperationActor(payload?.actor),
  };
}
