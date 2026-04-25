import React from 'react';
import { progressForGrammarMonster } from '../../../platform/game/monster-system.js';
import { monsterAsset, monsterAssetSrcSet } from '../../../platform/game/monsters.js';
import {
  GRAMMAR_MONSTER_ROUTES,
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

function EmptyEvidence({ children }) {
  return <p className="small muted">{children}</p>;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numericScore(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normaliseRecentActivityEntry(entry = {}) {
  const result = isPlainObject(entry.result) ? entry.result : {};
  const correct = entry.correct ?? result.correct;
  return {
    itemId: entry.itemId || '',
    templateId: entry.templateId || '',
    label: entry.questionTypeLabel || entry.templateLabel || entry.label || entry.templateId || 'Grammar item',
    correct: Boolean(correct),
    score: numericScore(entry.score ?? result.score, 0),
    maxScore: numericScore(entry.maxScore ?? result.maxScore, 1),
  };
}

function recentActivityForAnalytics(analytics = {}) {
  if (Array.isArray(analytics.recentActivity) && analytics.recentActivity.length) {
    return analytics.recentActivity.slice(0, 5).map(normaliseRecentActivityEntry);
  }
  if (Array.isArray(analytics.recentAttempts)) {
    return analytics.recentAttempts.slice(-5).reverse().map(normaliseRecentActivityEntry);
  }
  return [];
}

function punctuationGrammarConcepts(concepts = []) {
  return concepts.filter((concept) => concept.punctuationForGrammar === true);
}

export function GrammarAnalyticsScene({ grammar, rewardState: providedRewardState = null }) {
  const concepts = grammar.analytics?.concepts || [];
  const counts = grammar.stats?.concepts || {};
  const progressSnapshot = grammar.analytics?.progressSnapshot || {};
  const evidenceSummary = Array.isArray(grammar.analytics?.evidenceSummary) ? grammar.analytics.evidenceSummary : [];
  const misconceptionPatterns = Array.isArray(grammar.analytics?.misconceptionPatterns) ? grammar.analytics.misconceptionPatterns : [];
  const questionTypeSummary = Array.isArray(grammar.analytics?.questionTypeSummary) ? grammar.analytics.questionTypeSummary : [];
  const conceptsById = new Map(concepts.map((concept) => [concept.id, concept]));
  const grouped = groupedGrammarConcepts(concepts);
  const rewardState = providedRewardState || grammar.projections?.rewards?.state || {};
  const recentActivity = recentActivityForAnalytics(grammar.analytics || {});
  const punctuationConcepts = punctuationGrammarConcepts(concepts);
  const securedPunctuationConcepts = punctuationConcepts.filter((concept) => concept.status === 'secured').length;

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

      <div className="grammar-bellstorm-bridge" aria-label="Grammar and Bellstorm Coast bridge">
        <div>
          <div className="eyebrow">Bellstorm bridge</div>
          <h4>Punctuation-for-grammar stays in Grammar</h4>
          <p>
            These {punctuationConcepts.length} concepts count inside the 18-concept Grammar denominator for
            KS2 GPS mastery. Bellstorm Coast remains the separate Punctuation subject for richer punctuation
            progression.
          </p>
        </div>
        <div className="grammar-bridge-counts" aria-label="Punctuation-for-grammar concept progress">
          <strong>{securedPunctuationConcepts}/{punctuationConcepts.length || 0}</strong>
          <span>secured in Grammar</span>
        </div>
        <div className="grammar-bridge-concepts" aria-label="Punctuation-for-grammar concepts">
          {punctuationConcepts.map((concept) => (
            <span className={`grammar-mini-concept ${concept.status}`} key={concept.id}>{concept.name}</span>
          ))}
        </div>
      </div>

      <div className="grammar-analytics-grid">
        <div className="grammar-evidence-list">
          <div className="grammar-evidence-summary" aria-label="Grammar evidence summary">
            <div className="grammar-stat">
              <span>tracked</span>
              <strong>{progressSnapshot.trackedConcepts ?? 0}/{progressSnapshot.totalConcepts ?? concepts.length}</strong>
              <small>concepts</small>
            </div>
            <div className="grammar-stat">
              <span>accuracy</span>
              <strong>{progressSnapshot.accuracyPercent == null ? '-' : `${progressSnapshot.accuracyPercent}%`}</strong>
              <small>answered evidence</small>
            </div>
          </div>
          {evidenceSummary.length ? (
            <div className="grammar-method-list">
              {evidenceSummary.map((entry) => (
                <div key={entry.id || entry.label}>
                  <strong>{entry.label}</strong>
                  <span>{entry.detail}</span>
                </div>
              ))}
            </div>
          ) : null}
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
              const progress = progressForGrammarMonster(rewardState, route.id, {
                conceptTotal: route.conceptIds.length,
              });
              return (
                <article className="grammar-monster-route" key={route.id}>
                  <img
                    src={monsterAsset(route.id, progress.stage, 320, progress.branch)}
                    srcSet={monsterAssetSrcSet(route.id, progress.stage, progress.branch)}
                    sizes="72px"
                    alt=""
                    loading="lazy"
                  />
                  <div>
                    <strong>{route.name}</strong>
                    <span>{route.route}</span>
                    <small>{progress.mastered}/{progress.conceptTotal} Codex · {secured}/{route.conceptIds.length} secured</small>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grammar-evidence-panels">
        <div>
          <div className="eyebrow">Misconception repair</div>
          {misconceptionPatterns.length ? (
            <ol>
              {misconceptionPatterns.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}</strong>
                  <span>{entry.count || 0} signal{Number(entry.count) === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ol>
          ) : <EmptyEvidence>No recurring misconception pattern recorded yet.</EmptyEvidence>}
        </div>
        <div>
          <div className="eyebrow">Question-type evidence</div>
          {questionTypeSummary.length ? (
            <ol>
              {questionTypeSummary.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}</strong>
                  <span>{entry.correct || 0}/{entry.attempts || 0} correct · {entry.status || 'learning'}</span>
                </li>
              ))}
            </ol>
          ) : <EmptyEvidence>No question-type evidence recorded yet.</EmptyEvidence>}
        </div>
      </div>

      <div className="grammar-recent">
        <div className="eyebrow">Recent attempts</div>
        {recentActivity.length ? (
          <ol>
            {recentActivity.map((attempt, index) => (
              <li key={`${attempt.itemId || attempt.templateId || 'attempt'}-${index}`}>
                <strong>{attempt.label}</strong>
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
