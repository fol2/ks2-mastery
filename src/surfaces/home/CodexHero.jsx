import React from 'react';
import { CodexCreatureTrigger } from './CodexCreature.jsx';
import {
  codexEntryStateClassName,
  codexFeatureStyle,
} from './codex-view-model.js';

export function CodexHero({
  featured,
  heroBg,
  hasPunctuation,
  learnerName,
  onNavigateHome,
  onPreviewCreature,
  totals,
}) {
  return (
    <section
      className={featured ? codexEntryStateClassName('codex-hero', featured, { includeLocked: false }) : 'codex-hero'}
      style={{ '--hero-bg': `url('${heroBg}')` }}
    >
      <div className="codex-hero-art" aria-hidden="true" />
      <div className="codex-hero-copy">
        <p className="eyebrow">Monster codex</p>
        <h1 className="codex-title">
          {learnerName ? `${learnerName}'s codex journal` : 'Codex journal'}
        </h1>
        <p className="codex-lede">
          {hasPunctuation
            ? 'Track the creatures awakened by secure spelling words and punctuation units, from first catch through each evolution.'
            : 'Track the creatures awakened by secure spellings, from first catch through each evolution.'}
        </p>
        <div className="hero-cta-row">
          <button type="button" className="btn ghost xl" onClick={onNavigateHome}>
            Back to dashboard
          </button>
        </div>
      </div>

      <div className="codex-stat-strip" aria-label="Codex summary">
        <CodexStat value={totals.caught} label="Caught" />
        <CodexStat value={totals.secure} label="Secure units" />
        <CodexStat value={totals.highestStage} label="Highest stage" />
      </div>

      {featured && (
        <CodexFeature entry={featured} onPreviewCreature={onPreviewCreature} />
      )}
    </section>
  );
}

function CodexFeature({ entry, onPreviewCreature }) {
  return (
    <div
      className={codexEntryStateClassName('codex-feature', entry)}
      style={codexFeatureStyle(entry)}
    >
      {entry.displayState !== 'fresh' && <span className="codex-feature-shadow" aria-hidden="true" />}
      <CodexCreatureTrigger
        entry={entry}
        context="feature"
        sizes="(max-width: 820px) 52vw, 260px"
        onPreview={onPreviewCreature}
      />
      <div className="codex-feature-meta">
        <strong>{entry.name}</strong>
        <span>{entry.secureLabel}</span>
      </div>
    </div>
  );
}

function CodexStat({ value, label }) {
  return (
    <span className="codex-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}
