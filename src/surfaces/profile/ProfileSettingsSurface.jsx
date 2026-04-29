import { useMemo } from 'react';
import { TopNav } from '../shell/TopNav.jsx';
import { PersistenceBanner } from '../shell/PersistenceBanner.jsx';
import { randomHeroBackground } from '../home/data.js';
import {
  BUFFERED_GEMINI_VOICE_OPTIONS,
  normaliseBufferedGeminiVoice,
  normaliseTtsProvider,
} from '../../subjects/spelling/tts-providers.js';

const TTS_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'browser', label: 'Browser', title: 'Local browser voice, preferring Google UK English female where available' },
];

const SOCIAL_PROVIDERS = ['google', 'facebook', 'x', 'apple'];

const GOAL_LABELS = {
  confidence: 'Confidence and habit',
  sats: 'KS2 SATs prep',
  'catch-up': 'Catch-up and recovery',
};

const YEAR_GROUPS = ['Y3', 'Y4', 'Y5', 'Y6'];

function safeColour(value, fallback = '#3E6FA8') {
  const colour = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(colour) ? colour : fallback;
}

function goalLabel(value) {
  return GOAL_LABELS[value] || GOAL_LABELS.sats;
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

function providerLabel(provider) {
  return provider === 'x' ? 'X' : provider[0].toUpperCase() + provider.slice(1);
}

function profileWriteLockReason(appState, chrome) {
  if (chrome.session?.demo) {
    return 'Demo profile writes are read-only. Create an account to keep this learner permanently.';
  }
  if (appState.persistence?.mode === 'degraded') {
    return 'Sync is degraded, so profile writes are disabled until persistence recovers.';
  }
  return '';
}

function dataImportLockReason(appState, chrome, profileLockReason = '') {
  if (profileLockReason) return profileLockReason;
  if (chrome.session?.signedIn) {
    return 'JSON import is available only for local recovery. Server-synced accounts restore data from D1.';
  }
  if (appState.persistence?.mode === 'remote-sync') {
    return 'JSON import is available only for local recovery. Server-synced accounts restore data from D1.';
  }
  return '';
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
    <div className="chip-row profile-persistence-chips" role="status" aria-label="Persistence snapshot">
      <span className={`chip ${mode === 'degraded' ? 'warn' : mode === 'remote-sync' ? 'good' : ''}`}>
        {mode === 'remote-sync' ? 'Remote sync' : mode === 'degraded' ? 'Sync degraded' : 'Local-only'}
      </span>
      <span className="chip">{trust}</span>
      <span className="chip">Pending: {Number(snapshot?.pendingWriteCount) || 0}</span>
    </div>
  );
}

function ProfileShell({ chrome, actions, children, appState }) {
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
        platformRole={chrome.session?.platformRole}
        onOpenAdmin={actions.openAdminHub}
        currentScreen="profile-settings"
      />
      <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
      {children}
    </div>
  );
}

function EmptyProfile({ actions, writeLocked = false }) {
  const heroBg = useMemo(() => randomHeroBackground(), []);
  return (
    <main className="profile-page">
      <section className="profile-hero profile-hero-empty hero-paper" style={{ '--hero-bg': `url('${heroBg}')` }}>
        <div className="hero-art profile-hero-art" aria-hidden="true" />
        <div className="profile-hero-copy">
          <p className="eyebrow">Profile settings</p>
          <h1 className="profile-title">No writable learner is available</h1>
          <p className="profile-lede">Create or select a learner before changing study rhythm, profile colour, or portable data.</p>
          <div className="profile-hero-actions">
            <button className="btn primary xl" type="button" disabled={writeLocked} onClick={() => actions.dispatch('learner-create')}>Add learner</button>
            <button className="btn ghost xl" type="button" onClick={actions.navigateHome}>Back to dashboard</button>
          </div>
        </div>
      </section>
    </main>
  );
}

