// Hero Mode P2 — Child-facing copy and labels.
//
// All child-visible text for Hero Quest surfaces lives here.
// Pure module — ZERO Worker, React, D1, or framework imports.
//
// The HERO_FORBIDDEN_VOCABULARY list is the canonical source of truth for
// economy/pressure vocabulary scanning in boundary tests.

/**
 * Forbidden economy/pressure vocabulary.  No Hero-facing surface may
 * contain any of these tokens (case-insensitive).
 */
export const HERO_FORBIDDEN_VOCABULARY = Object.freeze([
  'coin',
  'shop',
  'deal',
  'loot',
  'streak',
  'claim',
  'reward',
  'treasure',
  'buy',
  'limited time',
  'daily deal',
  "don't miss out",
  'earn',
  'claim your reward',
  'earn coins',
  'grind',
  'you missed out',
  'unlock now',
  'spend now',
  'jackpot',
  'streak reward',
]);

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
