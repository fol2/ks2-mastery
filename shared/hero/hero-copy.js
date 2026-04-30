// Hero Mode P2 — Child-facing copy and labels.
//
// All child-visible text for Hero Quest surfaces lives here.
// Pure module — ZERO Worker, React, D1, or framework imports.
//
// The HERO_FORBIDDEN_PRESSURE_VOCABULARY list is the canonical source of truth
// for pressure/gambling vocabulary scanning in boundary tests.

/**
 * P4: Pressure/gambling vocabulary — ALWAYS forbidden in ALL Hero surfaces.
 * These terms create urgency, gambling mechanics, or shop pressure.
 */
export const HERO_FORBIDDEN_PRESSURE_VOCABULARY = Object.freeze([
  'shop',
  'deal',
  'loot',
  'jackpot',
  'limited time',
  'daily deal',
  "don't miss out",
  "don't miss",
  'streak reward',
  'grind',
  'buy',
  'buy now',
  'purchase',
  'spend now',
  'offer',
  'you missed out',
  'unlock now',
  'treasure',
  'claim your reward',
  'earn coins',
]);

/**
 * P4: Economy vocabulary allowed ONLY in economy-scoped files.
 * These terms must NOT appear in subject surfaces, HeroTaskBanner,
 * scheduler explanations, or non-economy Hero copy.
 */
export const HERO_ECONOMY_ALLOWED_VOCABULARY = Object.freeze([
  'coin',
  'balance',
  'Hero Coins',
  'invite',
  'monster grow',
  'camp',
  'hero camp',
  'hero pool',
  'monster invite',
  'hero monster',
]);

/**
 * Files where economy vocabulary is permitted.
 */
export const HERO_ECONOMY_ALLOWED_FILES = Object.freeze([
  'shared/hero/economy.js',
  'shared/hero/hero-copy.js',
  'shared/hero/hero-pool.js',
  'shared/hero/monster-economy.js',
  'shared/hero/claim-contract.js',
  'src/platform/hero/hero-ui-model.js',
  'src/platform/hero/hero-camp-model.js',
  'src/platform/hero/hero-monster-assets.js',
  'src/surfaces/home/HeroQuestCard.jsx',
  'src/surfaces/home/HeroCampPanel.jsx',
  'src/surfaces/home/HeroCampMonsterCard.jsx',
  'src/surfaces/home/HeroCampConfirmation.jsx',
  'worker/src/hero/read-model.js',
  'worker/src/hero/camp.js',
  'worker/src/hero/analytics.js',
  'worker/src/hero/readiness.js',
  'worker/src/hero/telemetry-probe.js',
  'shared/hero/stop-conditions.js',
]);

// Backward compat — tests importing this get the pressure-only list
export const HERO_FORBIDDEN_VOCABULARY = HERO_FORBIDDEN_PRESSURE_VOCABULARY;

/**
 * P3 progress copy — shown in HeroQuestCard and HeroTaskBanner for
 * claiming, task-complete, daily-complete, and refresh states.
 * All terms are economy-free.
 */
export const HERO_PROGRESS_COPY = Object.freeze({
  taskComplete: 'Task complete.',
  taskCompleteDetail: 'Nice work — your Hero Quest has moved forward.',
  nextTaskReady: 'Next Hero task is ready.',
  dailyComplete: "Today's Hero Quest is complete.",
  dailyCompleteDetail: 'You kept your ready subjects strong today.',
  claiming: 'Checking your Hero progress…',
  refreshed: 'Your Hero Quest refreshed. Try the next task now.',
  bannerComplete: 'Hero task complete. Return to your Hero Quest for the next round.',
});

/**
 * P4 economy copy — shown in HeroQuestCard when daily Coins are awarded.
 * Calm, non-pressurising. No shop/deal/streak/loot language.
 */
export const HERO_ECONOMY_COPY = Object.freeze({
  coinsAdded: 'Hero Coins added.',
  coinsAddedDetail: 'You completed today\'s Hero Quest.',
  balanceLabel: 'Hero Coins',
  savedForCamp: 'Hero Coins saved for Hero Camp.',
  dailyAvailable: 'Complete today\'s Hero Quest to add 100 Hero Coins.',
});

/**
 * Child-facing labels by intent.  Explains *why* this task was chosen
 * in age-appropriate language.
 */
export const HERO_INTENT_LABELS = Object.freeze({
  'weak-repair':              'Practise something tricky',
  'due-review':               'Review something you learnt before',
  'retention-after-secure':   'Keep a strong skill sharp',
  'post-mega-maintenance':    'Stay sharp after a big milestone',
  'breadth-maintenance':      'Explore a different area',
  'fresh-exploration':        'Try something new',
});

/**
 * Child-facing labels by subject.
 */
export const HERO_SUBJECT_LABELS = Object.freeze({
  spelling:     'Spelling',
  grammar:      'Grammar',
  punctuation:  'Punctuation',
});

/**
 * Child-facing reason strings by intent.  Provides a short sentence
 * explaining the task to the child.
 */
export const HERO_INTENT_REASONS = Object.freeze({
  'weak-repair':              'This will help you get better at something you find tricky.',
  'due-review':               'Time to refresh something you covered a while ago.',
  'retention-after-secure':   'A quick check to keep a strong skill in top form.',
  'post-mega-maintenance':    'Keep your skills strong after passing a big milestone.',
  'breadth-maintenance':      'A chance to practise across different topics.',
  'fresh-exploration':        'Something new to discover today.',
});

/**
 * UI reason labels — shown when the Hero card explains *why* it is
 * not available.
 */
export const HERO_UI_REASON_LABELS = Object.freeze({
  'enabled':                'Your Hero Quest is ready.',
  'child-ui-disabled':      'Hero Quest is not available right now.',
  'launch-disabled':        'Hero Quest is not available right now.',
  'shadow-disabled':        'Hero Quest is not available right now.',
  'no-eligible-subjects':   'No subjects are ready for a Hero Quest yet.',
  'no-launchable-tasks':    'No Hero task is ready yet — your subjects are still available below.',
});

/**
 * CTA text for various card states.
 */
export const HERO_CTA_TEXT = Object.freeze({
  start:      'Start Hero Quest',
  continue:   'Continue Hero task',
  starting:   'Starting…',
  refresh:    'Try the next task now',
  unavailable: 'Hero Quest is not available',
});

/**
 * Resolve the child-facing label for a task.
 *
 * @param {string} intent
 * @param {string} subjectId
 * @returns {string}
 */
export function resolveChildLabel(intent, subjectId) {
  const intentLabel = HERO_INTENT_LABELS[intent] || 'Hero task';
  const subjectLabel = HERO_SUBJECT_LABELS[subjectId] || subjectId || 'Subject';
  return `${subjectLabel}: ${intentLabel}`;
}

/**
 * Resolve the child-facing reason for a task.
 *
 * @param {string} intent
 * @returns {string}
 */
export function resolveChildReason(intent) {
  return HERO_INTENT_REASONS[intent] || 'Part of today’s Hero Quest.';
}
