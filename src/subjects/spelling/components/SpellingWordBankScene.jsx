import React from 'react';
import { SearchIcon } from './spelling-icons.jsx';
import { SummaryCards } from './SpellingCommon.jsx';
import { SpellingWordDetailModal } from './SpellingWordDetailModal.jsx';
import {
  WORD_BANK_FILTER_IDS,
  WORD_BANK_YEAR_FILTER_IDS,
  countWordBankStatus,
  countWordBankYear,
  dueLabel,
  findWordBankEntry,
  heroBgForLearner,
  heroBgStyle,
  normaliseSearchText,
  renderAction,
  spellingPoolLabel,
  wordBankFilterMatchesStatus,
  wordBankPillClass,
  wordBankYearFilterLabel,
  wordBankYearFilterMatches,
  wordMatchesSearch,
  wordStatusLabel,
} from './spelling-view-model.js';

function FilterChips({ counts, activeFilter, actions }) {
  const chips = [
    { id: 'all', label: 'All' },
    { id: 'due', label: 'Due' },
    { id: 'weak', label: 'Trouble' },
    { id: 'learning', label: 'Learning' },
    { id: 'secure', label: 'Secure' },
    { id: 'unseen', label: 'Unseen' },
  ];
  return (
    <div className="wb-chips" role="group" aria-label="Filter word bank by status">
      {chips.map((chip) => {
        const active = chip.id === activeFilter;
        return (
          <button
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            className={`wb-chip${active ? ' on' : ''}`}
            data-action="spelling-analytics-status-filter"
            data-value={chip.id}
            key={chip.id}
            onClick={(event) => renderAction(actions, event, 'spelling-analytics-status-filter', { value: chip.id })}
          >
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
    { id: 'all', label: 'All years' },
    { id: 'y3-4', label: 'Years 3-4' },
    { id: 'y5-6', label: 'Years 5-6' },
  ];
  return (
    <div className="wb-chips wb-year-chips" role="group" aria-label="Filter word bank by year band">
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

function WordBankLegend({ counts }) {
  const items = [
    { token: 'new', label: 'New', count: counts.unseen ?? 0 },
    { token: 'learning', label: 'Learning', count: counts.learning ?? 0 },
    { token: 'due', label: 'Due', count: counts.due ?? 0 },
    { token: 'secure', label: 'Secure', count: counts.secure ?? 0 },
    { token: 'trouble', label: 'Trouble', count: counts.weak ?? 0 },
  ];
  return (
    <div className="wb-status-legend" aria-label="Word status colour legend">
      {items.map((item) => (
        <span className="wb-legend-item" key={item.token}>
          <span className={`wb-legend-swatch ${item.token}`} aria-hidden="true" />
          <span className="wb-legend-label">{item.label}</span>
          <span className="wb-legend-count">{item.count}</span>
        </span>
      ))}
    </div>
  );
}

function WordPill({ word, actions }) {
  const progress = word.progress || {};
  const title = [
    word.word,
    word.family ? `Family: ${word.family}` : '',
    word.yearLabel || '',
    spellingPoolLabel(word),
    word.stageLabel || '',
    `Correct ${Math.max(0, Number(progress.correct) || 0)}`,
    `Wrong ${Math.max(0, Number(progress.wrong) || 0)}`,
    `Next due: ${dueLabel(progress)}`,
    'Click to drill',
  ].filter(Boolean).join(' • ');
  return (
    <button
      type="button"
      className={`wb-word-pill ${wordBankPillClass(word.status)}`}
      data-action="spelling-word-detail-open"
      data-slug={word.slug}
      data-value="drill"
      title={title}
      aria-label={`Drill ${word.word}. ${wordStatusLabel(word.status)}. ${spellingPoolLabel(word)}.`}
      onClick={(event) => renderAction(actions, event, 'spelling-word-detail-open', { slug: word.slug, value: 'drill' })}
    >
      {word.word}
    </button>
  );
}

function WordGroup({ group, words, query, actions }) {
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
          ? words.map((word) => <WordPill word={word} actions={actions} key={word.slug} />)
          : <div className="wb-empty">{emptyText}</div>}
      </div>
    </section>
  );
}

function WordBankCard({ learner, analytics, appState, actions }) {
  const searchQuery = appState?.transientUi?.spellingAnalyticsWordSearch || '';
  const statusFilter = appState?.transientUi?.spellingAnalyticsStatusFilter || 'all';
  const yearFilter = appState?.transientUi?.spellingAnalyticsYearFilter || 'all';
  const query = normaliseSearchText(searchQuery);
  const activeFilter = WORD_BANK_FILTER_IDS.has(statusFilter) ? statusFilter : 'all';
  const activeYearFilter = WORD_BANK_YEAR_FILTER_IDS.has(yearFilter) ? yearFilter : 'all';
  const groups = Array.isArray(analytics.wordGroups) ? analytics.wordGroups : [];
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
  const footText = activeYearFilter === 'all'
    ? `Showing ${visibleWords.length} of ${totalWords} tracked spellings.`
    : `Showing ${visibleWords.length} of ${categoryTotal} ${categoryLabel} spellings.`;
  const learnerName = learner?.name ? `${learner.name}’s` : 'Learner';

  return (
    <section className="word-bank-card">
      <div className="wb-card">
        <header className="wb-head">
          <p className="eyebrow">Word bank progress</p>
          <h1 className="title">{learnerName} word bank</h1>
          <p className="lede">{ledeBase}{ledeSearch} Tap any word to drill it, then switch to the explainer if you need help.</p>
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
              onChange={(event) => renderAction(actions, event, 'spelling-analytics-search', { value: event.currentTarget.value })}
            />
          </label>
          <div className="wb-filter-stack">
            <YearChips counts={yearCounts} activeYearFilter={activeYearFilter} actions={actions} />
            <FilterChips counts={counts} activeFilter={activeFilter} actions={actions} />
          </div>
        </div>

        <WordBankLegend counts={counts} />

        <div className="wb-word-groups">
          {visibleGroups.length
            ? visibleGroups.map((entry) => <WordGroup {...entry} query={query} actions={actions} key={entry.group.key} />)
            : <div className="wb-empty">{query ? 'No words match your search and filters.' : 'No words match your filters.'}</div>}
        </div>

        <div className="wb-foot small muted">{footText}</div>
      </div>
    </section>
  );
}

function WordBankAggregates({ analytics }) {
  const emptyStats = { total: 0, secure: 0, due: 0, trouble: 0, fresh: 0, accuracy: null };
  const core = analytics.pools.core || analytics.pools.all || emptyStats;
  const y34 = analytics.pools.y34 || emptyStats;
  const y56 = analytics.pools.y56 || emptyStats;
  const extra = analytics.pools.extra || emptyStats;
  const cards = [
    {
      eyebrow: 'Core spellings',
      title: 'Core statutory progress',
      stats: [
        { label: 'Total', value: core.total, sub: 'Words in core pool' },
        { label: 'Secure', value: core.secure, sub: 'Stage 4+' },
        { label: 'Due now', value: core.due, sub: 'Due today or overdue' },
        { label: 'Accuracy', value: core.accuracy == null ? '—' : `${core.accuracy}%`, sub: 'Across stored attempts' },
      ],
    },
    {
      eyebrow: 'Years 3-4',
      title: 'Lower KS2 spelling pool',
      stats: [
        { label: 'Total', value: y34.total, sub: 'Words in pool' },
        { label: 'Secure', value: y34.secure, sub: 'Stable recall' },
        { label: 'Trouble', value: y34.trouble, sub: 'Weak or fragile' },
        { label: 'Unseen', value: y34.fresh, sub: 'Not yet introduced' },
      ],
    },
    {
      eyebrow: 'Years 5-6',
      title: 'Upper KS2 spelling pool',
      stats: [
        { label: 'Total', value: y56.total, sub: 'Words in pool' },
        { label: 'Secure', value: y56.secure, sub: 'Stable recall' },
        { label: 'Trouble', value: y56.trouble, sub: 'Weak or fragile' },
        { label: 'Unseen', value: y56.fresh, sub: 'Not yet introduced' },
      ],
    },
    {
      eyebrow: 'Extra',
      title: 'Expansion spelling pool',
      stats: [
        { label: 'Total', value: extra.total, sub: 'Words in pool' },
        { label: 'Secure', value: extra.secure, sub: 'Stable recall' },
        { label: 'Trouble', value: extra.trouble, sub: 'Weak or fragile' },
        { label: 'Unseen', value: extra.fresh, sub: 'Not yet introduced' },
      ],
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

export function SpellingWordBankScene({ appState, learner, analytics, accent, actions }) {
  const detailSlug = appState?.transientUi?.spellingWordDetailSlug || '';
  const detailMode = appState?.transientUi?.spellingWordDetailMode || 'explain';
  const drillTyped = appState?.transientUi?.spellingWordBankDrillTyped || '';
  const drillResult = appState?.transientUi?.spellingWordBankDrillResult || null;
  const detailWord = findWordBankEntry(analytics, detailSlug);
  const heroBg = heroBgForLearner(learner.id);

  return (
    <div className="spelling-in-session word-bank-shell" style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
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
        <WordBankCard learner={learner} analytics={analytics} appState={appState} actions={actions} />
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
