import {
  BUFFERED_AUDIO_SPEED_OPTIONS,
  BUFFERED_GEMINI_VOICE_OPTIONS,
  SPELLING_AUDIO_MODEL,
  SPELLING_AUDIO_ROOT_PREFIX,
  buildAudioAssetKey,
  buildWordAudioAssetKey,
} from '../../../../shared/spelling-audio.js';
import {
  normaliseContentOperation,
} from './operations-model.js';
import {
  normaliseSpellingContentBundle,
} from './model.js';
import {
  isSpellingPoolPotentiallyLearnerVisible,
} from './pool-visibility.js';

export const SPELLING_AUDIO_REQUIREMENT_PROFILE_VERSION = 'spelling-audio-profile-v1';

const WORD_AUDIO_BLOCKING_STATUSES = new Set([
  'missing',
  'stale',
  'generated',
  'failed',
  'skipped',
  'override_requested',
]);

const AUDIO_STATUS_BLOCKER_CODES = Object.freeze({
  word: Object.freeze({
    missing: 'word_audio_missing',
    stale: 'word_audio_stale',
    generated: 'word_audio_not_uploaded',
    failed: 'word_audio_failed',
    skipped: 'word_audio_skipped',
    override_requested: 'word_audio_override_requested',
  }),
  sentence: Object.freeze({
    missing: 'sentence_audio_missing',
    stale: 'sentence_audio_stale',
    generated: 'sentence_audio_not_uploaded',
    failed: 'sentence_audio_failed',
    skipped: 'sentence_audio_skipped',
    override_requested: 'sentence_audio_override_requested',
  }),
});

const AUDIO_IMPACTFUL_WORD_FIELDS = new Set([
  'word',
  'sentenceEntryIds',
  'variants',
  'active',
  'retired',
  'retirement',
  'spellingPool',
  'listId',
]);

const AUDIO_IMPACTFUL_SENTENCE_FIELDS = new Set([
  'text',
  'wordSlug',
  'active',
  'retired',
  'retirement',
]);

const AUDIO_IMPACTFUL_WORD_LIST_FIELDS = new Set([
  'active',
  'retired',
  'retirement',
  'spellingPool',
  'wordSlugs',
]);

const AUDIO_IMPACTFUL_POOL_FIELDS = new Set([
  'active',
  'retired',
  'retirement',
  'visibility',
]);

