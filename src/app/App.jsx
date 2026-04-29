import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HomeSurface } from '../surfaces/home/HomeSurface.jsx';
import { CodexSurface } from '../surfaces/home/CodexSurface.jsx';
import { TopNav } from '../surfaces/shell/TopNav.jsx';
import { PersistenceBanner } from '../surfaces/shell/PersistenceBanner.jsx';
import { ToastShelf } from '../surfaces/shell/ToastShelf.jsx';
import { ProfileSettingsSurface } from '../surfaces/profile/ProfileSettingsSurface.jsx';
import { SubjectRoute } from '../surfaces/subject/SubjectRoute.jsx';
import { MonsterVisualConfigProvider } from '../platform/game/MonsterVisualConfigContext.jsx';
import { MonsterEffectConfigProvider } from '../platform/game/MonsterEffectConfigContext.jsx';
import { ErrorBoundary } from '../platform/react/ErrorBoundary.jsx';
import { LoadingSkeleton } from '../platform/ui/LoadingSkeleton.jsx';
import { captureClientError } from '../platform/ops/error-capture.js';
import { ActiveMessagesBar } from '../platform/ops/active-messages.js';
import { usePlatformStore } from '../platform/react/use-platform-store.js';
import { CelebrationLayer } from '../platform/game/render/CelebrationLayer.jsx';
import { runtimeRegistration } from '../platform/game/render/runtime-registration.js';
import { __registerCelebrationTemplates } from '../platform/game/render/effect-templates/index.js';

// SH2-U10: adult-only hub surfaces load lazily via `lazy()`. Esbuild
// emits these three entry graphs as separate `.js` chunks under
// `src/bundles/` (via `splitting: true` in `scripts/build-client.mjs`), so a
// learner-only practice flow never downloads admin/parent hub JS. The
// `MonsterVisualConfigPanel` is reached only through `AdminHubSurface`, so
// splitting the admin hub drags the config panel into the same lazy chunk
// — no second lazy entry-point needed, and the ParentHub/AdminHub chunks
// stay disjoint. The imports below stay as side-effect-free dynamic
// imports so the main bundle's static analysis sees no reference.
const AdminHubSurface = lazy(() =>
  import('../surfaces/hubs/AdminHubSurface.jsx').then((module) => ({
    default: module.AdminHubSurface,
  })),
);
const ParentHubSurface = lazy(() =>
  import('../surfaces/hubs/ParentHubSurface.jsx').then((module) => ({
    default: module.ParentHubSurface,
  })),
);
// JSX-bearing templates: the bundler (esbuild) compiles their JSX cleanly.
// We pre-register them via the synchronous test seam so the templates are
// already in the registry's lookup table when `runtimeRegistration()` walks
// the bundled catalog. Without this, the `caught`/`evolve`/`mega` celebration
// kinds would silently skip — the same surface that PR #119 used module-load
// side effects to guarantee.
import particlesBurstTemplate from '../platform/game/render/effect-templates/particles-burst.js';
import shineStreakTemplate from '../platform/game/render/effect-templates/shine-streak.js';

// One-shot bootstrap: register bundled defaults (and any published catalog
// once U5 wires it through) BEFORE <MonsterRender> / <CelebrationLayer>
// mount. Replaces the ad-hoc `effects/{caught,evolve,mega}.js` side-effect
// imports the file used to perform.
__registerCelebrationTemplates({
  particlesBurst: particlesBurstTemplate,
  shineStreak: shineStreakTemplate,
});
runtimeRegistration();

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

function SharedOverlays({ appState, actions, controller, activeSubjectId = '' }) {
  return (
    <div className="home-overlays">
      <ToastShelf toasts={appState.toasts || []} onDismiss={(index) => actions.dispatch('toast-dismiss', { index })} />
      <CelebrationLayer store={controller?.store} controller={controller} activeSubjectId={activeSubjectId} />
    </div>
  );
}

function SubjectTopNav({ chrome, actions, currentScreen }) {
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
      platformRole={chrome.session?.platformRole}
      onOpenAdmin={actions.openAdminHub}
      currentScreen={currentScreen}
    />
  );
}

// U6: React ErrorBoundary capture hook. The boundary fires this on every
// componentDidCatch; captureClientError is idempotent, bounded, and never
// throws. credentialFetch is intentionally omitted — error-capture.js reuses
// the fetch installed by `installGlobalErrorCapture` in src/main.js.
function handleBoundaryError(error, info) {
  captureClientError({
    source: 'react-error-boundary',
    error,
    info,
  });
}

