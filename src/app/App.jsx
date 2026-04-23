import React, { useLayoutEffect, useMemo } from 'react';
import { HomeSurface } from '../surfaces/home/HomeSurface.jsx';
import { CodexSurface } from '../surfaces/home/CodexSurface.jsx';
import { TopNav } from '../surfaces/shell/TopNav.jsx';
import { PersistenceBanner } from '../surfaces/shell/PersistenceBanner.jsx';
import { ToastShelf } from '../surfaces/shell/ToastShelf.jsx';
import { MonsterCelebrationOverlay } from '../surfaces/shell/MonsterCelebrationOverlay.jsx';
import { ProfileSettingsSurface } from '../surfaces/profile/ProfileSettingsSurface.jsx';
import { ParentHubSurface } from '../surfaces/hubs/ParentHubSurface.jsx';
import { AdminHubSurface } from '../surfaces/hubs/AdminHubSurface.jsx';
import { SubjectRoute } from '../surfaces/subject/SubjectRoute.jsx';
import { ErrorBoundary } from '../platform/react/ErrorBoundary.jsx';
import { usePlatformStore } from '../platform/react/use-platform-store.js';

const REACT_ROUTES = new Set([
  'dashboard',
  'codex',
  'subject',
  'profile-settings',
  'parent-hub',
  'admin-hub',
]);

function SharedOverlays({ appState, actions }) {
  return (
    <div className="home-overlays">
      <ToastShelf toasts={appState.toasts || []} onDismiss={(index) => actions.dispatch('toast-dismiss', { index })} />
      <MonsterCelebrationOverlay
        queue={appState.monsterCelebrations?.queue || []}
        onDismiss={() => actions.dispatch('monster-celebration-dismiss')}
      />
    </div>
  );
}

function SubjectTopNav({ chrome, actions }) {
  return (
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
  );
}

function UnknownRouteSurface({ screen, actions }) {
  return (
    <main className="subject-main" style={{ maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <section className="card" role="alert" aria-live="polite">
        <div className="eyebrow">Route unavailable</div>
        <h1 className="section-title">This screen is not available</h1>
        <p className="subtitle">
          The React shell could not match the route "{screen || 'unknown'}". Return to the dashboard to continue.
        </p>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn primary" type="button" onClick={actions.navigateHome}>Back to dashboard</button>
        </div>
      </section>
    </main>
  );
}

export function App({ controller, runtime }) {
  const snapshot = usePlatformStore(controller);
  const appState = snapshot.appState;
  const screen = appState.route?.screen || 'dashboard';
  const context = runtime.contextFor(appState.route?.subjectId || 'spelling');
  const actions = useMemo(() => runtime.buildSurfaceActions(), [runtime]);

  useLayoutEffect(() => {
    runtime.afterRender?.(appState);
  }, [appState, runtime]);

  return (
    <ErrorBoundary>
      {screen === 'dashboard' && (
        <>
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <HomeSurface model={runtime.buildHomeModel(appState, context)} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} />
        </>
      )}

      {screen === 'codex' && (
        <>
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <CodexSurface model={runtime.buildCodexModel(appState, context)} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} />
        </>
      )}

      {screen === 'subject' && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <SubjectRoute appState={appState} context={context} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} />
        </div>
      )}

      {screen === 'profile-settings' && (
        <>
          <ProfileSettingsSurface
            appState={appState}
            chrome={runtime.buildSurfaceChromeModel(appState)}
            actions={actions}
            subjectCount={context.subjects?.length || 0}
            liveSubjectCount={(context.subjects || []).filter((subject) => subject.available !== false).length}
          />
          <SharedOverlays appState={appState} actions={actions} />
        </>
      )}

      {screen === 'parent-hub' && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <ParentHubSurface
            appState={appState}
            model={context.parentHub}
            hubState={context.parentHubState}
            accessContext={context}
            actions={actions}
          />
          <SharedOverlays appState={appState} actions={actions} />
        </div>
      )}

      {screen === 'admin-hub' && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <AdminHubSurface
            appState={appState}
            model={context.adminHub}
            hubState={context.adminHubState}
            accountDirectory={context.adminAccountDirectory}
            accessContext={context}
            actions={actions}
          />
          <SharedOverlays appState={appState} actions={actions} />
        </div>
      )}

      {!REACT_ROUTES.has(screen) && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <UnknownRouteSurface screen={screen} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} />
        </div>
      )}
    </ErrorBoundary>
  );
}
