import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';
import { buildPunctuationLearnerReadModel } from '../../../../src/subjects/punctuation/read-model.js';
import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from '../../../../shared/punctuation/content.js';

const FORBIDDEN_ITEM_FIELDS = new Set([
  'accepted',
  'acceptedAnswers',
  'answers',
  'correctIndex',
  'generatorFamilyId',
  'rubric',
  'validator',
  'validators',
  'seed',
  'generator',
  'hiddenQueue',
  'rawResponse',
  'templateId',
  'unpublished',
]);

// Extends FORBIDDEN_ITEM_FIELDS with keys that could leak through summary,
// feedback, analytics, context-pack, or availability payloads. Kept aligned
// with scripts/punctuation-production-smoke.mjs:FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS
// so smoke-side and Worker-side guards share one contract.
const FORBIDDEN_READ_MODEL_KEYS = new Set([
  ...FORBIDDEN_ITEM_FIELDS,
  'rawGenerator',
  'queueItemIds',
  'responses',
  'variantSignature',
]);
const OPAQUE_VARIANT_SIGNATURE_PATTERN = /^puncsig_[a-z0-9]+$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseOpaqueVariantSignature(value) {
  if (typeof value !== 'string') return '';
  const signature = value.trim();
  return OPAQUE_VARIANT_SIGNATURE_PATTERN.test(signature) ? signature : '';
}

function safeCurrentItem(item) {
  if (!isPlainObject(item)) return null;
  const safe = {
    id: typeof item.id === 'string' ? item.id : '',
    mode: typeof item.mode === 'string' ? item.mode : '',
    skillIds: Array.isArray(item.skillIds) ? item.skillIds.filter((entry) => typeof entry === 'string') : [],
    clusterId: typeof item.clusterId === 'string' ? item.clusterId : null,
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    stem: typeof item.stem === 'string' ? item.stem : '',
    inputKind: item.inputKind === 'choice' ? 'choice' : 'text',
    source: item.source === 'generated' ? 'generated' : 'fixed',
  };
  if (Array.isArray(item.options)) {
    safe.options = item.options
      .filter(isPlainObject)
      .map((option) => ({
        text: typeof option.text === 'string' ? option.text : '',
        index: Number.isInteger(Number(option.index)) ? Number(option.index) : 0,
      }));
  }
  const variantSignature = normaliseOpaqueVariantSignature(item.variantSignature);
  if (safe.source === 'generated' && variantSignature) {
    safe.variantSignature = variantSignature;
  }
  return safe;
}

function safeContentSkills() {
  return PUNCTUATION_CONTENT_MANIFEST.skills
    .filter((skill) => skill.published)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      clusterId: skill.clusterId,
    }));
}

function normaliseSupportLevel(value) {
  const level = Number(value);
  return Number.isInteger(level) && level > 0 ? level : 0;
}

function guidedTeachBox(skillId, supportLevel = 0) {
  const skill = PUNCTUATION_CONTENT_MANIFEST.skills.find((entry) => entry.id === skillId && entry.published);
  if (!skill) return null;
  const level = normaliseSupportLevel(supportLevel);
  if (level <= 0) return null;
  const box = {
    skillId: skill.id,
    name: skill.name,
    rule: skill.rule || '',
    selfCheckPrompt: 'Check the rule, compare the examples, then try the item without looking for the answer pattern.',
  };
  if (level >= 2) {
    box.workedExample = {
      before: skill.workedBad || '',
      after: skill.workedGood || '',
    };
    box.contrastExample = {
      before: skill.contrastBad || '',
      after: skill.contrastGood || '',
    };
  }
  return box;
}

function safeWeakFocus(value) {
  if (!isPlainObject(value)) return null;
  return {
    skillId: typeof value.skillId === 'string' ? value.skillId : '',
    skillName: typeof value.skillName === 'string' ? value.skillName : '',
    mode: typeof value.mode === 'string' ? value.mode : '',
    clusterId: typeof value.clusterId === 'string' ? value.clusterId : null,
    bucket: typeof value.bucket === 'string' ? value.bucket : '',
    source: typeof value.source === 'string' ? value.source : '',
  };
}

function safeGpsSession(session) {
  if (session?.mode !== 'gps') return null;
  const length = Number.isFinite(Number(session.length)) ? Number(session.length) : 0;
  const answeredCount = Number.isFinite(Number(session.answeredCount)) ? Number(session.answeredCount) : 0;
  return {
    testLength: length,
    answeredCount,
    remainingCount: Math.max(0, length - answeredCount),
    delayedFeedback: true,
  };
}

