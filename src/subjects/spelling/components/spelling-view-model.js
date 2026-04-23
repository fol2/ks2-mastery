import { monsterSummaryFromSpellingAnalytics } from '../../../platform/game/monster-system.js';
import { monsterAsset, monsterAssetSrcSet } from '../../../platform/game/monsters.js';
import { formatElapsedMinutes } from '../../../platform/core/utils.js';

export const SPELLING_ACCENT = '#3E6FA8';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MODE_CARDS = Object.freeze([
  {
    id: 'smart',
    iconSrc: '/assets/icons/spelling-modes/smart-review.webp',
    title: 'Smart Review',
    desc: 'Due · weak · one fresh word.',
  },
  {
    id: 'trouble',
    iconSrc: '/assets/icons/spelling-modes/trouble-drill.webp',
    title: 'Trouble Drill',
    desc: 'Only the words you usually miss.',
  },
  {
    id: 'test',
    iconSrc: '/assets/icons/spelling-modes/sats-test.webp',
    title: 'SATs Test',
    desc: 'One-shot dictation, no retries.',
  },
]);
export const ROUND_LENGTH_OPTIONS = Object.freeze(['10', '20', '40']);
export const YEAR_FILTER_OPTIONS = Object.freeze([
  { value: 'core', label: 'Core' },
  { value: 'y3-4', label: 'Y3-4' },
  { value: 'y5-6', label: 'Y5-6' },
  { value: 'extra', label: 'Extra' },
]);
export const WORD_BANK_FILTER_IDS = new Set(['all', 'due', 'weak', 'learning', 'secure', 'unseen']);
export const WORD_BANK_YEAR_FILTER_IDS = new Set(['all', 'y3-4', 'y5-6', 'extra']);

const SCRIBE_DOWNS_BASE = '/assets/regions/the-scribe-downs';
const spellingHeroUrl = (variant) => `${SCRIBE_DOWNS_BASE}/the-scribe-downs-${variant}.1280.webp`;
export const SPELLING_HERO_BACKGROUNDS = Object.freeze({
  smart: Object.freeze(['a1', 'b1', 'c1'].map(spellingHeroUrl)),
  trouble: Object.freeze([spellingHeroUrl('d1')]),
  test: Object.freeze([spellingHeroUrl('e1')]),
});

export function accentFor(subject) {
  return subject?.accent || SPELLING_ACCENT;
}

