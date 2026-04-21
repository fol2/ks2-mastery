import React, { useEffect, useMemo, useState } from 'react';
import { TopNav } from './TopNav.jsx';
import {
  buildCodexEntries,
  eggBreatheStyle,
  monsterMotionStyle,
  pickFeaturedCodexEntry,
  randomHeroBackground,
} from './data.js';

const STAGES = Object.freeze([
  { value: 0, label: 'E', name: 'Egg' },
  { value: 1, label: 'K', name: 'Kid' },
  { value: 2, label: 'T', name: 'Teen' },
  { value: 3, label: 'A', name: 'Adult' },
  { value: 4, label: 'M', name: 'Mega' },
]);

export function CodexSurface({ model, actions }) {
  const [previewEntry, setPreviewEntry] = useState(null);
  const heroBg = useMemo(() => randomHeroBackground(), [model.learner?.id]);
  const entries = useMemo(() => buildCodexEntries(model.monsterSummary || []), [model.monsterSummary]);
  const totals = useMemo(() => codexTotals(entries), [entries]);
  const featured = pickFeaturedCodexEntry(entries);

  useEffect(() => {
    if (!previewEntry) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setPreviewEntry(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewEntry]);

  return (
    <div className="app-shell">
      <TopNav
        theme={model.theme}
        onToggleTheme={actions.toggleTheme}
        learners={model.learnerOptions || []}
        selectedLearnerId={model.learner?.id || ''}
        learnerLabel={model.learnerLabel || ''}
        signedInAs={model.signedInAs}
        onSelectLearner={actions.selectLearner}
        onOpenProfileSettings={actions.openProfileSettings}
        onLogout={actions.logout}
        persistenceMode={model.persistence?.mode || 'local-only'}
        persistenceLabel={model.persistence?.label || ''}
      />

      <main className="codex-page">
        <section
          className={`codex-hero${featured ? ` is-${featured.displayState} stage-${featured.stage}` : ''}`}
          style={{ '--hero-bg': `url('${heroBg}')` }}
        >
          <div className="codex-hero-art" aria-hidden="true" />
          <div className="codex-hero-copy">
            <p className="eyebrow">Monster codex</p>
            <h1 className="codex-title">
              {model.learner?.name ? `${model.learner.name}'s codex journal` : 'Codex journal'}
            </h1>
            <p className="codex-lede">
              Track the creatures awakened by secure spellings, from first catch through each evolution.
            </p>
            <div className="hero-cta-row">
              <button type="button" className="btn ghost xl" onClick={actions.navigateHome}>
                Back to dashboard
              </button>
            </div>
          </div>

          <div className="codex-stat-strip" aria-label="Codex summary">
            <CodexStat value={totals.caught} label="Caught" />
            <CodexStat value={totals.secure} label="Secure words" />
            <CodexStat value={totals.highestStage} label="Highest stage" />
          </div>

          {featured && (
            <div
              className={`codex-feature is-${featured.displayState} stage-${featured.stage}${featured.caught ? '' : ' locked'}`}
              style={codexFeatureStyle(featured)}
            >
              <span className="codex-feature-orbit" aria-hidden="true" />
              {featured.displayState !== 'fresh' && <span className="codex-feature-shadow" aria-hidden="true" />}
              <CodexCreatureTrigger
                entry={featured}
                context="feature"
                sizes="(max-width: 820px) 52vw, 260px"
                onPreview={setPreviewEntry}
              />
              <div className="codex-feature-meta">
                <span className={'chip ' + (featured.caught ? 'good' : 'warn')}>
                  {featured.caught ? 'Unlocked' : 'Waiting'}
                </span>
                <strong>{featured.name}</strong>
                <span>{featured.secureLabel}</span>
              </div>
            </div>
          )}
        </section>

        <div className="home-section-head codex-section-head">
          <div>
            <h2 className="section-title">Monster roster</h2>
            <p className="codex-section-note">Each creature reflects a different part of English Spelling progress.</p>
          </div>
          <button type="button" className="home-section-link" onClick={() => actions.openSubject('spelling')}>
            Spelling practice →
          </button>
        </div>

        <section className="codex-roster" aria-label="Monster roster">
          {entries.map((entry) => (
            <CodexCard
              key={entry.id}
              entry={entry}
              onPractice={() => actions.openSubject('spelling')}
              onPreview={setPreviewEntry}
            />
          ))}
        </section>
      </main>

      {previewEntry && (
        <CodexCreatureLightbox entry={previewEntry} onClose={() => setPreviewEntry(null)} />
      )}
    </div>
  );
}

function codexFeatureStyle(entry) {
  const powerBonus = { inklet: 0, glimmerbug: 44, phaeton: 100 }[entry.id] || 0;
  const stageBonus = (entry.caught ? entry.stage : 0) * 95;
  const visualSize = Math.min(860, 330 + powerBonus + stageBonus);
  const rise = entry.displayState === 'monster'
    ? Math.min(155, 52 + (entry.stage * 24) + (entry.id === 'phaeton' ? 20 : 0))
    : 0;

  return {
    '--codex-feature-size': `${visualSize}px`,
    '--codex-feature-orbit-size': `${Math.min(920, Math.round(visualSize * 1.14))}px`,
    '--codex-feature-shadow-width': `${Math.min(640, Math.round(visualSize * 0.86))}px`,
    '--codex-feature-shadow-y': `${Math.round(Math.max(120, visualSize * 0.34))}px`,
    '--codex-feature-rise': `${rise}px`,
  };
}

function CodexStat({ value, label }) {
  return (
    <span className="codex-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function CodexCard({ entry, onPractice, onPreview }) {
  return (
    <article
      className={`codex-card is-${entry.displayState} stage-${entry.stage}${entry.caught ? '' : ' locked'}`}
      style={{
        '--monster-colour': entry.colour,
        '--monster-soft': entry.soft,
        '--p': entry.progressPct,
      }}
    >
      <div className="codex-card-top">
        <div className="codex-portrait">
          <CodexCreatureTrigger
            entry={entry}
            sizes="(max-width: 820px) 45vw, 180px"
            onPreview={onPreview}
          />
        </div>
        <div className="cx-ring" style={{ '--ring-color': entry.colour, '--p': entry.progressPct }}>
          <span className="cx-pct">{entry.progressPct}%</span>
        </div>
      </div>

      <div className="codex-card-body">
        <div className="codex-card-kicker">{entry.wordBand}</div>
        <h3>{entry.name}</h3>
        <p>{entry.blurb}</p>
      </div>

      <div className="codex-stage-track" aria-label={`${entry.speciesName} evolution stage`}>
        {STAGES.map((stage) => (
          <span
            key={stage.value}
            aria-label={stage.name}
            className={
              'codex-stage-dot'
              + (stage.value === 4 ? ' is-mega' : '')
              + (entry.caught && stage.value <= entry.stage ? ' is-lit' : '')
              + (entry.caught && stage.value === entry.stage ? ' is-current' : '')
            }
          >
            {stage.label}
          </span>
        ))}
      </div>

      <div className="codex-card-footer">
        <div>
          <span className={'chip ' + (entry.caught ? 'good' : 'warn')}>{entry.stageLabel}</span>
          <span className="chip">{entry.secureLabel}</span>
        </div>
        <button type="button" className="btn secondary sm" onClick={onPractice}>
          Practise
        </button>
      </div>
    </article>
  );
}

function CodexCreatureTrigger({ entry, sizes, context = 'card', onPreview }) {
  if (!entry.caught) {
    return <CodexCreatureVisual entry={entry} sizes={sizes} context={context} />;
  }

  return (
    <button
      type="button"
      className={`codex-creature-button is-${context}`}
      aria-label={`View ${entry.name} full screen`}
      onClick={() => onPreview(entry)}
    >
      <CodexCreatureVisual entry={entry} sizes={sizes} context={context} />
    </button>
  );
}

function CodexCreatureVisual({ entry, sizes, context = 'card' }) {
  if (entry.displayState === 'fresh') {
    return (
      <span className="codex-unknown" role="img" aria-label={entry.imageAlt}>
        {entry.placeholder || '?'}
      </span>
    );
  }

  return (
    <img
      className={`codex-creature-image is-${entry.displayState}`}
      src={entry.img}
      srcSet={entry.srcSet}
      sizes={sizes}
      style={creatureMotionStyle(entry, context)}
      alt={entry.imageAlt}
    />
  );
}

function creatureMotionStyle(entry, context) {
  if (entry.displayState === 'egg') return eggBreatheStyle(entry, context);
  if (entry.displayState === 'monster') return monsterMotionStyle(entry, context);
  return undefined;
}

function CodexCreatureLightbox({ entry, onClose }) {
  return (
    <div
      className="codex-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name} full screen`}
      onClick={onClose}
    >
      <button type="button" className="codex-lightbox-close" aria-label="Close preview" onClick={onClose}>
        ×
      </button>
      <div className="codex-lightbox-stage" onClick={(event) => event.stopPropagation()}>
        <span className="codex-lightbox-orbit" aria-hidden="true" />
        <span className="codex-lightbox-shadow" aria-hidden="true" />
        <CodexCreatureVisual entry={entry} context="preview" sizes="min(82vw, 720px)" />
        <div className="codex-lightbox-meta">
          <span className={'chip ' + (entry.caught ? 'good' : 'warn')}>{entry.stageLabel}</span>
          <strong>{entry.name}</strong>
          <span>{entry.secureLabel}</span>
        </div>
      </div>
    </div>
  );
}

function codexTotals(entries) {
  const directSecure = entries
    .filter((entry) => entry.id !== 'phaeton')
    .reduce((sum, entry) => sum + entry.mastered, 0);
  const aggregateSecure = entries.find((entry) => entry.id === 'phaeton')?.mastered || 0;

  return {
    caught: entries.filter((entry) => entry.caught).length,
    secure: Math.max(directSecure, aggregateSecure),
    highestStage: entries.reduce((max, entry) => Math.max(max, entry.caught ? entry.stage : 0), 0),
  };
}
