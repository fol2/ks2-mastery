import React from 'react';
import { SearchIcon } from './spelling-icons.jsx';
import { CountUpValue, SummaryCards } from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import { SpellingWordDetailModal } from './SpellingWordDetailModal.jsx';
// SH2-U5: the "no words tracked yet" branch surfaces the shared empty
// primitive with the canonical copy. The existing `wb-empty` div
// continues to cover the "filters matched nothing" branch (progress is
// fine, just a filter change away) — that's not an empty state, just a
// narrowed view, so it keeps its inline muted copy.
import { EmptyState } from '../../../platform/ui/EmptyState.jsx';
import {
  WORD_BANK_FILTER_IDS,
  WORD_BANK_GUARDIAN_CHIP_LABELS,
  WORD_BANK_GUARDIAN_FILTER_HINTS,
  WORD_BANK_GUARDIAN_FILTER_IDS,
  WORD_BANK_GUARDIAN_FILTER_ID_SET,
  WORD_BANK_YEAR_FILTER_IDS,
  countWordBankExtra,
  countWordBankStatus,
  countWordBankYear,
  dueLabel,
  findWordBankEntry,
  heroBgForLearner,
  heroBgStyle,
  normaliseSearchText,
  progressAccuracyLabel,
  progressAttemptCount,
  progressCorrectCount,
  progressWrongCount,
  renderAction,
  spellingPoolLabel,
  wordBankFilterMatchesStatus,
  wordBankAggregateCards,
  wordBankAggregateStats,
  wordBankPillClass,
  wordBankYearFilterLabel,
  wordBankYearFilterMatches,
  wordMatchesSearch,
  wordStatusLabel,
} from './spelling-view-model.js';

// Guardian chip copy and hints live in the view-model so the SSR scene, any
// test harness, and any future surface read from a single source of truth.
// See `WORD_BANK_GUARDIAN_CHIP_LABELS` in `spelling-view-model.js` for the
// U5 copy polish rationale (R10). The `GUARDIAN_CHIP_ORDER` alias here keeps
// the existing local variable name stable for the rest of the scene.
const GUARDIAN_CHIP_ORDER = WORD_BANK_GUARDIAN_FILTER_IDS;

function FilterChips({ counts, activeFilter, actions }) {
  const chips = [
    { id: 'all', label: 'All', swatch: 'all' },
    { id: 'due', label: 'Due', swatch: 'due' },
    { id: 'weak', label: 'Trouble', swatch: 'trouble' },
    { id: 'learning', label: 'Learning', swatch: 'learning' },
    { id: 'secure', label: 'Secure', swatch: 'secure' },
    { id: 'unseen', label: 'Unseen', swatch: 'new' },
  ];
  return (
    <div className="wb-chips wb-status-chips" role="group" aria-label="Filter word bank by status">
      {chips.map((chip) => {
        const active = chip.id === activeFilter;
        return (
          <button
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            className={`wb-chip wb-chip-status${active ? ' on' : ''}`}
            data-action="spelling-analytics-status-filter"
            data-value={chip.id}
            key={chip.id}
            onClick={(event) => renderAction(actions, event, 'spelling-analytics-status-filter', { value: chip.id })}
          >
            <span className={`wb-status-swatch ${chip.swatch}`} aria-hidden="true" />
            <span className="wb-chip-label">{chip.label}</span>
            <CountUpValue className="wb-chip-count" value={counts[chip.id] ?? 0} />
          </button>
        );
      })}
    </div>
  );
}

/* Guardian filter chips sit on a row below the legacy status chips — same
 * underlying data-action so the Set expansion in module.js accepts the four
 * new IDs for free. The distinct wrapper class + square-cornered chip
 * variant visually distinguishes "maintenance" (Guardian) from "learning"
 * (legacy) so a learner with 10 chips in front of them doesn't read them
 * as one undifferentiated decision. */
