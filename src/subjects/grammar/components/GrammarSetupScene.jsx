import React from 'react';
import {
  GRAMMAR_ENABLED_MODES,
  GRAMMAR_LOCKED_MODES,
  GRAMMAR_REGION_IMAGE,
  GRAMMAR_REGION_IMAGE_SMALL,
  groupedGrammarConcepts,
} from '../metadata.js';
import { normaliseGrammarSpeechRate } from '../speech.js';

const SPEECH_RATE_OPTIONS = Object.freeze([
  { value: 0.6, label: '0.6x slow' },
  { value: 0.8, label: '0.8x steady' },
  { value: 1, label: '1x normal' },
  { value: 1.2, label: '1.2x quicker' },
  { value: 1.4, label: '1.4x fast' },
]);

function Stat({ label, value, detail }) {
  return (
    <div className="grammar-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ModeButton({ mode, selected, disabled, locked, reason, actions }) {
  const className = `grammar-mode${selected ? ' selected' : ''}${locked ? ' locked' : ''}`;
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
  const selectedGoal = grammar.prefs?.goalType || 'questions';
  const miniTestMode = selectedMode === 'satsset';
  const troubleMode = selectedMode === 'trouble';
  const surgeryMode = selectedMode === 'surgery';
  const builderMode = selectedMode === 'builder';
  const focusDisabled = troubleMode || surgeryMode || builderMode;
  const selectedFocus = focusDisabled ? '' : (grammar.prefs?.focusConceptId || '');
  const focusPlaceholder = troubleMode ? 'Weakest concept' : (surgeryMode ? 'Surgery mix' : (builderMode ? 'Builder mix' : 'Smart mix'));
  const groupedConcepts = groupedGrammarConcepts(grammar.analytics?.concepts || []);
  const setupDisabled = runtimeReadOnly || Boolean(grammar.pendingCommand);
  const lengthOptions = miniTestMode ? [8, 12] : [3, 5, 8, 10, 15];
  const selectedLength = miniTestMode
    ? (Number(grammar.prefs?.roundLength) >= 10 ? 12 : 8)
    : (Number(grammar.prefs?.roundLength) || 5);
  const selectedSpeechRate = normaliseGrammarSpeechRate(grammar.prefs?.speechRate);

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
            {learner?.name || 'This learner'} can practise with Worker-marked grammar modes while the
            full concept map stays visible for the larger product build.
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
              <div className="eyebrow">Worker-marked modes</div>
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
                disabled={setupDisabled}
                actions={actions}
              />
            ))}
            {GRAMMAR_LOCKED_MODES.map((mode) => (
              <ModeButton
                key={mode.id}
                mode={mode}
                disabled
                locked
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
                disabled={setupDisabled || focusDisabled}
                onChange={(event) => actions.dispatch('grammar-set-focus', { value: event.currentTarget.value })}
              >
                <option value="">{focusPlaceholder}</option>
                {(grammar.analytics?.concepts || []).map((concept) => (
                  <option value={concept.id} key={concept.id}>{concept.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{miniTestMode ? 'Mini-set size' : 'Round length'}</span>
              <select
                className="input"
                value={String(selectedLength)}
                disabled={setupDisabled}
                onChange={(event) => actions.dispatch('grammar-set-round-length', { value: event.currentTarget.value })}
              >
                {lengthOptions.map((length) => <option value={length} key={length}>{length}</option>)}
              </select>
            </label>
            {!miniTestMode ? (
              <label className="field">
                <span>Session goal</span>
                <select
                  className="input"
                  value={selectedGoal}
                  disabled={setupDisabled}
                  onChange={(event) => actions.dispatch('grammar-set-goal', { value: event.currentTarget.value })}
                >
                  <option value="questions">Question count</option>
                  <option value="timed">Ten minutes</option>
                  <option value="due">Clear due items</option>
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Speech rate</span>
              <select
                className="input"
                value={String(selectedSpeechRate)}
                disabled={setupDisabled}
                onChange={(event) => actions.dispatch('grammar-set-speech-rate', { value: event.currentTarget.value })}
              >
                {SPEECH_RATE_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grammar-settings-list" aria-label="Grammar practice settings">
            <label className="grammar-setting-toggle">
              <input
                type="checkbox"
                checked={grammar.prefs?.allowTeachingItems === true}
                disabled={setupDisabled || selectedMode !== 'smart'}
                onChange={(event) => actions.dispatch('grammar-set-practice-setting', {
                  key: 'allowTeachingItems',
                  value: event.currentTarget.checked,
                })}
              />
              <span>Smart Review teaching items</span>
            </label>
            <label className="grammar-setting-toggle">
              <input
                type="checkbox"
                checked={grammar.prefs?.showDomainBeforeAnswer !== false}
                disabled={setupDisabled}
                onChange={(event) => actions.dispatch('grammar-set-practice-setting', {
                  key: 'showDomainBeforeAnswer',
                  value: event.currentTarget.checked,
                })}
              />
              <span>Show domain before answering</span>
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
              disabled={setupDisabled}
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