function DemoConversionPanel({ actions }) {
  const submit = (event) => {
    event.preventDefault();
    actions.dispatch('demo-convert-email', { formData: new FormData(event.currentTarget) });
  };

  return (
    <section className="profile-panel profile-demo-conversion-panel">
      <header className="profile-panel-head">
        <div>
          <p className="eyebrow">Demo progress</p>
          <h2 className="section-title">Create an account</h2>
        </div>
        <span className="chip good">Progress kept</span>
      </header>
      <p className="subtitle">Keep this demo learner, spelling progress and Codex rewards by creating a parent account.</p>
      <form className="auth-form profile-demo-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" name="password" autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn primary lg" type="submit">Create account from demo</button>
      </form>
      <div className="auth-divider"><span>Social sign-in</span></div>
      <div className="auth-social profile-demo-social">
        {SOCIAL_PROVIDERS.map((provider) => (
          <button
            key={provider}
            className="btn secondary"
            type="button"
            onClick={() => actions.dispatch('demo-social-convert', { provider })}
          >
            {providerLabel(provider)}
          </button>
        ))}
      </div>
    </section>
  );
}

function IdentityCard({ learner, accent, liveSubjectCount, subjectCount, ordinal, learnerCount }) {
  return (
    <aside className="profile-identity" aria-label="Current learner summary">
      <div className="profile-avatar" aria-hidden="true">{initials(learner.name)}</div>
      <div className="profile-identity-copy">
        <strong>{learner.name}</strong>
        <span>{learner.yearGroup} · {goalLabel(learner.goal)}</span>
      </div>
      <div className="profile-mini-stats" role="list" aria-label="Learner profile summary">
        <span role="listitem">
          <strong>{learner.dailyMinutes || 15}</strong>
          <small>daily minutes</small>
        </span>
        <span role="listitem">
          <strong>{ordinal}/{learnerCount}</strong>
          <small>learner</small>
        </span>
        <span role="listitem">
          <strong>{liveSubjectCount}/{subjectCount}</strong>
          <small>subjects live</small>
        </span>
      </div>
    </aside>
  );
}

