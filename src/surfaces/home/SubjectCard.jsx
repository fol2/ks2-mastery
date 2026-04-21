import React from 'react';

const STATUS_LABEL = { live: 'Live', ready: 'Ready', soon: 'Soon' };

export function SubjectCard({ subject, onOpen }) {
  const isPlaceholder = subject.status !== 'live';
  const pct = Math.round((subject.progress || 0) * 100);
  const hasRegion = Boolean(subject.regionBase);
  const statusLabel = STATUS_LABEL[subject.status] || 'Soon';
  return (
    <button
      className={'subject-card' + (isPlaceholder ? ' placeholder' : '')}
      data-action="open-subject"
      data-subject-id={subject.id}
      type="button"
      onClick={() => onOpen?.(subject.id)}
      style={{ appearance: 'none', textAlign: 'left' }}
    >
      {hasRegion ? (
        <div className="sc-banner sc-banner--art">
          <img
            className="sc-banner-art"
            src={`${subject.regionBase}.1280.webp`}
            srcSet={`${subject.regionBase}.640.webp 640w, ${subject.regionBase}.1280.webp 1280w`}
            sizes="(max-width: 980px) 100vw, 320px"
            alt=""
            aria-hidden="true"
          />
          <span className="sc-banner-fade" aria-hidden="true" />
        </div>
      ) : (
        <div className="sc-banner" style={{ background: subject.accent }}>
          <span className="sc-glyph" aria-hidden="true">{subject.glyph}</span>
          <span className="sc-status">{statusLabel}</span>
        </div>
      )}
      <div className="sc-body">
        <div className="sc-eyebrow">{subject.eyebrow || '\u00A0'}</div>
        <h3>{subject.name}</h3>
        <p>{subject.blurb}</p>
        <div className="sc-meter">
          <div className="sc-meter-head">
            <span className="sc-pct">{isPlaceholder ? '—' : `${pct}%`}</span>
            <span className="sc-meta">{subject.progressLabel}</span>
          </div>
          <div className="progress">
            <span style={{ width: `${pct}%`, background: 'var(--brand)' }} />
          </div>
        </div>
      </div>
    </button>
  );
}
