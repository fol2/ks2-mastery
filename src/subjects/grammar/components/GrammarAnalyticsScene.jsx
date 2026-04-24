import React from 'react';
import {
  GRAMMAR_MONSTER_ROUTES,
  grammarMonsterAsset,
  groupedGrammarConcepts,
} from '../metadata.js';

function StatusCount({ label, value, className = '' }) {
  return (
    <span className={`grammar-status-count ${className}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function securedCountForRoute(route, conceptsById) {
  return route.conceptIds.reduce((count, conceptId) => (
    conceptsById.get(conceptId)?.status === 'secured' ? count + 1 : count
  ), 0);
}

export function GrammarAnalyticsScene({ grammar }) {
  const concepts = grammar.analytics?.concepts || [];
  const counts = grammar.stats?.concepts || {};
  const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
  const grouped = groupedGrammarConcepts(concepts);
  const recentAttempts = Array.isArray(grammar.analytics?.recentAttempts)
    ? grammar.analytics.recentAttempts.slice(-5).reverse()
    : [];

  return (
    <section className="card grammar-analytics" aria-labelledby="grammar-analytics-title">
      <div className="card-header">
        <div>
          <div className="eyebrow">Evidence snapshot</div>
          <h3 className="section-title" id="grammar-analytics-title">Grammar analytics</h3>
        </div>
        <span className="chip">Stage 1</span>
      </div>

      <div className="grammar-status-strip" aria-label="Concept status counts">
        <StatusCount label="new" value={counts.new || 0} className="new" />
        <StatusCount label="learning" value={counts.learning || 0} className="learning" />
        <StatusCount label="weak" value={counts.weak || 0} className="weak" />
        <StatusCount label="due" value={counts.due || 0} className="due" />
        <StatusCount label="secured" value={counts.secured || 0} className="secured" />
      </div>

      <div className="grammar-analytics-grid">
        <div className="grammar-evidence-list">
          {grouped.map((group) => (
            <div className="grammar-evidence-domain" key={group.domain}>
              <strong>{group.domain}</strong>
              <div>
                {group.concepts.map((concept) => (
                  <span className={`grammar-mini-concept ${concept.status}`} key={concept.id}>
                    {concept.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grammar-route-panel">
          <div className="eyebrow">Reserved reward routes</div>
          <div className="grammar-monster-grid">
            {GRAMMAR_MONSTER_ROUTES.map((route) => {
              const secured = securedCountForRoute(route, conceptsById);
              return (
                <article className="grammar-monster-route" key={route.id}>
                  <img src={grammarMonsterAsset(route.id)} alt="" loading="lazy" />
                  <div>
                    <strong>{route.name}</strong>
                    <span>{route.route}</span>
                    <small>{secured}/{route.conceptIds.length} secured</small>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grammar-recent">
        <div className="eyebrow">Recent attempts</div>
        {recentAttempts.length ? (
          <ol>
            {recentAttempts.map((attempt, index) => (
              <li key={`${attempt.itemId || attempt.templateId || 'attempt'}-${index}`}>
                <strong>{attempt.templateLabel || attempt.templateId || 'Grammar item'}</strong>
                <span>{attempt.correct ? 'correct' : 'review'} · score {attempt.score ?? 0}/{attempt.maxScore ?? 1}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="small muted">No Grammar attempts recorded yet.</p>
        )}
      </div>
    </section>
  );
}
