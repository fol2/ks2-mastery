import React from 'react';
import { GrammarConceptDetailModal } from './GrammarConceptDetailModal.jsx';
import {
  GRAMMAR_BANK_CLUSTER_CHIPS,
  GRAMMAR_BANK_HERO,
  GRAMMAR_BANK_STATUS_CHIPS,
  buildGrammarBankModel,
  grammarBankAggregateCards,
} from './grammar-view-model.js';

// Phase 3 U2: Grammar Bank scene. Mirrors the Spelling Word Bank scene
// shape — hero, aggregate card row, search + filter chips, concept grid,
// detail modal. Every label, chip id, and count comes from the U8
// view-model. The JSX layer is layout-only.
//
// Focus-return contract: concept cards carry `data-focus-return-id` so
// the detail modal can restore focus on close (SSR-visible marker; the
// actual focus motion is a browser runtime side-effect and asserted via
// manual QA — see `GrammarConceptDetailModal.jsx` for the hook).
//
// Search: the search input is controlled locally (draft) and commits its
// value on blur / Enter via `grammar-concept-bank-search`. This mirrors
// the Spelling Word Bank pattern so typing does not force every
// keystroke through the store.

function AggregateCards({ counts, total }) {
  const cards = grammarBankAggregateCards(counts, { total });
  return (
    <div className="grammar-bank-aggregates" role="list">
      {cards.map((card) => (
        <div className="grammar-bank-aggregate-card" role="listitem" data-aggregate-id={card.id} key={card.id}>
          <div className="grammar-bank-aggregate-label">{card.label}</div>
          <div className="grammar-bank-aggregate-value">{card.value}</div>
          <div className="grammar-bank-aggregate-sub">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

function StatusFilterChips({ counts, activeFilter, onChange }) {
  return (
    <div className="grammar-bank-chips grammar-bank-status-chips" role="group" aria-label="Filter concepts by status">
      {GRAMMAR_BANK_STATUS_CHIPS.map((chip) => {
        const active = chip.id === activeFilter;
        const chipCount = counts[chip.id] ?? 0;
        return (
          <button
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            className={`grammar-bank-chip grammar-bank-chip-status${active ? ' on' : ''}`}
            data-action="grammar-concept-bank-filter"
            data-value={chip.id}
            key={chip.id}
            onClick={() => onChange(chip.id)}
          >
            <span className={`grammar-bank-chip-swatch tone-${chip.tone}`} aria-hidden="true" />
            <span className="grammar-bank-chip-label">{chip.label}</span>
            <span className="grammar-bank-chip-count">{chipCount}</span>
          </button>
        );
      })}
    </div>
  );
}

function ClusterFilterChips({ counts, activeFilter, onChange }) {
  return (
    <div className="grammar-bank-chips grammar-bank-cluster-chips" role="group" aria-label="Filter concepts by cluster">
      {GRAMMAR_BANK_CLUSTER_CHIPS.map((chip) => {
        const active = chip.id === activeFilter;
        const chipCount = counts[chip.id] ?? 0;
        return (
          <button
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            className={`grammar-bank-chip grammar-bank-chip-cluster${active ? ' on' : ''}`}
            data-action="grammar-concept-bank-cluster-filter"
            data-value={chip.id}
            key={chip.id}
            onClick={() => onChange(chip.id)}
          >
            <span className="grammar-bank-chip-label">{chip.label}</span>
            <span className="grammar-bank-chip-count">{chipCount}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConceptCard({ card, onPractise, onOpenDetail }) {
  const returnId = `grammar-bank-concept-card-${card.id}`;
  return (
    <article
      className={`grammar-bank-card tone-${card.tone}`}
      data-concept-id={card.id}
      data-cluster-id={card.cluster}
      data-status-label={card.label}
    >
      <header className="grammar-bank-card-head">
        <div className="grammar-bank-card-head-copy">
          <h3 className="grammar-bank-card-title">{card.name}</h3>
          <p className="grammar-bank-card-domain">{card.domain}</p>
        </div>
        <span className={`grammar-bank-card-status-chip tone-${card.tone}`}>{card.childLabel}</span>
      </header>
      <p className="grammar-bank-card-summary">{card.summary}</p>
      {card.example ? (
        <blockquote className="grammar-bank-card-example">{card.example}</blockquote>
      ) : null}
      <div className="grammar-bank-card-foot">
        <span className="grammar-bank-card-cluster-badge" data-cluster-id={card.cluster}>{card.clusterName}</span>
        <div className="grammar-bank-card-actions">
          <button
            type="button"
            className="btn primary sm"
            data-action="grammar-focus-concept"
            data-concept-id={card.id}
            onClick={() => onPractise(card.id)}
          >
            Practise 5
          </button>
          <button
            type="button"
            className="btn ghost sm"
            data-action="grammar-concept-detail-open"
            data-concept-id={card.id}
            data-focus-return-id={returnId}
            onClick={() => onOpenDetail(card.id)}
          >
            See example
          </button>
        </div>
      </div>
    </article>
  );
}

export function GrammarConceptBankScene({ grammar, actions }) {
  const bankUi = grammar?.bank || {};
  const activeStatus = bankUi.statusFilter || 'all';
  const activeCluster = bankUi.clusterFilter || 'all';
  const persistedQuery = bankUi.query || '';
  const detailConceptId = bankUi.detailConceptId || '';

  const [draftQuery, setDraftQuery] = React.useState(persistedQuery);
  React.useEffect(() => {
    setDraftQuery(persistedQuery);
  }, [persistedQuery]);

  const commitSearch = React.useCallback((value) => {
    const next = String(value || '').slice(0, 80);
    if (next === persistedQuery) return;
    actions?.dispatch?.('grammar-concept-bank-search', { value: next });
  }, [actions, persistedQuery]);

  const bankModel = buildGrammarBankModel(grammar, {
    statusFilter: activeStatus,
    clusterFilter: activeCluster,
    query: draftQuery,
  });

  const handleStatusChange = (id) => {
    actions?.dispatch?.('grammar-concept-bank-filter', { value: id });
  };
  const handleClusterChange = (id) => {
    actions?.dispatch?.('grammar-concept-bank-cluster-filter', { value: id });
  };
  const handlePractise = (conceptId) => {
    actions?.dispatch?.('grammar-focus-concept', { conceptId });
  };
  const handleOpenDetail = (conceptId) => {
    actions?.dispatch?.('grammar-concept-detail-open', { conceptId });
  };

  const detailCard = detailConceptId
    ? bankModel.cards.find((card) => card.id === detailConceptId)
      || buildGrammarBankModel(grammar, { statusFilter: 'all', clusterFilter: 'all', query: '' })
        .cards.find((card) => card.id === detailConceptId)
    : null;

  const totalMatches = bankModel.cards.length;
  const summaryText = totalMatches === bankModel.total
    ? `Showing all ${bankModel.total} concepts.`
    : `Showing ${totalMatches} of ${bankModel.total} concepts.`;

  return (
    <section className="grammar-bank-scene" aria-labelledby="grammar-bank-title">
      <header className="grammar-bank-topbar">
        <button
          type="button"
          className="btn ghost sm"
          data-action="grammar-close-concept-bank"
          onClick={() => actions?.dispatch?.('grammar-close-concept-bank')}
        >
          &larr; Back to Grammar Garden
        </button>
        <div className="grammar-bank-topbar-copy">
          <h2 id="grammar-bank-title" className="grammar-bank-title">{GRAMMAR_BANK_HERO.title}</h2>
          <p className="grammar-bank-subtitle">{GRAMMAR_BANK_HERO.subtitle}</p>
        </div>
      </header>

      <AggregateCards counts={bankModel.counts} total={bankModel.total} />

      <div className="grammar-bank-toolbar">
        <label className="grammar-bank-search">
          <span className="grammar-bank-search-label">Search concepts</span>
          <input
            type="search"
            name="grammarConceptBankSearch"
            autoComplete="off"
            placeholder="Search concepts"
            value={draftQuery}
            data-action="grammar-concept-bank-search"
            aria-label="Search Grammar concepts"
            onChange={(event) => setDraftQuery(event.currentTarget.value.slice(0, 80))}
            onBlur={(event) => commitSearch(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              commitSearch(event.currentTarget.value);
            }}
          />
        </label>
        <div className="grammar-bank-filter-stack">
          <StatusFilterChips
            counts={bankModel.counts}
            activeFilter={activeStatus}
            onChange={handleStatusChange}
          />
          <ClusterFilterChips
            counts={bankModel.clusterCounts}
            activeFilter={activeCluster}
            onChange={handleClusterChange}
          />
        </div>
      </div>

      <p className="grammar-bank-summary" role="status">{summaryText}</p>

      <div className="grammar-bank-grid">
        {bankModel.cards.length
          ? bankModel.cards.map((card) => (
            <ConceptCard
              card={card}
              onPractise={handlePractise}
              onOpenDetail={handleOpenDetail}
              key={card.id}
            />
          ))
          : (
            <div className="grammar-bank-empty" role="status">
              {draftQuery ? GRAMMAR_BANK_HERO.emptyWithSearch : GRAMMAR_BANK_HERO.empty}
            </div>
          )
        }
      </div>

      {detailCard ? (
        <GrammarConceptDetailModal card={detailCard} actions={actions} />
      ) : null}
    </section>
  );
}
