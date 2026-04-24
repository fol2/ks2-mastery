import React from 'react';
import { SearchIcon } from './spelling-icons.jsx';
import { SummaryCards } from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import { SpellingWordDetailModal } from './SpellingWordDetailModal.jsx';
import {
  WORD_BANK_FILTER_IDS,
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
            <span className="wb-chip-count">{counts[chip.id] ?? 0}</span>
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
            <span className="wb-chip-count">{counts[chip.id] ?? 0}</span>
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

function WordBankCard({ learner, analytics, appState, actions, runtimeReadOnly = false }) {
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
  const activeFilter = WORD_BANK_FILTER_IDS.has(statusFilter) ? statusFilter : 'all';
  const activeYearFilter = WORD_BANK_YEAR_FILTER_IDS.has(yearFilter) ? yearFilter : 'all';
  const groups = Array.isArray(analytics.wordGroups) ? analytics.wordGroups : [];
  const wordBankMeta = analytics.wordBank || {};
  const allWords = groups.flatMap((group) => Array.isArray(group.words) ? group.words : []);
  const categoryWords = allWords.filter((word) => wordBankYearFilterMatches(activeYearFilter, word));
  const visibleGroups = groups
    .filter((group) => (activeYearFilter === 'all' ? true : group.key === activeYearFilter))
    .map((group) => ({
      group,
      words: (Array.isArray(group.words) ? group.words : [])
        .filter((word) => wordBankFilterMatchesStatus(activeFilter, word.status))
        .filter((word) => wordMatchesSearch(word, query)),
    }))
    .filter((entry) => (activeFilter === 'all' && !query ? true : entry.words.length > 0));
  const visibleWords = visibleGroups.flatMap((entry) => entry.words);
  const counts = {
    all: categoryWords.length,
    due: countWordBankStatus(categoryWords, 'due'),
    weak: countWordBankStatus(categoryWords, 'trouble'),
    learning: countWordBankStatus(categoryWords, 'learning'),
    secure: countWordBankStatus(categoryWords, 'secure'),
    unseen: countWordBankStatus(categoryWords, 'new'),
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
          </div>
        </div>

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

function WordBankAggregates({ analytics }) {
  const groups = Array.isArray(analytics.wordGroups) ? analytics.wordGroups : [];
  const allWords = groups.flatMap((group) => Array.isArray(group.words) ? group.words : []);
  const core = wordBankAggregateStats(allWords.filter((word) => word.spellingPool !== 'extra'));
  const y34 = wordBankAggregateStats(allWords.filter((word) => word.year === '3-4'));
  const y56 = wordBankAggregateStats(allWords.filter((word) => word.year === '5-6'));
  const extra = wordBankAggregateStats(allWords.filter((word) => word.spellingPool === 'extra'));
  const cards = [
    {
      eyebrow: 'Core spellings',
      title: 'Core statutory progress',
      stats: wordBankAggregateCards(core, 'Words in core pool'),
    },
    {
      eyebrow: 'Years 3-4',
      title: 'Lower KS2 spelling pool',
      stats: wordBankAggregateCards(y34, 'Words in pool'),
    },
    {
      eyebrow: 'Years 5-6',
      title: 'Upper KS2 spelling pool',
      stats: wordBankAggregateCards(y56, 'Words in pool'),
    },
    {
      eyebrow: 'Extra',
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
        <WordBankAggregates analytics={analytics} />
        <WordBankCard learner={learner} analytics={analytics} appState={appState} actions={actions} runtimeReadOnly={runtimeReadOnly} />
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
