import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeSurface } from '../surfaces/home/HomeSurface.jsx';
import { CodexSurface } from '../surfaces/home/CodexSurface.jsx';
import { TopNav } from '../surfaces/shell/TopNav.jsx';
import { PersistenceBanner } from '../surfaces/shell/PersistenceBanner.jsx';
import { ToastShelf } from '../surfaces/shell/ToastShelf.jsx';
import { ProfileSettingsSurface } from '../surfaces/profile/ProfileSettingsSurface.jsx';
import { ParentHubSurface } from '../surfaces/hubs/ParentHubSurface.jsx';
import { AdminHubSurface } from '../surfaces/hubs/AdminHubSurface.jsx';
import { SubjectRoute } from '../surfaces/subject/SubjectRoute.jsx';
import { MonsterVisualConfigProvider } from '../platform/game/MonsterVisualConfigContext.jsx';
import { ErrorBoundary } from '../platform/react/ErrorBoundary.jsx';
import { usePlatformStore } from '../platform/react/use-platform-store.js';
import { CelebrationLayer } from '../platform/game/render/CelebrationLayer.jsx';
// Transient overlay effects register themselves at module load. Importing
// them here is the single mount point — `<CelebrationLayer>` looks each
// up via the registry, so the import is purely for side effects.
import '../platform/game/render/effects/caught.js';
import '../platform/game/render/effects/evolve.js';
import '../platform/game/render/effects/mega.js';

const REACT_ROUTES = new Set([
  'dashboard',
  'codex',
  'subject',
  'profile-settings',
  'parent-hub',
  'admin-hub',
]);

const SUBJECT_HOME_EXIT_MS = 220;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function SharedOverlays({ appState, actions, controller }) {
  return (
    <div className="home-overlays">
      <ToastShelf toasts={appState.toasts || []} onDismiss={(index) => actions.dispatch('toast-dismiss', { index })} />
      <CelebrationLayer store={controller?.store} controller={controller} />
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
  const routedSubjectId = appState.route?.subjectId || 'spelling';
  const context = runtime.contextFor(routedSubjectId);
  const monsterVisualConfig = runtime.monsterVisualConfig?.() || null;
  const baseActions = useMemo(() => runtime.buildSurfaceActions(), [runtime]);
  const [subjectExitPhase, setSubjectExitPhase] = useState('idle');
  const subjectExitTimer = useRef(null);

  const clearSubjectExitTimer = useCallback(() => {
    if (subjectExitTimer.current) {
      clearTimeout(subjectExitTimer.current);
      subjectExitTimer.current = null;
    }
  }, []);

  const navigateHome = useCallback(() => {
    if (screen === 'subject' && subjectExitPhase === 'idle' && !prefersReducedMotion()) {
      setSubjectExitPhase('leaving');
      clearSubjectExitTimer();
      subjectExitTimer.current = setTimeout(() => {
        subjectExitTimer.current = null;
        baseActions.navigateHome();
        setSubjectExitPhase('idle');
      }, SUBJECT_HOME_EXIT_MS);
      return;
    }

    clearSubjectExitTimer();
    setSubjectExitPhase('idle');
    baseActions.navigateHome();
  }, [baseActions, clearSubjectExitTimer, screen, subjectExitPhase]);

  const actions = useMemo(() => ({
    ...baseActions,
    navigateHome,
  }), [baseActions, navigateHome]);

  useEffect(() => clearSubjectExitTimer, [clearSubjectExitTimer]);

  useLayoutEffect(() => {
    if (screen !== 'subject' && subjectExitPhase !== 'idle') {
      clearSubjectExitTimer();
      setSubjectExitPhase('idle');
    }
  }, [clearSubjectExitTimer, screen, subjectExitPhase]);

  useLayoutEffect(() => {
    runtime.afterRender?.(appState);
  }, [appState, runtime]);

  const subjectShellClassName = [
    'app-shell',
    'subject-entry-shell',
    subjectExitPhase === 'leaving' ? 'subject-exit-shell' : '',
  ].filter(Boolean).join(' ');

  return (
    <MonsterVisualConfigProvider value={monsterVisualConfig}>
      <ErrorBoundary>
      {screen === 'dashboard' && (
        <>
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <HomeSurface
            model={runtime.buildHomeModel(appState, context)}
            actions={actions}
            shellClassName="app-shell home-entry-shell"
          />
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </>
      )}

      {screen === 'codex' && (
        <>
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <CodexSurface model={runtime.buildCodexModel(appState, context)} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </>
      )}

      {screen === 'subject' && (
        <div className={subjectShellClassName}>
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <SubjectRoute key={routedSubjectId} appState={appState} context={context} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
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
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
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
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
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
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </div>
      )}

      {!REACT_ROUTES.has(screen) && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <UnknownRouteSurface screen={screen} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </div>
      )}
      </ErrorBoundary>
    </MonsterVisualConfigProvider>
  );
}
