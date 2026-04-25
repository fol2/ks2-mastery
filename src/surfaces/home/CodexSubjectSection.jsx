import React, { useState } from 'react';
import { CodexCard } from './CodexCard.jsx';

export function CodexSubjectSection({ group, onPractice, onPreview, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const { subjectId, decor, subjectName, totals, status, entries } = group;
  const contentId = `codex-section-${subjectId}`;
  const headingId = `codex-section-${subjectId}-heading`;
  const sectionClass = [
    'codex-subject-section',
    `is-${status}`,
    open ? 'is-open' : 'is-closed',
  ].join(' ');

  return (
    <section
      className={sectionClass}
      style={{ '--subject-accent': decor.accent }}
      aria-labelledby={headingId}
    >
      <h2 className="codex-subject-head" id={headingId}>
        <button
          type="button"
          className="codex-subject-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="codex-subject-glyph" aria-hidden="true">{decor.glyph}</span>
          <span className="codex-subject-titles">
            <span className="codex-subject-eyebrow">{decor.eyebrow}</span>
            <span className="codex-subject-name">{subjectName}</span>
          </span>
          <span className="codex-subject-meta">
            <span className="codex-subject-count">
              {totals.caught} / {totals.total} caught
            </span>
            <span
              className="codex-subject-bar"
              style={{ '--p': totals.progressPct }}
              aria-hidden="true"
            >
              <span />
            </span>
          </span>
          <span className="codex-subject-chevron" aria-hidden="true" />
        </button>
      </h2>
      <div
        id={contentId}
        className="codex-subject-content"
        {...(open ? {} : { inert: '' })}
      >
        <div className="codex-subject-content-inner">
          <div className="codex-roster" aria-label={`${subjectName} monster roster`}>
            {entries.map((entry) => (
              <CodexCard
                key={entry.id}
                entry={entry}
                onPractice={onPractice}
                onPreview={onPreview}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
