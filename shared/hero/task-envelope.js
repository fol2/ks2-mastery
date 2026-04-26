import {
  HERO_EFFORT_RANGE,
  isValidIntent,
  isValidLauncher,
} from './constants.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampEffort(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return HERO_EFFORT_RANGE.min;
  return Math.max(HERO_EFFORT_RANGE.min, Math.min(HERO_EFFORT_RANGE.max, Math.round(n)));
}

export function buildTaskEnvelope({
  subjectId,
  intent,
  launcher,
  effortTarget,
  reasonTags,
  debugReason,
  heroContext,
} = {}) {
  return {
    subjectId: typeof subjectId === 'string' ? subjectId : '',
    intent: typeof intent === 'string' ? intent : '',
    launcher: typeof launcher === 'string' ? launcher : '',
    effortTarget: clampEffort(effortTarget),
    reasonTags: Array.isArray(reasonTags) ? reasonTags.filter(Boolean).map(String) : [],
    debugReason: typeof debugReason === 'string' ? debugReason : '',
    heroContext: isPlainObject(heroContext) ? heroContext : null,
  };
}

export function validateTaskEnvelope(envelope) {
  const errors = [];
  if (!isPlainObject(envelope)) {
    return { valid: false, errors: ['envelope must be a plain object'] };
  }
  if (!envelope.subjectId) {
    errors.push('subjectId is required');
  }
  if (!isValidIntent(envelope.intent)) {
    errors.push(`unknown intent: ${JSON.stringify(envelope.intent)}`);
  }
  if (!isValidLauncher(envelope.launcher)) {
    errors.push(`unknown launcher: ${JSON.stringify(envelope.launcher)}`);
  }
  if (!Number.isFinite(envelope.effortTarget) || envelope.effortTarget < HERO_EFFORT_RANGE.min) {
    errors.push(`effortTarget must be >= ${HERO_EFFORT_RANGE.min}`);
  }
  if (!Array.isArray(envelope.reasonTags)) {
    errors.push('reasonTags must be an array');
  }
  return { valid: errors.length === 0, errors };
}

const CHILD_SAFE_FIELDS = new Set([
  'subjectId', 'intent', 'launcher', 'effortTarget',
  'reasonTags', 'heroContext',
]);

export function stripDebugFields(envelope) {
  if (!isPlainObject(envelope)) return {};
  const result = {};
  for (const key of Object.keys(envelope)) {
    if (CHILD_SAFE_FIELDS.has(key)) {
      result[key] = envelope[key];
    }
  }
  return result;
}
