import React from 'react';
import { CodexCreatureVisual } from './CodexCreature.jsx';

export function CodexCreatureLightbox({ entry, onClose }) {
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