function GuardianFilterChips({ counts, activeFilter, actions }) {
  return (
    <div
      className="wb-chips wb-status-chips wb-chips--guardian"
      role="group"
      aria-label="Filter word bank by Guardian status"
    >
      {GUARDIAN_CHIP_ORDER.map((id) => {
        const active = id === activeFilter;
        return (
          <button
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            className={`wb-chip wb-chip-status wb-chip-guardian wb-chip-guardian--${id}${active ? ' on' : ''}`}
            data-action="spelling-analytics-status-filter"
            data-value={id}
            key={id}
            onClick={(event) => renderAction(actions, event, 'spelling-analytics-status-filter', { value: id })}
          >
            <span className="wb-chip-guardian-mark" aria-hidden="true" />
            <span className="wb-chip-label">{WORD_BANK_GUARDIAN_CHIP_LABELS[id]}</span>
            <CountUpValue className="wb-chip-count" value={counts[id] ?? 0} />
          </button>
        );
      })}
    </div>
  );
}

function YearChips({ counts, activeYearFilter, actions }) {
  const chips = [
    { id: 'all', label: 'All' },
    { id: 'y3-4', label: 'Years 3-4' },
    { id: 'y5-6', label: 'Years 5-6' },
    { id: 'extra', label: 'Extra' },
  ];
  return (
    <div className="wb-chips wb-year-chips" role="group" aria-label="Filter word bank by category">
      {chips.map((chip) => {
        const active = chip.id === activeYearFilter;
        return (
          <button
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            className={`wb-chip wb-chip-category${active ? ' on' : ''}`}
            data-action="spelling-analytics-year-filter"
            data-value={chip.id}
            key={chip.id}
            onClick={(event) => renderAction(actions, event, 'spelling-analytics-year-filter', { value: chip.id })}
          >
            <span className="wb-chip-label">{chip.label}</span>
            <CountUpValue className="wb-chip-count" value={counts[chip.id] ?? 0} />
          </button>
        );
      })}
    </div>
  );
}

function WordPill({ word, actions }) {
  const progress = word.progress || {};
  const categoryLabel = word.yearLabel || spellingPoolLabel(word);
  const title = [
    word.word,
    `Correct: ${progressCorrectCount(progress)}`,
    `Wrong: ${progressWrongCount(progress)}`,
    `Attempts: ${progressAttemptCount(progress)}`,
    `Accuracy: ${progressAccuracyLabel(progress)}`,
    `Next due: ${dueLabel(progress)}`,
  ].filter(Boolean).join(' • ');
  return (
    <button
      type="button"
      className={`wb-word-pill ${wordBankPillClass(word.status)}`}
      data-action="spelling-word-detail-open"
      data-slug={word.slug}
      data-value="explain"
      title={title}
      aria-label={`Explain ${word.word}. ${wordStatusLabel(word.status)}. ${categoryLabel}.`}
      onClick={(event) => renderAction(actions, event, 'spelling-word-detail-open', { slug: word.slug, value: 'explain' })}
    >
      {word.word}
    </button>
  );
}

function WordGroup({ group, words, query, actions, runtimeReadOnly = false }) {
  const secureCount = words.filter((word) => Math.max(0, Number(word.progress?.stage) || 0) >= 4).length;
  const summaryText = words.length
    ? `${secureCount} secure out of ${words.length} visible spellings`
    : 'No words match your filters.';
  const emptyText = query ? 'Try another word or family search.' : 'Try another status or year filter.';
  return (
    <section className="wb-word-group" aria-label={`${group.title} spellings`}>
      <div className="wb-word-group-head">
        <h2>{group.title}</h2>
        <p>{summaryText}</p>
      </div>
      <div className="wb-word-bank">
        {words.length
          ? words.map((word) => <WordPill word={word} actions={actions} runtimeReadOnly={runtimeReadOnly} key={word.slug} />)
          : <div className="wb-empty">{emptyText}</div>}
      </div>
    </section>
  );
}

