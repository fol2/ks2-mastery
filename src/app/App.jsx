import React, { useLayoutEffect } from 'react';
import { HomeSurface } from '../surfaces/home/HomeSurface.jsx';
import { CodexSurface } from '../surfaces/home/CodexSurface.jsx';
import { TopNav } from '../surfaces/home/TopNav.jsx';
import { ErrorBoundary } from '../platform/react/ErrorBoundary.jsx';
import { usePlatformStore } from '../platform/react/use-platform-store.js';
import {
  renderApp,
  renderMonsterCelebrationOverlay,
  renderPersistenceBanner,
  renderSubjectScreen,
  renderToasts,
} from '../platform/ui/render.js';

function Html({ html }) {
  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function OverlayHtml({ appState }) {
  const html = `
    ${renderToasts(appState)}
    ${renderMonsterCelebrationOverlay(appState)}
  `;
  return <div className="home-overlays" dangerouslySetInnerHTML={{ __html: html }} />;
}

function SubjectTopNav({ chrome, actions }) {
  return (
    <TopNav
      theme={chrome.theme}
      onToggleTheme={actions.toggleTheme}
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
          <Html html={renderPersistenceBanner(appState.persistence)} />
          <HomeSurface model={runtime.buildHomeModel(appState, context)} actions={actions} />
          <OverlayHtml appState={appState} />
        </>
      )}

      {screen === 'codex' && (
        <>
          <Html html={renderPersistenceBanner(appState.persistence)} />
          <CodexSurface model={runtime.buildCodexModel(appState, context)} actions={actions} />
          <OverlayHtml appState={appState} />
        </>
      )}

      {screen === 'subject' && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} />
          <Html html={renderPersistenceBanner(appState.persistence)} />
          <Html html={renderSubjectScreen(context)} />
          <Html html={renderToasts(appState)} />
          <Html html={renderMonsterCelebrationOverlay(appState)} />
        </div>
      )}

      {!['dashboard', 'codex', 'subject'].includes(screen) && (
        <Html html={renderApp(appState, context)} />
      )}
    </ErrorBoundary>
  );
}
