import {
  HERO_LAUNCH_CONTRACT_VERSION,
  HERO_DEFAULT_TIMEZONE,
  HERO_P2_SCHEDULER_VERSION,
} from './constants.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const HERO_CONTEXT_ALLOWLIST = new Set([
  'version',
  'source',
  'phase',
  'questId',
  'taskId',
  'dateKey',
  'timezone',
  'schedulerVersion',
  'questFingerprint',
  'subjectId',
  'intent',
  'launcher',
  'effortTarget',
  'launchRequestId',
  'launchedAt',
]);

export function buildHeroContext({
  quest,
  task,
  taskId,
  requestId,
  now,
  schedulerVersion,
  questFingerprint,
} = {}) {
  const q = isPlainObject(quest) ? quest : {};
  const t = isPlainObject(task) ? task : {};
  const ts = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  const ver = typeof schedulerVersion === 'string' ? schedulerVersion : '';
  const phase = ver === HERO_P2_SCHEDULER_VERSION ? 'p2-child-launch' : 'p1-launch';
  return {
    version: HERO_LAUNCH_CONTRACT_VERSION,
    source: 'hero-mode',
    phase,
    questId: typeof q.questId === 'string' ? q.questId : '',
    taskId: typeof taskId === 'string' ? taskId : '',
    dateKey: typeof q.dateKey === 'string' ? q.dateKey : '',
    timezone: typeof q.timezone === 'string' ? q.timezone : HERO_DEFAULT_TIMEZONE,
    schedulerVersion: ver,
    questFingerprint: typeof questFingerprint === 'string' ? questFingerprint : null,
    subjectId: typeof t.subjectId === 'string' ? t.subjectId : '',
    intent: typeof t.intent === 'string' ? t.intent : '',
    launcher: typeof t.launcher === 'string' ? t.launcher : '',
    effortTarget: Number.isFinite(Number(t.effortTarget)) ? Number(t.effortTarget) : 0,
    launchRequestId: typeof requestId === 'string' ? requestId : '',
    launchedAt: new Date(ts).toISOString(),
  };
}

export function validateHeroContext(ctx) {
  const errors = [];
  if (!isPlainObject(ctx)) {
    return { valid: false, errors: ['heroContext must be a plain object'] };
  }
  if (ctx.version !== HERO_LAUNCH_CONTRACT_VERSION) {
    errors.push(`version must be ${HERO_LAUNCH_CONTRACT_VERSION}`);
  }
  if (!ctx.questId) {
    errors.push('questId is required');
  }
  if (!ctx.taskId) {
    errors.push('taskId is required');
  }
  if (ctx.source !== 'hero-mode') {
    errors.push('source must be hero-mode');
  }
  if (!ctx.launchRequestId) {
    errors.push('launchRequestId is required');
  }
  return { valid: errors.length === 0, errors };
}

export function extractHeroSummaryContext(session) {
  if (!session?.heroContext || session.heroContext.source !== 'hero-mode') return null;
  const ctx = session.heroContext;
  return {
    source: ctx.source,
    questId: ctx.questId || null,
    taskId: ctx.taskId || null,
    questFingerprint: ctx.questFingerprint || null,
    launchRequestId: ctx.launchRequestId || null,
  };
}

export function sanitiseHeroContext(ctx) {
  if (!isPlainObject(ctx)) return {};
  const result = {};
  for (const key of Object.keys(ctx)) {
    if (HERO_CONTEXT_ALLOWLIST.has(key)) {
      result[key] = ctx[key];
    }
  }
  return result;
}
