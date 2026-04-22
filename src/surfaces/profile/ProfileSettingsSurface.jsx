import React from 'react';
import { TopNav } from '../shell/TopNav.jsx';
import { PersistenceBanner } from '../shell/PersistenceBanner.jsx';

function safeColour(value, fallback = '#3E6FA8') {
  const colour = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : fallback;
}

function goalLabel(value) {
  return {
    confidence: 'Confidence and habit',
    sats: 'KS2 SATs prep',
    'catch-up': 'Catch-up and recovery',
  }[value] || 'KS2 SATs prep';
}

function initials(name) {
  const parts = String(name || 'Learner').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'L').toUpperCase();
}

function learnerList(appState) {
  return appState.learners.allIds.map((id) => appState.learners.byId[id]).filter(Boolean);
}

function selectedLearner(appState) {
  const selectedId = appState.learners.selectedId;
  return selectedId ? appState.learners.byId[selectedId] || null : null;
}

function learnerOrdinal(appState) {
  const index = appState.learners.allIds.indexOf(appState.learners.selectedId);
  return index >= 0 ? index + 1 : 1;
}

function PersistenceInline({ snapshot }) {
  const mode = snapshot?.mode || 'local-only';
  const trust = snapshot?.trustedState === 'remote'
    ? 'Remote trusted'
    : snapshot?.trustedState === 'local-cache'
      ? 'Local cache trusted'
      : snapshot?.trustedState === 'memory'
        ? 'Memory only'
        : 'This browser trusted';
  return (
    <div className="chip-row" style={{ marginTop: 14 }}>
      <span className={`chip ${mode === 'degraded' ? 'warn' : mode === 'remote-sync' ? 'good' : ''}`}>{mode === 'remote-sync' ? 'Remote sync' : mode === 'degraded' ? 'Sync degraded' : 'Local-only'}</span>
      <span className="chip">{trust}</span>
      <span className="chip">Pending: {Number(snapshot?.pendingWriteCount) || 0}</span>
    </div>
  );
}

