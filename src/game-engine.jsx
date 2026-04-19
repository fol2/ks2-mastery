// GameEngine — overlay game system's single entry point.
//
// Invariant (R15 / R17): this module is operationally READ-ONLY with
// respect to study state. It subscribes to study-engine events
// (`monster:progress`, `answer:graded`) and reads `KS2App.state.monsters`,
// but never calls `KS2App.setSpellingData`, never writes to
// `ks2-spell-progress-<pid>` or `ks2-monsters-<pid>` localStorage keys,
// and never calls `/api/spelling/*` endpoints.
//
// The overlay's own state lives exclusively in `ks2-overlay-<profileId>`
// (device-local localStorage, v1). Future v2 may mirror some of this to
// D1 via a new `/api/overlay/*` endpoint; that change would keep the
// read-only-on-study-state invariant intact.
//
// Dependency injection: the factory `createGameEngine(deps)` takes its
// dependencies (window, localStorage, KS2App) as arguments so a future
// jsdom vitest project (Unit 8) can construct isolated instances with
// spies on the study surfaces to prove the invariant under scripted
// event sequences. In the browser, the IIFE below installs a singleton
// on `window.GameEngine` using real dependencies.

(function () {
  const BASE_KEY = 'ks2-overlay';
  const OVERLAY_STATE_VERSION = 1;

  function defaultOverlayState() {
    return {
      version: OVERLAY_STATE_VERSION,
      seenSpirits: [],
      dismissedIntros: {},
      lastVisitedSubject: null,
      lastSessionEndedAt: null,
    };
  }

  function keyFor(profileId) {
    return `${BASE_KEY}-${profileId || 'default'}`;
  }

  function createGameEngine(deps) {
    const win = deps.window;
    const storage = deps.localStorage;
    const ks2 = deps.ks2App;
    const log = (deps.log && typeof deps.log === 'function') ? deps.log : () => {};

    let streak = 0;
    let lastSpiritSlug = null;
    let submitInFlight = false;
    let currentProfileId = resolveProfileId(ks2);
    let overlayState = loadOverlayState(currentProfileId);
    const subscribers = new Set();

    function resolveProfileId(ks2App) {
      try {
        const s = ks2App && typeof ks2App.getState === 'function' ? ks2App.getState() : null;
        return (s && s.selectedChild) || 'default';
      } catch { return 'default'; }
    }

    function loadOverlayState(pid) {
      try {
        const raw = storage && storage.getItem ? storage.getItem(keyFor(pid)) : null;
        if (!raw) return defaultOverlayState();
        const parsed = JSON.parse(raw);
        // Merge against the default to pick up any schema additions
        // made after the stored blob was written.
        return { ...defaultOverlayState(), ...parsed };
      } catch (err) {
        log('GameEngine: failed to load overlay state', err);
        return defaultOverlayState();
      }
    }

    function persistOverlayState(pid, state) {
      try {
        if (!storage || !storage.setItem) return;
        storage.setItem(keyFor(pid), JSON.stringify(state));
      } catch (err) {
        // Most commonly localStorage quota exceeded. Overlay state is
        // non-authoritative, so we log and continue rather than propagate.
        log('GameEngine: failed to persist overlay state', err);
      }
    }

    function notify() {
      const snapshot = {
        streak,
        lastSpiritSlug,
        submitInFlight,
        overlayState: { ...overlayState },
        profileId: currentProfileId,
      };
      for (const fn of [...subscribers]) {
        try { fn(snapshot); }
        catch (err) { log('GameEngine: subscriber threw', err); }
      }
    }

    function onAnswerGraded(evt) {
      const detail = evt && evt.detail;
      if (!detail || typeof detail.correct !== 'boolean') return;
      const prev = { streak, lastSpiritSlug };
      streak = detail.correct ? (streak + 1) : 0;
      if (detail.done && detail.slug) lastSpiritSlug = detail.slug;
      if (streak !== prev.streak || lastSpiritSlug !== prev.lastSpiritSlug) notify();
    }

    function onMonsterProgress() {
      // State that the overlay derives from `KS2App.state.monsters` may have
      // changed; let subscribers re-render. We do not cache monsters here —
      // consumers re-read via `KS2App.getState()` on each render.
      notify();
    }

    // KS2App subscription — watch selectedChild changes for profile switch.
    let ks2Unsubscribe = null;
    if (ks2 && typeof ks2.subscribe === 'function') {
      ks2Unsubscribe = ks2.subscribe((nextState) => {
        const nextPid = (nextState && nextState.selectedChild) || 'default';
        if (nextPid !== currentProfileId) {
          currentProfileId = nextPid;
          streak = 0;
          lastSpiritSlug = null;
          submitInFlight = false;
          overlayState = loadOverlayState(nextPid);
          notify();
        }
      });
    }

    // DOM event subscriptions — engines and the combat skin emit these.
    if (win && win.addEventListener) {
      win.addEventListener('answer:graded', onAnswerGraded);
      win.addEventListener('monster:progress', onMonsterProgress);
    }

    return {
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },

      getOverlayState() {
        return { ...overlayState };
      },

      saveOverlayState(patch) {
        if (!patch || typeof patch !== 'object') return;
        overlayState = { ...overlayState, ...patch };
        persistOverlayState(currentProfileId, overlayState);
        notify();
      },

      resetOverlayState(profileId) {
        const target = profileId || currentProfileId;
        try {
          if (storage && storage.removeItem) storage.removeItem(keyFor(target));
        } catch (err) {
          log('GameEngine: failed to reset overlay state', err);
        }
        if (target === currentProfileId) {
          overlayState = defaultOverlayState();
          notify();
        }
      },

      getStreak() { return streak; },
      getLastSpiritSlug() { return lastSpiritSlug; },

      // Network-freeze signal (Decision 15): set by `spelling-api.jsx` so
      // the combat skin can render a brief "checking…" state without the
      // overlay needing to mutate `KS2App.state.spelling`.
      getSubmitInFlight() { return submitInFlight; },
      setSubmitInFlight(next) {
        const prev = submitInFlight;
        submitInFlight = Boolean(next);
        if (submitInFlight !== prev) notify();
      },

      // Test hook — lets a future jsdom-based unit test (Unit 8) tear
      // down event listeners + KS2App subscription cleanly between cases.
      destroy() {
        if (win && win.removeEventListener) {
          win.removeEventListener('answer:graded', onAnswerGraded);
          win.removeEventListener('monster:progress', onMonsterProgress);
        }
        if (ks2Unsubscribe) ks2Unsubscribe();
        subscribers.clear();
      },
    };
  }

  // Expose the factory on globalThis so future unit tests can construct
  // isolated instances with mocked dependencies. Works in both browser
  // (globalThis === window) and Node/Workers runtimes.
  if (typeof globalThis !== 'undefined') {
    globalThis.__ks2CreateGameEngine = createGameEngine;
  }

  // Auto-install the production singleton only when running in a browser
  // with `KS2App` already initialised. `client-store.jsx` is loaded
  // before this module in the bundle (slot 5), so `window.KS2App` is
  // defined by the time we run.
  if (typeof window !== 'undefined' && window.KS2App) {
    window.GameEngine = createGameEngine({
      window,
      localStorage: window.localStorage,
      ks2App: window.KS2App,
      log: (msg, err) => {
        try { console.warn(msg, err); }
        catch { /* console unavailable — swallow */ }
      },
    });
  }
})();