function WordBankCard({ learner, analytics, appState, actions, postMastery = null, runtimeReadOnly = false }) {
  const persistedSearchQuery = appState?.transientUi?.spellingAnalyticsWordSearch || '';
  const [draftSearch, setDraftSearch] = React.useState(persistedSearchQuery);
  const statusFilter = appState?.transientUi?.spellingAnalyticsStatusFilter || 'all';
  const yearFilter = appState?.transientUi?.spellingAnalyticsYearFilter || 'all';
  React.useEffect(() => {
    setDraftSearch(persistedSearchQuery);
  }, [persistedSearchQuery]);
  const commitSearch = React.useCallback((value) => {
    const nextValue = String(value || '').slice(0, 80);
    if (nextValue === persistedSearchQuery) return;
    actions.dispatch('spelling-analytics-search', { value: nextValue });
  }, [actions, persistedSearchQuery]);
  const searchQuery = draftSearch;
  const query = normaliseSearchText(searchQuery);
  const showGuardianFilters = Boolean(postMastery?.allWordsMega);
  const guardianMap = postMastery?.guardianMap && typeof postMastery.guardianMap === 'object'
    ? postMastery.guardianMap
    : {};
  const todayDay = Number.isFinite(Number(postMastery?.todayDay))
    ? Math.floor(Number(postMastery.todayDay))
    : 0;
  // A persisted filter ID might point at a Guardian chip. If the learner is
  // not currently post-mega (e.g. a new statutory word just published),
  // collapse back to `all` so the UI never tries to apply a filter that has
  // no visible chip. Legacy filters pass through unchanged.
  const rawStatusFilter = WORD_BANK_FILTER_IDS.has(statusFilter) ? statusFilter : 'all';
  const activeFilter = !showGuardianFilters && WORD_BANK_GUARDIAN_FILTER_ID_SET.has(rawStatusFilter)
    ? 'all'
    : rawStatusFilter;
  const activeYearFilter = WORD_BANK_YEAR_FILTER_IDS.has(yearFilter) ? yearFilter : 'all';
  const groups = Array.isArray(analytics.wordGroups) ? analytics.wordGroups : [];
  const wordBankMeta = analytics.wordBank || {};
  const allWords = groups.flatMap((group) => Array.isArray(group.words) ? group.words : []);
  // SH2-U5: when the learner has zero tracked words we short-circuit to
  // the shared empty-state card. No filters, no toolbar, no group head —
  // the progress is genuinely empty so the canonical "what happened /
  // progress safe / action" copy is the whole panel.
  const totalTrackedWords = allWords.length;
  const categoryWords = allWords.filter((word) => wordBankYearFilterMatches(activeYearFilter, word));
  // U2 orphan-sanitiser context: wordBankFilterMatchesStatus uses these when
  // checking `guardianDue` / `wobbling` so a row whose slug no longer
  // publishes at core-pool + stage >= Mega cannot surface under those chips.
  // The Word Bank's rows are already filtered to runtime-known words, so the
  // guard is defensive — but it also enforces R10 (wobbling + stage < Mega
  // never matches). Only built when the guardian chips are even visible.
  //
  // Dep note: we key the memo on `groups` (the upstream prop that backs
  // `allWords`), NOT on `allWords` directly. `allWords` is rebuilt via
  // `groups.flatMap(...)` on every render, so listing it in the dep array
  // would bust the memo every render. Keying on `groups` keeps the memo
  // stable across identical-prop renders while still invalidating whenever
  // the upstream groups change.
  const { wordBySlug: orphanWordBySlug, progressMap: orphanProgressMap } = React.useMemo(() => {
    if (!showGuardianFilters) return { wordBySlug: null, progressMap: null };
    const wordBySlug = {};
    const progressMap = {};
    for (const word of allWords) {
      if (!word || !word.slug) continue;
      wordBySlug[word.slug] = word;
      const stage = Math.max(0, Number(word.progress?.stage) || 0);
      progressMap[word.slug] = { stage };
    }
    return { wordBySlug, progressMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see dep note above.
  }, [showGuardianFilters, groups]);
  const filterOptions = { guardianMap, todayDay };
  const visibleGroups = groups
    .filter((group) => (activeYearFilter === 'all' ? true : group.key === activeYearFilter))
    .map((group) => ({
      group,
      words: (Array.isArray(group.words) ? group.words : [])
        .filter((word) => wordBankFilterMatchesStatus(activeFilter, word.status, {
          guardian: guardianMap[word.slug] || null,
          todayDay,
          slug: word.slug,
          progressMap: orphanProgressMap,
          wordBySlug: orphanWordBySlug,
        }))
        .filter((word) => wordMatchesSearch(word, query)),
    }))
    .filter((entry) => (activeFilter === 'all' && !query ? true : entry.words.length > 0));
  const visibleWords = visibleGroups.flatMap((entry) => entry.words);
  const legacyStats = wordBankAggregateStats(categoryWords);
  const guardianStats = showGuardianFilters
    ? wordBankAggregateStats(categoryWords, {
        guardianMap,
        todayDay,
        progressMap: orphanProgressMap,
        wordBySlug: orphanWordBySlug,
      })
    : null;
  const counts = {
    all: categoryWords.length,
    due: legacyStats.due,
    weak: legacyStats.trouble,
    learning: legacyStats.learning,
    secure: legacyStats.secure,
    unseen: legacyStats.unseen,
    // Guardian counts only materialise when the chips are surfaced. Keeping
    // them off the object entirely when allWordsMega === false means the
    // legacy `counts` literal is byte-identical to what shipped before U6.
    ...(guardianStats ? {
      guardianDue: guardianStats.guardianDue,
      wobbling: guardianStats.wobbling,
      renewedRecently: guardianStats.renewedRecently,
      neverRenewed: guardianStats.neverRenewed,
    } : {}),
  };
  const yearCounts = {
    all: allWords.length,
    'y3-4': countWordBankYear(allWords, '3-4'),
    'y5-6': countWordBankYear(allWords, '5-6'),
    extra: countWordBankExtra(allWords),
  };
  const totalWords = allWords.length;
  const categoryTotal = categoryWords.length;
  const categoryLabel = wordBankYearFilterLabel(activeYearFilter);
  const ledeBase = activeYearFilter === 'all'
    ? `${totalWords} word${totalWords === 1 ? '' : 's'} tracked — ${counts.secure} secure, ${counts.due} due today, ${counts.weak} weak spots.`
    : `${categoryLabel} selected — ${categoryTotal} of ${totalWords} words, ${counts.secure} secure, ${counts.due} due today, ${counts.weak} weak spots.`;
  const ledeSearch = query
    ? ` Showing ${visibleWords.length} match${visibleWords.length === 1 ? '' : 'es'} for "${searchQuery}".`
    : '';
  const loadedRows = Number(wordBankMeta.returnedRows) || totalWords;
  const filteredRows = Number(wordBankMeta.filteredRows) || categoryTotal || totalWords;
  const footText = wordBankMeta.hasNextPage
    ? `Showing ${visibleWords.length} visible spellings from ${loadedRows} loaded rows.`
    : activeYearFilter === 'all'
      ? `Showing ${visibleWords.length} of ${totalWords} tracked spellings.`
      : `Showing ${visibleWords.length} of ${categoryTotal} ${categoryLabel} spellings.`;
  const learnerName = learner?.name ? `${learner.name}’s` : 'Learner';

  if (totalTrackedWords === 0) {
    return (
      <section className="word-bank-card word-bank-card-empty">
        <div className="wb-card">
          <header className="wb-head">
            <p className="eyebrow">Word bank progress</p>
            <h1 className="title">{learnerName} word bank</h1>
          </header>
          <EmptyState
            title="No words yet"
            body="No words yet. Your progress is saved. Play a spelling round to add your first word."
            action={{
              label: 'Back to spelling',
              onClick: (event) => renderAction(actions, event, 'spelling-close-word-bank'),
              dataAction: 'spelling-close-word-bank',
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="word-bank-card">
      <div className="wb-card">
        <header className="wb-head">
          <p className="eyebrow">Word bank progress</p>
          <h1 className="title">{learnerName} word bank</h1>
          <p className="lede">{ledeBase}{ledeSearch} Tap any word to see its explainer, then switch to drill when you want to practise.</p>
        </header>

        <div className="wb-toolbar">
          <label className="wb-search">
            <span className="wb-search-icon" aria-hidden="true"><SearchIcon /></span>
            <input
              type="search"
              name="spellingAnalyticsSearch"
              autoComplete="off"
              placeholder="Search words…"
              value={searchQuery}
              data-action="spelling-analytics-search"
              aria-label="Search word bank"
              onChange={(event) => setDraftSearch(event.currentTarget.value.slice(0, 80))}
              onBlur={(event) => commitSearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                commitSearch(event.currentTarget.value);
              }}
            />
          </label>
          <div className="wb-filter-stack">
            <YearChips counts={yearCounts} activeYearFilter={activeYearFilter} actions={actions} />
            <FilterChips counts={counts} activeFilter={activeFilter} actions={actions} />
            {showGuardianFilters ? (
              <GuardianFilterChips counts={counts} activeFilter={activeFilter} actions={actions} />
            ) : null}
          </div>
        </div>

        {showGuardianFilters && WORD_BANK_GUARDIAN_FILTER_ID_SET.has(activeFilter) ? (
          <p className="wb-guardian-hint" role="status">
            {WORD_BANK_GUARDIAN_FILTER_HINTS[activeFilter]}
          </p>
        ) : null}

        <div className="wb-word-groups">
          {visibleGroups.length
            ? visibleGroups.map((entry) => <WordGroup {...entry} query={query} actions={actions} runtimeReadOnly={runtimeReadOnly} key={entry.group.key} />)
            : <div className="wb-empty">{query ? 'No words match your search and filters.' : 'No words match your filters.'}</div>}
        </div>

        <div className="wb-foot small muted">
          {footText}
          {wordBankMeta.hasNextPage ? (
            <button
              type="button"
              className="btn ghost sm"
              data-action="spelling-word-bank-load-more"
              onClick={(event) => renderAction(actions, event, 'spelling-word-bank-load-more')}
            >
              Load more
            </button>
          ) : null}
          {wordBankMeta.hasNextPage ? <span> {filteredRows} authorised matches available.</span> : null}
        </div>
      </div>
    </section>
  );
}

function WordBankAggregates({ analytics, postMastery = null }) {
  const groups = Array.isArray(analytics.wordGroups) ? analytics.wordGroups : [];
  const allWords = groups.flatMap((group) => Array.isArray(group.words) ? group.words : []);
  const showGuardianCards = Boolean(postMastery?.allWordsMega);
  const guardianMap = postMastery?.guardianMap && typeof postMastery.guardianMap === 'object'
    ? postMastery.guardianMap
    : {};
  const todayDay = Number.isFinite(Number(postMastery?.todayDay))
    ? Math.floor(Number(postMastery.todayDay))
    : 0;
  // U2 orphan-sanitiser context mirrors the Word Bank chip filters so the
  // summary aggregates track the visible-row counts exactly. Dep is
  // `groups` (not `allWords`) because `allWords` is rebuilt via
  // `groups.flatMap(...)` every render — see the WordBankCard memo above
  // for the same pattern + rationale.
  const { wordBySlug: orphanWordBySlug, progressMap: orphanProgressMap } = React.useMemo(() => {
    if (!showGuardianCards) return { wordBySlug: null, progressMap: null };
    const wordBySlug = {};
    const progressMap = {};
    for (const word of allWords) {
      if (!word || !word.slug) continue;
      wordBySlug[word.slug] = word;
      const stage = Math.max(0, Number(word.progress?.stage) || 0);
      progressMap[word.slug] = { stage };
    }
    return { wordBySlug, progressMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `groups` to avoid reference-churn on `allWords`.
  }, [showGuardianCards, groups]);
  // When showGuardianCards is false we explicitly pass the zero-arg shape
  // so the aggregate keeps its byte-identical six-field legacy output.
  const statsOptions = showGuardianCards
    ? { guardianMap, todayDay, progressMap: orphanProgressMap, wordBySlug: orphanWordBySlug }
    : undefined;
  const cardOptions = showGuardianCards ? { showGuardian: true } : undefined;
  const core = wordBankAggregateStats(allWords.filter((word) => word.spellingPool !== 'extra'), statsOptions);
  const y34 = wordBankAggregateStats(allWords.filter((word) => word.year === '3-4'), statsOptions);
  const y56 = wordBankAggregateStats(allWords.filter((word) => word.year === '5-6'), statsOptions);
  const extra = wordBankAggregateStats(allWords.filter((word) => word.spellingPool === 'extra'), statsOptions);
  const cards = [
    {
      eyebrow: 'Core spellings',
      title: 'Core statutory progress',
      stats: wordBankAggregateCards(core, 'Words in core pool', cardOptions),
    },
    {
      eyebrow: 'Years 3-4',
      title: 'Lower KS2 spelling pool',
      stats: wordBankAggregateCards(y34, 'Words in pool', cardOptions),
    },
    {
      eyebrow: 'Years 5-6',
      title: 'Upper KS2 spelling pool',
      stats: wordBankAggregateCards(y56, 'Words in pool', cardOptions),
    },
    {
      eyebrow: 'Extra',
      // Extra pool is never Guardian-eligible (Guardian Mega is core-only),
      // so we always use the legacy card shape here regardless of
      // showGuardianCards. This keeps the Extra card's visual rhythm
      // identical across the post-Mega transition.
      title: 'Expansion spelling pool',
      stats: wordBankAggregateCards(extra, 'Words in pool'),
    },
  ];
  return (
    <div className="wb-aggregates">
      {cards.map((card) => (
        <section className="wb-card wb-card-compact" key={card.eyebrow}>
          <div className="eyebrow">{card.eyebrow}</div>
          <h2 className="section-title">{card.title}</h2>
          <SummaryCards cards={card.stats} />
        </section>
      ))}
    </div>
  );
}

export function SpellingWordBankScene({
  appState,
  learner,
  analytics,
  accent,
  actions,
  postMastery = null,
  previousHeroBg = '',
  runtimeReadOnly = false,
}) {
  const detailSlug = appState?.transientUi?.spellingWordDetailSlug || '';
  const detailMode = appState?.transientUi?.spellingWordDetailMode || 'explain';
  const drillTyped = appState?.transientUi?.spellingWordBankDrillTyped || '';
  const drillResult = appState?.transientUi?.spellingWordBankDrillResult || null;
  const transientDetail = appState?.transientUi?.spellingWordDetail || null;
  const detailWord = transientDetail?.slug === detailSlug
    ? transientDetail
    : findWordBankEntry(analytics, detailSlug);
  const heroBg = heroBgForLearner(learner.id);

  return (
    <div className="spelling-in-session word-bank-shell" style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="word-bank-scene">
        <header className="word-bank-topbar">
          <button
            type="button"
            className="btn ghost sm"
            data-action="spelling-close-word-bank"
            onClick={(event) => renderAction(actions, event, 'spelling-close-word-bank')}
          >
            ← Back to setup
          </button>
          <h1 className="word-bank-title">{learner.name}’s spellings</h1>
        </header>
        <WordBankAggregates analytics={analytics} postMastery={postMastery} />
        <WordBankCard
          learner={learner}
          analytics={analytics}
          appState={appState}
          actions={actions}
          postMastery={postMastery}
          runtimeReadOnly={runtimeReadOnly}
        />
      </div>
      {detailWord ? (
        <SpellingWordDetailModal
          word={detailWord}
          mode={detailMode}
          typed={drillTyped}
          result={drillResult}
          accent={accent}
          actions={actions}
        />
      ) : null}
    </div>
  );
}
