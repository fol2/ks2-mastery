import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import { formatTimestamp } from './hub-utils.js';
import {
  CONTENT_OPERATION_DETAIL_TABS,
  CONTENT_OPERATION_LANES,
  normaliseContentOperationAudioScan,
  normaliseContentOperationCandidate,
  normaliseContentOperationPackage,
  normaliseContentOperationsOverview,
  normaliseContentOperationsPackageDetail,
  normaliseContentOperationsPackageList,
  normaliseContentOperationsReleaseList,
  normaliseContentOperationsSpellingBrowse,
  normaliseContentOperationsSpellingItemDetail,
} from '../../platform/hubs/admin-content-operations.js';
import {
  buildSpellingPoolDeleteOrRetireOperation,
  buildSpellingPoolUpsertOperation,
  buildSpellingHeroExposureUpsertOperation,
  buildSpellingRewardTrackDeleteOrRetireOperation,
  buildSpellingRewardTrackUpsertOperation,
  buildSpellingSentenceDeleteOrRetireOperation,
  buildSpellingSentenceUpsertOperation,
  buildSpellingWordListDeleteOrRetireOperation,
  buildSpellingWordListUpsertOperation,
  buildSpellingWordDeleteOrRetireOperation,
  buildSpellingWordUpsertOperation,
} from '../../subjects/spelling/content/package-operations.js';
import {
  HERO_EXPOSURE_STATES,
  HERO_EXPOSURE_SURFACES,
  REWARD_TRACK_PROGRESS_MODES,
  REWARD_TRACK_THRESHOLD_TEMPLATES,
  SPELLING_REWARD_TRACK_MONSTER_IDS,
  heroExposureStatus,
} from '../../platform/game/reward-track-config.js';

const CENTRE_TABS = Object.freeze([
  { key: 'overview', label: 'Overview' },
  { key: 'packages', label: 'Packages' },
  { key: 'spelling', label: 'Spelling' },
  { key: 'audio', label: 'Audio' },
  { key: 'poolsRewards', label: 'Pools & Rewards' },
  { key: 'monstersAssets', label: 'Monsters & Assets' },
  { key: 'heroCodex', label: 'Hero / Codex' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'releases', label: 'Release history' },
]);

const DETAIL_TAB_BLOCKER_SECTIONS = Object.freeze({
  spelling: 'validation',
  audio: 'audio',
  poolsRewards: 'rewards',
  monstersAssets: 'assets',
  heroCodex: 'exposure',
});

const CONTENT_OPERATION_CAPABILITIES = Object.freeze({
  EDIT: 'content_operations.edit',
  APPROVE: 'content_operations.approve',
  PUBLISH: 'content_operations.publish',
});

const SPELLING_OPERATION_NOUNS = Object.freeze({
  'spelling.sentenceEntry': 'Sentence',
  'spelling.wordList': 'Word list',
  'spelling.pool': 'Pool',
  'spelling.rewardTrack': 'Reward track',
  'spelling.heroExposure': 'Hero / Codex',
});

function actorCan(actor, capability) {
  return Boolean(actor?.capabilities?.[capability]);
}

function contentOperationMutation(action, packageId) {
  const safeAction = String(action || 'mutation').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const safePackageId = String(packageId || 'package').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  return {
    requestId: `content-ops-${safeAction}-${safePackageId}-${Date.now()}`,
  };
}

function csvValue(values) {
  return Array.isArray(values) ? values.filter(Boolean).join(', ') : '';
}

function csvNumberValue(values) {
  return Array.isArray(values)
    ? values.filter((entry) => Number.isFinite(Number(entry))).join(', ')
    : '';
}

function csvNumberList(value) {
  return thresholdOverrideParse(value).values;
}

function csvList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function thresholdOverrideParse(value) {
  const values = [];
  const invalidTokens = [];
  String(value || '')
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const numeric = Number(entry);
      if (Number.isFinite(numeric)) {
        values.push(numeric);
      } else {
        invalidTokens.push(entry);
      }
    });
  return { values, invalidTokens };
}

function strictCsvNumberList(value) {
  const parsed = thresholdOverrideParse(value);
  if (parsed.invalidTokens.length) {
    throw new TypeError(`Threshold overrides must be numbers; invalid value "${parsed.invalidTokens[0]}".`);
  }
  return parsed.values;
}

function provenanceField(provenance, key) {
  return provenance && typeof provenance === 'object' ? String(provenance[key] || '') : '';
}

function spellingPoolOptionId(pool) {
  return String(pool?.id || pool?.pool || '').trim();
}

function spellingPoolOptionLabel(pool) {
  const id = spellingPoolOptionId(pool);
  if (pool?.title) return pool.title;
  if (id === 'core') return 'Core';
  if (id === 'extra') return 'Extra';
  return id || 'Pool';
}

function spellingPoolOptions(pools = []) {
  const source = Array.isArray(pools) && pools.length
    ? pools
    : [{ id: 'core', title: 'Core' }, { id: 'extra', title: 'Extra' }];
  const seen = new Set();
  const output = [];
  for (const pool of source) {
    const id = spellingPoolOptionId(pool);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push({ id, label: spellingPoolOptionLabel(pool) });
  }
  return output;
}

function emptyWordEditorForm(wordLists = [], selectedRow = null) {
  const preferredList = selectedRow?.listId
    ? wordLists.find((entry) => entry.id === selectedRow.listId)
    : wordLists[0];
  const spellingPool = preferredList?.spellingPool || selectedRow?.spellingPool || 'core';
  return {
    slug: '',
    word: '',
    family: selectedRow?.family || '',
    listId: preferredList?.id || selectedRow?.listId || '',
    spellingPool,
    coverageTier: preferredList?.coverageTier || selectedRow?.coverageTier || (spellingPool === 'extra' ? 'enrichment-extra' : 'statutory-core'),
    yearGroups: spellingPool === 'core' ? 'Y3, Y4' : '',
    tags: '',
    patternIds: '',
    accepted: '',
    explanation: '',
    sentenceEntryIds: '',
    sourceNote: '',
    provenanceSource: '',
    provenanceNote: '',
    progressKey: '',
    variants: [],
    retirementReason: '',
  };
}

function wordEditorFormFromWord(word, selectedRow = null, wordLists = []) {
  if (!word) return emptyWordEditorForm(wordLists, selectedRow);
  const list = word.list || wordLists.find((entry) => entry.id === word.listId) || null;
  return {
    slug: word.slug || selectedRow?.slug || '',
    word: word.word || selectedRow?.word || '',
    family: word.family || selectedRow?.family || '',
    listId: word.listId || list?.id || selectedRow?.listId || '',
    spellingPool: word.spellingPool || list?.spellingPool || selectedRow?.spellingPool || 'core',
    coverageTier: word.coverageTier || list?.coverageTier || selectedRow?.coverageTier || '',
    yearGroups: csvValue(word.yearGroups),
    tags: csvValue(word.tags),
    patternIds: csvValue(word.patternIds),
    accepted: csvValue(word.accepted),
    explanation: word.explanation || '',
    sentenceEntryIds: csvValue(word.sentenceEntryIds),
    sourceNote: word.sourceNote || '',
    provenanceSource: provenanceField(word.provenance, 'source'),
    provenanceNote: provenanceField(word.provenance, 'note'),
    progressKey: word.progressKey || word.slug || '',
    variants: (Array.isArray(word.variants) ? word.variants : []).map((variant) => ({
      word: variant.word || '',
      accepted: csvValue(variant.accepted),
      explanation: variant.explanation || '',
      sentenceEntryIds: csvValue(variant.sentenceEntryIds),
      sourceNote: variant.sourceNote || '',
      provenanceSource: provenanceField(variant.provenance, 'source'),
      provenanceNote: provenanceField(variant.provenance, 'note'),
      progressKey: variant.progressKey || variant.word || '',
    })),
    retirementReason: '',
  };
}

function operationInputFromWordForm(form) {
  return {
    slug: form.slug,
    word: form.word,
    family: form.family,
    listId: form.listId,
    spellingPool: form.spellingPool,
    coverageTier: form.coverageTier,
    yearGroups: form.yearGroups,
    tags: form.tags,
    patternIds: form.patternIds,
    accepted: form.accepted,
    explanation: form.explanation,
    sentenceEntryIds: form.sentenceEntryIds,
    sourceNote: form.sourceNote,
    provenance: {
      source: form.provenanceSource,
      note: form.provenanceNote,
    },
    progressKey: form.progressKey,
    variants: (Array.isArray(form.variants) ? form.variants : []).map((variant) => ({
      word: variant.word,
      accepted: variant.accepted,
      explanation: variant.explanation,
      sentenceEntryIds: variant.sentenceEntryIds,
      sourceNote: variant.sourceNote,
      provenance: {
        source: variant.provenanceSource,
        note: variant.provenanceNote,
      },
      progressKey: variant.progressKey,
    })),
  };
}

function emptySentenceEditorForm(selectedRow = null) {
  return {
    id: '',
    wordSlug: selectedRow?.slug || '',
    text: '',
    variantLabel: 'default',
    tags: '',
    sourceNote: '',
    provenanceSource: '',
    provenanceNote: '',
    retirementReason: '',
  };
}

function sentenceEditorFormFromSentence(sentence, selectedRow = null) {
  if (!sentence) return emptySentenceEditorForm(selectedRow);
  return {
    id: sentence.id || '',
    wordSlug: sentence.wordSlug || selectedRow?.slug || '',
    text: sentence.text || '',
    variantLabel: sentence.variantLabel || 'default',
    tags: csvValue(sentence.tags),
    sourceNote: sentence.sourceNote || '',
    provenanceSource: provenanceField(sentence.provenance, 'source'),
    provenanceNote: provenanceField(sentence.provenance, 'note'),
    retirementReason: '',
  };
}

function operationInputFromSentenceForm(form) {
  return {
    id: form.id,
    wordSlug: form.wordSlug,
    text: form.text,
    variantLabel: form.variantLabel,
    tags: form.tags,
    sourceNote: form.sourceNote,
    provenance: {
      source: form.provenanceSource,
      note: form.provenanceNote,
    },
  };
}

function emptyWordListEditorForm(wordLists = [], selectedRow = null) {
  const preferredList = selectedRow?.listId
    ? wordLists.find((entry) => entry.id === selectedRow.listId)
    : wordLists[0];
  const spellingPool = preferredList?.spellingPool || selectedRow?.spellingPool || 'core';
  return {
    id: '',
    title: '',
    spellingPool,
    coverageTier: preferredList?.coverageTier || selectedRow?.coverageTier || (spellingPool === 'extra' ? 'enrichment-extra' : 'statutory-core'),
    yearGroups: spellingPool === 'core' ? 'Y3, Y4' : '',
    tags: '',
    wordSlugs: selectedRow?.slug || '',
    sourceNote: '',
    provenanceSource: '',
    provenanceNote: '',
    retirementReason: '',
  };
}

function wordListEditorFormFromList(list, selectedRow = null, wordLists = []) {
  if (!list) return emptyWordListEditorForm(wordLists, selectedRow);
  return {
    id: list.id || '',
    title: list.title || '',
    spellingPool: list.spellingPool || selectedRow?.spellingPool || 'core',
    coverageTier: list.coverageTier || selectedRow?.coverageTier || '',
    yearGroups: csvValue(list.yearGroups),
    tags: csvValue(list.tags),
    wordSlugs: csvValue(list.wordSlugs),
    sourceNote: list.sourceNote || '',
    provenanceSource: provenanceField(list.provenance, 'source'),
    provenanceNote: provenanceField(list.provenance, 'note'),
    retirementReason: '',
  };
}

function operationInputFromWordListForm(form) {
  return {
    id: form.id,
    title: form.title,
    spellingPool: form.spellingPool,
    coverageTier: form.coverageTier,
    yearGroups: form.yearGroups,
    tags: form.tags,
    wordSlugs: form.wordSlugs,
    sourceNote: form.sourceNote,
    provenance: {
      source: form.provenanceSource,
      note: form.provenanceNote,
    },
  };
}

function emptyPoolEditorForm(pools = [], selectedRow = null) {
  const preferredPool = selectedRow?.spellingPool
    ? pools.find((entry) => entry.id === selectedRow.spellingPool || entry.pool === selectedRow.spellingPool)
    : pools[0];
  const poolId = preferredPool?.id || preferredPool?.pool || selectedRow?.spellingPool || 'extension';
  return {
    id: '',
    title: '',
    type: poolId === 'extra' ? 'enrichment' : (poolId === 'core' ? 'statutory' : 'extension'),
    visibilityState: 'hidden',
    scheduledAt: '',
    rolloutFlag: '',
    rewardTrackIds: '',
    tags: '',
    sourceNote: '',
    provenanceSource: '',
    provenanceNote: '',
    noRewardExceptionApproved: false,
    noRewardExceptionReason: '',
    retirementReason: '',
  };
}

function poolEditorFormFromPool(pool, selectedRow = null, pools = []) {
  if (!pool) return emptyPoolEditorForm(pools, selectedRow);
  return {
    id: pool.id || pool.pool || '',
    title: pool.title || '',
    type: pool.type || 'custom',
    visibilityState: pool.visibility?.state || 'hidden',
    scheduledAt: pool.visibility?.scheduledAt ? String(pool.visibility.scheduledAt) : '',
    rolloutFlag: pool.visibility?.rolloutFlag || '',
    rewardTrackIds: csvValue(pool.rewardTrackIds),
    tags: csvValue(pool.tags),
    sourceNote: pool.sourceNote || '',
    provenanceSource: provenanceField(pool.provenance, 'source'),
    provenanceNote: provenanceField(pool.provenance, 'note'),
    noRewardExceptionApproved: pool.noRewardException?.approved === true,
    noRewardExceptionReason: pool.noRewardException?.reason || '',
    retirementReason: '',
  };
}

function operationInputFromPoolForm(form) {
  return {
    id: form.id,
    title: form.title,
    type: form.type,
    rewardTrackIds: form.rewardTrackIds,
    visibility: {
      state: form.visibilityState,
      scheduledAt: form.scheduledAt,
      rolloutFlag: form.rolloutFlag,
    },
    tags: form.tags,
    sourceNote: form.sourceNote,
    provenance: {
      source: form.provenanceSource,
      note: form.provenanceNote,
    },
    noRewardException: {
      approved: Boolean(form.noRewardExceptionApproved),
      reason: form.noRewardExceptionReason,
    },
  };
}

function rewardTrackTemplateOptions() {
  return Object.values(REWARD_TRACK_THRESHOLD_TEMPLATES);
}

function thresholdTemplateLabel(templateId) {
  return REWARD_TRACK_THRESHOLD_TEMPLATES[templateId]?.label || templateId || 'Template';
}

function heroExposureStateLabel(state) {
  if (state === 'rollout-flagged') return 'Rollout flagged';
  if (state === 'scheduled') return 'Scheduled';
  if (state === 'hidden') return 'Hidden';
  return 'Visible';
}

function heroExposureSurfaceLabel(surface) {
  if (surface === 'heroCamp') return 'Hero Camp';
  if (surface === 'heroQuest') return 'Hero Quest';
  if (surface === 'subjectSetup') return 'Subject setup';
  if (surface === 'codex') return 'Codex';
  return surface;
}

function heroExposureChipClass(exposure) {
  const state = exposure?.state || 'visible';
  if (state === 'hidden') return 'warn';
  if (state === 'scheduled' || state === 'rollout-flagged') return '';
  return 'good';
}

function thresholdsForRewardTrackForm(form) {
  const overrides = csvNumberList(form.thresholdOverrides);
  if (overrides.length) return overrides;
  const template = REWARD_TRACK_THRESHOLD_TEMPLATES[form.thresholdTemplate]
    || REWARD_TRACK_THRESHOLD_TEMPLATES.direct;
  return Array.isArray(template?.thresholds) ? [...template.thresholds] : [];
}

function poolWordCountValue(pool) {
  return Number(pool?.activeWordCount ?? pool?.wordCount ?? pool?.totalWordCount) || 0;
}

function poolWordCountLookup(pools = []) {
  return Object.fromEntries((Array.isArray(pools) ? pools : [])
    .map((pool) => [spellingPoolOptionId(pool), poolWordCountValue(pool)])
    .filter(([id]) => Boolean(id)));
}

function learnerVisiblePoolIds(pools = []) {
  return new Set((Array.isArray(pools) ? pools : [])
    .filter((pool) => pool?.active !== false && !pool?.retired && pool?.visibility?.state === 'visible')
    .map(spellingPoolOptionId)
    .filter(Boolean));
}

function rewardTrackOptionLabel(track) {
  if (track?.labels?.title) return track.labels.title;
  if (track?.id) return track.id;
  return 'Reward track';
}