function StudyRhythmPanel({ learner, learners, appState, accent, writeLocked, writeLockReason, actions }) {
  return (
    <section className="profile-panel profile-rhythm-panel">
      <header className="profile-panel-head">
        <div>
          <p className="eyebrow">Learner details</p>
          <h2 className="section-title">Study rhythm</h2>
        </div>
        <span className="chip profile-shared-chip" style={{ borderColor: accent, color: accent }}>Shared profile</span>
      </header>
      {writeLockReason && <div className="feedback warn" role="status">{writeLockReason}</div>}
      {learners.length > 1 && (
        <label className="profile-form-field profile-form-field-wide profile-learner-switcher">
          <span>Current learner</span>
          <select
            className="select"
            name="learnerId"
            value={appState.learners.selectedId}
            onChange={(event) => actions.selectLearner(event.target.value)}
          >
            {learners.map((entry) => (
              <option value={entry.id} key={entry.id}>{entry.name} · {entry.yearGroup}</option>
            ))}
          </select>
        </label>
      )}
      <div className="profile-form-grid">
        <label className="profile-form-field profile-form-field-wide">
          <span>Name</span>
          <input className="input" name="name" autoComplete="off" defaultValue={learner.name} disabled={writeLocked} />
        </label>
        <label className="profile-form-field">
          <span>Year group</span>
          <select className="select" name="yearGroup" defaultValue={learner.yearGroup} disabled={writeLocked}>
            {YEAR_GROUPS.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label className="profile-form-field">
          <span>Primary goal</span>
          <select className="select" name="goal" defaultValue={learner.goal || 'sats'} disabled={writeLocked}>
            <option value="confidence">Confidence and habit</option>
            <option value="sats">KS2 SATs prep</option>
            <option value="catch-up">Catch-up and recovery</option>
          </select>
        </label>
        <label className="profile-form-field">
          <span>Daily minutes</span>
          <input
            className="input"
            type="number"
            min="5"
            max="60"
            name="dailyMinutes"
            autoComplete="off"
            defaultValue={learner.dailyMinutes || 15}
            disabled={writeLocked}
          />
        </label>
        <label className="profile-form-field profile-colour-field">
          <span>Accent colour</span>
          <input
            className="input"
            type="color"
            name="avatarColor"
            autoComplete="off"
            defaultValue={accent}
            disabled={writeLocked}
          />
        </label>
      </div>
    </section>
  );
}

function DictationVoicePanel({ ttsProvider, bufferedGeminiVoice, writeLocked, testVoice }) {
  return (
    <section className="profile-panel profile-dictation-panel">
      <header className="profile-panel-head">
        <div>
          <p className="eyebrow">Sound</p>
          <h2 className="section-title">Dictation voice</h2>
        </div>
        <span className="chip">Per browser</span>
      </header>
      <p className="subtitle">Pick the voice that reads each word aloud. Test before you save — preferences stick to this browser.</p>
      <div className="profile-tts-control">
        <div className="profile-tts-options" role="radiogroup" aria-label="Dictation voice">
          {TTS_PROVIDER_OPTIONS.map((option) => (
            <label className="profile-tts-option" key={option.value} title={option.title || option.label}>
              <input
                type="radio"
                name="ttsProvider"
                value={option.value}
                defaultChecked={ttsProvider === option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <button
          className="btn secondary profile-tts-test-btn"
          type="button"
          data-action="tts-test"
          onClick={testVoice}
        >
          <span className="profile-tts-test-label">Test</span>
        </button>
      </div>
      <label className="profile-form-field profile-form-field-wide">
        <span>Pre-cached Gemini voice</span>
        <select className="select" name="bufferedGeminiVoice" defaultValue={bufferedGeminiVoice} disabled={writeLocked}>
          {BUFFERED_GEMINI_VOICE_OPTIONS.map((option) => (
            <option value={option.id} key={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function DangerZonePanel({ writeLocked, actions }) {
  return (
    <section className="profile-panel profile-danger-panel" aria-labelledby="profile-danger-title">
      <header className="profile-panel-head">
        <div>
          <p className="eyebrow">Permanent actions</p>
          <h2 id="profile-danger-title" className="section-title">Danger zone</h2>
        </div>
      </header>
      <p className="subtitle">A reset clears learner progress without removing the learner. Deletion is permanent and removes every subject history for this learner.</p>
      <div className="profile-form-danger-actions">
        <button
          className="btn warn lg"
          type="button"
          disabled={writeLocked}
          onClick={() => actions.dispatch('learner-reset-progress')}
        >
          Reset learner progress
        </button>
        <button
          className="btn bad lg"
          type="button"
          disabled={writeLocked}
          onClick={() => actions.dispatch('learner-delete')}
        >
          Delete learner
        </button>
      </div>
    </section>
  );
}

function PortableSnapshotsPanel({ appState, importLocked, importLockReason, actions }) {
  return (
    <section className="profile-panel profile-data-panel">
      <header className="profile-panel-head">
        <div>
          <p className="eyebrow">Data safety</p>
          <h2 className="section-title">Portable snapshots</h2>
        </div>
      </header>
      <p className="subtitle">Exports use JSON recovery points. Imports keep existing learners unless a full-app snapshot replaces this browser dataset.</p>
      <PersistenceInline snapshot={appState.persistence} />
      {importLocked && <div className="feedback warn" role="status">{importLockReason}</div>}
      <div className="actions profile-data-actions">
        <button className="btn secondary" type="button" onClick={() => actions.dispatch('platform-export-learner')}>Export current learner</button>
        <button className="btn secondary" type="button" onClick={() => actions.dispatch('platform-export-app')}>Export full app</button>
        <button className="btn ghost" type="button" disabled={importLocked} onClick={() => actions.dispatch('platform-import')}>Import JSON</button>
      </div>
      {/* SH2-U8: inline style prop migrated to `.platform-import-file-input`
          class (display: none). See docs/hardening/csp-inline-style-inventory.md. */}
      <input
        id="platform-import-file"
        className="platform-import-file-input"
        type="file"
        accept=".json,application/json"
        onChange={(event) => actions.dispatch('platform-import-file-selected', { input: event.currentTarget })}
      />
    </section>
  );
}

export function ProfileSettingsSurface({ appState, chrome, actions, subjectCount = 0, liveSubjectCount = 0 }) {
  const learner = selectedLearner(appState);
  const learners = learnerList(appState);
  const writeLockReason = profileWriteLockReason(appState, chrome);
  const writeLocked = Boolean(writeLockReason);
  const importLockReason = dataImportLockReason(appState, chrome, writeLockReason);
  const importLocked = Boolean(importLockReason);
  const heroBg = useMemo(() => randomHeroBackground(), [learner?.id]);

  if (!learner) {
    return (
      <ProfileShell chrome={chrome} actions={actions} appState={appState}>
        <EmptyProfile actions={actions} writeLocked={writeLocked} />
      </ProfileShell>
    );
  }

  const accent = safeColour(learner.avatarColor);
  const ttsProvider = normaliseTtsProvider(chrome.ttsProvider);
  const bufferedGeminiVoice = normaliseBufferedGeminiVoice(chrome.bufferedGeminiVoice);

  const submit = (event) => {
    event.preventDefault();
    actions.dispatch('learner-save-form', { formData: new FormData(event.currentTarget) });
  };

  const testVoice = (event) => {
    const form = event.currentTarget.form;
    const formData = form ? new FormData(form) : null;
    actions.dispatch('tts-test', {
      provider: normaliseTtsProvider(formData?.get('ttsProvider'), ttsProvider),
      bufferedGeminiVoice: normaliseBufferedGeminiVoice(formData?.get('bufferedGeminiVoice'), bufferedGeminiVoice),
    });
  };

  const heroStyle = {
    '--profile-accent': accent,
    '--hero-bg': `url('${heroBg}')`,
  };

  return (
    <ProfileShell chrome={chrome} actions={actions} appState={appState}>
      <main className="profile-page">
        <section className="profile-hero hero-paper" style={heroStyle}>
          <div className="hero-art profile-hero-art" aria-hidden="true" />
          <div className="profile-hero-copy">
            <p className="eyebrow">Profile settings</p>
            <h1 className="profile-title">
              Learning profile for <em>{learner.name}</em>
            </h1>
            <p className="profile-lede">Year group, goal and daily rhythm stay shared across every subject in the dashboard.</p>
            <div className="profile-hero-actions">
              <button
                className="btn primary xl"
                type="button"
                disabled={writeLocked}
                onClick={() => actions.dispatch('learner-create')}
                style={{ background: accent }}
              >
                Add learner
              </button>
              <button className="btn ghost xl" type="button" onClick={actions.navigateHome}>Back to dashboard</button>
            </div>
          </div>
          <IdentityCard
            learner={learner}
            accent={accent}
            liveSubjectCount={liveSubjectCount}
            subjectCount={subjectCount}
            ordinal={learnerOrdinal(appState)}
            learnerCount={learners.length}
          />
        </section>

        <div className="profile-layout">
          <form id="learner-profile-form" className="profile-form-column" onSubmit={submit}>
            <StudyRhythmPanel
              learner={learner}
              learners={learners}
              appState={appState}
              accent={accent}
              writeLocked={writeLocked}
              writeLockReason={writeLockReason}
              actions={actions}
            />
            <DictationVoicePanel
              ttsProvider={ttsProvider}
              bufferedGeminiVoice={bufferedGeminiVoice}
              writeLocked={writeLocked}
              testVoice={testVoice}
            />
            <DangerZonePanel writeLocked={writeLocked} actions={actions} />
            <footer className="profile-form-footer">
              <p className="profile-form-footer-note" aria-hidden={writeLocked ? 'false' : 'true'}>
                {writeLocked ? 'Writes are paused — unlock persistence to save.' : 'Changes apply across every subject once saved.'}
              </p>
              <button
                className="btn primary lg"
                style={{ background: accent }}
                type="submit"
                disabled={writeLocked}
              >
                Save learner profile
              </button>
            </footer>
          </form>

          <aside className="profile-side-panels">
            {chrome.session?.demo && <DemoConversionPanel actions={actions} />}
            <PortableSnapshotsPanel
              appState={appState}
              importLocked={importLocked}
              importLockReason={importLockReason}
              actions={actions}
            />
          </aside>
        </div>
      </main>
    </ProfileShell>
  );
}
