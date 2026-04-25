import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { CodexCreatureTrigger } from './CodexCreature.jsx';
import {
  codexEntryStateClassName,
  codexFeatureStyle,
} from './codex-view-model.js';
import { formatSubjectList } from './data.js';

export function CodexHero({
  featured,
  heroBg,
  presentSubjects = [],
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
        <p className="codex-lede">{describeCodexLede(presentSubjects)}</p>
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
  const monsterVisualConfig = useMonsterVisualConfig();
  return (
    <div
      className={codexEntryStateClassName('codex-feature', entry)}
      style={codexFeatureStyle(entry, monsterVisualConfig?.config)}
    >
      {entry.displayState !== 'fresh' && <span className="codex-feature-shadow" aria-hidden="true" />}
      <CodexCreatureTrigger
        entry={entry}
        context="feature"
        sizes="(max-width: 820px) 76vw, 700px"
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

function describeCodexLede(presentSubjects) {
  if (!presentSubjects.length) {
    return 'Track the creatures awakened by secure learning, from first catch through each evolution.';
  }
  const onlySpelling = presentSubjects.length === 1 && presentSubjects[0] === 'Spelling';
  if (onlySpelling) {
    return 'Track the creatures awakened by secure spellings, from first catch through each evolution.';
  }
  const list = formatSubjectList(presentSubjects.map(toLowerNoun));
  return `Track the creatures awakened by secure ${list}, from first catch through each evolution.`;
}

function toLowerNoun(subjectName) {
  if (subjectName === 'Spelling') return 'spellings';
  if (subjectName === 'Punctuation') return 'punctuation units';
  if (subjectName === 'Grammar') return 'grammar units';
  if (subjectName === 'Reading') return 'reading evidence';
  if (subjectName === 'Arithmetic') return 'arithmetic units';
  if (subjectName === 'Reasoning') return 'reasoning units';
  return subjectName.toLowerCase();
}
