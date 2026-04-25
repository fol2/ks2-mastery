import { cloneSerialisable } from '../../../../src/platform/core/repositories/helpers.js';
import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from '../../../../shared/punctuation/content.js';

const FORBIDDEN_ITEM_FIELDS = new Set([
  'accepted',
  'answers',
  'correctIndex',
  'rubric',
  'validator',
  'seed',
  'generator',
  'hiddenQueue',
  'unpublished',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function safeSession(session, phase) {
  if (!isPlainObject(session)) return null;
  const safe = {
    id: typeof session.id === 'string' ? session.id : '',
    releaseId: typeof session.releaseId === 'string' ? session.releaseId : PUNCTUATION_RELEASE_ID,
    mode: typeof session.mode === 'string' ? session.mode : 'smart',
    length: Number.isFinite(Number(session.length)) ? Number(session.length) : 4,
    phase: phase === 'feedback' ? 'feedback' : 'active-item',
    startedAt: Number.isFinite(Number(session.startedAt)) ? Number(session.startedAt) : 0,
    answeredCount: Number.isFinite(Number(session.answeredCount)) ? Number(session.answeredCount) : 0,
    correctCount: Number.isFinite(Number(session.correctCount)) ? Number(session.correctCount) : 0,
    currentItem: phase === 'active-item' || phase === 'feedback' ? safeCurrentItem(session.currentItem) : null,
    securedUnits: Array.isArray(session.securedUnits) ? session.securedUnits.filter((entry) => typeof entry === 'string') : [],
    misconceptionTags: Array.isArray(session.misconceptionTags) ? session.misconceptionTags.filter((entry) => typeof entry === 'string') : [],
    guided: session.mode === 'guided' ? {
      skillId: typeof session.guidedSkillId === 'string' ? session.guidedSkillId : null,
      supportLevel: normaliseSupportLevel(session.guidedSupportLevel),
      teachBox: guidedTeachBox(session.guidedSkillId, session.guidedSupportLevel),
    } : null,
    weakFocus: session.mode === 'weak' ? safeWeakFocus(session.weakFocus) : null,
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
  return cloneSerialisable(summary);
}

function assertNoForbiddenItemFields(item) {
  if (!isPlainObject(item)) return;
  for (const key of Object.keys(item)) {
    if (FORBIDDEN_ITEM_FIELDS.has(key)) {
      throw new Error(`Punctuation read model attempted to expose server-only item field: ${key}`);
    }
  }
}

export function buildPunctuationReadModel({
  learnerId,
  state,
  prefs,
  stats,
  analytics = null,
  content = null,
} = {}) {
  const safeState = cloneSerialisable(state) || {};
  const phase = typeof safeState.phase === 'string' ? safeState.phase : 'setup';
  if (phase === 'active-item') assertNoForbiddenItemFields(safeState.session?.currentItem);
  return {
    subjectId: 'punctuation',
    learnerId,
    version: 1,
    phase,
    session: ['active-item', 'feedback'].includes(phase) ? safeSession(safeState.session, phase) : null,
    feedback: phase === 'feedback' || phase === 'summary' ? safeFeedback(safeState.feedback) : null,
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
}