const AUDIO_IMPACTFUL_VARIANT_FIELDS = new Set([
  'word',
  'sentenceEntryIds',
  'active',
  'retired',
  'retirement',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
  const output = [];
  const seen = new Set();
  for (const value of asArray(values)) {
    const next = normaliseString(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    output.push(next);
  }
  return output;
}

function voiceRoleFor(voiceId) {
  return BUFFERED_GEMINI_VOICE_OPTIONS.find((voice) => voice.id === voiceId)?.role || 'unknown';
}

function defaultVoiceByRole(role, fallbackIndex) {
  return BUFFERED_GEMINI_VOICE_OPTIONS.find((voice) => voice.role === role)?.id
    || BUFFERED_GEMINI_VOICE_OPTIONS[fallbackIndex]?.id
    || BUFFERED_GEMINI_VOICE_OPTIONS[0]?.id
    || '';
}

function defaultSpeedById(speedId) {
  return BUFFERED_AUDIO_SPEED_OPTIONS.find((speed) => speed.id === speedId) || null;
}

function defaultWordProfiles() {
  const maleVoice = defaultVoiceByRole('male', 0);
  const femaleVoice = defaultVoiceByRole('female', 1);
  return [
    {
      profileId: 'male.natural',
      lane: 'word',
      voiceId: maleVoice,
      voiceRole: voiceRoleFor(maleVoice),
      paceId: 'natural',
      speedId: '',
      slow: false,
      required: true,
    },
    {
      profileId: 'female.natural',
      lane: 'word',
      voiceId: femaleVoice,
      voiceRole: voiceRoleFor(femaleVoice),
      paceId: 'natural',
      speedId: '',
      slow: false,
      required: true,
    },
  ];
}

function defaultSentenceProfiles() {
  const maleVoice = defaultVoiceByRole('male', 0);
  const femaleVoice = defaultVoiceByRole('female', 1);
  const standard = defaultSpeedById('standard') || { id: 'standard', slow: false };
  const slow = defaultSpeedById('slow') || { id: 'slow', slow: true };
  return [
    {
      profileId: 'male.normal',
      lane: 'sentence',
      voiceId: maleVoice,
      voiceRole: voiceRoleFor(maleVoice),
      paceId: 'standard',
      speedId: standard.id,
      slow: Boolean(standard.slow),
      required: true,
    },
    {
      profileId: 'male.slow',
      lane: 'sentence',
      voiceId: maleVoice,
      voiceRole: voiceRoleFor(maleVoice),
      paceId: 'slow',
      speedId: slow.id,
      slow: Boolean(slow.slow),
      required: true,
    },
    {
      profileId: 'female.normal',
      lane: 'sentence',
      voiceId: femaleVoice,
      voiceRole: voiceRoleFor(femaleVoice),
      paceId: 'standard',
      speedId: standard.id,
      slow: Boolean(standard.slow),
      required: true,
    },
    {
      profileId: 'female.slow',
      lane: 'sentence',
      voiceId: femaleVoice,
      voiceRole: voiceRoleFor(femaleVoice),
      paceId: 'slow',
      speedId: slow.id,
      slow: Boolean(slow.slow),
      required: true,
    },
  ];
}

export const DEFAULT_SPELLING_WORD_AUDIO_PROFILES = Object.freeze(
  defaultWordProfiles().map((profile) => Object.freeze(profile)),
);

export const DEFAULT_SPELLING_SENTENCE_AUDIO_PROFILES = Object.freeze(
  defaultSentenceProfiles().map((profile) => Object.freeze(profile)),
);

function normaliseProfileEntries(rawEntries, defaults, lane) {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return defaults.map((entry) => ({ ...entry }));
  const defaultsById = new Map(defaults.map((entry) => [entry.profileId, entry]));
  const output = [];
  for (const rawEntry of rawEntries) {
    const raw = typeof rawEntry === 'string' ? { profileId: rawEntry } : (isPlainObject(rawEntry) ? rawEntry : {});
    const profileId = normaliseString(raw.profileId || raw.id);
    const fallback = defaultsById.get(profileId) || null;
    const voiceId = normaliseString(raw.voiceId || raw.voice, fallback?.voiceId || '');
    const speedId = lane === 'sentence'
      ? normaliseString(raw.speedId || raw.speed, fallback?.speedId || 'standard')
      : '';
    const paceId = normaliseString(raw.paceId || raw.pace, fallback?.paceId || (lane === 'word' ? 'natural' : speedId));
    if (!profileId || !voiceId) continue;
    output.push({
      profileId,
      lane,
      voiceId,
      voiceRole: normaliseString(raw.voiceRole || raw.role, fallback?.voiceRole || voiceRoleFor(voiceId)),
      paceId,
      speedId,
      slow: lane === 'sentence'
        ? Boolean(raw.slow ?? fallback?.slow ?? defaultSpeedById(speedId)?.slow)
        : false,
      required: raw.required === false ? false : (fallback?.required !== false),
    });
  }
  return output.length ? output : defaults.map((entry) => ({ ...entry }));
}

export function normaliseSpellingAudioRequirementProfile(rawProfile = null) {
  const raw = isPlainObject(rawProfile) ? rawProfile : {};
  const wordProfiles = normaliseProfileEntries(raw.wordProfiles, DEFAULT_SPELLING_WORD_AUDIO_PROFILES, 'word');
  const sentenceProfiles = normaliseProfileEntries(
    raw.sentenceProfiles,
    DEFAULT_SPELLING_SENTENCE_AUDIO_PROFILES,
    'sentence',
  );
  const modelId = normaliseString(raw.modelId || raw.model, SPELLING_AUDIO_MODEL);
  return {
    profileVersion: normaliseString(raw.profileVersion || raw.version, SPELLING_AUDIO_REQUIREMENT_PROFILE_VERSION),
    modelId,
    wordProfiles,
    sentenceProfiles,
    strict: raw.strict === false ? false : true,
  };
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
  if (!base64) throw new Error('Base64 encoding is not available for spelling audio readiness.');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto SHA-256 is required for spelling audio readiness.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export async function computeSpellingWordAudioContentKey(slug, word) {
  return sha256Base64Url([
    'spelling-audio-word-v1',
    cleanText(slug).toLowerCase(),
    cleanText(word),
  ].join('|'));
}

export async function computeSpellingSentenceAudioContentKey(slug, sentenceIndex, word, sentence) {
  return sha256Base64Url([
    'spelling-audio-content-v2',
    cleanText(slug).toLowerCase(),
    String(Number(sentenceIndex)),
    cleanText(word),
    cleanText(sentence),
  ].join('|'));
}

function draftMaps(bundle) {
  return {
    poolsById: new Map(bundle.draft.pools.map((entry) => [entry.id, entry])),
    wordListsById: new Map(bundle.draft.wordLists.map((entry) => [entry.id, entry])),
    wordsBySlug: new Map(bundle.draft.words.map((entry) => [entry.slug, entry])),
    sentencesById: new Map(bundle.draft.sentences.map((entry) => [entry.id, entry])),
  };
}

function activeVisibleWord(word, maps) {
  if (!word || word.active === false || word.retired) return false;
  const list = maps.wordListsById.get(word.listId);
  if (list && (list.active === false || list.retired)) return false;
  const pool = maps.poolsById.get(word.spellingPool);
  if (pool && (
    pool.active === false
      || pool.retired
      || !isSpellingPoolPotentiallyLearnerVisible(pool.visibility)
  )) return false;
  return true;
}

function activeSentence(sentence) {
  return Boolean(sentence) && sentence.active !== false && !sentence.retired && Boolean(cleanText(sentence.text));
}

function operationFirstField(operation) {
  return normaliseString(operation?.fieldPath).split('.').filter(Boolean)[0] || '';
}

function operationFieldParts(operation) {
  return normaliseString(operation?.fieldPath).split('.').filter(Boolean);
}

function operationPayloadActivates(operation) {
  if (operation?.action !== 'set') return true;
  const field = operationFirstField(operation);
  if (field === 'active') return operation.payload !== false;
  if (field === 'retired') return operation.payload !== true;
  return true;
}

function wordFieldImpactsAudio(operation) {
  const pathParts = operationFieldParts(operation);
  const firstField = pathParts[0] || '';
  if (!AUDIO_IMPACTFUL_WORD_FIELDS.has(firstField)) return false;
  if (firstField !== 'variants') return true;
  if (pathParts.length <= 2) return true;
  return AUDIO_IMPACTFUL_VARIANT_FIELDS.has(pathParts[2]);
}

function affectedAudioTargets(rawOperations = []) {
  let affectedAll = false;
  const affectedSlugs = new Set();
  const affectedSentenceIds = new Set();
  const affectedListIds = new Set();
  const affectedPoolIds = new Set();
  const operations = asArray(rawOperations)
    .map((operation) => {
      try {
        return normaliseContentOperation(operation, { now: () => 0 });
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  for (const operation of operations) {
    const firstField = operationFirstField(operation);
    if (operation.entityType === 'spelling.audioRequirementProfile') {
      affectedAll = true;
      continue;
    }
    if (operation.entityType === 'spelling.pool') {
      const structural = ['create', 'upsert', 'replace'].includes(operation.action);
      const fieldImpactsAudio = operation.action === 'set' && AUDIO_IMPACTFUL_POOL_FIELDS.has(firstField);
      if ((structural || fieldImpactsAudio) && operationPayloadActivates(operation)) {
        affectedPoolIds.add(operation.entityId);
      }
      continue;
    }
    if (operation.entityType === 'spelling.wordList') {
      const structural = ['create', 'upsert', 'replace'].includes(operation.action);
      const fieldImpactsAudio = operation.action === 'set' && AUDIO_IMPACTFUL_WORD_LIST_FIELDS.has(firstField);
      if ((structural || fieldImpactsAudio) && operationPayloadActivates(operation)) {
        affectedListIds.add(operation.entityId);
      }
      continue;
    }
    if (operation.entityType === 'spelling.word') {
      const structural = ['create', 'upsert', 'replace'].includes(operation.action);
      const fieldImpactsAudio = operation.action === 'set' && wordFieldImpactsAudio(operation);
      if ((structural || fieldImpactsAudio) && operationPayloadActivates(operation)) {
        affectedSlugs.add(operation.entityId);
      }
      continue;
    }
    if (operation.entityType === 'spelling.sentenceEntry') {
      const structural = ['create', 'upsert', 'replace'].includes(operation.action);
      const fieldImpactsAudio = operation.action === 'set' && AUDIO_IMPACTFUL_SENTENCE_FIELDS.has(firstField);
      if ((structural || fieldImpactsAudio) && operationPayloadActivates(operation)) {
        affectedSentenceIds.add(operation.entityId);
      }
    }
  }

  return {
    affectedAll,
    affectedSlugs,
    affectedSentenceIds,
    affectedListIds,
    affectedPoolIds,
    operationCount: operations.length,
  };
}

function wordUsesAffectedSentence(word, affectedSentenceIds) {
  if (!affectedSentenceIds.size) return false;
  if (asArray(word.sentenceEntryIds).some((id) => affectedSentenceIds.has(id))) return true;
  return asArray(word.variants).some((variant) => (
    asArray(variant.sentenceEntryIds).some((id) => affectedSentenceIds.has(id))
  ));
}

function shouldScanWord({
  word,
  maps,
  scope,
  affectedAll,
  affectedSlugs,
  affectedSentenceIds,
  affectedListIds,
  affectedPoolIds,
}) {
  if (!activeVisibleWord(word, maps)) return false;
  if (scope === 'all') return true;
  if (affectedAll) return true;
  return affectedSlugs.has(word.slug)
    || wordUsesAffectedSentence(word, affectedSentenceIds)
    || affectedListIds.has(word.listId)
    || affectedPoolIds.has(word.spellingPool);
}

function sentenceEntriesFor(ids, maps) {
  return uniqueStrings(ids)
    .map((id) => maps.sentencesById.get(id))
    .filter(activeSentence)
    .sort((left, right) => left.sortIndex - right.sortIndex || left.id.localeCompare(right.id));
}

function parseSpellingAudioKey(key) {
  const value = normaliseString(key);
  if (!value || !value.startsWith(`${SPELLING_AUDIO_ROOT_PREFIX}/`)) return null;
  const parts = value.split('/').map((part) => decodeURIComponent(part));
  if (parts.length < 7) return null;
  const [, , modelId, voiceId, fourth] = parts;
  if (fourth === 'word') {
    const contentKey = parts[5] || '';
    const filename = parts[6] || '';
    const slug = filename.replace(/\.[^.]+$/, '');
    return {
      key: value,
      lane: 'word',
      modelId,
      voiceId,
      paceId: 'natural',
      speedId: '',
      contentKey,
      slug,
      sentenceIndex: null,
    };
  }
  if (parts.length < 8) return null;
  const speedId = fourth;
  const contentKey = parts[5] || '';
  const slug = parts[6] || '';
  const sentenceIndex = Number((parts[7] || '').replace(/\.[^.]+$/, ''));
  return {
    key: value,
    lane: 'sentence',
    modelId,
    voiceId,
    paceId: speedId,
    speedId,
    contentKey,
    slug,
    sentenceIndex: Number.isInteger(sentenceIndex) ? sentenceIndex : null,
  };
}

function normaliseInventory(inventory = []) {
  const entries = [];
  for (const raw of inventory instanceof Set ? [...inventory] : asArray(inventory)) {
    const key = typeof raw === 'string' ? raw : normaliseString(raw?.key || raw?.r2Key || raw?.r2_key);
    const parsed = parseSpellingAudioKey(key);
    if (parsed) entries.push(parsed);
  }
  const byKey = new Set(entries.map((entry) => entry.key));
  return { entries, byKey };
}

function normaliseJobStatus(status) {
  const value = normaliseString(status).toLowerCase().replace(/-/g, '_');
  if (['uploaded', 'complete', 'completed', 'stored', 'present'].includes(value)) return 'present';
  if (['override_requested', 'override'].includes(value)) return 'override_requested';
  if (['generated', 'failed', 'skipped'].includes(value)) return value;
  return '';
}

function normaliseJobs(jobs = []) {
  return asArray(jobs)
    .map((raw) => {
      const status = normaliseJobStatus(raw?.status);
      if (!status) return null;
      return {
        lane: normaliseString(raw.lane),
        entityType: normaliseString(raw.entityType || raw.entity_type),
        entityId: normaliseString(raw.entityId || raw.entity_id),
        voiceId: normaliseString(raw.voiceId || raw.voice_id || raw.voice),
        paceId: normaliseString(raw.paceId || raw.pace_id || raw.speedId || raw.speed_id || raw.speed),
        modelId: normaliseString(raw.modelId || raw.model_id || raw.model, SPELLING_AUDIO_MODEL),
        profileVersion: normaliseString(raw.profileVersion || raw.profile_version),
        contentKey: normaliseString(raw.contentKey || raw.content_key),
        status,
        r2Key: normaliseString(raw.r2Key || raw.r2_key || raw.key),
        error: raw.error || raw.errorJson || raw.error_json || null,
      };
    })
    .filter(Boolean);
}

function sameRequirementScope(parsedKey, requirement) {
  if (!parsedKey || parsedKey.lane !== requirement.lane) return false;
  if (parsedKey.modelId !== requirement.modelId) return false;
  if (parsedKey.voiceId !== requirement.voiceId) return false;
  if (parsedKey.slug !== requirement.slug) return false;
  if (requirement.lane === 'word') return parsedKey.paceId === 'natural';
  return parsedKey.speedId === requirement.speedId
    && parsedKey.sentenceIndex === requirement.sentenceIndex;
}

function sameJobScope(job, requirement) {
  if (!job || job.lane !== requirement.lane) return false;
  if (job.modelId !== requirement.modelId) return false;
  if (job.voiceId !== requirement.voiceId) return false;
  if (job.paceId !== requirement.paceId && job.paceId !== requirement.speedId) return false;
  if (job.contentKey === requirement.contentKey) return true;
  if (job.r2Key) {
    const parsed = parseSpellingAudioKey(job.r2Key);
    return sameRequirementScope(parsed, requirement);
  }
  return false;
}

function statusForRequirement(requirement, inventory, jobs) {
  if (inventory.byKey.has(requirement.r2Key)) return { status: 'present', r2Key: requirement.r2Key };
  const matchingJob = jobs.find((job) => sameJobScope(job, requirement) && job.contentKey === requirement.contentKey);
  if (matchingJob) {
    return {
      status: matchingJob.status,
      r2Key: matchingJob.r2Key || requirement.r2Key,
      job: matchingJob,
    };
  }
  const staleInventory = inventory.entries.find((entry) => (
    sameRequirementScope(entry, requirement) && entry.contentKey !== requirement.contentKey
  ));
  if (staleInventory) {
    return { status: 'stale', r2Key: staleInventory.key, staleContentKey: staleInventory.contentKey };
  }
  const staleJob = jobs.find((job) => {
    if (job.contentKey === requirement.contentKey) return false;
    if (!job.r2Key) return false;
    const parsed = parseSpellingAudioKey(job.r2Key);
    return sameRequirementScope(parsed, requirement);
  });
  if (staleJob) {
    return {
      status: 'stale',
      r2Key: staleJob.r2Key,
      staleContentKey: staleJob.contentKey,
      job: staleJob,
    };
  }
  return { status: 'missing', r2Key: requirement.r2Key };
}

function itemBlockerCode(item) {
  if (!item.required) return '';
  return AUDIO_STATUS_BLOCKER_CODES[item.lane]?.[item.status] || '';
}

function summariseItems(items, lane = null) {
  const scoped = lane ? items.filter((item) => item.lane === lane) : items;
  const statusCounts = {};
  for (const item of scoped) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  const blockers = uniqueStrings(scoped.map(itemBlockerCode).filter(Boolean));
  const warnings = [];
  const requiredCount = scoped.filter((item) => item.required).length;
  const status = blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'passed');
  return {
    status,
    blockers,
    warnings,
    requiredCount,
    totalRequired: requiredCount,
    presentCount: statusCounts.present || 0,
    missingCount: statusCounts.missing || 0,
    staleCount: statusCounts.stale || 0,
    generatedCount: statusCounts.generated || 0,
    failedCount: statusCounts.failed || 0,
    skippedCount: statusCounts.skipped || 0,
    overrideRequestedCount: statusCounts.override_requested || 0,
    statusCounts,
  };
}

function bySlugSummary(items) {
  const bySlug = {};
  for (const item of items) {
    if (!bySlug[item.slug]) bySlug[item.slug] = { slug: item.slug, items: [] };
    bySlug[item.slug].items.push(item);
  }
  for (const [slug, entry] of Object.entries(bySlug)) {
    const wordItems = entry.items.filter((item) => item.lane === 'word');
    const sentenceItems = entry.items.filter((item) => item.lane === 'sentence');
    const summary = summariseItems(entry.items);
    bySlug[slug] = {
      slug,
      status: summary.status,
      blockers: summary.blockers,
      warnings: summary.warnings,
      wordAudioRequired: wordItems.filter((item) => item.required).length,
      sentenceAudioRequired: sentenceItems.filter((item) => item.required).length,
      totalRequired: summary.totalRequired,
      presentCount: summary.presentCount,
      missingCount: summary.missingCount,
      staleCount: summary.staleCount,
      generatedCount: summary.generatedCount,
      failedCount: summary.failedCount,
      skippedCount: summary.skippedCount,
      overrideRequestedCount: summary.overrideRequestedCount,
      items: entry.items,
    };
  }
  return bySlug;
}

async function wordRequirementItems({ word, surface, profile, maps }) {
  const contentKey = await computeSpellingWordAudioContentKey(word.slug, surface.wordText);
  return profile.wordProfiles.map((audioProfile) => {
    const r2Key = buildWordAudioAssetKey({
      model: profile.modelId,
      voice: audioProfile.voiceId,
      contentKey,
      slug: word.slug,
    });
    return {
      itemId: `word:${word.slug}:${surface.surfaceId}:${audioProfile.profileId}`,
      lane: 'word',
      profileId: audioProfile.profileId,
      profileVersion: profile.profileVersion,
      modelId: profile.modelId,
      voiceId: audioProfile.voiceId,
      voiceRole: audioProfile.voiceRole,
      paceId: audioProfile.paceId,
      speedId: audioProfile.speedId,
      slow: audioProfile.slow,
      required: audioProfile.required !== false && activeVisibleWord(word, maps),
      slug: word.slug,
      word: surface.wordText,
      surface: surface.surface,
      variantIndex: surface.variantIndex,
      variantWord: surface.variantWord,
      contentKey,
      r2Key,
    };
  });
}

async function sentenceRequirementItems({ word, sentence, sentenceIndex, surface, profile, maps }) {
  const contentKey = await computeSpellingSentenceAudioContentKey(
    word.slug,
    sentenceIndex,
    surface.wordText,
    sentence.text,
  );
  return profile.sentenceProfiles.map((audioProfile) => {
    const r2Key = buildAudioAssetKey({
      model: profile.modelId,
      voice: audioProfile.voiceId,
      speed: audioProfile.speedId,
      contentKey,
      slug: word.slug,
      sentenceIndex,
    });
    return {
      itemId: `sentence:${word.slug}:${sentence.id}:${surface.surfaceId}:${audioProfile.profileId}`,
      lane: 'sentence',
      profileId: audioProfile.profileId,
      profileVersion: profile.profileVersion,
      modelId: profile.modelId,
      voiceId: audioProfile.voiceId,
      voiceRole: audioProfile.voiceRole,
      paceId: audioProfile.paceId,
      speedId: audioProfile.speedId,
      slow: audioProfile.slow,
      required: audioProfile.required !== false && activeVisibleWord(word, maps),
      slug: word.slug,
      word: surface.wordText,
      sentenceId: sentence.id,
      sentence: sentence.text,
      sentenceIndex,
      surface: surface.surface,
      variantIndex: surface.variantIndex,
      variantWord: surface.variantWord,
      contentKey,
      r2Key,
    };
  });
}

async function requirementItemsForWord({ word, maps, profile }) {
  const items = [];
  const baseSurface = {
    surfaceId: 'base',
    surface: 'base',
    variantIndex: null,
    variantWord: '',
    wordText: word.word,
  };
  items.push(...await wordRequirementItems({ word, surface: baseSurface, profile, maps }));
  const baseSentences = sentenceEntriesFor(word.sentenceEntryIds, maps);
  for (const [sentenceIndex, sentence] of baseSentences.entries()) {
    items.push(...await sentenceRequirementItems({
      word,
      sentence,
      sentenceIndex,
      surface: baseSurface,
      profile,
      maps,
    }));
  }

  for (const [variantIndex, variant] of asArray(word.variants).entries()) {
    const wordText = cleanText(variant.word);
    if (!wordText) continue;
    const variantSurface = {
      surfaceId: `variant-${variantIndex}`,
      surface: 'variant',
      variantIndex,
      variantWord: wordText,
      wordText,
    };
    items.push(...await wordRequirementItems({ word, surface: variantSurface, profile, maps }));
    const variantSentences = sentenceEntriesFor(variant.sentenceEntryIds, maps);
    for (const sentence of variantSentences) {
      items.push(...await sentenceRequirementItems({
        word,
        sentence,
        sentenceIndex: 0,
        surface: variantSurface,
        profile,
        maps,
      }));
    }
  }
  return items;
}

export function buildDefaultSpellingAudioReadinessSummary(
  word,
  baseSentenceCount,
  variantSentenceCount,
  rawProfile = null,
) {
  const profile = normaliseSpellingAudioRequirementProfile(rawProfile);
  const variantCount = asArray(word?.variants).length;
  const wordAudioRequired = (1 + variantCount) * profile.wordProfiles.length;
  const sentenceAudioRequired = (Number(baseSentenceCount) + Number(variantSentenceCount)) * profile.sentenceProfiles.length;
  return {
    status: 'not_scanned',
    profileVersion: profile.profileVersion,
    modelId: profile.modelId,
    wordProfiles: profile.wordProfiles.map((entry) => entry.profileId),
    sentenceProfiles: profile.sentenceProfiles.map((entry) => entry.profileId),
    wordAudioRequired,
    sentenceAudioRequired,
    totalRequired: wordAudioRequired + sentenceAudioRequired,
    presentCount: 0,
    missingCount: 0,
    staleCount: 0,
    generatedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    overrideRequestedCount: 0,
    blockers: [],
    warnings: [],
  };
}

export function audioReadinessSummaryForWord(
  word,
  baseSentenceCount,
  variantSentenceCount,
  scan = null,
) {
  const fallback = buildDefaultSpellingAudioReadinessSummary(
    word,
    baseSentenceCount,
    variantSentenceCount,
    scan?.profile,
  );
  const slugSummary = scan?.bySlug?.[word?.slug];
  if (!slugSummary) return fallback;
  return {
    ...fallback,
    status: slugSummary.status || fallback.status,
    wordAudioRequired: Number(slugSummary.wordAudioRequired) || 0,
    sentenceAudioRequired: Number(slugSummary.sentenceAudioRequired) || 0,
    totalRequired: Number(slugSummary.totalRequired) || 0,
    presentCount: Number(slugSummary.presentCount) || 0,
    missingCount: Number(slugSummary.missingCount) || 0,
    staleCount: Number(slugSummary.staleCount) || 0,
    generatedCount: Number(slugSummary.generatedCount) || 0,
    failedCount: Number(slugSummary.failedCount) || 0,
    skippedCount: Number(slugSummary.skippedCount) || 0,
    overrideRequestedCount: Number(slugSummary.overrideRequestedCount) || 0,
    blockers: asArray(slugSummary.blockers),
    warnings: asArray(slugSummary.warnings),
    items: asArray(slugSummary.items),
  };
}

export function audioReadinessHasBlockingItems(scan = null) {
  if (!scan || !isPlainObject(scan)) return false;
  if (asArray(scan.blockers).length > 0) return true;
  return asArray(scan.items).some((item) => (
    item.required !== false
    && WORD_AUDIO_BLOCKING_STATUSES.has(item.status)
  ));
}

export async function scanSpellingAudioReadiness(rawBundle, {
  operations = null,
  scope = null,
  profile = null,
  inventory = [],
  jobs = [],
} = {}) {
  const bundle = normaliseSpellingContentBundle(rawBundle);
  const maps = draftMaps(bundle);
  const requirementProfile = normaliseSpellingAudioRequirementProfile(
    profile ?? bundle.draft.audioRequirementProfile ?? null,
  );
  const {
    affectedAll,
    affectedSlugs,
    affectedSentenceIds,
    affectedListIds,
    affectedPoolIds,
    operationCount,
  } = affectedAudioTargets(operations);
  const scanScope = scope || (Array.isArray(operations) ? 'affected' : 'all');
  const plannedItems = [];

  for (const word of bundle.draft.words) {
    if (!shouldScanWord({
      word,
      maps,
      scope: scanScope,
      affectedAll,
      affectedSlugs,
      affectedSentenceIds,
      affectedListIds,
      affectedPoolIds,
    })) {
      continue;
    }
    const wordItems = await requirementItemsForWord({ word, maps, profile: requirementProfile });
    const selectedOnlyBySentence = scanScope === 'affected'
      && !affectedAll
      && !affectedSlugs.has(word.slug)
      && !affectedListIds.has(word.listId)
      && !affectedPoolIds.has(word.spellingPool)
      && affectedSentenceIds.size;
    if (selectedOnlyBySentence) {
      plannedItems.push(...wordItems.filter((item) => (
        item.lane === 'sentence' && affectedSentenceIds.has(item.sentenceId)
      )));
    } else {
      plannedItems.push(...wordItems);
    }
  }

  const normalisedInventory = normaliseInventory(inventory);
  const normalisedJobs = normaliseJobs(jobs);
  const items = plannedItems.map((item) => {
    const state = statusForRequirement(item, normalisedInventory, normalisedJobs);
    return {
      ...item,
      status: state.status,
      r2Key: state.r2Key || item.r2Key,
      ...(state.staleContentKey ? { staleContentKey: state.staleContentKey } : {}),
      ...(state.job?.error ? { error: state.job.error } : {}),
      blocker: AUDIO_STATUS_BLOCKER_CODES[item.lane]?.[state.status] || '',
    };
  });
  const summary = summariseItems(items);
  const wordLane = summariseItems(items, 'word');
  const sentenceLane = summariseItems(items, 'sentence');

  return {
    status: summary.status,
    profileVersion: requirementProfile.profileVersion,
    modelId: requirementProfile.modelId,
    profile: requirementProfile,
    scope: scanScope,
    operationCount,
    scannedWordCount: new Set(items.map((item) => item.slug)).size,
    requiredCount: summary.requiredCount,
    totalRequired: summary.totalRequired,
    presentCount: summary.presentCount,
    missingCount: summary.missingCount,
    staleCount: summary.staleCount,
    generatedCount: summary.generatedCount,
    failedCount: summary.failedCount,
    skippedCount: summary.skippedCount,
    overrideRequestedCount: summary.overrideRequestedCount,
    blockers: summary.blockers,
    warnings: summary.warnings,
    lanes: {
      word: wordLane,
      sentence: sentenceLane,
    },
    items,
    bySlug: bySlugSummary(items),
  };
}
