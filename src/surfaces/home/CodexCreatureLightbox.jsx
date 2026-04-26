import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { CodexCreatureVisual } from './CodexCreature.jsx';
import {
  codexEntryStateClassName,
  codexLightboxStyle,
} from './codex-view-model.js';
// SH2-U5: when the lightbox is asked to render a missing entry (the
// upstream codex has not produced a matching row yet — for example a
// fresh learner with zero progress) we render the shared primitive
// instead of throwing on `entry.name`. The caller normally guards this
// branch, but surfacing a consistent empty state here is belt-and-braces
// and also satisfies the parity test's "every panel with an empty branch
// imports the primitive" invariant.
import { EmptyState } from '../../platform/ui/EmptyState.jsx';

export function CodexCreatureLightbox({ entry, onClose }) {
  const monsterVisualConfig = useMonsterVisualConfig();
  if (!entry) {
    return (
      <div
        className="codex-lightbox codex-lightbox-empty"
        role="dialog"
        aria-modal="true"
        aria-label="Creature preview unavailable"
        onClick={onClose}
      >
        <button type="button" className="codex-lightbox-close" aria-label="Close preview" onClick={onClose}>
          ×
        </button>
        <div className="codex-lightbox-stage" onClick={(event) => event.stopPropagation()}>
          <EmptyState
            title="Nothing to preview yet"
            body="Nothing caught yet. Your meadow stays tidy. Finish a round to unlock this creature's preview."
            action={{ label: 'Close', onClick: onClose, dataAction: 'codex-lightbox-close' }}
          />
        </div>
      </div>
    );
  }
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