function nextRewardTrackId(poolId, monsterId, rewardTracks = []) {
  const base = `${poolId || 'pool'}-${monsterId || 'reward-track'}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'spelling-reward-track';
  const existing = new Set((Array.isArray(rewardTracks) ? rewardTracks : [])
    .map((track) => track?.id)
    .filter(Boolean));
  if (!existing.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function firstAvailableMonsterId(poolId, rewardTracks = []) {
  const used = new Set((Array.isArray(rewardTracks) ? rewardTracks : [])
    .filter((track) => track?.poolId === poolId && track?.active !== false)
    .map((track) => track.monsterId)
    .filter(Boolean));
  return SPELLING_REWARD_TRACK_MONSTER_IDS.find((monsterId) => !used.has(monsterId))
    || SPELLING_REWARD_TRACK_MONSTER_IDS[0]
    || '';
}

function emptyRewardTrackEditorForm(pools = [], selectedPool = null, rewardTracks = []) {
  const poolId = spellingPoolOptionId(selectedPool) || spellingPoolOptionId(pools[0]) || 'extra';
  const monsterId = firstAvailableMonsterId(poolId, rewardTracks);
  return {
    id: nextRewardTrackId(poolId, monsterId, rewardTracks),
    poolId,
    monsterId,
    progressionMode: 'parallel',
    thresholdTemplate: 'direct',
    thresholdOverrides: '1',
    active: true,
    progressKey: monsterId,
    sourceMonsterIds: monsterId,
    sequentialAfter: '',
    dependencyApprovalApproved: false,
    dependencyApprovalReason: '',
    heroExposureState: 'visible',
    heroExposureSurfaces: csvValue(HERO_EXPOSURE_SURFACES),
    heroExposureScheduledAt: '',
    heroExposureRolloutFlag: '',
    heroExposurePreviewAllowed: true,
    labelsTitle: '',
    labelsShortLabel: '',
    labelsDescription: '',
    sourceNote: '',
    retirementReason: '',
    sortIndex: String(Array.isArray(rewardTracks) ? rewardTracks.length : 0),
  };
}

function rewardTrackEditorFormFromTrack(track, selectedPool = null, pools = [], rewardTracks = []) {
  if (!track) return emptyRewardTrackEditorForm(pools, selectedPool, rewardTracks);
  const exposure = track.heroExposure || {};
  const exposureSurfaces = Array.isArray(exposure.surfaces) && exposure.surfaces.length
    ? exposure.surfaces
    : HERO_EXPOSURE_SURFACES;
  return {
    id: track.id || '',
    poolId: track.poolId || spellingPoolOptionId(selectedPool) || '',
    monsterId: track.monsterId || '',
    progressionMode: track.progressionMode || 'parallel',
    thresholdTemplate: track.thresholdTemplate || 'direct',
    thresholdOverrides: csvNumberValue(track.thresholdOverrides),
    active: track.active !== false,
    progressKey: track.progressKey || track.monsterId || '',
    sourceMonsterIds: csvValue(track.sourceMonsterIds),
    sequentialAfter: track.sequentialAfter || '',
    dependencyApprovalApproved: track.dependencyApproval?.approved === true,
    dependencyApprovalReason: track.dependencyApproval?.reason || '',
    heroExposureState: exposure.state || 'visible',
    heroExposureSurfaces: csvValue(exposureSurfaces),
    heroExposureScheduledAt: exposure.scheduledAt ? String(exposure.scheduledAt) : '',
    heroExposureRolloutFlag: exposure.rolloutFlag || '',
    heroExposurePreviewAllowed: exposure.previewAllowed !== false,
    labelsTitle: track.labels?.title || '',
    labelsShortLabel: track.labels?.shortLabel || '',
    labelsDescription: track.labels?.description || '',
    sourceNote: track.sourceNote || '',
    retirementReason: '',
    sortIndex: Number.isInteger(Number(track.sortIndex)) ? String(track.sortIndex) : '0',
  };
}

function heroExposureInputFromForm(form) {
  return {
    state: form.heroExposureState,
    surfaces: csvList(form.heroExposureSurfaces),
    scheduledAt: form.heroExposureScheduledAt,
    rolloutFlag: form.heroExposureRolloutFlag,
    previewAllowed: Boolean(form.heroExposurePreviewAllowed),
  };
}

function operationInputFromRewardTrackForm(form) {
  const dependencyApproval = form.dependencyApprovalApproved || form.dependencyApprovalReason
    ? {
        approved: Boolean(form.dependencyApprovalApproved),
        reason: form.dependencyApprovalReason,
      }
    : undefined;
  return {
    id: form.id,
    poolId: form.poolId,
    monsterId: form.monsterId,
    progressionMode: form.progressionMode,
    thresholdTemplate: form.thresholdTemplate,
    thresholdOverrides: strictCsvNumberList(form.thresholdOverrides),
    active: Boolean(form.active),
    progressKey: form.progressKey,
    sourceMonsterIds: form.sourceMonsterIds,
    sequentialAfter: form.sequentialAfter,
    labels: {
      title: form.labelsTitle,
      shortLabel: form.labelsShortLabel,
      description: form.labelsDescription,
    },
    heroExposure: heroExposureInputFromForm(form),
    ...(dependencyApproval ? { dependencyApproval } : {}),
    sourceNote: form.sourceNote,
    sortIndex: form.sortIndex,
  };
}

function operationInputFromHeroExposureForm(form) {
  return {
    id: form.id,
    heroExposure: heroExposureInputFromForm(form),
  };
}

function actionMessage(action) {
  if (action === 'validate') return 'Candidate validated.';
  if (action === 'resolve-conflict') return 'Conflict resolved.';
  if (action === 'approve') return 'Candidate approved.';
  if (action === 'publish') return 'Package published.';
  return 'Package action completed.';
}

function collectLanePackages(overview) {
  const seen = new Set();
  const packages = [];
  for (const lane of CONTENT_OPERATION_LANES) {
    for (const entry of overview.lanes[lane.key] || []) {
      if (!entry.packageId || seen.has(entry.packageId)) continue;
      seen.add(entry.packageId);
      packages.push(entry);
    }
  }
  return packages;
}

function initialPackageId({ packageDetail, initialActiveTab, initialSelectedPackageId }) {
  if (initialSelectedPackageId) return initialSelectedPackageId;
  if (initialActiveTab !== 'detail') return '';
  const detail = normaliseContentOperationsPackageDetail(packageDetail);
  return detail.package?.packageId || '';
}

function errorEnvelope(error, fallbackCode = 'content_operations_fetch_failed') {
  if (!error) return null;
  return {
    code: error.code || fallbackCode,
    message: error.message || 'Content operations could not be loaded.',
    at: Date.now(),
  };
}

function operationCountLabel(contentPackage, variant = 'short') {
  const rawCount = contentPackage?.operationCount;
  const count = Number(rawCount);
  if (rawCount === null || rawCount === undefined || !Number.isFinite(count)) {
    if (variant === 'table') return 'Pending';
    if (variant === 'long') return 'Operation count pending';
    return 'Pending ops';
  }
  if (variant === 'table') return String(count);
  if (variant === 'long') return `${String(count)} ${count === 1 ? 'operation' : 'operations'}`;
  return `${String(count)} ops`;
}

function blockerSectionHasSignals(section) {
  return Boolean(section && (
    section.count > 0
      || section.warningCount > 0
      || section.blockers?.length
      || section.errors?.length
      || section.warnings?.length
  ));
}

function hasAudioOrAssetSignals(contentPackage) {
  return blockerSectionHasSignals(contentPackage.blockers?.audio)
    || blockerSectionHasSignals(contentPackage.blockers?.assets);
}

function latestCandidateForPackage(contentPackage, lifecycleState) {
  if (
    lifecycleState?.candidate
    && lifecycleState.packageId === contentPackage.packageId
  ) {
    return normaliseContentOperationCandidate(lifecycleState.candidate);
  }
  return contentPackage.latestCandidate || null;
}

function candidateHasApprovalBlockers(candidate) {
  if (!candidate) return true;
  return candidate.blockers.blockingSections
    .filter((section) => section !== 'publishReadiness')
    .length > 0;
}

function formatCompactJson(value) {
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function conflictKey(conflict, index = 0) {
  return conflict?.conflictId
    || `${conflict?.entityType || 'entity'}:${conflict?.entityId || 'id'}:${conflict?.fieldPath || '$'}:${index}`;
}

function formatConflictValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseConflictEditValue(text, conflict) {
  const structured = [conflict?.packageValue, conflict?.currentValue, conflict?.baseValue]
    .some((value) => value && typeof value === 'object');
  if (!structured) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function eventDetailText(event) {
  const payload = event?.event && typeof event.event === 'object' && !Array.isArray(event.event)
    ? event.event
    : null;
  if (!payload) return '';
  const parts = [
    payload.candidateHash ? `candidate ${payload.candidateHash}` : '',
    payload.snapshotHash ? `snapshot ${payload.snapshotHash}` : '',
    payload.releaseId ? `release ${payload.releaseId}` : '',
    payload.notes ? `notes: ${payload.notes}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' - ') : formatCompactJson(payload);
}

function PackageStateChip({ contentPackage }) {
  return (
    <span className={`chip ${contentPackage.chipClass}`} data-package-state={contentPackage.state}>
      {contentPackage.stateLabel}
    </span>
  );
}

function MetricTile({ label, value, detail }) {
  return (
    <div className="content-ops-metric">
      <span className="small muted">{label}</span>
      <strong>{value}</strong>
      {detail ? <span className="small muted">{detail}</span> : null}
    </div>
  );
}

function draftStateChipClass(state) {
  if (state === 'added') return 'good';
  if (state === 'modified') return 'warn';
  if (state === 'removed') return 'bad';
  return '';
}

function draftStateLabel(state) {
  if (state === 'added') return 'Added';
  if (state === 'modified') return 'Modified';
  if (state === 'removed') return 'Removed';
  return 'Published';
}

function statusChipClass(status) {
  if (['available', 'passed', 'published', 'present'].includes(status)) return 'good';
  if (['blocked', 'stale_candidate', 'missing', 'mismatch', 'unavailable'].includes(status)) return 'bad';
  if (['candidate_required', 'not_ready', 'warning', 'warnings_only'].includes(status)) return 'warn';
  return '';
}

function statusLabel(status) {
  return String(status || 'unknown').replace(/_/g, ' ');
}

const AUDIO_STATUS_FILTERS = Object.freeze([
  { value: 'actionable', label: 'Actionable gaps' },
  { value: 'all', label: 'All states' },
  { value: 'missing', label: 'Missing' },
  { value: 'failed', label: 'Failed' },
  { value: 'stale', label: 'Stale' },
  { value: 'generated', label: 'Generated' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'override_requested', label: 'Override requested' },
  { value: 'present', label: 'Present' },
]);

function audioStatusChipClass(status) {
  if (status === 'present' || status === 'passed') return 'good';
  if (status === 'missing' || status === 'failed' || status === 'blocked') return 'bad';
  if (['stale', 'generated', 'skipped', 'override_requested', 'warning'].includes(status)) return 'warn';
  return '';
}

function filterAudioItems(items, { laneFilter, statusFilter }) {
  return items.filter((item) => {
    if (laneFilter !== 'all' && item.lane !== laneFilter) return false;
    if (statusFilter === 'actionable') return item.canGenerate;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    return true;
  });
}

function audioItemDetail(item) {
  const parts = [
    item.voiceRole ? `${item.voiceRole} voice` : '',
    item.paceId || item.speedId || '',
    item.profileId || '',
  ].filter(Boolean);
  return parts.join(' / ');
}

function audioGenerationMessage(action, payload) {
  if (action === 'scan') return 'Audio scan refreshed.';
  const summary = payload?.audio?.summary || {};
  const uploaded = Number(summary.uploaded) || 0;
  const failed = Number(summary.failed) || 0;
  const skipped = (Number(summary.skippedExisting) || 0)
    + (Number(summary.skippedPresent) || 0)
    + (Number(summary.skippedDueLimit) || 0);
  return `Audio generation finished: ${String(uploaded)} uploaded, ${String(failed)} failed, ${String(skipped)} skipped.`;
}

function audioItemSelectable(item) {
  return Boolean(item?.canGenerate || item?.canOverride);
}

function assetScanForPackage(contentPackage) {
  return contentPackage?.latestCandidate?.assetScan || null;
}

function assetManifestForPackage(contentPackage, latestRelease = null) {
  const scanManifest = assetScanForPackage(contentPackage)?.assetReferenceManifest || null;
  if (scanManifest?.references?.length) return scanManifest;
  if (latestRelease?.assetReferenceManifest?.references?.length) return latestRelease.assetReferenceManifest;
  return scanManifest || latestRelease?.assetReferenceManifest || null;
}

function assetReferenceTargetLabel(reference) {
  const target = reference?.target || {};
  return [
    target.monsterId || 'monster',
    target.branchId || 'branch',
    target.stageId ? `stage ${target.stageId}` : 'stage',
  ].join(' / ');
}

