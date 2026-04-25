import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { CodexCreatureVisual } from './CodexCreature.jsx';
import {
  codexEntryStateClassName,
  codexLightboxStyle,
} from './codex-view-model.js';

export function CodexCreatureLightbox({ entry, onClose }) {
  const monsterVisualConfig = useMonsterVisualConfig();
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
      <div
        className={codexEntryStateClassName('codex-lightbox-stage', entry)}
        style={codexLightboxStyle(entry, monsterVisualConfig?.config)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="codex-lightbox-figure">
          <span className="codex-lightbox-orbit" aria-hidden="true" />
          <span className="codex-lightbox-shadow" aria-hidden="true" />
          <CodexCreatureVisual entry={entry} context="preview" sizes="min(82vw, 720px)" />
        </div>
        <div className="codex-lightbox-meta">
          <span className={'chip ' + (entry.caught ? 'good' : 'warn')}>{entry.stageLabel}</span>
          <strong>{entry.name}</strong>
          <span>{entry.secureLabel}</span>
        </div>
      </div>
    </div>
  );
}