export function stableHash(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function spellingHeroMode(mode) {
  if (mode === 'trouble') return 'trouble';
  if (mode === 'test') return 'test';
  return 'smart';
}

export function heroBgForMode(mode, learnerId) {
  const heroMode = spellingHeroMode(mode);
  const backgrounds = SPELLING_HERO_BACKGROUNDS[heroMode] || SPELLING_HERO_BACKGROUNDS.smart;
  if (!backgrounds.length) return '';
  const index = stableHash(`spelling:${heroMode}:${learnerId}`) % backgrounds.length;
  return backgrounds[index];
}

export function heroBgForLearner(learnerId, mode = 'smart') {
  return heroBgForMode(mode, learnerId);
}

export function heroBgForSetup(learnerId, prefs) {
  return heroBgForMode(prefs?.mode, learnerId);
}

export function heroBgForSession(learnerId, session) {
  return heroBgForMode(session?.mode || (session?.type === 'test' ? 'test' : 'smart'), learnerId);
}

export function heroBgStyle(url) {
  return url ? { '--hero-bg': `url('${url}')` } : {};
}

export function heroPanDelayStyle() {
  if (typeof performance === 'undefined') return {};
  const elapsed = (performance.now() / 1000) % 144;
  return { animationDelay: `-${elapsed.toFixed(3)}s` };
}

export function beginLabel(prefs) {
  if (prefs.mode === 'test') return 'Begin SATs test';
  if (prefs.mode === 'trouble') return 'Begin trouble drill';
  return `Begin ${prefs.roundLength || '10'} words`;
}

export function normaliseSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

export function wordBankFilterMatchesStatus(filter, status) {
  if (filter === 'all') return true;
  if (filter === 'weak') return status === 'trouble';
  if (filter === 'unseen') return status === 'new';
  return filter === status;
}

export function wordBankYearFilterMatches(filter, word) {
  if (filter === 'all') return true;
  if (filter === 'y3-4') return word.year === '3-4';
  if (filter === 'y5-6') return word.year === '5-6';
  if (filter === 'extra') return word.spellingPool === 'extra';
  return true;
}

export function wordBankYearFilterLabel(filter) {
  if (filter === 'y3-4') return 'Years 3-4';
  if (filter === 'y5-6') return 'Years 5-6';
  if (filter === 'extra') return 'Extra';
  return 'All';
}

export function wordStatusLabel(status) {
  const labels = {
    new: 'New',
    learning: 'Learning',
    due: 'Due',
    secure: 'Secure',
    trouble: 'Trouble',
  };
  return labels[status] || 'Learning';
}

export function wordBankPillClass(status) {
  if (status === 'new') return 'new';
  if (status === 'trouble') return 'trouble';
  return status;
}

export function spellingPoolLabel(word) {
  if (word?.spellingPool === 'extra') return 'Extra';
  return word?.yearLabel || 'Core';
}

export function spellingPoolContextLabel(word) {
  if (word?.spellingPool === 'extra') return 'Extra spelling';
  return word?.yearLabel || 'Core spelling';
}

export function wordMatchesSearch(word, query) {
  if (!query) return true;
  const fields = [
    word.slug,
    word.word,
    word.family,
    word.yearLabel,
    spellingPoolLabel(word),
    word.explanation,
    ...(Array.isArray(word.accepted) ? word.accepted : []),
  ].map(normaliseSearchText);
  return fields.some((field) => field.includes(query));
}

export function dueLabel(progress) {
  if (!progress) return 'Unseen';
  const attempts = Math.max(0, Number(progress.attempts) || 0);
  if (!attempts) return 'Unseen';
  const dueDay = Number(progress.dueDay);
  if (!Number.isFinite(dueDay)) return 'Unseen';
  const today = Math.floor(Date.now() / DAY_MS);
  if (dueDay - today > 3650) return 'Long-term review';
  const daysUntilDue = Math.floor(dueDay - today);
  if (daysUntilDue <= 0) return 'Today';
  if (daysUntilDue === 1) return 'In 1 day';
  return `In ${daysUntilDue} days`;
}

export function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildDrillCloze(sentence, word) {
  const raw = String(sentence || '');
  const target = String(word?.word || '').trim();
  if (!target) return raw;
  if (raw.includes('________')) return raw;
  const pattern = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i');
  if (pattern.test(raw)) return raw.replace(pattern, '________');
  return '________';
}

export function renderAction(actions, event, action, data = {}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const payload = action === 'spelling-word-detail-open' && data && typeof data === 'object'
    ? { ...data, triggerElement: event?.currentTarget || data.triggerElement || null }
    : data;
  if (
    (action === 'spelling-start' || action === 'spelling-start-again')
    && typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function'
  ) {
    document.documentElement.classList.add('spelling-flow-transition');
    const transition = document.startViewTransition(() => {
      actions.dispatch(action, payload);
    });
    transition.finished
      .catch(() => {})
      .finally(() => {
        document.documentElement.classList.remove('spelling-flow-transition');
      });
    return;
  }
  actions.dispatch(action, payload);
}

export function renderFormAction(actions, event, action, extra = {}) {
  event.preventDefault();
  event.stopPropagation();
  actions.dispatch(action, { ...extra, formData: new FormData(event.currentTarget) });
}

export function pathProgressDots({ done, current, total }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const display = Math.min(safeTotal, 20);
  const perDot = safeTotal / display;
  return Array.from({ length: display }, (_, index) => {
    const start = index * perDot;
    const end = (index + 1) * perDot;
    if (end <= done) return 'done';
    if (current >= start && current < end) return 'current';
    return '';
  });
}

export function feedbackTone(kind) {
  if (kind === 'error') return 'bad';
  if (kind === 'warn') return 'warn';
  return 'good';
}

export function summaryModeLabel(mode) {
  if (mode === 'trouble') return 'Trouble Drill';
  if (mode === 'test') return 'SATs Test';
  if (mode === 'single') return 'Single-word Drill';
  return 'Smart Review';
}

export function summaryHeadline(summary) {
  if (summary?.totalWords > 0 && typeof summary.correct === 'number') {
    return `${summary.correct} of ${summary.totalWords} words landed.`;
  }
  return summary?.message || '';
}

export function summaryRibbonSub(summary) {
  const parts = [summaryModeLabel(summary?.mode), formatElapsedMinutes(summary?.elapsedMs)];
  if (typeof summary?.accuracy === 'number') parts.push(`${summary.accuracy}% accuracy`);
  return parts.filter(Boolean).join(' · ');
}

export function countWordBankStatus(words, status) {
  return words.reduce((count, word) => count + (word.status === status ? 1 : 0), 0);
}

export function countWordBankYear(words, year) {
  return words.reduce((count, word) => count + (word.year === year ? 1 : 0), 0);
}

export function countWordBankExtra(words) {
  return words.reduce((count, word) => count + (word.spellingPool === 'extra' ? 1 : 0), 0);
}

export function wordBankAggregateStats(words) {
  const stats = {
    total: 0,
    secure: 0,
    due: 0,
    trouble: 0,
    learning: 0,
    unseen: 0,
  };
  for (const word of Array.isArray(words) ? words : []) {
    stats.total += 1;
    if (word.status === 'secure') stats.secure += 1;
    else if (word.status === 'due') stats.due += 1;
    else if (word.status === 'trouble') stats.trouble += 1;
    else if (word.status === 'learning') stats.learning += 1;
    else if (word.status === 'new') stats.unseen += 1;
  }
  return stats;
}

export function wordBankAggregateCards(stats, totalSub) {
  return [
    { label: 'Total', value: stats.total, sub: totalSub },
    { label: 'Secure', value: stats.secure, sub: 'Stable recall' },
    { label: 'Due now', value: stats.due, sub: 'Due today or overdue' },
    { label: 'Trouble', value: stats.trouble, sub: 'Weak or fragile' },
    { label: 'Learning', value: stats.learning, sub: 'Introduced, not secure' },
    { label: 'Unseen', value: stats.unseen, sub: 'Not yet introduced' },
  ];
}

export function findWordBankEntry(analytics, slug) {
  if (!slug) return null;
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  for (const group of groups) {
    const words = Array.isArray(group.words) ? group.words : [];
    const match = words.find((entry) => entry.slug === slug);
    if (match) return match;
  }
  return null;
}

export function buildSpellingContext({ appState, service, repositories, subject }) {
  const learner = appState.learners.byId[appState.learners.selectedId];
  const ui = service.initState(appState.subjectUi.spelling, learner.id);
  const needsAnalytics = ui.phase === 'dashboard' || ui.phase === 'word-bank';
  const analytics = needsAnalytics ? service.getAnalyticsSnapshot(learner.id) : null;
  return {
    learner,
    ui,
    accent: accentFor(subject),
    prefs: service.getPrefs(learner.id),
    analytics,
    codex: ui.phase === 'dashboard' && analytics
      ? monsterSummaryFromSpellingAnalytics(analytics, {
          learnerId: learner.id,
          gameStateRepository: repositories?.gameState,
          persistBranches: false,
        })
      : [],
  };
}

export function monsterImageProps(monster, progress) {
  return {
    src: monsterAsset(monster.id, progress.stage, 320, progress.branch),
    srcSet: monsterAssetSrcSet(monster.id, progress.stage, progress.branch),
    sizes: 'min(30vw, 120px)',
  };
}
