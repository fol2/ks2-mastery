export const HERO_SCHEDULER_VERSION = 'hero-p0-shadow-v1';

export const HERO_DEFAULT_TIMEZONE = 'Europe/London';

export const HERO_DEFAULT_EFFORT_TARGET = 18;

export const HERO_EFFORT_RANGE = Object.freeze({ min: 1, max: 50 });

export const HERO_INTENTS = Object.freeze([
  'due-review',
  'weak-repair',
  'retention-after-secure',
  'post-mega-maintenance',
  'breadth-maintenance',
  'starter-growth',
]);

export const HERO_LAUNCHERS = Object.freeze([
  'smart-practice',
  'trouble-practice',
  'mini-test',
  'guardian-check',
  'gps-check',
]);

export const HERO_SAFETY_FLAGS = Object.freeze({
  childVisible: false,
  coinsEnabled: false,
  writesEnabled: false,
});

export const HERO_SUBJECT_IDS = Object.freeze([
  'spelling',
  'grammar',
  'punctuation',
  'arithmetic',
  'reasoning',
  'reading',
]);

export const HERO_READY_SUBJECT_IDS = Object.freeze([
  'spelling',
  'grammar',
  'punctuation',
]);

export const HERO_LOCKED_SUBJECT_IDS = Object.freeze([
  'arithmetic',
  'reasoning',
  'reading',
]);

export const HERO_INTENT_WEIGHTS = Object.freeze({
  'due-review': 0.60,
  'weak-repair': 0.25,
  'retention-after-secure': 0.60,
  'post-mega-maintenance': 0.60,
  'breadth-maintenance': 0.15,
  'starter-growth': 0.15,
});

export const HERO_MAINTENANCE_INTENTS = Object.freeze(new Set([
  'retention-after-secure',
  'post-mega-maintenance',
]));

const INTENT_SET = new Set(HERO_INTENTS);
const LAUNCHER_SET = new Set(HERO_LAUNCHERS);

export function isValidIntent(intent) {
  return typeof intent === 'string' && INTENT_SET.has(intent);
}

export function isValidLauncher(launcher) {
  return typeof launcher === 'string' && LAUNCHER_SET.has(launcher);
}
