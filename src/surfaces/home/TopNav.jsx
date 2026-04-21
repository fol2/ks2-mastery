import React, { useEffect, useRef, useState } from 'react';
import { IconSun, IconMoon, IconChevronDown } from './icons.jsx';

function UserPill({ learners, selectedLearnerId, learnerLabel, signedInAs, onSelectLearner, onOpenProfileSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', (event) => event.key === 'Escape' && setOpen(false));
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const canSwitchLearner = learners.length > 1;

  return (
    <div className="user-pill-wrap" ref={wrapperRef}>
      <button
        type="button"
        className="learner-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{learnerLabel}</span>
        <IconChevronDown />
      </button>
      {open && (
        <div className="user-pill-menu" role="menu">
          {signedInAs && (
            <div className="user-pill-meta">
              <span className="user-pill-meta-label">Signed in</span>
              <span className="user-pill-meta-value">{signedInAs}</span>
            </div>
          )}
          {canSwitchLearner && (
            <div className="user-pill-section">
              <div className="user-pill-section-title">Switch learner</div>
              <ul className="user-pill-list" role="none">
                {learners.map((learner) => (
                  <li key={learner.id}>
                    <button
                      type="button"
                      className={'user-pill-item' + (learner.id === selectedLearnerId ? ' is-selected' : '')}
                      role="menuitem"
                      onClick={() => {
                        onSelectLearner(learner.id);
                        setOpen(false);
                      }}
                    >
                      <span className="user-pill-item-name">{learner.name}</span>
                      <span className="user-pill-item-meta">{learner.yearGroup}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="user-pill-section">
            <button
              type="button"
              className="user-pill-item"
              role="menuitem"
              onClick={() => {
                onOpenProfileSettings();
                setOpen(false);
              }}
            >
              <span className="user-pill-item-name">Profile settings</span>
            </button>
            {onLogout && (
              <button
                type="button"
                className="user-pill-item user-pill-item-danger"
                role="menuitem"
                onClick={() => {
                  onLogout();
                  setOpen(false);
                }}
              >
                <span className="user-pill-item-name">Sign out</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PersistenceDot({ mode, label }) {
  const tone = mode === 'remote-sync' ? 'good' : mode === 'degraded' ? 'bad' : 'neutral';
  return (
    <span className={`persistence-dot persistence-dot-${tone}`} role="status" title={label} aria-label={label}>
      <span className="persistence-dot-blip" aria-hidden="true" />
    </span>
  );
}

export function TopNav({
  theme,
  onToggleTheme,
  learners,
  selectedLearnerId,
  learnerLabel,
  signedInAs,
  onSelectLearner,
  onOpenProfileSettings,
  onLogout,
  persistenceMode,
  persistenceLabel,
}) {
  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-mark">K</span>
        <div className="lockup">
          <div>KS2 Mastery</div>
          <small>Codex journal</small>
        </div>
      </div>
      <div className="nav-right">
        <PersistenceDot mode={persistenceMode} label={persistenceLabel} />
        <UserPill
          learners={learners}
          selectedLearnerId={selectedLearnerId}
          learnerLabel={learnerLabel}
          signedInAs={signedInAs}
          onSelectLearner={onSelectLearner}
          onOpenProfileSettings={onOpenProfileSettings}
          onLogout={onLogout}
        />
        <button className="theme-btn" aria-label="Toggle theme" onClick={onToggleTheme} type="button">
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}