function safeSession(session, phase) {
  if (!isPlainObject(session)) return null;
  const hideGpsInterimResults = session.mode === 'gps';
  const safe = {
    id: typeof session.id === 'string' ? session.id : '',
    releaseId: typeof session.releaseId === 'string' ? session.releaseId : PUNCTUATION_RELEASE_ID,
    mode: typeof session.mode === 'string' ? session.mode : 'smart',
    length: Number.isFinite(Number(session.length)) ? Number(session.length) : 4,
    phase: phase === 'feedback' ? 'feedback' : 'active-item',
    startedAt: Number.isFinite(Number(session.startedAt)) ? Number(session.startedAt) : 0,
    answeredCount: Number.isFinite(Number(session.answeredCount)) ? Number(session.answeredCount) : 0,
    correctCount: hideGpsInterimResults
      ? 0
      : (Number.isFinite(Number(session.correctCount)) ? Number(session.correctCount) : 0),
    currentItem: phase === 'active-item' || phase === 'feedback' ? safeCurrentItem(session.currentItem) : null,
    securedUnits: Array.isArray(session.securedUnits) ? session.securedUnits.filter((entry) => typeof entry === 'string') : [],
    misconceptionTags: hideGpsInterimResults
      ? []
      : (Array.isArray(session.misconceptionTags) ? session.misconceptionTags.filter((entry) => typeof entry === 'string') : []),
    guided: session.mode === 'guided' ? {
      skillId: typeof session.guidedSkillId === 'string' ? session.guidedSkillId : null,
      supportLevel: normaliseSupportLevel(session.guidedSupportLevel),
      teachBox: guidedTeachBox(session.guidedSkillId, session.guidedSupportLevel),
    } : null,
    weakFocus: session.mode === 'weak' ? safeWeakFocus(session.weakFocus) : null,
    gps: session.mode === 'gps' ? safeGpsSession(session) : null,
    serverAuthority: session.serverAuthority === 'worker' ? 'worker' : null,
  };
  return safe;
}

function safeFeedback(feedback) {
  if (!isPlainObject(feedback)) return null;
  return {
    kind: ['success', 'error', 'warn', 'info'].includes(feedback.kind) ? feedback.kind : 'info',
    headline: typeof feedback.headline === 'string' ? feedback.headline : '',
    body: typeof feedback.body === 'string' ? feedback.body : '',
    attemptedAnswer: typeof feedback.attemptedAnswer === 'string' ? feedback.attemptedAnswer : '',
    displayCorrection: typeof feedback.displayCorrection === 'string' ? feedback.displayCorrection : '',
    explanation: typeof feedback.explanation === 'string' ? feedback.explanation : '',
    misconceptionTags: Array.isArray(feedback.misconceptionTags) ? feedback.misconceptionTags.filter((entry) => typeof entry === 'string') : [],
    facets: Array.isArray(feedback.facets)
      ? feedback.facets
          .filter(isPlainObject)
          .map((facet) => ({
            id: typeof facet.id === 'string' ? facet.id : '',
            ok: facet.ok === true,
            label: typeof facet.label === 'string' ? facet.label : '',
          }))
          .filter((facet) => facet.id)
      : [],
  };
}

function safeSummary(summary) {
  if (!isPlainObject(summary)) return null;
  // cloneSerialisable strips non-JSON values; the subsequent recursive scan
  // at payload assembly time enforces the forbidden-field contract. Summary
  // shape is intentionally permissive so new harmless fields can be added
  // without a code change — only forbidden keys trip the guard.
  return cloneSerialisable(summary);
}

// Retained for a future Parent/Admin scope wiring (origin R34). Not dispatched
// by the child read-model since Phase 3 U8; exported so the future caller can
// reuse the same allowlist rather than reinventing it.
export function safeContextPackSummary(summary) {
  if (!isPlainObject(summary)) return null;
  return {
    status: summary.status === 'ready' ? 'ready' : (summary.status === 'unavailable' ? 'unavailable' : 'not_requested'),
    code: typeof summary.code === 'string' ? summary.code : null,
    message: typeof summary.message === 'string' ? summary.message : '',
    acceptedCount: Number.isFinite(Number(summary.acceptedCount)) ? Number(summary.acceptedCount) : 0,
    rejectedCount: Number.isFinite(Number(summary.rejectedCount)) ? Number(summary.rejectedCount) : 0,
    atomKinds: Array.isArray(summary.atomKinds) ? summary.atomKinds.filter((entry) => typeof entry === 'string') : [],
    affectedGeneratorFamilies: Array.isArray(summary.affectedGeneratorFamilies)
      ? summary.affectedGeneratorFamilies.filter((entry) => typeof entry === 'string')
      : [],
    generatedItemCount: Number.isFinite(Number(summary.generatedItemCount)) ? Number(summary.generatedItemCount) : 0,
  };
}