function UnknownRouteSurface({ screen, actions }) {
  // SH2-U8: inline style props migrated to `.unknown-route-*` classes
  // (see docs/hardening/csp-inline-style-inventory.md).
  return (
    <main className="subject-main unknown-route-main">
      <section className="card" role="alert" aria-live="polite">
        <div className="eyebrow">Route unavailable</div>
        <h1 className="section-title">This screen is not available</h1>
        <p className="subtitle">
          The React shell could not match the route "{screen || 'unknown'}". Return to the dashboard to continue.
        </p>
        <div className="actions unknown-route-actions">
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
  const monsterEffectConfig = runtime.monsterEffectConfig?.() || null;
  const baseActions = useMemo(() => runtime.buildSurfaceActions(), [runtime]);

  // Refresh the effect registry whenever the published catalog changes so a
  // fresh admin publish lands in <MonsterRender>/<CelebrationLayer> without a
  // page reload. The module-load `runtimeRegistration()` above already
  // bootstrapped the bundled defaults; this effect re-runs it with the new
  // catalog (config wins on `kind` collision per U3).
  useEffect(() => {
    runtimeRegistration({ catalog: monsterEffectConfig?.catalog });
  }, [monsterEffectConfig?.catalog]);

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
      <MonsterEffectConfigProvider value={monsterEffectConfig}>
      <ErrorBoundary onError={handleBoundaryError}>
      {/* U12: active message banners render at app-shell top level, above all
          route surfaces. The bar polls GET /api/ops/active-messages every 5 min
          and fail-open (no banner on fetch error). */}
      <ActiveMessagesBar fetchActiveMessages={runtime.fetchActiveMessages} />
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

      {screen === 'subject' && (() => {
        // U6: pass heroLastLaunch to SubjectRoute only when the launch
        // targets the currently routed subject.  heroUi.lastLaunch is the
        // single source of truth — subject safeSession() strips heroContext.
        const heroLastLaunch = appState.heroUi?.lastLaunch || null;
        const matchingLastLaunch = heroLastLaunch?.subjectId === routedSubjectId
          ? heroLastLaunch
          : null;
        return (
          <div className={subjectShellClassName}>
            <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} currentScreen={screen} />
            <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
            <SubjectRoute key={routedSubjectId} appState={appState} context={context} actions={actions} heroLastLaunch={matchingLastLaunch} />
            <SharedOverlays appState={appState} actions={actions} controller={controller} activeSubjectId={routedSubjectId} />
          </div>
        );
      })()}

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

      {/* U7 hardening-residuals: each lazy-loaded adult hub surface gets its
          own inner ErrorBoundary wrapping the Suspense. If a chunk-load failure
          occurs (stale deploy, offline, cache eviction), the ErrorBoundary
          renders a "Reload" CTA instead of the generic app-level fallback.
          The outer ErrorBoundary (line 206) still catches non-chunk errors. */}
      {screen === 'parent-hub' && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} currentScreen={screen} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <ErrorBoundary onError={handleBoundaryError}>
            <Suspense fallback={<LoadingSkeleton rows={6} />}>
              <ParentHubSurface
                appState={appState}
                model={context.parentHub}
                hubState={context.parentHubState}
                accessContext={context}
                actions={actions}
              />
            </Suspense>
          </ErrorBoundary>
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </div>
      )}

      {screen === 'admin-hub' && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} currentScreen={screen} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <ErrorBoundary onError={handleBoundaryError}>
            <Suspense fallback={<LoadingSkeleton rows={6} />}>
              <AdminHubSurface
                appState={appState}
                model={context.adminHub}
                hubState={context.adminHubState}
                accountDirectory={context.adminAccountDirectory}
                accessContext={context}
                actions={actions}
              />
            </Suspense>
          </ErrorBoundary>
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </div>
      )}

      {!REACT_ROUTES.has(screen) && (
        <div className="app-shell">
          <SubjectTopNav chrome={runtime.buildSurfaceChromeModel(appState)} actions={actions} currentScreen={screen} />
          <PersistenceBanner snapshot={appState.persistence} onRetry={actions.retryPersistence} />
          <UnknownRouteSurface screen={screen} actions={actions} />
          <SharedOverlays appState={appState} actions={actions} controller={controller} />
        </div>
      )}
      </ErrorBoundary>
      </MonsterEffectConfigProvider>
    </MonsterVisualConfigProvider>
  );
}
