import React from 'react';
import {
  GRAMMAR_ENABLED_MODES,
  GRAMMAR_LOCKED_MODES,
  GRAMMAR_REGION_IMAGE,
  GRAMMAR_REGION_IMAGE_SMALL,
  groupedGrammarConcepts,
} from '../metadata.js';

function Stat({ label, value, detail }) {
  return (
    <div className="grammar-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ModeButton({ mode, selected, disabled, reason, actions }) {
  const className = `grammar-mode${selected ? ' selected' : ''}${disabled ? ' locked' : ''}`;
  return (
    <button
      className={className}
      type="button"
      disabled={disabled}
      onClick={() => actions.dispatch('grammar-set-mode', { value: mode.id })}
    >
      <span>{mode.label}</span>
      <small>{mode.detail || reason || ''}</small>
    </button>
  );
}

export function GrammarSetupScene({ learner, grammar, actions, runtimeReadOnly }) {
  const counts = grammar.stats?.concepts || {};
  const templates = grammar.stats?.templates || {};
  const selectedMode = grammar.prefs?.mode || 'smart';
  const selectedFocus = grammar.prefs?.focusConceptId || '';
  const groupedConcepts = groupedGrammarConcepts(grammar.analytics?.concepts || []);
  const startDisabled = runtimeReadOnly || Boolean(grammar.pendingCommand);

  return (
    <section className="grammar-setup" aria-labelledby="grammar-setup-title">
      <div
        className="grammar-hero"
        style={{ '--grammar-hero-bg': `url(${GRAMMAR_REGION_IMAGE})` }}
      >
        <picture aria-hidden="true">
          <source media="(max-width: 720px)" srcSet={GRAMMAR_REGION_IMAGE_SMALL} />
          <img src={GRAMMAR_REGION_IMAGE} alt="" />
        </picture>
        <div className="grammar-hero-copy">
          <div className="eyebrow">Clause Conservatory</div>
          <h2 id="grammar-setup-title">Grammar retrieval practice</h2>
          <p>
            {learner?.name || 'This learner'} can start with the Stage 1 Worker-marked grammar engine,
            while the full concept map stays visible for the larger product build.
          </p>
          <div className="grammar-hero-stats" aria-label="Grammar coverage">
            <Stat label="Concepts" value={counts.total || 18} detail="full map" />
            <Stat label="Templates" value={templates.total || 51} detail="Worker-held" />
            <Stat label="Secured" value={counts.secured || 0} detail={`${counts.due || 0} due`} />
          </div>
        </div>
      </div>

      <div className="grammar-setup-grid">
        <section className="card grammar-start-card" aria-labelledby="grammar-start-title">
          <div className="card-header">
            <div>
              <div className="eyebrow">Stage 1 practice</div>
              <h3 className="section-title" id="grammar-start-title">Start a Grammar round</h3>
            </div>
            <span className="chip good">Worker marked</span>
          </div>

          <div className="grammar-mode-grid" aria-label="Grammar practice mode">
            {GRAMMAR_ENABLED_MODES.map((mode) => (
              <ModeButton
                key={mode.id}
                mode={mode}
                selected={mode.id === selectedMode}
                actions={actions}
              />
            ))}
            {GRAMMAR_LOCKED_MODES.map((mode) => (
              <ModeButton
                key={mode.id}
                mode={mode}
                disabled
                reason="Coming next"
                actions={actions}
              />
            ))}
          </div>

          <div className="grammar-controls">
            <label className="field">
              <span>Focus concept</span>
              <select
                className="input"
                value={selectedFocus}
                onChange={(event) => actions.dispatch('grammar-set-focus', { value: event.currentTarget.value })}
              >
                <option value="">Smart mix</option>
                {(grammar.analytics?.concepts || []).map((concept) => (
                  <option value={concept.id} key={concept.id}>{concept.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Round length</span>
              <select
                className="input"
                value={String(grammar.prefs?.roundLength || 5)}
                onChange={(event) => actions.dispatch('grammar-set-round-length', { value: event.currentTarget.value })}
              >
                {[3, 5, 8, 10, 15].map((length) => <option value={length} key={length}>{length}</option>)}
              </select>
            </label>
          </div>

          {grammar.error ? (
            <div className="feedback bad" role="alert">
              <strong>Grammar is unavailable right now</strong>
              <div>{grammar.error}</div>
            </div>
          ) : null}

          <div className="actions">
            <button
              className="btn primary xl"
              type="button"
              disabled={startDisabled}
              onClick={() => actions.dispatch('grammar-start')}
            >
              {grammar.pendingCommand === 'start-session' ? 'Starting...' : 'Start practice'}
            </button>
          </div>
        </section>

        <section className="card grammar-map-card" aria-labelledby="grammar-map-title">
          <div className="eyebrow">Full placeholder map</div>
          <h3 className="section-title" id="grammar-map-title">All 18 Grammar concepts</h3>
          <div className="grammar-domain-list">
            {groupedConcepts.map((group) => (
              <div className="grammar-domain" key={group.domain}>
                <div className="grammar-domain-title">{group.domain}</div>
                <div className="grammar-concept-list">
                  {group.concepts.map((concept) => (
                    <span className={`grammar-concept ${concept.status}`} key={concept.id}>
                      <span>{concept.name}</span>
                      <small>{concept.status}</small>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
