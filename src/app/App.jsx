import React, { useLayoutEffect } from 'react';
import { HomeSurface } from '../surfaces/home/HomeSurface.jsx';
import { CodexSurface } from '../surfaces/home/CodexSurface.jsx';
import { TopNav } from '../surfaces/shell/TopNav.jsx';
import { PersistenceBanner } from '../surfaces/shell/PersistenceBanner.jsx';
import { ToastShelf } from '../surfaces/shell/ToastShelf.jsx';
import { MonsterCelebrationOverlay } from '../surfaces/shell/MonsterCelebrationOverlay.jsx';
import { ProfileSettingsSurface } from '../surfaces/profile/ProfileSettingsSurface.jsx';
import { ErrorBoundary } from '../platform/react/ErrorBoundary.jsx';
import { usePlatformStore } from '../platform/react/use-platform-store.js';
import {
  renderApp,
  renderSubjectScreen,
} from '../platform/ui/render.js';

function Html({ html }) {
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

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

export function App({ controller, runtime }) {
  const snapshot = usePlatformStore(controller);
  const appState = snapshot.appState;
  const screen = appState.route?.screen || 'dashboard';
  const context = runtime.contextFor(appState.route?.subjectId || 'spelling');
  const actions = runtime.buildSurfaceActions();

  useLayoutEffect(() => {
    runtime.afterRender?.(appState, context);
  }, [appState, context, runtime]);

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
          <Html html={renderSubjectScreen(context)} />
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

      {!['dashboard', 'codex', 'subject', 'profile-settings'].includes(screen) && (
        <Html html={renderApp(appState, context)} />
      )}
    </ErrorBoundary>
  );
}