function EmptyProfile({ actions }) {
  return (
    <main className="profile-page">
      <section className="profile-empty-state hero-paper">
        <div>
          <div className="eyebrow">Profile settings</div>
          <h1 className="profile-title">No writable learner is available</h1>
          <p className="profile-lede">Create or select a learner before changing study rhythm, profile colour, or portable data.</p>
          <div className="profile-hero-actions">
            <button className="btn primary xl" type="button" onClick={() => actions.dispatch('learner-create')}>Add learner</button>
            <button className="btn ghost xl" type="button" onClick={actions.navigateHome}>Back to dashboard</button>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ProfileSettingsSurface({ appState, chrome, actions, subjectCount = 0, liveSubjectCount = 0 }) {
  const learner = selectedLearner(appState);
  const learners = learnerList(appState);
  if (!learner) {
    return (
      <div className="app-shell profile-settings-shell">
        <TopNav
          theme={chrome.theme}
          onToggleTheme={actions.toggleTheme}
          onNavigateHome={actions.navigateHome}
          learners={chrome.learnerOptions || []}
          selectedLearnerId={chrome.learner?.id || ''}
          learnerLabel={chrome.learnerLabel || ''}
          signedInAs={chrome.signedInAs}
          onSelectLearner={actions.selectLearner}
          onOpenProfileSettings={actions.openProfileSettings}
          onLogout={actions.logout}
          persistenceMode={chrome.persistence?.mode || 'local-only'}
          persistenceLabel={chrome.persistence?.label || ''}
        />
        <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
        <EmptyProfile actions={actions} />
      </div>
    );
  }

  const accent = safeColour(learner.avatarColor);
  const submit = (event) => {
    event.preventDefault();
    actions.dispatch('learner-save-form', { formData: new FormData(event.currentTarget) });
  };

  return (
    <div className="app-shell profile-settings-shell">
      <TopNav
        theme={chrome.theme}
        onToggleTheme={actions.toggleTheme}
        onNavigateHome={actions.navigateHome}
        learners={chrome.learnerOptions || []}
        selectedLearnerId={chrome.learner?.id || ''}
        learnerLabel={chrome.learnerLabel || ''}
        signedInAs={chrome.signedInAs}
        onSelectLearner={actions.selectLearner}
        onOpenProfileSettings={actions.openProfileSettings}
        onLogout={actions.logout}
        persistenceMode={chrome.persistence?.mode || 'local-only'}
        persistenceLabel={chrome.persistence?.label || ''}
      />
      <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
      <main className="profile-page">
        <section className="profile-hero hero-paper" style={{ '--profile-accent': accent }}>
          <div className="profile-hero-copy">
            <div className="profile-kicker">Profile settings</div>
            <h1 className="profile-title">Learning profile for {learner.name}</h1>
            <p className="profile-lede">Year group, goal and daily rhythm stay shared across every subject in the dashboard.</p>
            <div className="profile-hero-actions">
              <button className="btn primary xl" type="button" onClick={() => actions.dispatch('learner-create')} style={{ background: accent }}>Add learner</button>
              <button className="btn ghost xl" type="button" onClick={actions.navigateHome}>Back to dashboard</button>
            </div>
          </div>
          <div className="profile-identity">
            <div className="profile-avatar" aria-hidden="true">{initials(learner.name)}</div>
            <div className="profile-identity-copy">
              <strong>{learner.name}</strong>
              <span>{learner.yearGroup} / {goalLabel(learner.goal)}</span>
            </div>
            <div className="profile-mini-stats" aria-label="Learner profile summary">
              <span><strong>{learner.dailyMinutes || 15}</strong><small>daily minutes</small></span>
              <span><strong>{learnerOrdinal(appState)}/{learners.length}</strong><small>learner</small></span>
              <span><strong>{liveSubjectCount}/{subjectCount}</strong><small>subjects live</small></span>
            </div>
          </div>
        </section>

        <section className="profile-layout">
          <form id="learner-profile-form" className="profile-panel profile-editor-panel" onSubmit={submit}>
            <div className="profile-panel-head">
              <div>
                <div className="eyebrow">Learner details</div>
                <h2 className="section-title">Study rhythm</h2>
              </div>
              <span className="chip" style={{ borderColor: accent, color: accent }}>Shared profile</span>
            </div>
            {learners.length > 1 && (
              <label className="profile-form-field profile-form-field-wide">
                <span>Current learner</span>
                <select className="select" name="learnerId" value={appState.learners.selectedId} onChange={(event) => actions.selectLearner(event.target.value)}>
                  {learners.map((entry) => (
                    <option value={entry.id} key={entry.id}>{entry.name} · {entry.yearGroup}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="profile-form-grid">
              <label className="profile-form-field profile-form-field-wide">
                <span>Name</span>
                <input className="input" name="name" autoComplete="off" defaultValue={learner.name} />
              </label>
              <label className="profile-form-field">
                <span>Year group</span>
                <select className="select" name="yearGroup" defaultValue={learner.yearGroup}>
                  {['Y3', 'Y4', 'Y5', 'Y6'].map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <label className="profile-form-field">
                <span>Primary goal</span>
                <select className="select" name="goal" defaultValue={learner.goal || 'sats'}>
                  <option value="confidence">Confidence and habit</option>
                  <option value="sats">KS2 SATs prep</option>
                  <option value="catch-up">Catch-up and recovery</option>
                </select>
              </label>
              <label className="profile-form-field">
                <span>Daily minutes</span>
                <input className="input" type="number" min="5" max="60" name="dailyMinutes" autoComplete="off" defaultValue={learner.dailyMinutes || 15} />
              </label>
              <label className="profile-form-field profile-colour-field">
                <span>Accent colour</span>
                <input className="input" type="color" name="avatarColor" autoComplete="off" defaultValue={accent} />
              </label>
            </div>
            <div className="profile-form-footer">
              <div className="profile-form-danger-actions">
                <button className="btn warn lg" type="button" onClick={() => actions.dispatch('learner-reset-progress')}>Reset learner progress</button>
                <button className="btn bad lg" type="button" onClick={() => actions.dispatch('learner-delete')}>Delete learner</button>
              </div>
              <button className="btn primary lg" style={{ background: accent }} type="submit">Save learner profile</button>
            </div>
          </form>

          <aside className="profile-side-panels">
            <section className="profile-panel profile-data-panel">
              <div className="profile-panel-head">
                <div>
                  <div className="eyebrow">Data safety</div>
                  <h2 className="section-title">Portable snapshots</h2>
                </div>
              </div>
              <p className="subtitle">Exports use JSON recovery points. Imports keep existing learners unless a full-app snapshot replaces this browser dataset.</p>
              <PersistenceInline snapshot={appState.persistence} />
              <div className="actions profile-data-actions">
                <button className="btn secondary" type="button" onClick={() => actions.dispatch('platform-export-learner')}>Export current learner</button>
                <button className="btn secondary" type="button" onClick={() => actions.dispatch('platform-export-app')}>Export full app</button>
                <button className="btn ghost" type="button" onClick={() => actions.dispatch('platform-import')}>Import JSON</button>
              </div>
              <input id="platform-import-file" style={{ display: 'none' }} type="file" accept=".json,application/json" />
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