function byteSizeLabel(bytes) {
  const numeric = Number(bytes) || 0;
  if (numeric >= 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
  if (numeric >= 1024) return `${Math.round(numeric / 1024)} KB`;
  return `${String(numeric)} B`;
}

function rendererContextLabel(context) {
  return String(context || '').replace(/-/g, ' ');
}

function AssetReferencePreviewCards({ manifest }) {
  const references = Array.isArray(manifest?.references) ? manifest.references : [];
  if (!references.length) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-asset-preview-empty="true">
        No package monster image references.
      </div>
    );
  }
  return (
    <div className="content-ops-asset-preview-grid" data-content-ops-asset-preview-grid="true">
      {references.map((reference) => {
        const dimensions = reference.content?.dimensions || {};
        const contexts = Array.isArray(reference.renderer?.contexts) ? reference.renderer.contexts : [];
        const previewUrl = reference.preview?.url || '';
        const key = reference.referenceId || reference.assetUploadId || assetReferenceTargetLabel(reference);
        return (
          <article className="content-ops-package-summary content-ops-asset-preview-card" key={key} data-content-ops-asset-reference={key}>
            <span className="content-ops-package-summary-main">
              <strong>{assetReferenceTargetLabel(reference)}</strong>
              <span className="small muted">{reference.assetUploadId || 'Upload pending'}</span>
            </span>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={`${assetReferenceTargetLabel(reference)} monster asset preview`}
                loading="lazy"
                className="content-ops-asset-preview-image"
              />
            ) : (
              <div className="feedback warn admin-note-spaced" data-content-ops-asset-preview-blocked="true">
                {reference.preview?.blockedReason || 'Preview unavailable'}
              </div>
            )}
            <span className="chip-row content-ops-package-summary-meta">
              <span className={`chip ${statusChipClass(reference.validation?.status)}`}>{statusLabel(reference.validation?.status)}</span>
              <span className={`chip ${statusChipClass(reference.storage?.status)}`}>{statusLabel(reference.storage?.status)}</span>
              <span className="chip">{dimensions.width || '?'} x {dimensions.height || '?'}</span>
              <span className="chip">{byteSizeLabel(reference.content?.byteSize)}</span>
            </span>
            {contexts.length ? (
              <span className="chip-row content-ops-chip-wrap">
                {contexts.map((context) => (
                  <span className="chip" key={context}>{rendererContextLabel(context)}</span>
                ))}
              </span>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function MonsterAssetsPanel({ contentPackage, latestRelease = null, blockerSection = null }) {
  const scan = assetScanForPackage(contentPackage);
  const manifest = assetManifestForPackage(contentPackage, latestRelease);
  const status = scan?.status || manifest?.status || 'not_scanned';
  const references = Array.isArray(manifest?.references) ? manifest.references : [];
  return (
    <section className="content-ops-area-panel" data-content-ops-monster-assets-panel="true">
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Monster assets</div>
          <h5>Package image references</h5>
          <p className="small muted admin-note-spaced">
            {contentPackage?.packageId ? `Package ${contentPackage.packageId}` : `Latest release ${latestRelease?.releaseId || 'bundled fallback'}`}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className={`chip ${statusChipClass(status)}`}>{statusLabel(status)}</span>
          <span className="chip">{String(references.length)} references</span>
          {manifest?.policy?.runtimeReadable === false ? <span className="chip warn">Runtime T23</span> : null}
        </div>
      </div>
      <div className="content-ops-metric-grid">
        <MetricTile label="Uploads" value={String(scan?.uploadCount || 0)} detail={`${String(scan?.targetCount || references.length)} targets`} />
        <MetricTile label="Manifest" value={manifest?.hash || scan?.hash || 'Pending'} detail={`Schema ${String(manifest?.schemaVersion || 1)}`} />
        <MetricTile label="Rollback" value={manifest?.policy?.retention?.rollbackAvailability || 'retained'} detail="Release reference policy" />
        <MetricTile label="Derivatives" value={manifest?.policy?.responsiveDerivatives?.mode || 'source'} detail="Responsive policy" />
      </div>
      {blockerSection && contentPackage ? (
        <BlockerSummary blockers={contentPackage.blockers} sectionKey={blockerSection} />
      ) : null}
      <AssetReferencePreviewCards manifest={manifest} />
    </section>
  );
}

function CentreTabNav({ activeTab, onSelect }) {
  return (
    <div className="content-ops-tabs" role="tablist" aria-label="Content operations views">
      {CENTRE_TABS.map((tab) => (
        <button
          key={tab.key}
          className="content-ops-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key ? 'true' : 'false'}
          data-active={activeTab === tab.key ? 'true' : undefined}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DetailTabNav({ activeTab, onSelect }) {
  return (
    <div className="content-ops-detail-tabs" role="tablist" aria-label="Package detail domains">
      {CONTENT_OPERATION_DETAIL_TABS.map((tab) => (
        <button
          key={tab.key}
          className="content-ops-detail-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key ? 'true' : 'false'}
          data-active={activeTab === tab.key ? 'true' : undefined}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PackageSummary({ contentPackage, onSelect }) {
  return (
    <button
      type="button"
      className="content-ops-package-summary"
      onClick={() => onSelect(contentPackage.packageId)}
      data-package-id={contentPackage.packageId}
    >
      <span className="content-ops-package-summary-main">
        <strong>{contentPackage.title}</strong>
        <span className="small muted">{contentPackage.packageId || 'package pending'}</span>
      </span>
      <span className="chip-row content-ops-package-summary-meta">
        <PackageStateChip contentPackage={contentPackage} />
        <span className="chip">{operationCountLabel(contentPackage)}</span>
      </span>
    </button>
  );
}

function OverviewLanes({ overview, onSelectPackage }) {
  const warningPackages = collectLanePackages(overview).filter(hasAudioOrAssetSignals);
  return (
    <div className="content-ops-lanes">
      {CONTENT_OPERATION_LANES.map((lane) => {
        const packages = overview.lanes[lane.key] || [];
        return (
          <article className="content-ops-lane" key={lane.key} data-lane={lane.key}>
            <div className="content-ops-lane-header">
              <span className={`chip ${lane.chipClass}`}>{lane.label}</span>
              <strong>{packages.length}</strong>
            </div>
            <div className="content-ops-lane-body">
              {packages.length ? packages.slice(0, 4).map((contentPackage) => (
                <PackageSummary
                  key={contentPackage.packageId}
                  contentPackage={contentPackage}
                  onSelect={onSelectPackage}
                />
              )) : (
                <span className="small muted">{lane.emptyLabel}</span>
              )}
            </div>
          </article>
        );
      })}
      <article className="content-ops-lane" data-lane="audioAssetWarnings">
        <div className="content-ops-lane-header">
          <span className="chip warn">Audio / asset warnings</span>
          <strong>{warningPackages.length}</strong>
        </div>
        <div className="content-ops-lane-body">
          {warningPackages.length ? warningPackages.slice(0, 4).map((contentPackage) => (
            <PackageSummary
              key={contentPackage.packageId}
              contentPackage={contentPackage}
              onSelect={onSelectPackage}
            />
          )) : (
            <span className="small muted">No missing audio or asset warnings</span>
          )}
        </div>
      </article>
      <article className="content-ops-lane" data-lane="recentReleases">
        <div className="content-ops-lane-header">
          <span className="chip good">Recent releases</span>
          <strong>{overview.recentReleases.length}</strong>
        </div>
        <div className="content-ops-lane-body">
          {overview.recentReleases.length ? overview.recentReleases.slice(0, 4).map((release) => (
            <div className="content-ops-release-summary" key={release.releaseId}>
              <strong>{release.releaseId}</strong>
              <span className="small muted">{formatTimestamp(release.publishedAt || release.createdAt)}</span>
            </div>
          )) : (
            <span className="small muted">No recent releases</span>
          )}
        </div>
      </article>
    </div>
  );
}

function BlockerSummary({ blockers, sectionKey }) {
  const section = blockers?.[sectionKey] || null;
  if (!section) return null;
  const hasBlockers = section.count > 0 || section.blockers?.length || section.errors?.length;
  const hasWarnings = section.warningCount > 0 || section.warnings?.length;
  if (!hasBlockers && !hasWarnings) {
    return <span className="chip good">{section.status || 'Ready'}</span>;
  }
  return (
    <div className="content-ops-blocker-summary">
      <div className="chip-row content-ops-chip-wrap">
        <span className={`chip ${hasBlockers ? 'bad' : 'warn'}`}>{section.status || 'Review'}</span>
        {hasBlockers ? <span className="chip bad">{String(section.count)} blockers</span> : null}
        {hasWarnings ? <span className="chip warn">{String(section.warningCount || section.warnings.length)} warnings</span> : null}
      </div>
      {section.blockers?.length ? (
        <ul className="content-ops-operation-list">
          {section.blockers.slice(0, 3).map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      ) : null}
      {section.warnings?.length ? (
        <ul className="content-ops-operation-list">
          {section.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function AudioOperationsPanel({
  contentPackage,
  actor,
  audioState,
  actionAvailability = {},
  onRunAction,
}) {
  const candidate = latestCandidateForPackage(contentPackage, audioState);
  const scan = normaliseContentOperationAudioScan(candidate?.audioScan);
  const audioSection = candidate?.blockers?.audio || contentPackage.blockers.audio;
  const strictReadiness = audioSection?.strictAudioReadiness || null;
  const fallbackApproval = audioSection?.fallbackApproval || null;
  const canEdit = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.EDIT);
  const isRunning = Boolean(
    audioState?.running
      && audioState.packageId === contentPackage.packageId
  );
  const activeAction = isRunning ? audioState.action : '';
  const actionError = audioState?.packageId === contentPackage.packageId ? audioState.error : null;
  const actionMessageText = audioState?.packageId === contentPackage.packageId ? audioState.message : '';
  const [laneFilter, setLaneFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('actionable');
  const [selectedItemIds, setSelectedItemIds] = React.useState([]);
  const [overrideReason, setOverrideReason] = React.useState('');

  React.useEffect(() => {
    setSelectedItemIds([]);
    setOverrideReason('');
  }, [contentPackage.packageId, candidate?.candidateId]);

  const filteredItems = React.useMemo(
    () => filterAudioItems(scan.items, { laneFilter, statusFilter }),
    [laneFilter, scan.items, statusFilter],
  );
  const selectedSet = React.useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedItems = scan.items.filter((item) => selectedSet.has(item.itemId));
  const selectedGeneratableIds = selectedItems
    .filter((item) => item.canGenerate)
    .map((item) => item.itemId);
  const selectedOverrideIds = selectedItems
    .filter((item) => item.canOverride)
    .map((item) => item.itemId);
  const visibleSelectableIds = filteredItems
    .filter(audioItemSelectable)
    .map((item) => item.itemId)
    .filter(Boolean);
  const allVisibleSelected = visibleSelectableIds.length > 0
    && visibleSelectableIds.every((itemId) => selectedSet.has(itemId));
  const batchCount = scan.actionableItems.length;
  const overrideReady = overrideReason.trim().length > 0;
  const run = (action, extra = {}) => {
    if (!onRunAction) return;
    onRunAction(action, {
      packageId: contentPackage.packageId,
      candidateId: candidate?.candidateId || '',
      ...extra,
    });
  };
  const toggleVisibleSelection = () => {
    setSelectedItemIds((current) => {
      if (allVisibleSelected) {
        const visible = new Set(visibleSelectableIds);
        return current.filter((itemId) => !visible.has(itemId));
      }
      return [...new Set([...current, ...visibleSelectableIds])];
    });
  };
  const toggleItem = (itemId) => {
    setSelectedItemIds((current) => (
      current.includes(itemId)
        ? current.filter((entry) => entry !== itemId)
        : [...current, itemId]
    ));
  };
  const scanDisabled = !canEdit || !actionAvailability.scan || isRunning || contentPackage.state === 'published';
  const generateSelectedDisabled = !canEdit
    || !actionAvailability.generate
    || isRunning
    || selectedGeneratableIds.length === 0
    || contentPackage.state === 'published';
  const batchDisabled = !canEdit
    || !actionAvailability.generate
    || isRunning
    || batchCount === 0
    || contentPackage.state === 'published';
  const overrideDisabled = !canEdit
    || !actionAvailability.generate
    || isRunning
    || !candidate?.candidateId
    || !overrideReady
    || contentPackage.state === 'published';

  return (
    <section className="content-ops-audio-panel" data-content-ops-audio-panel="true">
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Audio operations</div>
          <h5>Scan, generate, override</h5>
          <p className="small muted admin-note-spaced">
            {candidate?.candidateId ? `Candidate ${candidate.candidateId}` : 'Run validation to build an audio scan'}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className={`chip ${audioStatusChipClass(scan.status)}`}>{statusLabel(scan.status)}</span>
          <span className="chip">{String(scan.summary.totalRequired)} required</span>
          {fallbackApproval?.allowed ? <span className="chip warn">Fallback approved</span> : null}
        </div>
      </div>

      <div className="content-ops-metric-grid">
        <MetricTile label="Word audio" value={String(scan.lanes.word.totalRequired)} detail={`${String(scan.lanes.word.missingCount)} missing`} />
        <MetricTile label="Sentence audio" value={String(scan.lanes.sentence.totalRequired)} detail={`${String(scan.lanes.sentence.missingCount)} missing`} />
        <MetricTile label="Present" value={String(scan.summary.presentCount)} detail={`${String(scan.actionableItems.length)} actionable`} />
        <MetricTile label="Failures" value={String(scan.summary.failedCount)} detail={`${String(scan.summary.staleCount)} stale`} />
      </div>

      <div className="content-ops-audio-controls">
        <div className="content-ops-audio-filter-row">
          <label>
            <span className="small muted">Lane</span>
            <select
              value={laneFilter}
              onChange={(event) => setLaneFilter(event.target.value)}
              data-content-ops-audio-lane-filter="true"
            >
              <option value="all">All lanes</option>
              <option value="word">Word</option>
              <option value="sentence">Sentence</option>
            </select>
          </label>
          <label>
            <span className="small muted">State</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              data-content-ops-audio-status-filter="true"
            >
              {AUDIO_STATUS_FILTERS.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn secondary compact"
            onClick={toggleVisibleSelection}
            disabled={!visibleSelectableIds.length}
            data-content-ops-audio-select-visible="true"
          >
            {allVisibleSelected ? 'Clear visible' : 'Select visible'}
          </button>
        </div>
        <div className="actions content-ops-lifecycle-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={scanDisabled}
            aria-busy={activeAction === 'scan' ? 'true' : undefined}
            data-content-ops-audio-action="scan"
            onClick={() => run('scan')}
          >
            Refresh scan
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={generateSelectedDisabled}
            aria-busy={activeAction === 'generate-selected' ? 'true' : undefined}
            data-content-ops-audio-action="generate-selected"
            onClick={() => run('generate-selected', {
              itemIds: selectedGeneratableIds,
              limit: Math.max(1, selectedGeneratableIds.length),
            })}
          >
            Generate selected
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={batchDisabled}
            aria-busy={activeAction === 'generate-batch' ? 'true' : undefined}
            data-content-ops-audio-action="generate-batch"
            onClick={() => run('generate-batch', { itemIds: [], limit: 25 })}
          >
            Batch generate gaps
          </button>
        </div>
      </div>

      <div className="content-ops-audio-override">
        <label className="content-ops-notes-field">
          <span className="small muted">Override reason</span>
          <textarea
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            rows={2}
            data-content-ops-audio-override-reason="true"
          />
        </label>
        <button
          type="button"
          className="btn secondary"
          disabled={overrideDisabled}
          aria-busy={activeAction === 'override' ? 'true' : undefined}
          data-content-ops-audio-action="override"
          onClick={() => run('override', {
            itemIds: selectedOverrideIds,
            limit: selectedOverrideIds.length ? selectedOverrideIds.length : 25,
            override: true,
            reason: overrideReason.trim(),
          })}
        >
          Regenerate selected or package
        </button>
      </div>

      {strictReadiness ? (
        <div className="feedback warn admin-note-spaced" data-content-ops-audio-strict-readiness="true">
          Strict audio readiness: {statusLabel(strictReadiness.status)} - {String(strictReadiness.affectedCount)} affected
        </div>
      ) : null}
      <BlockerSummary blockers={{ audio: audioSection }} sectionKey="audio" />

      <div className="content-ops-table-scroll">
        <table className="admin-overview-table content-ops-table content-ops-audio-table" aria-label="Content operation audio matrix">
          <thead>
            <tr className="admin-overview-thead-row">
              <th className="small admin-overview-th-first">Item</th>
              <th className="small admin-overview-th">Lane</th>
              <th className="small admin-overview-th">State</th>
              <th className="small admin-overview-th">Voice</th>
              <th className="small admin-overview-th">Storage</th>
              <th className="small admin-overview-th">Select</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length ? filteredItems.slice(0, 80).map((item) => (
              <tr key={item.itemId} className="admin-overview-tbody-row" data-audio-status={item.status}>
                <td className="admin-overview-td-first">
                  <strong>{item.label}</strong>
                  <div className="small muted">{item.lane === 'sentence' ? (item.sentence || 'Sentence') : (item.word || 'Word')}</div>
                </td>
                <td className="admin-overview-td small">{item.lane}</td>
                <td className="admin-overview-td">
                  <span className={`chip ${audioStatusChipClass(item.status)}`}>{item.statusLabel}</span>
                  {item.blocker ? <div className="small muted">{item.blocker}</div> : null}
                </td>
                <td className="admin-overview-td small">{audioItemDetail(item) || 'Profile pending'}</td>
                <td className="admin-overview-td small">{item.r2Key || 'No R2 key'}</td>
                <td className="admin-overview-td">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(item.itemId)}
                    disabled={!audioItemSelectable(item)}
                    onChange={() => toggleItem(item.itemId)}
                    aria-label={`Select ${item.itemId}`}
                    data-content-ops-audio-item={item.itemId}
                  />
                </td>
              </tr>
            )) : (
              <tr className="admin-overview-tbody-row">
                <td className="admin-overview-td-first" colSpan={6}>
                  <span className="small muted">No audio items match the current filters.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {actionError ? (
        <div className="feedback warn admin-note-spaced" data-content-ops-audio-error="true">
          <strong>{actionError.code}</strong>
          <div>{actionError.message}</div>
        </div>
      ) : actionMessageText ? (
        <div className="feedback good admin-note-spaced" data-content-ops-audio-message="true">
          {actionMessageText}
        </div>
      ) : null}
    </section>
  );
}

function PackageTable({ packages, selectedPackageId, onSelectPackage }) {
  if (!packages.length) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-empty-packages="true">
        No content operation packages yet.
      </div>
    );
  }
  return (
    <div className="content-ops-table-scroll">
      <table className="admin-overview-table content-ops-table" aria-label="Content operation packages">
        <thead>
          <tr className="admin-overview-thead-row">
            <th className="small admin-overview-th-first">Package</th>
            <th className="small admin-overview-th">State</th>
            <th className="small admin-overview-th-right">Operations</th>
            <th className="small admin-overview-th">Updated</th>
            <th className="small admin-overview-th">Readiness</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((contentPackage) => (
            <tr
              key={contentPackage.packageId}
              className="admin-overview-tbody-row"
              data-selected={contentPackage.packageId === selectedPackageId ? 'true' : undefined}
              data-package-state={contentPackage.state}
            >
              <td className="admin-overview-td-first">
                <button
                  className="content-ops-row-button"
                  type="button"
                  onClick={() => onSelectPackage(contentPackage.packageId)}
                >
                  {contentPackage.title}
                </button>
                <div className="small muted">{contentPackage.packageId}</div>
              </td>
              <td className="admin-overview-td">
                <PackageStateChip contentPackage={contentPackage} />
              </td>
              <td className="admin-overview-td-right">{operationCountLabel(contentPackage, 'table')}</td>
              <td className="admin-overview-td small">{formatTimestamp(contentPackage.updatedAt)}</td>
              <td className="admin-overview-td">
                {contentPackage.blockers.blockerCount ? (
                  <span className="chip bad">{String(contentPackage.blockers.blockerCount)} blocker sections</span>
                ) : (
                  <span className="chip good">No blocker sections</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublishedAreaPanel({
  activeTab,
  latestRelease,
  selectedPackageId,
  selectedSummary,
  actor,
  audioState,
  audioActionAvailability,
  onRunAudioAction,
}) {
  const tab = CENTRE_TABS.find((entry) => entry.key === activeTab);
  const blockerSection = DETAIL_TAB_BLOCKER_SECTIONS[activeTab] || null;
  if (activeTab === 'audio' && selectedSummary) {
    return (
      <AudioOperationsPanel
        contentPackage={selectedSummary}
        actor={actor}
        audioState={audioState}
        actionAvailability={audioActionAvailability}
        onRunAction={onRunAudioAction}
      />
    );
  }
  if (activeTab === 'monstersAssets') {
    return (
      <MonsterAssetsPanel
        contentPackage={selectedSummary}
        latestRelease={latestRelease}
        blockerSection={blockerSection}
      />
    );
  }
  return (
    <div className="content-ops-area-panel" data-content-ops-area={activeTab}>
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Published state</div>
          <h4 className="section-title admin-section-title">{tab?.label || 'Content area'}</h4>
          <p className="small muted admin-note-spaced">
            Latest release {latestRelease?.releaseId || 'bundled fallback'}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className="chip">Browse mode</span>
          {selectedPackageId ? <span className="chip">Package {selectedPackageId}</span> : <span className="chip warn">No package selected</span>}
        </div>
      </div>
      {blockerSection && selectedSummary ? (
        <BlockerSummary blockers={selectedSummary.blockers} sectionKey={blockerSection} />
      ) : null}
      <div className="content-ops-domain-placeholder">
        <span className="chip">No mutation controls</span>
        <span className="small muted">Package selection is required before this area can create operations.</span>
      </div>
    </div>
  );
}

function SpellingBrowsePanel({
  areaKey = 'spelling',
  browse,
  itemDetail,
  filters,
  selectedWordSlug,
  selectedPackageId,
  canEdit,
  spellingOperationAvailable,
  spellingOperationState,
  loadingBrowse,
  loadingItem,
  error,
  onFilterChange,
  onApplyFilters,
  onSelectWord,
  onSubmitSpellingOperation,
}) {
  const selectedRow = browse.words.find((row) => row.slug === selectedWordSlug) || browse.words[0] || null;
  const packageDraft = browse.packageDraft;
  const selectedDetail = itemDetail?.found
    && itemDetail.slug === selectedRow?.slug
    && (itemDetail.packageDraft?.packageId || '') === (packageDraft.packageId || '')
    && (itemDetail.packageDraft?.candidateId || '') === (packageDraft.candidateId || '')
    && (itemDetail.release?.releaseId || '') === (browse.release.releaseId || '')
    ? itemDetail
    : null;
  const currentWord = selectedDetail?.current || null;
  const packageWord = selectedDetail?.packageValue || null;
  const editorSourceWord = packageWord || currentWord || null;
  const selectedList = browse.wordLists.find((list) => list.id === selectedRow?.listId) || browse.wordLists[0] || null;
  const selectedPool = browse.pools.find((pool) => pool.id === selectedRow?.spellingPool || pool.pool === selectedRow?.spellingPool)
    || browse.pools[0]
    || null;
  const rewardTracks = React.useMemo(() => (
    Array.isArray(browse.rewardTracks) ? browse.rewardTracks : []
  ), [browse.rewardTracks]);
  const selectedPoolId = spellingPoolOptionId(selectedPool);
  const rewardTracksForSelectedPool = React.useMemo(() => (
    rewardTracks.filter((track) => track.poolId === selectedPoolId)
  ), [rewardTracks, selectedPoolId]);
  const poolOptions = React.useMemo(() => spellingPoolOptions(browse.pools), [browse.pools]);
  const sentenceOptions = React.useMemo(() => {
    const seen = new Set();
    const output = [];
    for (const sentence of [
      ...((packageWord?.sentences || [])),
      ...((currentWord?.sentences || [])),
    ]) {
      if (!sentence?.id || seen.has(sentence.id)) continue;
      seen.add(sentence.id);
      output.push(sentence);
    }
    return output;
  }, [currentWord, packageWord]);
  const releaseLabel = browse.release.releaseId || 'bundled fallback';
  const detailValidation = selectedDetail?.validationState || selectedRow?.validationState || packageDraft.validation;
  const [editorMode, setEditorMode] = React.useState('edit');
  const [wordForm, setWordForm] = React.useState(() => emptyWordEditorForm(browse.wordLists, selectedRow));
  const [sentenceMode, setSentenceMode] = React.useState('edit');
  const [selectedSentenceId, setSelectedSentenceId] = React.useState('');
  const [sentenceForm, setSentenceForm] = React.useState(() => emptySentenceEditorForm(selectedRow));
  const [wordListMode, setWordListMode] = React.useState('edit');
  const [wordListForm, setWordListForm] = React.useState(() => emptyWordListEditorForm(browse.wordLists, selectedRow));
  const [poolMode, setPoolMode] = React.useState('edit');
  const [poolForm, setPoolForm] = React.useState(() => emptyPoolEditorForm(browse.pools, selectedRow));
  const [rewardTrackMode, setRewardTrackMode] = React.useState('edit');
  const [selectedRewardTrackId, setSelectedRewardTrackId] = React.useState('');
  const [rewardTrackForm, setRewardTrackForm] = React.useState(() => (
    emptyRewardTrackEditorForm(browse.pools, selectedPool, rewardTracks)
  ));
  const [formError, setFormError] = React.useState('');
  const formDisabled = !selectedPackageId
    || !canEdit
    || !spellingOperationAvailable
    || Boolean(spellingOperationState?.running);
  const formBlockedReason = !selectedPackageId
    ? 'Select a package'
    : (!canEdit ? 'Edit locked' : (!spellingOperationAvailable ? 'API unavailable' : ''));
  const removeLabel = selectedRow?.hasCurrent ? 'Retire word' : 'Delete draft';
  const selectedSentence = sentenceOptions.find((sentence) => sentence.id === selectedSentenceId)
    || sentenceOptions[0]
    || null;
  const selectedRewardTrack = rewardTracks.find((track) => track.id === selectedRewardTrackId)
    || rewardTracksForSelectedPool[0]
    || rewardTracks[0]
    || null;
  const canSaveRewardExposure = rewardTrackMode === 'edit'
    && Boolean(selectedRewardTrack)
    && rewardTrackForm.id === selectedRewardTrack?.id;
  const selectedRewardThresholds = React.useMemo(
    () => thresholdsForRewardTrackForm(rewardTrackForm),
    [rewardTrackForm],
  );
  const selectedRewardPool = browse.pools.find((pool) => spellingPoolOptionId(pool) === rewardTrackForm.poolId)
    || selectedPool
    || null;
  const selectedRewardPoolWordCount = poolWordCountValue(selectedRewardPool);
  const selectedRewardExposureStatus = heroExposureStatus(
    heroExposureInputFromForm(rewardTrackForm),
    { surface: 'codex', now: Date.now() },
  );

  React.useEffect(() => {
    if (editorMode === 'create') return;
    setFormError('');
    setWordForm(wordEditorFormFromWord(editorSourceWord, selectedRow, browse.wordLists));
  }, [
    browse.wordLists,
    editorMode,
    editorSourceWord,
    selectedRow,
    selectedRow?.slug,
  ]);

  React.useEffect(() => {
    if (sentenceMode === 'create') return;
    setFormError('');
    const nextSentence = selectedSentence || sentenceOptions[0] || null;
    setSelectedSentenceId(nextSentence?.id || '');
    setSentenceForm(sentenceEditorFormFromSentence(nextSentence, selectedRow));
  }, [
    sentenceMode,
    selectedRow,
    selectedRow?.slug,
    selectedSentence,
    sentenceOptions,
  ]);

  React.useEffect(() => {
    if (wordListMode === 'create') return;
    setFormError('');
    setWordListForm(wordListEditorFormFromList(selectedList, selectedRow, browse.wordLists));
  }, [
    browse.wordLists,
    selectedList,
    selectedRow,
    selectedRow?.listId,
    wordListMode,
  ]);

  React.useEffect(() => {
    if (poolMode === 'create') return;
    setFormError('');
    setPoolForm(poolEditorFormFromPool(selectedPool, selectedRow, browse.pools));
  }, [
    browse.pools,
    poolMode,
    selectedPool,
    selectedRow,
    selectedRow?.spellingPool,
  ]);

  React.useEffect(() => {
    if (rewardTrackMode === 'create') return;
    setFormError('');
    setSelectedRewardTrackId(selectedRewardTrack?.id || '');
    setRewardTrackForm(rewardTrackEditorFormFromTrack(
      selectedRewardTrack,
      selectedPool,
      browse.pools,
      rewardTracks,
    ));
  }, [
    browse.pools,
    rewardTrackMode,
    rewardTracks,
    selectedPool,
    selectedRewardTrack,
  ]);

  const updateWordForm = React.useCallback((patch) => {
    setFormError('');
    setWordForm((current) => {
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'listId')) {
        const list = browse.wordLists.find((entry) => entry.id === patch.listId);
        if (list) {
          next.spellingPool = list.spellingPool;
          next.coverageTier = list.coverageTier;
        }
      }
      return next;
    });
  }, [browse.wordLists]);

  const updateSentenceForm = React.useCallback((patch) => {
    setFormError('');
    setSentenceForm((current) => ({ ...current, ...patch }));
  }, []);

  const updateWordListForm = React.useCallback((patch) => {
    setFormError('');
    setWordListForm((current) => {
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'spellingPool')) {
        next.coverageTier = patch.spellingPool === 'extra' ? 'enrichment-extra' : 'statutory-core';
        if (patch.spellingPool === 'extra') next.yearGroups = '';
      }
      return next;
    });
  }, []);

  const updatePoolForm = React.useCallback((patch) => {
    setFormError('');
    setPoolForm((current) => {
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'type')) {
        if (patch.type === 'statutory') next.visibilityState = next.id === 'core' ? next.visibilityState : 'hidden';
        if (patch.type === 'enrichment' && !next.id) next.id = 'extra';
      }
      return next;
    });
  }, []);

  const updateRewardTrackForm = React.useCallback((patch) => {
    setFormError('');
    setRewardTrackForm((current) => {
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'monsterId')) {
        if (!next.progressKey || next.progressKey === current.monsterId) {
          next.progressKey = patch.monsterId;
        }
        if (!next.sourceMonsterIds || next.sourceMonsterIds === current.monsterId) {
          next.sourceMonsterIds = patch.monsterId;
        }
      }
      return next;
    });
  }, []);

  const updateVariant = React.useCallback((index, patch) => {
    setFormError('');
    setWordForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) => (
        variantIndex === index ? { ...variant, ...patch } : variant
      )),
    }));
  }, []);

  const addVariant = React.useCallback(() => {
    setFormError('');
    setWordForm((current) => ({
      ...current,
      spellingPool: 'extra',
      coverageTier: 'enrichment-extra',
      variants: [
        ...current.variants,
        {
          word: '',
          accepted: '',
          explanation: '',
          sentenceEntryIds: '',
          sourceNote: current.sourceNote,
          provenanceSource: current.provenanceSource,
          provenanceNote: '',
          progressKey: '',
        },
      ],
    }));
  }, []);

  const removeVariant = React.useCallback((index) => {
    setFormError('');
    setWordForm((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));
  }, []);

  const startCreate = React.useCallback(() => {
    setEditorMode('create');
    setFormError('');
    setWordForm(emptyWordEditorForm(browse.wordLists, selectedRow));
  }, [browse.wordLists, selectedRow]);

  const startEdit = React.useCallback(() => {
    setEditorMode('edit');
    setFormError('');
    setWordForm(wordEditorFormFromWord(editorSourceWord, selectedRow, browse.wordLists));
  }, [browse.wordLists, editorSourceWord, selectedRow]);

  const startCreateSentence = React.useCallback(() => {
    setSentenceMode('create');
    setSelectedSentenceId('');
    setFormError('');
    setSentenceForm(emptySentenceEditorForm(selectedRow));
  }, [selectedRow]);

  const startEditSentence = React.useCallback((sentenceId = '') => {
    const nextSentence = sentenceOptions.find((sentence) => sentence.id === sentenceId) || sentenceOptions[0] || null;
    setSentenceMode('edit');
    setSelectedSentenceId(nextSentence?.id || '');
    setFormError('');
    setSentenceForm(sentenceEditorFormFromSentence(nextSentence, selectedRow));
  }, [selectedRow, sentenceOptions]);

  const startCreateWordList = React.useCallback(() => {
    setWordListMode('create');
    setFormError('');
    setWordListForm(emptyWordListEditorForm(browse.wordLists, selectedRow));
  }, [browse.wordLists, selectedRow]);

  const startEditWordList = React.useCallback(() => {
    setWordListMode('edit');
    setFormError('');
    setWordListForm(wordListEditorFormFromList(selectedList, selectedRow, browse.wordLists));
  }, [browse.wordLists, selectedList, selectedRow]);

  const startCreatePool = React.useCallback(() => {
    setPoolMode('create');
    setFormError('');
    setPoolForm(emptyPoolEditorForm(browse.pools, selectedRow));
  }, [browse.pools, selectedRow]);

  const startEditPool = React.useCallback((poolId = '') => {
    const nextPool = browse.pools.find((pool) => pool.id === poolId || pool.pool === poolId) || selectedPool;
    setPoolMode('edit');
    setFormError('');
    setPoolForm(poolEditorFormFromPool(nextPool, selectedRow, browse.pools));
  }, [browse.pools, selectedPool, selectedRow]);

  const startCreateRewardTrack = React.useCallback(() => {
    setRewardTrackMode('create');
    setSelectedRewardTrackId('');
    setFormError('');
    setRewardTrackForm(emptyRewardTrackEditorForm(browse.pools, selectedPool, rewardTracks));
  }, [browse.pools, rewardTracks, selectedPool]);

  const startEditRewardTrack = React.useCallback((trackId = '') => {
    const nextTrack = rewardTracks.find((track) => track.id === trackId) || selectedRewardTrack;
    setRewardTrackMode('edit');
    setSelectedRewardTrackId(nextTrack?.id || '');
    setFormError('');
    setRewardTrackForm(rewardTrackEditorFormFromTrack(
      nextTrack,
      selectedPool,
      browse.pools,
      rewardTracks,
    ));
  }, [browse.pools, rewardTracks, selectedPool, selectedRewardTrack]);

  const submitWordForm = React.useCallback((event) => {
    event?.preventDefault?.();
    if (!onSubmitSpellingOperation) return;
    try {
      const operation = buildSpellingWordUpsertOperation(operationInputFromWordForm(wordForm), {
        existingWord: editorMode === 'edit' ? editorSourceWord : null,
        wordLists: browse.wordLists,
      });
      onSubmitSpellingOperation(operation, { slug: operation.entityId, action: 'word-upsert' });
    } catch (submitError) {
      setFormError(submitError?.validation?.errors?.[0]?.message || submitError?.message || 'Word operation is invalid.');
    }
  }, [browse.wordLists, editorMode, editorSourceWord, onSubmitSpellingOperation, wordForm]);

  const submitRemoval = React.useCallback(() => {
    if (!onSubmitSpellingOperation || !selectedRow) return;
    try {
      const operation = buildSpellingWordDeleteOrRetireOperation({
        slug: wordForm.slug || selectedRow.slug,
        hasCurrent: selectedRow.hasCurrent,
        reason: wordForm.retirementReason,
      }, {
        reason: wordForm.retirementReason,
      });
      onSubmitSpellingOperation(operation, { slug: operation.entityId, action: operation.action });
    } catch (submitError) {
      setFormError(submitError?.message || 'Word operation is invalid.');
    }
  }, [onSubmitSpellingOperation, selectedRow, wordForm.retirementReason, wordForm.slug]);

  const submitSentenceForm = React.useCallback((event) => {
    event?.preventDefault?.();
    if (!onSubmitSpellingOperation) return;
    try {
      const operation = buildSpellingSentenceUpsertOperation(operationInputFromSentenceForm(sentenceForm), {
        existingSentence: sentenceMode === 'edit' ? selectedSentence : null,
      });
      onSubmitSpellingOperation(operation, { slug: sentenceForm.wordSlug || selectedRow?.slug, action: 'sentence-upsert' });
    } catch (submitError) {
      setFormError(submitError?.validation?.errors?.[0]?.message || submitError?.message || 'Sentence operation is invalid.');
    }
  }, [onSubmitSpellingOperation, selectedRow?.slug, selectedSentence, sentenceForm, sentenceMode]);

  const submitSentenceRemoval = React.useCallback(() => {
    if (!onSubmitSpellingOperation || !selectedSentence) return;
    try {
      const hasCurrent = Boolean(currentWord?.sentences?.some((sentence) => sentence.id === selectedSentence.id));
      const operation = buildSpellingSentenceDeleteOrRetireOperation({
        id: sentenceForm.id || selectedSentence.id,
        hasCurrent,
        reason: sentenceForm.retirementReason,
      }, {
        reason: sentenceForm.retirementReason,
      });
      onSubmitSpellingOperation(operation, { slug: selectedSentence.wordSlug || selectedRow?.slug, action: `sentence-${operation.action}` });
    } catch (submitError) {
      setFormError(submitError?.message || 'Sentence operation is invalid.');
    }
  }, [currentWord?.sentences, onSubmitSpellingOperation, selectedRow?.slug, selectedSentence, sentenceForm.id, sentenceForm.retirementReason]);

  const submitWordListForm = React.useCallback((event) => {
    event?.preventDefault?.();
    if (!onSubmitSpellingOperation) return;
    try {
      const operation = buildSpellingWordListUpsertOperation(operationInputFromWordListForm(wordListForm), {
        existingWordList: wordListMode === 'edit' ? selectedList : null,
        pools: browse.pools,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: 'word-list-upsert' });
    } catch (submitError) {
      setFormError(submitError?.validation?.errors?.[0]?.message || submitError?.message || 'Word-list operation is invalid.');
    }
  }, [browse.pools, onSubmitSpellingOperation, selectedList, selectedRow?.slug, wordListForm, wordListMode]);

  const submitWordListRemoval = React.useCallback(() => {
    if (!onSubmitSpellingOperation || !selectedList) return;
    try {
      const operation = buildSpellingWordListDeleteOrRetireOperation({
        id: wordListForm.id || selectedList.id,
        hasCurrent: selectedList.draftState !== 'added',
        reason: wordListForm.retirementReason,
      }, {
        reason: wordListForm.retirementReason,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: `word-list-${operation.action}` });
    } catch (submitError) {
      setFormError(submitError?.message || 'Word-list operation is invalid.');
    }
  }, [onSubmitSpellingOperation, selectedList, selectedRow?.slug, wordListForm.id, wordListForm.retirementReason]);

  const submitPoolForm = React.useCallback((event) => {
    event?.preventDefault?.();
    if (!onSubmitSpellingOperation) return;
    try {
      const operation = buildSpellingPoolUpsertOperation(operationInputFromPoolForm(poolForm), {
        existingPool: poolMode === 'edit' ? selectedPool : null,
        pools: browse.pools,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: 'pool-upsert' });
    } catch (submitError) {
      setFormError(submitError?.validation?.errors?.[0]?.message || submitError?.message || 'Pool operation is invalid.');
    }
  }, [browse.pools, onSubmitSpellingOperation, poolForm, poolMode, selectedPool, selectedRow?.slug]);

  const submitPoolRemoval = React.useCallback(() => {
    if (!onSubmitSpellingOperation || !selectedPool) return;
    try {
      const operation = buildSpellingPoolDeleteOrRetireOperation({
        id: poolForm.id || selectedPool.id || selectedPool.pool,
        hasCurrent: selectedPool.draftState !== 'added',
        reason: poolForm.retirementReason,
      }, {
        reason: poolForm.retirementReason,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: `pool-${operation.action}` });
    } catch (submitError) {
      setFormError(submitError?.message || 'Pool operation is invalid.');
    }
  }, [onSubmitSpellingOperation, poolForm.id, poolForm.retirementReason, selectedPool, selectedRow?.slug]);

  const submitRewardTrackForm = React.useCallback((event) => {
    event?.preventDefault?.();
    if (!onSubmitSpellingOperation) return;
    try {
      const operation = buildSpellingRewardTrackUpsertOperation(operationInputFromRewardTrackForm(rewardTrackForm), {
        existingTrack: rewardTrackMode === 'edit' ? selectedRewardTrack : null,
        rewardTracks,
        pools: browse.pools,
        poolWordCounts: poolWordCountLookup(browse.pools),
        learnerVisiblePoolIds: learnerVisiblePoolIds(browse.pools),
        enforceThresholdsForHiddenPools: true,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: 'reward-track-upsert' });
    } catch (submitError) {
      setFormError(submitError?.validation?.errors?.[0]?.message || submitError?.message || 'Reward-track operation is invalid.');
    }
  }, [
    browse.pools,
    onSubmitSpellingOperation,
    rewardTrackForm,
    rewardTrackMode,
    rewardTracks,
    selectedRewardTrack,
    selectedRow?.slug,
  ]);

  const submitHeroExposureForm = React.useCallback(() => {
    if (!onSubmitSpellingOperation || !canSaveRewardExposure) return;
    try {
      const operation = buildSpellingHeroExposureUpsertOperation(operationInputFromHeroExposureForm(rewardTrackForm), {
        existingTrack: selectedRewardTrack,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: 'hero-exposure-upsert' });
    } catch (submitError) {
      setFormError(submitError?.validation?.errors?.[0]?.message || submitError?.message || 'Hero / Codex exposure operation is invalid.');
    }
  }, [
    onSubmitSpellingOperation,
    canSaveRewardExposure,
    rewardTrackForm,
    selectedRewardTrack,
    selectedRow?.slug,
  ]);

  const submitRewardTrackRemoval = React.useCallback(() => {
    if (!onSubmitSpellingOperation || !selectedRewardTrack) return;
    try {
      const operation = buildSpellingRewardTrackDeleteOrRetireOperation({
        id: rewardTrackForm.id || selectedRewardTrack.id,
        hasCurrent: selectedRewardTrack.hasCurrent !== false && selectedRewardTrack.draftState !== 'added',
        reason: rewardTrackForm.retirementReason,
      }, {
        reason: rewardTrackForm.retirementReason,
      });
      onSubmitSpellingOperation(operation, { slug: selectedRow?.slug, action: `reward-track-${operation.action}` });
    } catch (submitError) {
      setFormError(submitError?.message || 'Reward-track operation is invalid.');
    }
  }, [onSubmitSpellingOperation, rewardTrackForm.id, rewardTrackForm.retirementReason, selectedRewardTrack, selectedRow?.slug]);

  return (
    <div className="content-ops-area-panel" data-content-ops-area={areaKey} data-content-ops-spelling-browse="true">
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Published state</div>
          <h4 className="section-title admin-section-title">
            {areaKey === 'heroCodex' ? 'Hero / Codex' : (areaKey === 'poolsRewards' ? 'Pools & Rewards' : 'Spelling browse')}
          </h4>
          <p className="small muted admin-note-spaced">
            Latest release {releaseLabel}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className="chip">Words {String(browse.totals.words)}</span>
          <span className="chip">Families {String(browse.totals.families)}</span>
          {packageDraft.active ? (
            <span className={`chip ${statusChipClass(packageDraft.status)}`}>
              Package draft {statusLabel(packageDraft.status)}
            </span>
          ) : selectedPackageId ? (
            <span className="chip warn">Package {selectedPackageId}</span>
          ) : (
            <span className="chip">Published only</span>
          )}
          {packageDraft.active ? (
            <span className={`chip ${statusChipClass(packageDraft.validation.status)}`}>
              Validation {statusLabel(packageDraft.validation.status)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="content-ops-metric-grid content-ops-spelling-metrics">
        {browse.pools.map((pool) => (
          <MetricTile
            key={pool.id || pool.pool}
            label={pool.title || `${pool.pool} pool`}
            value={String(pool.wordCount)}
            detail={`${pool.type || 'custom'} - ${pool.visibility?.state || 'hidden'}`}
          />
        ))}
        <MetricTile label="Word lists" value={String(browse.totals.wordLists)} detail={`${String(browse.totals.variants)} variants`} />
        <MetricTile label="Matched" value={String(browse.totals.matchedWords)} detail={`${String(browse.totals.displayedWords)} displayed`} />
      </div>

      <section className="content-ops-editor-panel" data-content-ops-pool-editor="true">
        <div className="content-ops-word-editor-header">
          <div>
            <div className="eyebrow">Pool metadata</div>
            <strong>{poolMode === 'create' ? 'New pool' : (poolForm.title || selectedPool?.title || 'Pool')}</strong>
          </div>
          <div className="chip-row content-ops-chip-wrap">
            <button type="button" className="btn secondary compact" onClick={() => startEditPool(selectedPool?.id || selectedPool?.pool)} disabled={!selectedPool}>
              Edit pool
            </button>
            <button type="button" className="btn secondary compact" onClick={startCreatePool}>
              New pool
            </button>
          </div>
        </div>
        <div className="content-ops-table-scroll">
          <table className="admin-overview-table content-ops-table" aria-label="Spelling pools">
            <thead>
              <tr className="admin-overview-thead-row">
                <th className="small admin-overview-th-first">Pool</th>
                <th className="small admin-overview-th">Type</th>
                <th className="small admin-overview-th">Visibility</th>
                <th className="small admin-overview-th-right">Words</th>
                <th className="small admin-overview-th-right">Tracks</th>
                <th className="small admin-overview-th">Draft</th>
              </tr>
            </thead>
            <tbody>
              {browse.pools.map((pool) => (
                <tr key={pool.id || pool.pool} className="admin-overview-tbody-row">
                  <td className="admin-overview-td-first">
                    <button
                      type="button"
                      className="content-ops-row-button"
                      onClick={() => startEditPool(pool.id || pool.pool)}
                      data-content-ops-pool-row={pool.id || pool.pool}
                    >
                      {pool.title || pool.pool}
                    </button>
                    <div className="small muted">{pool.id || pool.pool}</div>
                  </td>
                  <td className="admin-overview-td small">{pool.type || 'custom'}</td>
                  <td className="admin-overview-td">
                    <span className={`chip ${pool.retired ? 'bad' : (pool.visibility?.state === 'visible' ? 'good' : 'warn')}`}>
                      {pool.retired ? 'retired' : (pool.visibility?.state || 'hidden')}
                    </span>
                  </td>
                  <td className="admin-overview-td-right small">{String(pool.activeWordCount ?? pool.wordCount)} / {String(pool.totalWordCount)}</td>
                  <td className="admin-overview-td-right small">{String((pool.rewardTrackIds || []).length)}</td>
                  <td className="admin-overview-td">
                    <span className={`chip ${draftStateChipClass(pool.draftState)}`}>
                      {draftStateLabel(pool.draftState)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="content-ops-word-editor-grid" onSubmit={submitPoolForm}>
          <label>
            <span className="small muted">Pool id</span>
            <input
              value={poolForm.id}
              onChange={(event) => updatePoolForm({ id: event.target.value })}
              data-content-ops-pool-field="id"
              disabled={poolMode === 'edit'}
            />
          </label>
          <label>
            <span className="small muted">Title</span>
            <input
              value={poolForm.title}
              onChange={(event) => updatePoolForm({ title: event.target.value })}
              data-content-ops-pool-field="title"
            />
          </label>
          <label>
            <span className="small muted">Type</span>
            <select
              value={poolForm.type}
              onChange={(event) => updatePoolForm({ type: event.target.value })}
              data-content-ops-pool-field="type"
            >
              <option value="statutory">Statutory</option>
              <option value="enrichment">Enrichment</option>
              <option value="extension">Extension</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            <span className="small muted">Visibility</span>
            <select
              value={poolForm.visibilityState}
              onChange={(event) => updatePoolForm({ visibilityState: event.target.value })}
              data-content-ops-pool-field="visibilityState"
            >
              <option value="hidden">Hidden</option>
              <option value="staged">Staged</option>
              <option value="visible">Visible</option>
            </select>
          </label>
          <label>
            <span className="small muted">Scheduled at</span>
            <input
              value={poolForm.scheduledAt}
              onChange={(event) => updatePoolForm({ scheduledAt: event.target.value })}
              data-content-ops-pool-field="scheduledAt"
            />
          </label>
          <label>
            <span className="small muted">Rollout flag</span>
            <input
              value={poolForm.rolloutFlag}
              onChange={(event) => updatePoolForm({ rolloutFlag: event.target.value })}
              data-content-ops-pool-field="rolloutFlag"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">Reward track ids</span>
            <textarea
              value={poolForm.rewardTrackIds}
              onChange={(event) => updatePoolForm({ rewardTrackIds: event.target.value })}
              data-content-ops-pool-field="rewardTrackIds"
            />
          </label>
          <label>
            <span className="small muted">Tags</span>
            <input
              value={poolForm.tags}
              onChange={(event) => updatePoolForm({ tags: event.target.value })}
              data-content-ops-pool-field="tags"
            />
          </label>
          <label>
            <span className="small muted">Source notes</span>
            <input
              value={poolForm.sourceNote}
              onChange={(event) => updatePoolForm({ sourceNote: event.target.value })}
              data-content-ops-pool-field="sourceNote"
            />
          </label>
          <label>
            <span className="small muted">Provenance source</span>
            <input
              value={poolForm.provenanceSource}
              onChange={(event) => updatePoolForm({ provenanceSource: event.target.value })}
              data-content-ops-pool-field="provenanceSource"
            />
          </label>
          <label>
            <span className="small muted">No-reward exception</span>
            <input
              type="checkbox"
              checked={poolForm.noRewardExceptionApproved}
              onChange={(event) => updatePoolForm({ noRewardExceptionApproved: event.target.checked })}
              data-content-ops-pool-field="noRewardExceptionApproved"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">No-reward reason</span>
            <textarea
              value={poolForm.noRewardExceptionReason}
              onChange={(event) => updatePoolForm({ noRewardExceptionReason: event.target.value })}
              data-content-ops-pool-field="noRewardExceptionReason"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">Retirement reason</span>
            <input
              value={poolForm.retirementReason}
              onChange={(event) => updatePoolForm({ retirementReason: event.target.value })}
              data-content-ops-pool-field="retirementReason"
            />
          </label>
          <div className="content-ops-editor-actions content-ops-editor-wide">
            <button type="submit" className="btn primary" disabled={formDisabled}>
              Save pool
            </button>
            <button type="button" className="btn secondary" onClick={submitPoolRemoval} disabled={formDisabled || !selectedPool}>
              {selectedPool?.draftState === 'added' ? 'Delete draft pool' : 'Retire pool'}
            </button>
          </div>
        </form>
      </section>

      <section className="content-ops-editor-panel" data-content-ops-reward-editor="true">
        <div className="content-ops-word-editor-header">
          <div>
            <div className="eyebrow">Reward tracks</div>
            <strong>{rewardTrackMode === 'create' ? 'New reward track' : rewardTrackOptionLabel(selectedRewardTrack)}</strong>
          </div>
          <div className="chip-row content-ops-chip-wrap">
            <button type="button" className="btn secondary compact" onClick={() => startEditRewardTrack(selectedRewardTrack?.id)} disabled={!selectedRewardTrack}>
              Edit track
            </button>
            <button type="button" className="btn secondary compact" onClick={startCreateRewardTrack}>
              New track
            </button>
          </div>
        </div>
        <div className="content-ops-reward-impact" data-content-ops-reward-impact="true">
          <MetricTile
            label="Selected pool words"
            value={String(selectedRewardPoolWordCount)}
            detail={selectedRewardPool?.title || selectedRewardPool?.id || 'No pool'}
          />
          <MetricTile
            label="Thresholds"
            value={String(selectedRewardThresholds.length)}
            detail={selectedRewardThresholds.length ? `Highest ${String(Math.max(...selectedRewardThresholds))}` : 'Template required'}
          />
          <MetricTile
            label="Progression"
            value={rewardTrackForm.progressionMode}
            detail={thresholdTemplateLabel(rewardTrackForm.thresholdTemplate)}
          />
          <MetricTile
            label="Codex exposure"
            value={heroExposureStateLabel(selectedRewardExposureStatus.state)}
            detail={selectedRewardExposureStatus.learnerVisible
              ? 'Learner visible now'
              : (selectedRewardExposureStatus.previewAllowed === false ? 'Hidden from preview' : 'Admin preview only')}
          />
        </div>
        <div className="feedback warn content-ops-reward-safety" data-content-ops-reward-safety="true">
          Existing learner history stays keyed by the published progress key. Changing thresholds, source monsters, or sequence changes future reward projection after approval.
        </div>
        <div className="content-ops-table-scroll">
          <table className="admin-overview-table content-ops-table" aria-label="Spelling reward tracks">
            <thead>
              <tr className="admin-overview-thead-row">
                <th className="small admin-overview-th-first">Track</th>
                <th className="small admin-overview-th">Pool</th>
                <th className="small admin-overview-th">Monster</th>
                <th className="small admin-overview-th">Mode</th>
                <th className="small admin-overview-th">Exposure</th>
                <th className="small admin-overview-th-right">Thresholds</th>
                <th className="small admin-overview-th">State</th>
              </tr>
            </thead>
            <tbody>
              {rewardTracks.length ? rewardTracks.map((track) => (
                <tr key={track.id} className="admin-overview-tbody-row" data-selected={track.id === selectedRewardTrack?.id ? 'true' : undefined}>
                  <td className="admin-overview-td-first">
                    <button
                      type="button"
                      className="content-ops-row-button"
                      onClick={() => startEditRewardTrack(track.id)}
                      data-content-ops-reward-row={track.id}
                    >
                      {rewardTrackOptionLabel(track)}
                    </button>
                    <div className="small muted">{track.id}</div>
                  </td>
                  <td className="admin-overview-td small">{track.poolId || 'No pool'}</td>
                  <td className="admin-overview-td small">{track.monsterId || 'No monster'}</td>
                  <td className="admin-overview-td small">{track.progressionMode || 'parallel'}</td>
                  <td className="admin-overview-td">
                    <span className={`chip ${heroExposureChipClass(track.heroExposure)}`}>
                      {heroExposureStateLabel(track.heroExposure?.state || 'visible')}
                    </span>
                    <div className="small muted">
                      {((Array.isArray(track.heroExposure?.surfaces) && track.heroExposure.surfaces.length)
                        ? track.heroExposure.surfaces
                        : HERO_EXPOSURE_SURFACES).map(heroExposureSurfaceLabel).join(', ')}
                    </div>
                  </td>
                  <td className="admin-overview-td-right small">
                    {String((track.thresholdOverrides || []).length || (REWARD_TRACK_THRESHOLD_TEMPLATES[track.thresholdTemplate]?.thresholds || []).length)}
                  </td>
                  <td className="admin-overview-td">
                    <span className={`chip ${track.retired ? 'bad' : (track.active === false ? 'warn' : 'good')}`}>
                      {track.retired ? 'retired' : (track.active === false ? 'inactive' : 'active')}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr className="admin-overview-tbody-row">
                  <td className="admin-overview-td-first small muted" colSpan={7}>
                    No reward tracks in this package view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form className="content-ops-word-editor-grid" onSubmit={submitRewardTrackForm}>
          <label>
            <span className="small muted">Track id</span>
            <input
              value={rewardTrackForm.id}
              onChange={(event) => updateRewardTrackForm({ id: event.target.value })}
              data-content-ops-reward-field="id"
              disabled={rewardTrackMode === 'edit'}
            />
          </label>
          <label>
            <span className="small muted">Pool</span>
            <select
              value={rewardTrackForm.poolId}
              onChange={(event) => updateRewardTrackForm({ poolId: event.target.value })}
              data-content-ops-reward-field="poolId"
            >
              {poolOptions.map((pool) => (
                <option key={pool.id} value={pool.id}>{pool.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small muted">Monster</span>
            <select
              value={rewardTrackForm.monsterId}
              onChange={(event) => updateRewardTrackForm({ monsterId: event.target.value })}
              data-content-ops-reward-field="monsterId"
            >
              {SPELLING_REWARD_TRACK_MONSTER_IDS.map((monsterId) => (
                <option key={monsterId} value={monsterId}>{monsterId}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small muted">Progression mode</span>
            <select
              value={rewardTrackForm.progressionMode}
              onChange={(event) => updateRewardTrackForm({ progressionMode: event.target.value })}
              data-content-ops-reward-field="progressionMode"
            >
              {REWARD_TRACK_PROGRESS_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small muted">Threshold template</span>
            <select
              value={rewardTrackForm.thresholdTemplate}
              onChange={(event) => updateRewardTrackForm({ thresholdTemplate: event.target.value })}
              data-content-ops-reward-field="thresholdTemplate"
            >
              {rewardTrackTemplateOptions().map((template) => (
                <option key={template.id} value={template.id}>{template.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small muted">Threshold overrides</span>
            <input
              value={rewardTrackForm.thresholdOverrides}
              onChange={(event) => updateRewardTrackForm({ thresholdOverrides: event.target.value })}
              data-content-ops-reward-field="thresholdOverrides"
            />
          </label>
          <label>
            <span className="small muted">Progress key</span>
            <input
              value={rewardTrackForm.progressKey}
              onChange={(event) => updateRewardTrackForm({ progressKey: event.target.value })}
              data-content-ops-reward-field="progressKey"
            />
          </label>
          <label>
            <span className="small muted">Source monsters</span>
            <input
              value={rewardTrackForm.sourceMonsterIds}
              onChange={(event) => updateRewardTrackForm({ sourceMonsterIds: event.target.value })}
              data-content-ops-reward-field="sourceMonsterIds"
            />
          </label>
          <label>
            <span className="small muted">Sequential after</span>
            <select
              value={rewardTrackForm.sequentialAfter}
              onChange={(event) => updateRewardTrackForm({ sequentialAfter: event.target.value })}
              data-content-ops-reward-field="sequentialAfter"
            >
              <option value="">No dependency</option>
              {rewardTracks.filter((track) => track.id !== rewardTrackForm.id).map((track) => (
                <option key={track.id} value={track.id}>{rewardTrackOptionLabel(track)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small muted">Active</span>
            <input
              type="checkbox"
              checked={rewardTrackForm.active}
              onChange={(event) => updateRewardTrackForm({ active: event.target.checked })}
              data-content-ops-reward-field="active"
            />
          </label>
          <label>
            <span className="small muted">Hero / Codex exposure</span>
            <select
              value={rewardTrackForm.heroExposureState}
              onChange={(event) => updateRewardTrackForm({ heroExposureState: event.target.value })}
              data-content-ops-reward-field="heroExposureState"
            >
              {HERO_EXPOSURE_STATES.map((state) => (
                <option key={state} value={state}>{heroExposureStateLabel(state)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="small muted">Exposure surfaces</span>
            <input
              value={rewardTrackForm.heroExposureSurfaces}
              onChange={(event) => updateRewardTrackForm({ heroExposureSurfaces: event.target.value })}
              data-content-ops-reward-field="heroExposureSurfaces"
            />
          </label>
          <label>
            <span className="small muted">Exposure scheduled at</span>
            <input
              value={rewardTrackForm.heroExposureScheduledAt}
              onChange={(event) => updateRewardTrackForm({ heroExposureScheduledAt: event.target.value })}
              data-content-ops-reward-field="heroExposureScheduledAt"
            />
          </label>
          <label>
            <span className="small muted">Exposure rollout flag</span>
            <input
              value={rewardTrackForm.heroExposureRolloutFlag}
              onChange={(event) => updateRewardTrackForm({ heroExposureRolloutFlag: event.target.value })}
              data-content-ops-reward-field="heroExposureRolloutFlag"
            />
          </label>
          <label>
            <span className="small muted">Admin preview</span>
            <input
              type="checkbox"
              checked={rewardTrackForm.heroExposurePreviewAllowed}
              onChange={(event) => updateRewardTrackForm({ heroExposurePreviewAllowed: event.target.checked })}
              data-content-ops-reward-field="heroExposurePreviewAllowed"
            />
          </label>
          <label>
            <span className="small muted">Order</span>
            <input
              value={rewardTrackForm.sortIndex}
              onChange={(event) => updateRewardTrackForm({ sortIndex: event.target.value })}
              data-content-ops-reward-field="sortIndex"
            />
          </label>
          <label>
            <span className="small muted">Dependency approved</span>
            <input
              type="checkbox"
              checked={rewardTrackForm.dependencyApprovalApproved}
              onChange={(event) => updateRewardTrackForm({ dependencyApprovalApproved: event.target.checked })}
              data-content-ops-reward-field="dependencyApprovalApproved"
            />
          </label>
          <label>
            <span className="small muted">Track title</span>
            <input
              value={rewardTrackForm.labelsTitle}
              onChange={(event) => updateRewardTrackForm({ labelsTitle: event.target.value })}
              data-content-ops-reward-field="labelsTitle"
            />
          </label>
          <label>
            <span className="small muted">Short label</span>
            <input
              value={rewardTrackForm.labelsShortLabel}
              onChange={(event) => updateRewardTrackForm({ labelsShortLabel: event.target.value })}
              data-content-ops-reward-field="labelsShortLabel"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">Track description</span>
            <textarea
              value={rewardTrackForm.labelsDescription}
              onChange={(event) => updateRewardTrackForm({ labelsDescription: event.target.value })}
              data-content-ops-reward-field="labelsDescription"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">Dependency approval reason</span>
            <textarea
              value={rewardTrackForm.dependencyApprovalReason}
              onChange={(event) => updateRewardTrackForm({ dependencyApprovalReason: event.target.value })}
              data-content-ops-reward-field="dependencyApprovalReason"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">Source notes</span>
            <textarea
              value={rewardTrackForm.sourceNote}
              onChange={(event) => updateRewardTrackForm({ sourceNote: event.target.value })}
              data-content-ops-reward-field="sourceNote"
            />
          </label>
          <label className="content-ops-editor-wide">
            <span className="small muted">Retirement reason</span>
            <input
              value={rewardTrackForm.retirementReason}
              onChange={(event) => updateRewardTrackForm({ retirementReason: event.target.value })}
              data-content-ops-reward-field="retirementReason"
            />
          </label>
          <div className="content-ops-editor-actions content-ops-editor-wide">
            <button type="submit" className="btn primary" disabled={formDisabled}>
              Save reward track
            </button>
            <button type="button" className="btn secondary" onClick={submitHeroExposureForm} disabled={formDisabled || !canSaveRewardExposure}>
              Save exposure
            </button>
            <button type="button" className="btn secondary" onClick={submitRewardTrackRemoval} disabled={formDisabled || !selectedRewardTrack}>
              {selectedRewardTrack?.draftState === 'added' || selectedRewardTrack?.hasCurrent === false ? 'Delete draft track' : 'Retire track'}
            </button>
          </div>
        </form>
      </section>

      <form className="content-ops-browse-toolbar" onSubmit={onApplyFilters}>
        <label>
          <span className="small muted">Search</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => onFilterChange({ query: event.target.value })}
            data-content-ops-spelling-query="true"
          />
        </label>
        <label>
          <span className="small muted">Pool</span>
          <select
            value={filters.pool}
            onChange={(event) => onFilterChange({ pool: event.target.value })}
            data-content-ops-spelling-pool="true"
          >
            <option value="all">All</option>
            {poolOptions.map((pool) => (
              <option key={pool.id} value={pool.id}>{pool.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="small muted">List</span>
          <select
            value={filters.listId}
            onChange={(event) => onFilterChange({ listId: event.target.value })}
            data-content-ops-spelling-list="true"
          >
            <option value="">All lists</option>
            {browse.wordLists.map((list) => (
              <option key={list.id} value={list.id}>{list.title}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn secondary" disabled={loadingBrowse}>
          Apply filters
        </button>
      </form>

      {error ? (
        <div className="feedback warn admin-note-spaced" data-content-ops-spelling-error="true">
          <strong>{error.code}</strong>
          <div>{error.message}</div>
        </div>
      ) : null}

      <div className="content-ops-spelling-browser">
        <div className="content-ops-table-scroll">
          <table className="admin-overview-table content-ops-table content-ops-spelling-table" aria-label="Spelling words">
            <thead>
              <tr className="admin-overview-thead-row">
                <th className="small admin-overview-th-first">Word</th>
                <th className="small admin-overview-th">Pool</th>
                <th className="small admin-overview-th">Family</th>
                <th className="small admin-overview-th-right">Audio</th>
                <th className="small admin-overview-th">Validation</th>
                <th className="small admin-overview-th">Draft</th>
              </tr>
            </thead>
            <tbody>
              {browse.words.map((row) => (
                <tr
                  key={row.slug}
                  className="admin-overview-tbody-row"
                  data-selected={row.slug === selectedRow?.slug ? 'true' : undefined}
                  data-spelling-draft-state={row.draftState}
                >
                  <td className="admin-overview-td-first">
                    <button
                      type="button"
                      className="content-ops-row-button"
                      onClick={() => onSelectWord(row.slug)}
                      data-content-ops-spelling-word={row.slug}
                    >
                      {row.word}
                    </button>
                    <div className="small muted">{row.listTitle || row.listId}</div>
                  </td>
                  <td className="admin-overview-td">
                    <span className="chip">{row.spellingPool}</span>
                  </td>
                  <td className="admin-overview-td small">{row.family || 'No family'}</td>
                  <td className="admin-overview-td-right small">{String(row.audioReadiness.totalRequired)}</td>
                  <td className="admin-overview-td">
                    <span className={`chip ${statusChipClass(row.validationState.status)}`}>
                      {statusLabel(row.validationState.status)}
                    </span>
                  </td>
                  <td className="admin-overview-td">
                    <span className={`chip ${draftStateChipClass(row.draftState)}`}>
                      {draftStateLabel(row.draftState)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="content-ops-spelling-detail" aria-label="Spelling word detail">
          {selectedRow ? (
            <>
              <div className="content-ops-spelling-detail-header">
                <div>
                  <div className="eyebrow">Word detail</div>
                  <h5>{currentWord?.word || packageWord?.word || selectedRow.word}</h5>
                </div>
                <span className={`chip ${draftStateChipClass(selectedDetail?.draftState || selectedRow.draftState)}`}>
                  {draftStateLabel(selectedDetail?.draftState || selectedRow.draftState)}
                </span>
              </div>
              <div className="content-ops-spelling-detail-grid">
                <MetricTile
                  label="Family"
                  value={currentWord?.family || packageWord?.family || selectedRow.family || 'None'}
                  detail={`${String(currentWord?.familyMembers?.length || selectedRow.familySize)} related words`}
                />
                <MetricTile
                  label="Sentences"
                  value={String(currentWord?.sentences?.length || selectedRow.sentenceCount)}
                  detail={`${String(selectedRow.variantSentenceCount)} variant sentences`}
                />
                <MetricTile
                  label="Audio required"
                  value={String((currentWord?.audioReadiness || selectedRow.audioReadiness).totalRequired)}
                  detail={(currentWord?.audioReadiness || selectedRow.audioReadiness).status}
                />
                <MetricTile
                  label="Validation"
                  value={statusLabel(detailValidation.status)}
                  detail={`${String(detailValidation.errorCount || 0)} errors, ${String(detailValidation.warningCount || 0)} warnings`}
                />
                <MetricTile
                  label="Reward impact"
                  value={(currentWord?.rewardImpact || selectedRow.rewardImpact).spellingPool}
                  detail={(currentWord?.rewardImpact || selectedRow.rewardImpact).status}
                />
              </div>
              {loadingItem ? <div className="small muted admin-note-spaced">Word detail is loading.</div> : null}
              {currentWord?.sentences?.length ? (
                <ul className="content-ops-operation-list">
                  {currentWord.sentences.slice(0, 3).map((sentence) => (
                    <li key={sentence.id}>
                      <strong>{sentence.id}</strong>
                      <span className="small muted"> - {sentence.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {packageWord && selectedDetail?.draftState !== 'unchanged' ? (
                <div className="content-ops-spelling-draft-compare">
                  <span className="chip warn">Package draft</span>
                  <span className="small muted">{packageWord.explanation || 'Draft value available'}</span>
                </div>
              ) : null}
              <form
                className="content-ops-word-editor"
                data-content-ops-word-editor="true"
                onSubmit={submitWordForm}
              >
                <div className="content-ops-word-editor-header">
                  <div>
                    <div className="eyebrow">Word editor</div>
                    <strong>{editorMode === 'create' ? 'New word' : (wordForm.word || selectedRow.word)}</strong>
                  </div>
                  <div className="chip-row content-ops-chip-wrap">
                    <button type="button" className="btn secondary compact" onClick={startEdit} disabled={!selectedRow}>
                      Edit selected
                    </button>
                    <button type="button" className="btn secondary compact" onClick={startCreate}>
                      New word
                    </button>
                  </div>
                </div>
                {formBlockedReason ? (
                  <div className="feedback warn" data-content-ops-word-editor-blocked="true">
                    {formBlockedReason}
                  </div>
                ) : null}
                {formError || spellingOperationState?.error ? (
                  <div className="feedback warn" data-content-ops-word-editor-error="true">
                    {formError || spellingOperationState.error.message}
                  </div>
                ) : null}
                {spellingOperationState?.message ? (
                  <div className="feedback good" data-content-ops-word-editor-message="true">
                    {spellingOperationState.message}
                  </div>
                ) : null}
                <div className="content-ops-word-editor-grid">
                  <label>
                    <span className="small muted">Slug</span>
                    <input
                      value={wordForm.slug}
                      onChange={(event) => updateWordForm({ slug: event.target.value, progressKey: event.target.value })}
                      disabled={formDisabled || editorMode !== 'create'}
                      data-content-ops-word-field="slug"
                    />
                  </label>
                  <label>
                    <span className="small muted">Word</span>
                    <input
                      value={wordForm.word}
                      onChange={(event) => updateWordForm({ word: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="word"
                    />
                  </label>
                  <label>
                    <span className="small muted">Family</span>
                    <input
                      value={wordForm.family}
                      onChange={(event) => updateWordForm({ family: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="family"
                    />
                  </label>
                  <label>
                    <span className="small muted">List</span>
                    <select
                      value={wordForm.listId}
                      onChange={(event) => updateWordForm({ listId: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="listId"
                    >
                      <option value="">Select list</option>
                      {browse.wordLists.map((list) => (
                        <option key={list.id} value={list.id}>{list.title}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="small muted">Pool</span>
                    <select
                      value={wordForm.spellingPool}
                      onChange={(event) => updateWordForm({ spellingPool: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="spellingPool"
                    >
                      {poolOptions.map((pool) => (
                        <option key={pool.id} value={pool.id}>{pool.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="small muted">Coverage</span>
                    <input
                      value={wordForm.coverageTier}
                      onChange={(event) => updateWordForm({ coverageTier: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="coverageTier"
                    />
                  </label>
                  <label>
                    <span className="small muted">Year groups</span>
                    <input
                      value={wordForm.yearGroups}
                      onChange={(event) => updateWordForm({ yearGroups: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="yearGroups"
                    />
                  </label>
                  <label>
                    <span className="small muted">Accepted spellings</span>
                    <input
                      value={wordForm.accepted}
                      onChange={(event) => updateWordForm({ accepted: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="accepted"
                    />
                  </label>
                  <label>
                    <span className="small muted">Sentence IDs</span>
                    <input
                      value={wordForm.sentenceEntryIds}
                      onChange={(event) => updateWordForm({ sentenceEntryIds: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="sentenceEntryIds"
                    />
                  </label>
                  <label>
                    <span className="small muted">Progress key</span>
                    <input
                      value={wordForm.progressKey}
                      onChange={(event) => updateWordForm({ progressKey: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="progressKey"
                    />
                  </label>
                  <label>
                    <span className="small muted">Tags</span>
                    <input
                      value={wordForm.tags}
                      onChange={(event) => updateWordForm({ tags: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="tags"
                    />
                  </label>
                  <label>
                    <span className="small muted">Pattern IDs</span>
                    <input
                      value={wordForm.patternIds}
                      onChange={(event) => updateWordForm({ patternIds: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="patternIds"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Explanation</span>
                    <textarea
                      value={wordForm.explanation}
                      onChange={(event) => updateWordForm({ explanation: event.target.value })}
                      disabled={formDisabled}
                      rows={3}
                      data-content-ops-word-field="explanation"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Source notes</span>
                    <textarea
                      value={wordForm.sourceNote}
                      onChange={(event) => updateWordForm({ sourceNote: event.target.value })}
                      disabled={formDisabled}
                      rows={2}
                      data-content-ops-word-field="sourceNote"
                    />
                  </label>
                  <label>
                    <span className="small muted">Provenance source</span>
                    <input
                      value={wordForm.provenanceSource}
                      onChange={(event) => updateWordForm({ provenanceSource: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="provenanceSource"
                    />
                  </label>
                  <label>
                    <span className="small muted">Provenance note</span>
                    <input
                      value={wordForm.provenanceNote}
                      onChange={(event) => updateWordForm({ provenanceNote: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-field="provenanceNote"
                    />
                  </label>
                </div>

                <div className="content-ops-word-variants" data-content-ops-word-variants="true">
                  <div className="content-ops-word-editor-header">
                    <strong>Word-family variants</strong>
                    <button type="button" className="btn secondary compact" onClick={addVariant} disabled={formDisabled}>
                      Add variant
                    </button>
                  </div>
                  {wordForm.variants.length ? wordForm.variants.map((variant, index) => (
                    <div className="content-ops-word-variant-row" key={`${String(index)}-${variant.word || 'variant'}`}>
                      <label>
                        <span className="small muted">Variant</span>
                        <input
                          value={variant.word}
                          onChange={(event) => updateVariant(index, { word: event.target.value, progressKey: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="word"
                        />
                      </label>
                      <label>
                        <span className="small muted">Accepted</span>
                        <input
                          value={variant.accepted}
                          onChange={(event) => updateVariant(index, { accepted: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="accepted"
                        />
                      </label>
                      <label>
                        <span className="small muted">Sentence IDs</span>
                        <input
                          value={variant.sentenceEntryIds}
                          onChange={(event) => updateVariant(index, { sentenceEntryIds: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="sentenceEntryIds"
                        />
                      </label>
                      <label>
                        <span className="small muted">Progress key</span>
                        <input
                          value={variant.progressKey}
                          onChange={(event) => updateVariant(index, { progressKey: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="progressKey"
                        />
                      </label>
                      <label className="content-ops-word-editor-wide">
                        <span className="small muted">Explanation</span>
                        <textarea
                          value={variant.explanation}
                          onChange={(event) => updateVariant(index, { explanation: event.target.value })}
                          disabled={formDisabled}
                          rows={2}
                          data-content-ops-variant-field="explanation"
                        />
                      </label>
                      <label>
                        <span className="small muted">Source notes</span>
                        <input
                          value={variant.sourceNote}
                          onChange={(event) => updateVariant(index, { sourceNote: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="sourceNote"
                        />
                      </label>
                      <label>
                        <span className="small muted">Provenance source</span>
                        <input
                          value={variant.provenanceSource}
                          onChange={(event) => updateVariant(index, { provenanceSource: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="provenanceSource"
                        />
                      </label>
                      <label>
                        <span className="small muted">Provenance note</span>
                        <input
                          value={variant.provenanceNote}
                          onChange={(event) => updateVariant(index, { provenanceNote: event.target.value })}
                          disabled={formDisabled}
                          data-content-ops-variant-field="provenanceNote"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn secondary compact"
                        onClick={() => removeVariant(index)}
                        disabled={formDisabled}
                      >
                        Remove variant
                      </button>
                    </div>
                  )) : (
                    <div className="small muted">No variants</div>
                  )}
                </div>

                <label className="content-ops-word-editor-wide">
                  <span className="small muted">Retirement reason</span>
                  <input
                    value={wordForm.retirementReason}
                    onChange={(event) => updateWordForm({ retirementReason: event.target.value })}
                    disabled={formDisabled || editorMode === 'create'}
                    data-content-ops-word-field="retirementReason"
                  />
                </label>
                <div className="content-ops-word-editor-actions">
                  <button type="submit" className="btn primary compact" disabled={formDisabled}>
                    Save word
                  </button>
                  <button
                    type="button"
                    className="btn secondary compact"
                    onClick={submitRemoval}
                    disabled={formDisabled || editorMode === 'create' || !selectedRow}
                    data-content-ops-word-remove="true"
                  >
                    {removeLabel}
                  </button>
                </div>
              </form>
              <form
                className="content-ops-word-editor"
                data-content-ops-sentence-editor="true"
                onSubmit={submitSentenceForm}
              >
                <div className="content-ops-word-editor-header">
                  <div>
                    <div className="eyebrow">Sentence editor</div>
                    <strong>{sentenceMode === 'create' ? 'New sentence' : (sentenceForm.id || 'Selected sentence')}</strong>
                  </div>
                  <div className="chip-row content-ops-chip-wrap">
                    {sentenceOptions.length ? (
                      <select
                        value={selectedSentence?.id || ''}
                        onChange={(event) => startEditSentence(event.target.value)}
                        disabled={formDisabled}
                        data-content-ops-sentence-select="true"
                      >
                        {sentenceOptions.map((sentence) => (
                          <option key={sentence.id} value={sentence.id}>{sentence.id}</option>
                        ))}
                      </select>
                    ) : null}
                    <button type="button" className="btn secondary compact" onClick={() => startEditSentence(selectedSentence?.id)} disabled={!sentenceOptions.length}>
                      Edit sentence
                    </button>
                    <button type="button" className="btn secondary compact" onClick={startCreateSentence}>
                      New sentence
                    </button>
                  </div>
                </div>
                <div className="content-ops-word-editor-grid">
                  <label>
                    <span className="small muted">Sentence ID</span>
                    <input
                      value={sentenceForm.id}
                      onChange={(event) => updateSentenceForm({ id: event.target.value })}
                      disabled={formDisabled || sentenceMode !== 'create'}
                      data-content-ops-sentence-field="id"
                    />
                  </label>
                  <label>
                    <span className="small muted">Word slug</span>
                    <input
                      value={sentenceForm.wordSlug}
                      onChange={(event) => updateSentenceForm({ wordSlug: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-sentence-field="wordSlug"
                    />
                  </label>
                  <label>
                    <span className="small muted">Variant label</span>
                    <input
                      value={sentenceForm.variantLabel}
                      onChange={(event) => updateSentenceForm({ variantLabel: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-sentence-field="variantLabel"
                    />
                  </label>
                  <label>
                    <span className="small muted">Tags</span>
                    <input
                      value={sentenceForm.tags}
                      onChange={(event) => updateSentenceForm({ tags: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-sentence-field="tags"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Sentence text</span>
                    <textarea
                      value={sentenceForm.text}
                      onChange={(event) => updateSentenceForm({ text: event.target.value })}
                      disabled={formDisabled}
                      rows={2}
                      data-content-ops-sentence-field="text"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Source notes</span>
                    <textarea
                      value={sentenceForm.sourceNote}
                      onChange={(event) => updateSentenceForm({ sourceNote: event.target.value })}
                      disabled={formDisabled}
                      rows={2}
                      data-content-ops-sentence-field="sourceNote"
                    />
                  </label>
                  <label>
                    <span className="small muted">Provenance source</span>
                    <input
                      value={sentenceForm.provenanceSource}
                      onChange={(event) => updateSentenceForm({ provenanceSource: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-sentence-field="provenanceSource"
                    />
                  </label>
                  <label>
                    <span className="small muted">Provenance note</span>
                    <input
                      value={sentenceForm.provenanceNote}
                      onChange={(event) => updateSentenceForm({ provenanceNote: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-sentence-field="provenanceNote"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Retirement reason</span>
                    <input
                      value={sentenceForm.retirementReason}
                      onChange={(event) => updateSentenceForm({ retirementReason: event.target.value })}
                      disabled={formDisabled || sentenceMode === 'create'}
                      data-content-ops-sentence-field="retirementReason"
                    />
                  </label>
                </div>
                <div className="content-ops-word-editor-actions">
                  <button type="submit" className="btn primary compact" disabled={formDisabled}>
                    Save sentence
                  </button>
                  <button
                    type="button"
                    className="btn secondary compact"
                    onClick={submitSentenceRemoval}
                    disabled={formDisabled || sentenceMode === 'create' || !selectedSentence}
                    data-content-ops-sentence-remove="true"
                  >
                    {currentWord?.sentences?.some((sentence) => sentence.id === selectedSentence?.id) ? 'Retire sentence' : 'Delete draft sentence'}
                  </button>
                </div>
              </form>
              <form
                className="content-ops-word-editor"
                data-content-ops-word-list-editor="true"
                onSubmit={submitWordListForm}
              >
                <div className="content-ops-word-editor-header">
                  <div>
                    <div className="eyebrow">Word-list editor</div>
                    <strong>{wordListMode === 'create' ? 'New word list' : (wordListForm.title || selectedList?.title || 'Selected list')}</strong>
                  </div>
                  <div className="chip-row content-ops-chip-wrap">
                    <button type="button" className="btn secondary compact" onClick={startEditWordList} disabled={!selectedList}>
                      Edit list
                    </button>
                    <button type="button" className="btn secondary compact" onClick={startCreateWordList}>
                      New list
                    </button>
                  </div>
                </div>
                <div className="content-ops-word-editor-grid">
                  <label>
                    <span className="small muted">List ID</span>
                    <input
                      value={wordListForm.id}
                      onChange={(event) => updateWordListForm({ id: event.target.value })}
                      disabled={formDisabled || wordListMode !== 'create'}
                      data-content-ops-word-list-field="id"
                    />
                  </label>
                  <label>
                    <span className="small muted">Title</span>
                    <input
                      value={wordListForm.title}
                      onChange={(event) => updateWordListForm({ title: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="title"
                    />
                  </label>
                  <label>
                    <span className="small muted">Pool</span>
                    <select
                      value={wordListForm.spellingPool}
                      onChange={(event) => updateWordListForm({ spellingPool: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="spellingPool"
                    >
                      {poolOptions.map((pool) => (
                        <option key={pool.id} value={pool.id}>{pool.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="small muted">Coverage</span>
                    <input
                      value={wordListForm.coverageTier}
                      onChange={(event) => updateWordListForm({ coverageTier: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="coverageTier"
                    />
                  </label>
                  <label>
                    <span className="small muted">Year groups</span>
                    <input
                      value={wordListForm.yearGroups}
                      onChange={(event) => updateWordListForm({ yearGroups: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="yearGroups"
                    />
                  </label>
                  <label>
                    <span className="small muted">Tags</span>
                    <input
                      value={wordListForm.tags}
                      onChange={(event) => updateWordListForm({ tags: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="tags"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Word slugs</span>
                    <textarea
                      value={wordListForm.wordSlugs}
                      onChange={(event) => updateWordListForm({ wordSlugs: event.target.value })}
                      disabled={formDisabled}
                      rows={2}
                      data-content-ops-word-list-field="wordSlugs"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Source notes</span>
                    <textarea
                      value={wordListForm.sourceNote}
                      onChange={(event) => updateWordListForm({ sourceNote: event.target.value })}
                      disabled={formDisabled}
                      rows={2}
                      data-content-ops-word-list-field="sourceNote"
                    />
                  </label>
                  <label>
                    <span className="small muted">Provenance source</span>
                    <input
                      value={wordListForm.provenanceSource}
                      onChange={(event) => updateWordListForm({ provenanceSource: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="provenanceSource"
                    />
                  </label>
                  <label>
                    <span className="small muted">Provenance note</span>
                    <input
                      value={wordListForm.provenanceNote}
                      onChange={(event) => updateWordListForm({ provenanceNote: event.target.value })}
                      disabled={formDisabled}
                      data-content-ops-word-list-field="provenanceNote"
                    />
                  </label>
                  <label className="content-ops-word-editor-wide">
                    <span className="small muted">Retirement reason</span>
                    <input
                      value={wordListForm.retirementReason}
                      onChange={(event) => updateWordListForm({ retirementReason: event.target.value })}
                      disabled={formDisabled || wordListMode === 'create'}
                      data-content-ops-word-list-field="retirementReason"
                    />
                  </label>
                </div>
                <div className="content-ops-word-editor-actions">
                  <button type="submit" className="btn primary compact" disabled={formDisabled}>
                    Save list
                  </button>
                  <button
                    type="button"
                    className="btn secondary compact"
                    onClick={submitWordListRemoval}
                    disabled={formDisabled || wordListMode === 'create' || !selectedList}
                    data-content-ops-word-list-remove="true"
                  >
                    {selectedList?.draftState === 'added' ? 'Delete draft list' : 'Retire list'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="feedback admin-note-spaced" data-content-ops-spelling-empty="true">
              No spelling words match the current filters.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ConflictResolverPanel({
  conflicts,
  disabled,
  active,
  onResolve,
}) {
  const [edits, setEdits] = React.useState({});
  if (!conflicts.length) return null;

  return (
    <div className="content-ops-conflict-resolver" data-content-ops-conflict-resolver="true">
      <div className="content-ops-conflict-header">
        <div>
          <div className="eyebrow">Conflict resolver</div>
          <strong>{String(conflicts.length)} unresolved field {conflicts.length === 1 ? 'conflict' : 'conflicts'}</strong>
        </div>
        <span className="chip bad">Publish blocked</span>
      </div>
      {conflicts.map((conflict, index) => {
        const key = conflictKey(conflict, index);
        const editValue = Object.prototype.hasOwnProperty.call(edits, key)
          ? edits[key]
          : formatConflictValue(conflict.packageValue);
        const resolve = (resolution, rawValue = undefined) => {
          if (!onResolve) return;
          onResolve(conflict, resolution, rawValue);
        };
        return (
          <article className="content-ops-conflict-card" key={key} data-conflict-id={key}>
            <div className="content-ops-conflict-meta">
              <span className="chip bad">{conflict.code || 'conflict'}</span>
              <strong>{conflict.entityType} / {conflict.entityId}</strong>
              <code>{conflict.fieldPath || '$'}</code>
            </div>
            <div className="content-ops-conflict-values">
              <div>
                <span className="small muted">Package value</span>
                <pre>{formatConflictValue(conflict.packageValue) || 'Empty'}</pre>
              </div>
              <div>
                <span className="small muted">Current release value</span>
                <pre>{formatConflictValue(conflict.currentValue) || 'Empty'}</pre>
              </div>
            </div>
            <label className="content-ops-notes-field">
              <span className="small muted">Merged value</span>
              <textarea
                value={editValue}
                onChange={(event) => setEdits((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))}
                rows={4}
                data-content-ops-conflict-edit={key}
              />
            </label>
            <div className="actions content-ops-lifecycle-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={disabled || active}
                onClick={() => resolve('package')}
              >
                Keep package value
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={disabled || active}
                onClick={() => resolve('current')}
              >
                Keep current value
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={disabled || active}
                onClick={() => resolve('edit', parseConflictEditValue(editValue, conflict))}
              >
                Save merged value
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PackageLifecyclePanel({
  contentPackage,
  actor,
  lifecycleState,
  actionAvailability = {},
  onRunAction,
}) {
  const [notes, setNotes] = React.useState('');
  const [allowAudioFallback, setAllowAudioFallback] = React.useState(false);
  const [audioFallbackReason, setAudioFallbackReason] = React.useState('');
  const candidate = latestCandidateForPackage(contentPackage, lifecycleState);
  const canEdit = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.EDIT);
  const canApprove = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.APPROVE);
  const canPublish = actorCan(actor, CONTENT_OPERATION_CAPABILITIES.PUBLISH);
  const conflicts = candidate?.conflicts || [];
  React.useEffect(() => {
    setAllowAudioFallback(false);
    setAudioFallbackReason('');
  }, [contentPackage.packageId, candidate?.candidateId]);
  const isRunning = Boolean(
    lifecycleState?.running
      && lifecycleState.packageId === contentPackage.packageId
  );
  const activeAction = isRunning ? lifecycleState.action : '';
  const actionError = lifecycleState?.packageId === contentPackage.packageId
    ? lifecycleState.error
    : null;
  const actionMessageText = lifecycleState?.packageId === contentPackage.packageId
    ? lifecycleState.message
    : '';
  const blockingSections = candidate?.blockers?.blockingSections || [];
  const audioApprovalBlocked = blockingSections.includes('audio');
  const nonAudioApprovalBlocked = blockingSections
    .filter((section) => section !== 'publishReadiness' && section !== 'audio')
    .length > 0;
  const fallbackReason = audioFallbackReason.trim();
  const fallbackReady = audioApprovalBlocked && allowAudioFallback && fallbackReason.length > 0;
  const approvalBlocked = !candidate || nonAudioApprovalBlocked || (audioApprovalBlocked && !fallbackReady);
  const validateDisabled = !actionAvailability.validate || !canEdit || isRunning || contentPackage.state === 'published';
  const approveDisabled = !canApprove
    || !actionAvailability.approve
    || isRunning
    || !candidate?.candidateId
    || approvalBlocked
    || contentPackage.state === 'published';
  const publishDisabled = !canPublish
    || !actionAvailability.publish
    || isRunning
    || contentPackage.state !== 'approved';
  const resolveDisabled = !canEdit
    || !actionAvailability.resolveConflict
    || isRunning
    || contentPackage.state === 'published';

  const run = (action) => {
    if (!onRunAction) return;
    onRunAction(action, {
      packageId: contentPackage.packageId,
      candidateId: candidate?.candidateId || '',
      candidateHash: candidate?.candidateHash || '',
      notes,
      audioFallback: action === 'approve' && fallbackReady
        ? { reason: fallbackReason }
        : null,
    });
  };
  const resolveConflict = (conflict, resolution, value) => {
    if (!onRunAction) return;
    onRunAction('resolve-conflict', {
      packageId: contentPackage.packageId,
      conflictId: conflict?.conflictId || '',
      conflict,
      resolution,
      value,
    });
  };

  return (
    <section className="content-ops-lifecycle" aria-label="Package lifecycle">
      <div className="content-ops-lifecycle-header">
        <div>
          <div className="eyebrow">Lifecycle</div>
          <h5>Validate, approve, publish</h5>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <span className="chip">Edit {canEdit ? 'allowed' : 'locked'}</span>
          <span className="chip">Approve {canApprove ? 'allowed' : 'locked'}</span>
          <span className="chip">Publish {canPublish ? 'allowed' : 'locked'}</span>
        </div>
      </div>
      <div className="content-ops-candidate-grid">
        <MetricTile
          label="Candidate"
          value={candidate?.candidateId || 'Not built'}
          detail={candidate?.createdAt ? formatTimestamp(candidate.createdAt) : 'Run validation first'}
        />
        <MetricTile
          label="Candidate hash"
          value={candidate?.candidateHash || 'Pending'}
          detail={candidate?.operationsHash ? `Operations ${candidate.operationsHash}` : 'Operations hash pending'}
        />
        <MetricTile
          label="Release base"
          value={candidate?.baseReleaseId || contentPackage.baseReleaseId || 'First release'}
          detail={`Current ${candidate?.currentReleaseId || 'bundled fallback'}`}
        />
        <MetricTile
          label="Validation"
          value={candidate?.validation?.status || contentPackage.blockers.validation.status}
          detail={`${String(candidate?.validation?.errorCount || 0)} errors, ${String(candidate?.validation?.warningCount || 0)} warnings`}
        />
      </div>
      <ConflictResolverPanel
        conflicts={conflicts}
        disabled={resolveDisabled}
        active={activeAction === 'resolve-conflict'}
        onResolve={resolveConflict}
      />
      <div className="content-ops-lifecycle-controls">
        <label className="content-ops-notes-field">
          <span className="small muted">Approval notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            data-content-ops-approval-notes="true"
          />
        </label>
        {audioApprovalBlocked ? (
          <div className="content-ops-notes-field">
            <label className="content-ops-checkbox-row">
              <input
                type="checkbox"
                checked={allowAudioFallback}
                onChange={(event) => setAllowAudioFallback(event.target.checked)}
                data-content-ops-audio-fallback-toggle="true"
              />
              <span>Allow runtime TTS fallback</span>
            </label>
            <label>
              <span className="small muted">Fallback reason</span>
              <textarea
                value={audioFallbackReason}
                onChange={(event) => setAudioFallbackReason(event.target.value)}
                rows={2}
                disabled={!allowAudioFallback}
                data-content-ops-audio-fallback-reason="true"
              />
            </label>
          </div>
        ) : null}
        <div className="actions content-ops-lifecycle-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={validateDisabled}
            aria-busy={activeAction === 'validate' ? 'true' : undefined}
            data-content-ops-action="validate"
            onClick={() => run('validate')}
          >
            Validate candidate
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={approveDisabled}
            aria-busy={activeAction === 'approve' ? 'true' : undefined}
            data-content-ops-action="approve"
            onClick={() => run('approve')}
          >
            Approve candidate
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={publishDisabled}
            aria-busy={activeAction === 'publish' ? 'true' : undefined}
            data-content-ops-action="publish"
            onClick={() => run('publish')}
          >
            Publish package
          </button>
        </div>
      </div>
      {approvalBlocked && candidate ? (
        <>
          <BlockerSummary blockers={candidate.blockers} sectionKey="validation" />
          <BlockerSummary blockers={candidate.blockers} sectionKey="conflicts" />
          <BlockerSummary blockers={candidate.blockers} sectionKey="audio" />
          <BlockerSummary blockers={candidate.blockers} sectionKey="assets" />
          <BlockerSummary blockers={candidate.blockers} sectionKey="rewards" />
          <BlockerSummary blockers={candidate.blockers} sectionKey="visibility" />
          <BlockerSummary blockers={candidate.blockers} sectionKey="exposure" />
        </>
      ) : null}
      {actionError ? (
        <div className="feedback warn admin-note-spaced" data-content-ops-action-error="true">
          <strong>{actionError.code}</strong>
          <div>{actionError.message}</div>
        </div>
      ) : actionMessageText ? (
        <div className="feedback good admin-note-spaced" data-content-ops-action-message="true">
          {actionMessageText}
        </div>
      ) : null}
    </section>
  );
}

function PackageDetailBody({
  contentPackage,
  activeTab,
  events,
  actor,
  audioState,
  audioActionAvailability,
  onRunAudioAction,
}) {
  if (activeTab === 'spelling') {
    return (
      <div>
        <h5>Spelling operations</h5>
        {contentPackage.operations.length ? (
          <ul className="content-ops-operation-list">
            {contentPackage.operations.map((operation) => (
              <li key={operation.operationId}>
                <strong>{operation.action}</strong>
                {' '}
                {operation.entityType}
                {' '}
                <code>{operation.entityId}</code>
                {operation.fieldPath ? <span className="small muted"> - {operation.fieldPath}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <span className="small muted">No spelling operations recorded.</span>
        )}
      </div>
    );
  }

  if (activeTab === 'approvals') {
    return (
      <div className="chip-row content-ops-chip-wrap">
        <span className="chip">Approved {formatTimestamp(contentPackage.approvedAt)}</span>
        <span className="chip">Published {formatTimestamp(contentPackage.publishedAt)}</span>
      </div>
    );
  }

  if (activeTab === 'audit') {
    return (
      <div>
        {events.length ? (
          <ul className="content-ops-operation-list">
            {events.map((event) => (
              <li key={event.eventId}>
                <strong>{event.eventType}</strong>
                <span className="small muted"> - {formatTimestamp(event.createdAt)}</span>
                {event.actorAccountId ? <span className="small muted"> - {event.actorAccountId}</span> : null}
                {eventDetailText(event) ? (
                  <div className="small muted content-ops-event-detail">{eventDetailText(event)}</div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <span className="small muted">No audit events recorded.</span>
        )}
      </div>
    );
  }

  if (activeTab === 'audio') {
    return (
      <AudioOperationsPanel
        contentPackage={contentPackage}
        actor={actor}
        audioState={audioState}
        actionAvailability={audioActionAvailability}
        onRunAction={onRunAudioAction}
      />
    );
  }

  if (activeTab === 'monstersAssets') {
    return (
      <MonsterAssetsPanel
        contentPackage={contentPackage}
        blockerSection={DETAIL_TAB_BLOCKER_SECTIONS.monstersAssets}
      />
    );
  }

  const tab = CONTENT_OPERATION_DETAIL_TABS.find((entry) => entry.key === activeTab);
  const blockerSection = DETAIL_TAB_BLOCKER_SECTIONS[activeTab];
  return (
    <div className="content-ops-domain-placeholder">
      <span className="chip">Package-scoped</span>
      {tab ? <strong>{tab.label}</strong> : null}
      {blockerSection ? (
        <BlockerSummary blockers={contentPackage.blockers} sectionKey={blockerSection} />
      ) : null}
    </div>
  );
}

function PackageDetail({
  detail,
  selectedPackageId,
  loadingDetailId,
  detailErrorId,
  activeTab,
  onSelectTab,
  actor,
  lifecycleState,
  lifecycleActionAvailability,
  onRunLifecycleAction,
  audioState,
  audioActionAvailability,
  onRunAudioAction,
}) {
  const contentPackage = detail?.package || null;
  if (!selectedPackageId) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-no-package="true">
        No package selected.
      </div>
    );
  }
  if (detailErrorId === selectedPackageId) {
    return (
      <div className="feedback warn admin-note-spaced" data-content-ops-detail-error="true">
        Package detail could not be loaded.
      </div>
    );
  }
  if (!contentPackage || loadingDetailId === selectedPackageId) {
    return (
      <div className="feedback warn admin-note-spaced" data-content-ops-detail-loading="true">
        Package detail is loading.
      </div>
    );
  }

  const events = Array.isArray(detail.events) ? detail.events : [];
  return (
    <div className="content-ops-detail" data-package-detail={contentPackage.packageId}>
      <div className="content-ops-detail-header">
        <div>
          <div className="eyebrow">Package detail</div>
          <h4 className="section-title admin-section-title">{contentPackage.title}</h4>
          <p className="small muted admin-note-spaced">
            {contentPackage.packageId} - base {contentPackage.baseReleaseId || 'first release'}
          </p>
        </div>
        <div className="chip-row content-ops-chip-wrap">
          <PackageStateChip contentPackage={contentPackage} />
          <span className="chip">{operationCountLabel(contentPackage, 'long')}</span>
          {contentPackage.blockers.warningCount ? (
            <span className="chip warn">{String(contentPackage.blockers.warningCount)} warning sections</span>
          ) : null}
        </div>
      </div>
      <PackageLifecyclePanel
        contentPackage={contentPackage}
        actor={actor}
        lifecycleState={lifecycleState}
        actionAvailability={lifecycleActionAvailability}
        onRunAction={onRunLifecycleAction}
      />
      <DetailTabNav activeTab={activeTab} onSelect={onSelectTab} />
      <div className="content-ops-detail-body" role="tabpanel">
        <PackageDetailBody
          contentPackage={contentPackage}
          activeTab={activeTab}
          events={events}
          actor={actor}
          audioState={audioState}
          audioActionAvailability={audioActionAvailability}
          onRunAudioAction={onRunAudioAction}
        />
      </div>
    </div>
  );
}

function releaseProofChipClass(status) {
  if (status === 'recorded' || status === 'not_required') return 'good';
  if (status === 'partial') return 'warn';
  return 'warn';
}

function releaseProofLabel(status) {
  if (status === 'recorded') return 'Recorded';
  if (status === 'partial') return 'Partial';
  if (status === 'missing') return 'Missing';
  if (status === 'not_required') return 'Not required';
  return 'Unknown';
}

function releaseSurfaceLabels(surfaces = []) {
  return surfaces.map((surface) => surface.label || surface.key).filter(Boolean).join(', ');
}

function releaseChangedEntityLines(changedEntities = null) {
  return (changedEntities?.preview || [])
    .slice(0, 3)
    .map((entry) => {
      const actions = Array.isArray(entry.actions) && entry.actions.length ? entry.actions.join('/') : 'changed';
      const fields = Array.isArray(entry.fields) && entry.fields.length ? entry.fields.join(', ') : '$';
      return `${entry.entityType}:${entry.entityId} ${actions} ${fields}`;
    });
}

function releaseAssetChangeLines(assetChanges = null) {
  const uploadCount = Number(assetChanges?.uploadCount) || 0;
  const referenceCount = Number(assetChanges?.referenceCount) || 0;
  if (!uploadCount && !referenceCount) return [];
  const lines = [`Assets ${uploadCount} uploads / ${referenceCount} references`];
  for (const reference of (assetChanges?.preview || []).slice(0, 2)) {
    const target = [reference.monsterId, reference.branchId, reference.stageId].filter(Boolean).join('/');
    lines.push(target || reference.assetUploadId || reference.referenceId || 'asset reference');
  }
  return lines;
}

function ReleaseTable({ releases }) {
  if (!releases.length) {
    return (
      <div className="feedback admin-note-spaced" data-content-ops-empty-releases="true">
        No global content operation releases yet.
      </div>
    );
  }
  return (
    <div className="content-ops-table-scroll">
      <table className="admin-overview-table content-ops-table" aria-label="Content operation releases">
        <thead>
          <tr className="admin-overview-thead-row">
            <th className="small admin-overview-th-first">Release</th>
            <th className="small admin-overview-th">Status</th>
            <th className="small admin-overview-th">Package</th>
            <th className="small admin-overview-th">Actors</th>
            <th className="small admin-overview-th">Changed</th>
            <th className="small admin-overview-th">Audio</th>
            <th className="small admin-overview-th">Proof</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((release) => {
            const fallback = release.audioFallback || null;
            const audioWarnings = release.audioWarnings || null;
            const warnings = Array.isArray(audioWarnings?.warnings) ? audioWarnings.warnings : [];
            const affectedCount = Number(
              audioWarnings?.affectedCount
                ?? fallback?.affectedMatrix?.affectedCount
                ?? 0,
            ) || 0;
            const history = release.history || null;
            const changedEntities = history?.changedEntities || null;
            const productionProof = history?.productionProof || null;
            const proofStatus = productionProof?.status || (release.hasCallerProof ? 'recorded' : 'missing');
            const missingSurfaces = releaseSurfaceLabels(productionProof?.missingSurfaces || []);
            const linkedSurfaces = releaseSurfaceLabels(productionProof?.linkedSurfaces || []);
            const capture = productionProof?.capturedAt
              ? `Captured by ${productionProof.capturedByAccountId || 'unknown'} ${formatTimestamp(productionProof.capturedAt)}`
              : '';
            const entityTypeSummary = (changedEntities?.entityTypes || [])
              .slice(0, 3)
              .map((entry) => `${entry.entityType} ${entry.entityCount}`)
              .join(', ');
            const changedLines = releaseChangedEntityLines(changedEntities);
            const assetLines = releaseAssetChangeLines(history?.assetChanges);
            return (
              <tr
                key={release.releaseId}
                className="admin-overview-tbody-row"
                data-content-ops-release-history-row={release.releaseId}
              >
                <td className="admin-overview-td-first">
                  {release.releaseId}
                  <div className="small muted">{release.snapshotHash || 'hash pending'}</div>
                </td>
                <td className="admin-overview-td">
                  <span className={`chip ${release.status === 'published' ? 'good' : ''}`}>
                    {release.status}
                  </span>
                </td>
                <td className="admin-overview-td small">
                  {history?.package?.title || release.packageId || 'seeded'}
                  <div className="small muted">{release.packageId || 'first release'}</div>
                </td>
                <td className="admin-overview-td small">
                  <div>Published by {history?.publishedByAccountId || release.publishedByAccountId || 'unknown'}</div>
                  <div className="small muted">{formatTimestamp(history?.publishedAt || release.publishedAt || release.createdAt)}</div>
                  <div className="small muted">Approved by {history?.approvedByAccountId || 'n/a'}</div>
                </td>
                <td className="admin-overview-td small">
                  <strong>{String(changedEntities?.entityCount || 0)} entities</strong>
                  <div className="small muted">{String(changedEntities?.operationCount || 0)} operations</div>
                  {entityTypeSummary ? <div className="small muted">{entityTypeSummary}</div> : null}
                  {changedLines.map((line) => (
                    <div className="small muted" key={line}>{line}</div>
                  ))}
                  {assetLines.map((line) => (
                    <div className="small muted" key={line}>{line}</div>
                  ))}
                </td>
                <td className="admin-overview-td">
                  {fallback?.allowed ? (
                    <div className="content-ops-release-audio">
                      <span className="chip warn">Audio fallback</span>
                      <div className="small muted">{String(affectedCount)} affected</div>
                      {warnings.length ? (
                        <div className="small muted">{warnings.slice(0, 3).join(', ')}</div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="chip good">Ready</span>
                  )}
                </td>
                <td className="admin-overview-td">
                  <span
                    className={`chip ${releaseProofChipClass(proofStatus)}`}
                    data-content-ops-release-proof-status={proofStatus}
                  >
                  {releaseProofLabel(proofStatus)}
                  </span>
                  {missingSurfaces ? <div className="small muted">Missing {missingSurfaces}</div> : null}
                  {!missingSurfaces && linkedSurfaces ? <div className="small muted">{linkedSurfaces}</div> : null}
                  {capture ? <div className="small muted">{capture}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AdminContentOperationsSection({
  model,
  actions,
  initialOverview = null,
  initialPackages = null,
  initialReleases = null,
  initialPackageDetail = null,
  initialSpellingBrowse = null,
  initialSpellingItemDetail = null,
  initialSelectedPackageId = '',
  initialActiveTab = 'overview',
  initialDetailTab = 'spelling',
}) {
  const seedOverview = initialOverview || model?.contentOperations?.overview || null;
  const seedPackages = initialPackages || model?.contentOperations?.packages || null;
  const seedReleases = initialReleases || model?.contentOperations?.releases || null;
  const seedPackageDetail = initialPackageDetail || model?.contentOperations?.packageDetail || null;
  const seedSpellingBrowse = initialSpellingBrowse || model?.contentOperations?.spellingBrowse || null;
  const seedSpellingItemDetail = initialSpellingItemDetail || model?.contentOperations?.spellingItemDetail || null;
  const hasSeedData = Boolean(seedOverview || seedPackages || seedReleases || seedPackageDetail || seedSpellingBrowse);
  const [overviewPayload, setOverviewPayload] = React.useState(seedOverview);
  const [packageListPayload, setPackageListPayload] = React.useState(seedPackages);
  const [releaseListPayload, setReleaseListPayload] = React.useState(seedReleases);
  const [detailPayload, setDetailPayload] = React.useState(seedPackageDetail);
  const [spellingBrowsePayload, setSpellingBrowsePayload] = React.useState(seedSpellingBrowse);
  const [spellingItemPayload, setSpellingItemPayload] = React.useState(seedSpellingItemDetail);
  const [spellingFilters, setSpellingFilters] = React.useState({
    query: '',
    pool: 'all',
    listId: '',
    limit: 75,
  });
  const [selectedWordSlug, setSelectedWordSlug] = React.useState(
    normaliseContentOperationsSpellingItemDetail(seedSpellingItemDetail).slug,
  );
  const [selectedPackageId, setSelectedPackageId] = React.useState(initialPackageId({
    packageDetail: seedPackageDetail,
    initialActiveTab,
    initialSelectedPackageId,
  }));
  const [activeTab, setActiveTab] = React.useState(initialActiveTab);
  const [activeDetailTab, setActiveDetailTab] = React.useState(initialDetailTab);
  const [loading, setLoading] = React.useState(Boolean(actions?.contentOperationsApi?.readOverview && !hasSeedData));
  const [loadingSpellingBrowse, setLoadingSpellingBrowse] = React.useState(false);
  const [loadingSpellingItem, setLoadingSpellingItem] = React.useState(false);
  const [loadingDetailId, setLoadingDetailId] = React.useState('');
  const [detailErrorId, setDetailErrorId] = React.useState('');
  const [refreshError, setRefreshError] = React.useState(null);
  const [spellingError, setSpellingError] = React.useState(null);
  const [refreshedAt, setRefreshedAt] = React.useState(hasSeedData ? Date.now() : null);
  const [lifecycleState, setLifecycleState] = React.useState({
    packageId: '',
    action: '',
    running: false,
    message: '',
    error: null,
    candidate: null,
    approval: null,
    release: null,
  });
  const [audioOperationState, setAudioOperationState] = React.useState({
    packageId: '',
    action: '',
    running: false,
    message: '',
    error: null,
    candidate: null,
  });
  const [spellingOperationState, setSpellingOperationState] = React.useState({
    packageId: '',
    action: '',
    running: false,
    message: '',
    error: null,
  });
  const detailRequestRef = React.useRef({ id: '', seq: 0 });
  const spellingBrowseRequestRef = React.useRef(0);
  const spellingItemRequestRef = React.useRef({ slug: '', seq: 0 });
  const refreshRequestRef = React.useRef(0);
  const api = actions?.contentOperationsApi || null;

  const overview = React.useMemo(
    () => normaliseContentOperationsOverview(overviewPayload),
    [overviewPayload],
  );
  const packages = React.useMemo(() => {
    const listed = normaliseContentOperationsPackageList(packageListPayload);
    return listed.length ? listed : collectLanePackages(overview);
  }, [overview, packageListPayload]);
  const releases = React.useMemo(() => {
    const listed = normaliseContentOperationsReleaseList(releaseListPayload);
    return listed.length ? listed : overview.recentReleases;
  }, [overview.recentReleases, releaseListPayload]);
  const detail = React.useMemo(
    () => normaliseContentOperationsPackageDetail(detailPayload),
    [detailPayload],
  );
  const spellingBrowse = React.useMemo(
    () => normaliseContentOperationsSpellingBrowse(spellingBrowsePayload),
    [spellingBrowsePayload],
  );
  const spellingItemDetail = React.useMemo(
    () => normaliseContentOperationsSpellingItemDetail(spellingItemPayload),
    [spellingItemPayload],
  );

  const loadPackageDetail = React.useCallback(async (packageId) => {
    if (!api?.readPackage || !packageId) return;
    const seq = detailRequestRef.current.seq + 1;
    detailRequestRef.current = { id: packageId, seq };
    setLoadingDetailId(packageId);
    setDetailErrorId('');
    try {
      const payload = await api.readPackage({ packageId });
      if (detailRequestRef.current.id !== packageId || detailRequestRef.current.seq !== seq) return;
      setDetailPayload(payload);
      setRefreshError((current) => (
        current?.code === 'content_operations_detail_fetch_failed' ? null : current
      ));
    } catch (error) {
      if (detailRequestRef.current.id !== packageId || detailRequestRef.current.seq !== seq) return;
      setDetailPayload(null);
      setDetailErrorId(packageId);
      setRefreshError(errorEnvelope(error, 'content_operations_detail_fetch_failed'));
    } finally {
      if (detailRequestRef.current.id === packageId && detailRequestRef.current.seq === seq) {
        setLoadingDetailId('');
      }
    }
  }, [api]);

  const invalidateSpellingBrowse = React.useCallback(() => {
    spellingBrowseRequestRef.current += 1;
    spellingItemRequestRef.current = {
      slug: '',
      seq: spellingItemRequestRef.current.seq + 1,
    };
    setSpellingBrowsePayload(null);
    setSpellingItemPayload(null);
    setSelectedWordSlug('');
    setSpellingError(null);
    setLoadingSpellingBrowse(false);
    setLoadingSpellingItem(false);
  }, []);

  const selectPackage = React.useCallback((packageId) => {
    invalidateSpellingBrowse();
    setSelectedPackageId(packageId);
    setActiveTab('detail');
    setDetailErrorId('');
    if (api?.readPackage) {
      setDetailPayload((current) => (
        normaliseContentOperationsPackageDetail(current).package?.packageId === packageId ? current : null
      ));
      loadPackageDetail(packageId);
    } else {
      setDetailPayload({ package: packages.find((entry) => entry.packageId === packageId) || null, events: [] });
    }
  }, [api, invalidateSpellingBrowse, loadPackageDetail, packages]);

  const loadSpellingBrowse = React.useCallback(async () => {
    if (!api?.readSpellingBrowse) return;
    const seq = spellingBrowseRequestRef.current + 1;
    spellingBrowseRequestRef.current = seq;
    setLoadingSpellingBrowse(true);
    setSpellingError(null);
    try {
      const payload = await api.readSpellingBrowse({
        packageId: selectedPackageId || null,
        query: spellingFilters.query,
        pool: spellingFilters.pool === 'all' ? null : spellingFilters.pool,
        listId: spellingFilters.listId || null,
        limit: spellingFilters.limit,
      });
      if (spellingBrowseRequestRef.current !== seq) return;
      setSpellingBrowsePayload(payload);
      const nextBrowse = normaliseContentOperationsSpellingBrowse(payload);
      const firstSlug = nextBrowse.words[0]?.slug || '';
      setSelectedWordSlug((current) => (
        current && nextBrowse.words.some((row) => row.slug === current) ? current : firstSlug
      ));
      setRefreshedAt(Date.now());
    } catch (error) {
      if (spellingBrowseRequestRef.current !== seq) return;
      setSpellingError(errorEnvelope(error, 'content_operations_spelling_browse_failed'));
    } finally {
      if (spellingBrowseRequestRef.current === seq) {
        setLoadingSpellingBrowse(false);
      }
    }
  }, [api, selectedPackageId, spellingFilters]);

  const selectSpellingWord = React.useCallback(async (slug) => {
    const safeSlug = String(slug || '');
    setSelectedWordSlug(safeSlug);
    setSpellingItemPayload(null);
    if (!api?.readSpellingWord || !safeSlug) return;
    const seq = spellingItemRequestRef.current.seq + 1;
    spellingItemRequestRef.current = { slug: safeSlug, seq };
    setLoadingSpellingItem(true);
    setSpellingError(null);
    try {
      const payload = await api.readSpellingWord({
        slug: safeSlug,
        packageId: selectedPackageId || null,
      });
      if (spellingItemRequestRef.current.slug !== safeSlug || spellingItemRequestRef.current.seq !== seq) return;
      setSpellingItemPayload(payload);
    } catch (error) {
      if (spellingItemRequestRef.current.slug !== safeSlug || spellingItemRequestRef.current.seq !== seq) return;
      setSpellingError(errorEnvelope(error, 'content_operations_spelling_word_failed'));
    } finally {
      if (spellingItemRequestRef.current.slug === safeSlug && spellingItemRequestRef.current.seq === seq) {
        setLoadingSpellingItem(false);
      }
    }
  }, [api, selectedPackageId]);

  const updateSpellingFilters = React.useCallback((patch) => {
    setSpellingFilters((current) => ({ ...current, ...patch }));
  }, []);

  const applySpellingFilters = React.useCallback((event) => {
    event?.preventDefault?.();
    loadSpellingBrowse();
  }, [loadSpellingBrowse]);

  const runSpellingOperation = React.useCallback(async (operation, {
    slug = '',
    action = 'spelling-operation',
  } = {}) => {
    if (!api?.appendOperation || !selectedPackageId) return;
    setSpellingOperationState({
      packageId: selectedPackageId,
      action,
      running: true,
      message: '',
      error: null,
    });
    try {
      await api.appendOperation({
        packageId: selectedPackageId,
        operation,
        mutation: contentOperationMutation(action, selectedPackageId),
      });
      const noun = SPELLING_OPERATION_NOUNS[operation.entityType] || 'Word';
      setSpellingOperationState({
        packageId: selectedPackageId,
        action,
        running: false,
        message: operation.action === 'remove'
          ? `Draft ${noun.toLowerCase()} deleted.`
          : (operation.action === 'retire' ? `${noun} retired.` : `${noun} operation saved.`),
        error: null,
      });
      if (api.readPackage) {
        await loadPackageDetail(selectedPackageId);
      }
      await loadSpellingBrowse();
      if (slug && api.readSpellingWord && operation.action !== 'remove') {
        await selectSpellingWord(slug);
      }
    } catch (opError) {
      setSpellingOperationState({
        packageId: selectedPackageId,
        action,
        running: false,
        message: '',
        error: errorEnvelope(opError, 'content_operations_spelling_operation_failed'),
      });
    }
  }, [api, loadPackageDetail, loadSpellingBrowse, selectSpellingWord, selectedPackageId]);

  const refresh = React.useCallback(async () => {
    if (!api?.readOverview) return;
    const seq = refreshRequestRef.current + 1;
    refreshRequestRef.current = seq;
    setLoading(true);
    setRefreshError(null);
    try {
      const [nextOverview, nextPackages, nextReleases] = await Promise.all([
        api.readOverview({ limit: 30, includeHistory: true }),
        api.readPackages?.({ limit: 50 }),
        api.readReleases?.({ limit: 20, includeHistory: true }),
      ]);
      if (refreshRequestRef.current !== seq) return;
      setOverviewPayload(nextOverview);
      setPackageListPayload(nextPackages);
      setReleaseListPayload(nextReleases);
      setRefreshedAt(Date.now());
      if (selectedPackageId && api.readPackage) {
        await loadPackageDetail(selectedPackageId);
      }
    } catch (error) {
      if (refreshRequestRef.current !== seq) return;
      setRefreshError(errorEnvelope(error));
    } finally {
      if (refreshRequestRef.current === seq) {
        setLoading(false);
      }
    }
  }, [api, loadPackageDetail, selectedPackageId]);

  React.useEffect(() => {
    if (!api?.readOverview) return;
    if (overviewPayload || packageListPayload || releaseListPayload) return;
    refresh();
  }, [api, overviewPayload, packageListPayload, refresh, releaseListPayload]);

  React.useEffect(() => {
    if (!['spelling', 'poolsRewards', 'heroCodex'].includes(activeTab)) return;
    if (!api?.readSpellingBrowse) return;
    if (spellingBrowsePayload) return;
    loadSpellingBrowse();
  }, [activeTab, api, loadSpellingBrowse, spellingBrowsePayload]);

  React.useEffect(() => {
    if (activeTab !== 'detail') return;
    if (!selectedPackageId || !api?.readPackage) return;
    if (loadingDetailId === selectedPackageId || detailErrorId === selectedPackageId) return;
    if (detail.package?.packageId === selectedPackageId) return;
    loadPackageDetail(selectedPackageId);
  }, [
    activeTab,
    api,
    detail.package?.packageId,
    detailErrorId,
    loadPackageDetail,
    loadingDetailId,
    selectedPackageId,
  ]);

  React.useEffect(() => {
    if (activeTab !== 'audio') return;
    if (!selectedPackageId || !api?.readPackage) return;
    if (loadingDetailId === selectedPackageId || detailErrorId === selectedPackageId) return;
    if (detail.package?.packageId === selectedPackageId) return;
    loadPackageDetail(selectedPackageId);
  }, [
    activeTab,
    api,
    detail.package?.packageId,
    detailErrorId,
    loadPackageDetail,
    loadingDetailId,
    selectedPackageId,
  ]);

  const runLifecycleAction = React.useCallback(async (action, {
    packageId,
    candidateId = '',
    candidateHash = '',
    conflictId = '',
    conflict = null,
    resolution = '',
    value = undefined,
    notes = '',
    audioFallback = null,
  } = {}) => {
    if (!api || !packageId) return;
    setLifecycleState((current) => ({
      ...current,
      packageId,
      action,
      running: true,
      message: '',
      error: null,
    }));
    try {
      let payload = null;
      if (action === 'validate') {
        if (!api.validatePackage) throw new Error('Validate action is not available.');
        payload = await api.validatePackage({
          packageId,
          includeSnapshot: false,
          mutation: contentOperationMutation(action, packageId),
        });
      } else if (action === 'resolve-conflict') {
        if (!api.resolveConflict) throw new Error('Resolve conflict action is not available.');
        payload = await api.resolveConflict({
          packageId,
          conflictId,
          conflict,
          resolution,
          value,
          includeSnapshot: false,
          mutation: contentOperationMutation(action, packageId),
        });
      } else if (action === 'approve') {
        if (!api.approvePackage) throw new Error('Approve action is not available.');
        payload = await api.approvePackage({
          packageId,
          candidateId,
          notes,
          audioFallback,
          mutation: contentOperationMutation(action, packageId),
        });
      } else if (action === 'publish') {
        if (!api.publishPackage) throw new Error('Publish action is not available.');
        payload = await api.publishPackage({
          packageId,
          proof: {
            source: 'content-operations-centre',
            packageId,
            candidateId: candidateId || null,
            candidateHash: candidateHash || null,
            approvalNotes: notes || null,
          },
          mutation: contentOperationMutation(action, packageId),
        });
      }
      const nextCandidate = payload?.candidate
        ? normaliseContentOperationCandidate(payload.candidate)
        : null;
      setLifecycleState((current) => ({
        ...current,
        packageId,
        action,
        running: false,
        message: actionMessage(action),
        error: null,
        candidate: nextCandidate || (current.packageId === packageId ? current.candidate : null),
        approval: payload?.approval || null,
        release: payload?.release || null,
      }));
      invalidateSpellingBrowse();
      if (api.readPackage) {
        await loadPackageDetail(packageId);
      }
      if (action !== 'validate' && api.readOverview) {
        await refresh();
      }
    } catch (error) {
      setLifecycleState((current) => ({
        ...current,
        packageId,
        action,
        running: false,
        message: '',
        error: errorEnvelope(error, `content_operations_${action}_failed`),
      }));
    }
  }, [api, invalidateSpellingBrowse, loadPackageDetail, refresh]);

  const runAudioOperation = React.useCallback(async (action, {
    packageId,
    candidateId = '',
    itemIds = [],
    limit = null,
    override = false,
    reason = '',
  } = {}) => {
    if (!api || !packageId) return;
    setAudioOperationState({
      packageId,
      action,
      running: true,
      message: '',
      error: null,
      candidate: null,
    });
    try {
      let payload = null;
      if (action === 'scan') {
        if (!api.validatePackage) throw new Error('Audio scan action is not available.');
        payload = await api.validatePackage({
          packageId,
          includeSnapshot: false,
          mutation: contentOperationMutation('audio-scan', packageId),
        });
      } else {
        if (!api.generateAudio) throw new Error('Audio generation action is not available.');
        payload = await api.generateAudio({
          packageId,
          candidateId,
          itemIds,
          limit,
          override,
          reason,
          mutation: contentOperationMutation(`audio-${action}`, packageId),
        });
      }
      const nextCandidate = payload?.candidate
        ? normaliseContentOperationCandidate(payload.candidate)
        : null;
      setAudioOperationState({
        packageId,
        action,
        running: false,
        message: audioGenerationMessage(action, payload),
        error: null,
        candidate: nextCandidate,
      });
      invalidateSpellingBrowse();
      if (api.readPackage) {
        await loadPackageDetail(packageId);
      }
      if (api.readOverview) {
        await refresh();
      }
    } catch (error) {
      setAudioOperationState({
        packageId,
        action,
        running: false,
        message: '',
        error: errorEnvelope(error, `content_operations_audio_${action}_failed`),
        candidate: null,
      });
    }
  }, [api, invalidateSpellingBrowse, loadPackageDetail, refresh]);

  const latestRelease = overview.latestRelease;
  const primaryData = overview.openPackageCount || packages.length || releases.length || latestRelease || spellingBrowse.words.length ? {
    overview,
    packages,
    releases,
    latestRelease,
    spellingBrowse,
  } : null;
  const selectedSummary = packages.find((entry) => entry.packageId === selectedPackageId);
  const detailMatchesSelected = detail.package?.packageId === selectedPackageId;
  const safeDetail = detailMatchesSelected
    ? detail
    : (!api?.readPackage && selectedSummary
      ? { package: normaliseContentOperationPackage(selectedSummary), events: [] }
      : { package: null, events: [] });
  const selectedPackageForAudio = safeDetail.package || selectedSummary;
  const warningSectionCount = packages.reduce((sum, entry) => sum + entry.blockers.warningCount, 0);
  const detailActor = safeDetail.actor?.accountId ? safeDetail.actor : overview.actor;
  const spellingActor = spellingBrowse.actor?.accountId ? spellingBrowse.actor : overview.actor;
  const audioActor = safeDetail.actor?.accountId ? safeDetail.actor : overview.actor;
  const lifecycleActionAvailability = {
    validate: Boolean(api?.validatePackage),
    resolveConflict: Boolean(api?.resolveConflict),
    approve: Boolean(api?.approvePackage),
    publish: Boolean(api?.publishPackage),
  };
  const audioActionAvailability = {
    scan: Boolean(api?.validatePackage),
    generate: Boolean(api?.generateAudio),
  };

  return (
    <AdminPanelFrame
      eyebrow="Content Operations Centre"
      title="Spelling package workflow"
      subtitle="Global spelling release packages and readiness."
      refreshedAt={refreshedAt}
      refreshError={refreshError}
      onRefresh={api?.readOverview ? refresh : undefined}
      loading={loading}
      data={primaryData}
      emptyState={(
        <div className="feedback" data-content-ops-empty="true">
          No content operation package data.
        </div>
      )}
    >
      <div className="content-ops-metric-grid">
        <MetricTile
          label="Latest release"
          value={latestRelease?.releaseId || 'None'}
          detail={latestRelease ? formatTimestamp(latestRelease.publishedAt || latestRelease.createdAt) : 'Bundled fallback active'}
        />
        <MetricTile label="Open packages" value={String(overview.openPackageCount || packages.length)} detail="Drafts and review lanes" />
        <MetricTile label="Approved" value={String(overview.laneCounts.approvedPendingPublish || 0)} detail="Pending publish" />
        <MetricTile label="Warnings" value={String(warningSectionCount)} detail="Audio, assets, rewards, visibility" />
      </div>

      <CentreTabNav activeTab={activeTab} onSelect={setActiveTab} />

      {activeTab === 'overview' ? (
        <OverviewLanes overview={overview} onSelectPackage={selectPackage} />
      ) : null}

      {activeTab === 'packages' ? (
        <PackageTable
          packages={packages}
          selectedPackageId={selectedPackageId}
          onSelectPackage={selectPackage}
        />
      ) : null}

      {['spelling', 'poolsRewards', 'heroCodex'].includes(activeTab) ? (
        <SpellingBrowsePanel
          areaKey={activeTab}
          browse={spellingBrowse}
          itemDetail={spellingItemDetail}
          filters={spellingFilters}
          selectedWordSlug={selectedWordSlug}
          selectedPackageId={selectedPackageId}
          canEdit={actorCan(spellingActor, CONTENT_OPERATION_CAPABILITIES.EDIT)}
          spellingOperationAvailable={Boolean(api?.appendOperation)}
          spellingOperationState={spellingOperationState}
          loadingBrowse={loadingSpellingBrowse}
          loadingItem={loadingSpellingItem}
          error={spellingError}
          onFilterChange={updateSpellingFilters}
          onApplyFilters={applySpellingFilters}
          onSelectWord={selectSpellingWord}
          onSubmitSpellingOperation={runSpellingOperation}
        />
      ) : null}

      {['audio', 'monstersAssets', 'approvals'].includes(activeTab) ? (
        <PublishedAreaPanel
          activeTab={activeTab}
          latestRelease={latestRelease}
          selectedPackageId={selectedPackageId}
          selectedSummary={selectedPackageForAudio}
          actor={audioActor}
          audioState={audioOperationState}
          audioActionAvailability={audioActionAvailability}
          onRunAudioAction={runAudioOperation}
        />
      ) : null}

      {activeTab === 'detail' ? (
        <PackageDetail
          detail={safeDetail}
          selectedPackageId={selectedPackageId}
          loadingDetailId={loadingDetailId}
          detailErrorId={detailErrorId}
          activeTab={activeDetailTab}
          onSelectTab={setActiveDetailTab}
          actor={detailActor}
          lifecycleState={lifecycleState}
          lifecycleActionAvailability={lifecycleActionAvailability}
          onRunLifecycleAction={runLifecycleAction}
          audioState={audioOperationState}
          audioActionAvailability={audioActionAvailability}
          onRunAudioAction={runAudioOperation}
        />
      ) : null}

      {activeTab === 'releases' ? <ReleaseTable releases={releases} /> : null}
    </AdminPanelFrame>
  );
}
