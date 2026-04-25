import React from 'react';
import { CodexCreatureTrigger } from './CodexCreature.jsx';
import {
  CODEX_STAGES,
  codexCardStyle,
  codexEntryStateClassName,
  codexProgressRingStyle,
  codexStageDotClassName,
} from './codex-view-model.js';

export function CodexCard({ entry, onPractice, onPreview }) {
  return (
    <article
      className={codexEntryStateClassName('codex-card', entry)}
      style={codexCardStyle(entry)}
    >
      <div className="codex-card-top">
        <div className="codex-portrait">
          <CodexCreatureTrigger
            entry={entry}
            sizes="(max-width: 820px) 72vw, 360px"
            onPreview={onPreview}
          />
        </div>
        <div className="cx-ring" style={codexProgressRingStyle(entry)}>
          <span className="cx-pct">{entry.progressPct}%</span>
        </div>
      </div>

      <div className="codex-card-body">
        <div className="codex-card-kicker">{entry.wordBand}</div>
        <h3>{entry.name}</h3>
        <p>{entry.blurb}</p>
      </div>

      <div className="codex-stage-track" aria-label={`${entry.speciesName} evolution stage`}>
        {CODEX_STAGES.map((stage) => (
          <span
            key={stage.value}
            aria-label={stage.name}
            className={codexStageDotClassName(entry, stage)}
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
        <button type="button" className="btn secondary sm" onClick={() => onPractice(entry.subjectId || 'spelling')}>
          Practise
        </button>
      </div>
    </article>
  );
}