function assertNoForbiddenItemFields(item) {
  if (!isPlainObject(item)) return;
  for (const key of Object.keys(item)) {
    if (FORBIDDEN_ITEM_FIELDS.has(key)) {
      throw new Error(`Punctuation read model attempted to expose server-only item field: ${key}`);
    }
  }
}

function assertNoForbiddenReadModelKeys(value, path = 'punctuation') {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenReadModelKeys(value[index], `${path}[${index}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const allowedActiveItemSignature = key === 'variantSignature' && path.endsWith('.session.currentItem');
    if (FORBIDDEN_READ_MODEL_KEYS.has(key) && !allowedActiveItemSignature) {
      throw new Error(`Punctuation read model attempted to expose server-only ${path}.${key} field: ${key}`);
    }
    assertNoForbiddenReadModelKeys(child, `${path}.${key}`);
  }
}

export function buildPunctuationReadModel({
  learnerId,
  state,
  prefs,
  stats,
  analytics = null,
  content = null,
  // U2: `data` is the full progress blob persisted by the engine. When
  // present, `buildPunctuationLearnerReadModel` projects starView from
  // learning evidence so the Worker read-model carries the same Star
  // truth as the client bootstrap path.
  data = null,
  // contextPack is accepted for forward compatibility with a future Parent/Admin
  // scope, but Phase 3 U8 (origin R34) never attaches it to the default child
  // payload — the child surface never renders it. `safeContextPackSummary` and
  // `worker/src/subjects/punctuation/ai-enrichment.js` stay in place for that
  // future caller; today the argument is silently ignored by the read-model.
  // eslint-disable-next-line no-unused-vars
  contextPack = null,
} = {}) {
  const safeState = cloneSerialisable(state) || {};
  const phase = typeof safeState.phase === 'string' ? safeState.phase : 'setup';
  const hideGpsInterimFeedback = safeState.session?.mode === 'gps' && phase !== 'summary';
  if (phase === 'active-item') assertNoForbiddenItemFields(safeState.session?.currentItem);
  const payload = {
    subjectId: 'punctuation',
    learnerId,
    version: 1,
    phase,
    session: ['active-item', 'feedback'].includes(phase) ? safeSession(safeState.session, phase) : null,
    feedback: hideGpsInterimFeedback ? null : (phase === 'feedback' || phase === 'summary' ? safeFeedback(safeState.feedback) : null),
    summary: phase === 'summary' ? safeSummary(safeState.summary) : null,
    error: typeof safeState.error === 'string' ? safeState.error : '',
    availability: cloneSerialisable(safeState.availability) || { status: 'ready', code: null, message: '' },
    prefs: cloneSerialisable(prefs) || {},
    stats: cloneSerialisable(stats) || {},
    analytics: analytics ? cloneSerialisable(analytics) : null,
    content: content ? cloneSerialisable(content) : {
      releaseId: PUNCTUATION_RELEASE_ID,
      releaseName: PUNCTUATION_CONTENT_MANIFEST.releaseName,
      fullSkillCount: PUNCTUATION_CONTENT_MANIFEST.fullSkillCount,
      publishedScopeCopy: PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy,
      skills: safeContentSkills(),
    },
  };
  // U2: project starView from learning evidence when `data` is available.
  // `buildPunctuationLearnerReadModel` is the single source of truth for
  // star projection; delegating to it guarantees Worker command responses
  // and bootstrap/refresh paths produce identical Star totals (R1, R11).
  const learnerReadModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: data != null ? { data } : {},
  });
  payload.starView = learnerReadModel.starView;
  // R12: stats.grandStars must match starView so module.js:getDashboardStats
  // reaches the `grandStars != null` branch and renders the star-derived pct.
  if (!payload.stats) payload.stats = {};
  payload.stats.grandStars = learnerReadModel.starView.grand.grandStars;

  // Recursive fail-closed scan across every branch of the payload. Catches
  // leaked keys introduced by upstream service-state changes that bypass the
  // per-phase allowlists (e.g. new validator field added inside a review row,
  // hiddenQueue carried on a nested summary branch, rubric nested inside
  // analytics). Throws rather than silently stripping so tests and dev runs
  // surface the leak; production operators monitor via the command route's
  // error telemetry.
  assertNoForbiddenReadModelKeys(payload);
  return payload;
}
