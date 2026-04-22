# React Port & Flicker Elimination Design

## Goal

Eliminate whole-screen flicker across the app, most acutely on per-question transitions inside spelling sessions, by porting the view layer from string-template innerHTML-swap to a single React tree with unidirectional dataflow and fine-grained reconciliation. Fold the 100+ implicit `data-action` dispatch contract into a typed `useActions()` facade so future feature work has a single discoverable surface.

## Current Root Cause

- `src/main.js:1249` performs `root.innerHTML = renderApp(...)` on every store tick. Every state change wipes and rebuilds the entire DOM.
- `applySubjectTransition` (main.js:961-1001) fans out 3-4 independent `setState`/`pushToasts`/`pushMonsterCelebrations` calls per submit. Each call notifies subscribers, producing 3-4 full wipe-rebuild cycles per question.
- CSS compounds the cost: `.spelling-in-session .prompt-card { backdrop-filter: blur(8px) saturate(1.05); }` (app.css:4035), `--hero-bg` image re-decode (app.css:3949), `@keyframes ribbon-in` + `pulse-ring` (app.css:4257, 4002). Each rebuild re-pays all three costs.

## Behaviour After Port

- Route change unmounts the outgoing screen component and mounts the incoming one. Cross-screen chrome (toast shelf, monster celebration overlay, persistence banner) stays permanently mounted; state change only reconciles.
- Per-question transition: React diffs `word`, `feedback`, `pathProgress`, `inputDisabled` props inside `SessionCard`. Outer `.spelling-in-session` wrapper and `.prompt-card` glass panel remain the same DOM node, so `backdrop-filter` does not recompose, `--hero-bg` does not re-decode, animations do not restart.
- Focus, caret, autofocus, modal focus trap, audio-playing class become React hooks (refs + effects). The hand-written DOM patch layer in main.js:1210-1876 retires.
- Action dispatch: components call typed methods on the result of `useActions()`. The method internally calls the existing `dispatchAction(actionString, data)`, so the store mutation path is untouched.

## Out of Scope

- `renderAuthScreen` (main.js:153-251). Signed-out only, low frequency, unrelated to flicker. Stays string-rendered.
- `spellingAutoAdvance` (subjects/spelling/auto-advance.js). Pure logic module, no view involvement.
- Subject service, repository, event runtime layers. All non-view code unchanged.
- Worker-side hub API (`platform/hubs/api.js`). Fetch layer unchanged.
- Third-party libraries (React Router, react-query, etc.). None introduced.

## Architecture

### Directory Tree

```
src/
├── main.js                                  ~400 LOC (from ~1900)
├── bundles/
│   ├── app.bundle.js                        NEW — single IIFE, whole React tree
│   └── home.bundle.js                       DELETE
├── surfaces/
│   ├── _shared/                             NEW
│   │   ├── useAppState.js
│   │   ├── useActions.js
│   │   ├── ActionsContext.jsx
│   │   ├── StoreContext.jsx
│   │   ├── buildActions.js
│   │   ├── useFocusRestore.js
│   │   ├── useModalFocusTrap.js
│   │   ├── useAudioPlayingClass.js
│   │   ├── useHeroDarkProbe.js
│   │   ├── PromptCard.jsx                   shared glass-panel primitive
│   │   └── icons.jsx
│   ├── _overlays/                           NEW
│   │   ├── ToastShelf.jsx
│   │   ├── MonsterCelebration.jsx
│   │   └── PersistenceBanner.jsx
│   ├── app/                                 NEW
│   │   ├── AppRoot.jsx
│   │   ├── App.jsx
│   │   ├── screens.js
│   │   └── index.jsx                        bundle entry
│   ├── home/                                KEEP + refactor
│   │   ├── HomeScreen.jsx                   renamed from HomeSurface.jsx
│   │   ├── CodexScreen.jsx                  renamed from CodexSurface.jsx
│   │   ├── TopNav.jsx
│   │   └── (existing card/creature/hero components stay)
│   ├── profile-settings/                    NEW
│   │   └── ProfileSettingsScreen.jsx
│   ├── parent-hub/                          NEW
│   │   ├── ParentHubScreen.jsx
│   │   ├── LearnerOverview.jsx
│   │   ├── RecentSessions.jsx
│   │   ├── MisconceptionPatterns.jsx
│   │   └── StrengthList.jsx
│   ├── admin-hub/                           NEW
│   │   ├── AdminHubScreen.jsx
│   │   ├── AdminAccountRoles.jsx
│   │   ├── ContentReleaseStatus.jsx
│   │   ├── AuditLogLookup.jsx
│   │   └── LearnerSupport.jsx
│   └── spelling/                            NEW
│       ├── SpellingScreen.jsx               phase dispatcher
│       ├── _shared/
│       │   ├── Ribbon.jsx
│       │   ├── FamilyChips.jsx
│       │   ├── PathProgress.jsx
│       │   ├── Cloze.jsx
│       │   ├── HeroShell.jsx
│       │   └── icons.jsx
│       ├── session/
│       │   ├── SessionCard.jsx              critical flicker-kill component
│       │   ├── FeedbackSlot.jsx
│       │   ├── SessionFooter.jsx
│       │   └── AnswerInput.jsx
│       ├── setup/
│       │   ├── SetupScene.jsx
│       │   ├── ModeChooser.jsx
│       │   ├── LengthChooser.jsx
│       │   ├── YearFilter.jsx
│       │   └── WordBankEntry.jsx
│       ├── summary/
│       │   ├── SummaryScene.jsx
│       │   ├── SummaryStatGrid.jsx
│       │   └── MistakesList.jsx
│       └── word-bank/
│           ├── WordBankScene.jsx
│           ├── WordBankFilters.jsx
│           ├── WordRow.jsx
│           └── WordDetailModal.jsx
└── platform/
    ├── core/store.js                        +batch(fn) method
    └── ui/render.js                         DELETE
```

### Data Flow

```
store → <AppRoot store={...} actions={...} tts={...} services={...}>
           │
           ├── <StoreContext.Provider value={{ store, tts, services, runtimeBoundary }}>
           └── <ActionsContext.Provider value={buildActions(dispatchAction)}>
                  │
                  └── <App>
                        ├── useAppState(s => s.route.screen)
                        │
                        └── switch(screen):
                              case 'dashboard':        <HomeScreen />
                              case 'subject':          <SpellingScreen />
                              case 'codex':            <CodexScreen />
                              case 'profile-settings': <ProfileSettingsScreen />
                              case 'parent-hub':       <ParentHubScreen />
                              case 'admin-hub':        <AdminHubScreen />
                        
                        plus persistent overlays:
                              <ToastShelf />
                              <MonsterCelebration />
                              <PersistenceBanner />
```

Each screen subscribes via `useAppState(selector)` with narrow selectors. React 18 `useSyncExternalStore` uses `Object.is` equality so components re-render only when their subscribed slice changes ref.

### main.js After Port

Retained:
- Auth bootstrap and session fetch.
- Repositories, services, event runtime, store, tts, autoAdvance, runtimeBoundary creation.
- `handleGlobalAction`, `handleSubjectAction`, `dispatchAction` — the full existing dispatch layer. Called from `buildActions(...)`.
- `scheduleToastAutoDismissals` — still driven by `store.subscribe`.
- Global keyboard shortcut listener (`resolveSpellingShortcut`).
- Thin click-delegation listener, kept only for `<form data-action="...">` submit + `<input type="file">` change handlers. Most actions flow through React `onClick`.

Removed:
- `render()` innerHTML swap.
- `mountReactSurfaces`, `window.__ks2HomeSurface` / `__ks2CodexSurface` / `__ks2SubjectTopNavSurface` globals.
- `capturePreservedFocus`, `restoreModalTrigger`, `focusInitialModalElement`, `modalIsOpen` — replaced by hooks.
- `syncAudioPlayingClass` — replaced by `useAudioPlayingClass`.
- `applyHeroDarkProbes` — replaced by `useHeroDarkProbe`.
- Modal Tab-trap root listener — replaced by `useModalFocusTrap` on `<WordDetailModal>`.

React mount replaces all of the above:
```js
import { AppRoot } from './surfaces/app/AppRoot.jsx';
const reactRoot = createRoot(document.getElementById('app'));
const actions = buildActions(dispatchAction);
reactRoot.render(<AppRoot store={store} actions={actions} tts={tts} services={services} runtimeBoundary={runtimeBoundary} />);
```

### Build Config

`scripts/build-bundles.mjs`:
- Entry changes from `src/surfaces/home/index.jsx` to `src/surfaces/app/index.jsx`.
- Output `src/bundles/app.bundle.js`. The `home.bundle.js` file is deleted.
- All other esbuild options (IIFE, es2020, automatic JSX, minify) unchanged.

## Component Contracts

### useAppState

```js
// src/surfaces/_shared/useAppState.js
export function useAppState(selector = identity) {
  const { store } = useContext(StoreContext);
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
```

Rule: selectors return primitives or existing refs from store state. Object literals inline cause re-render on every tick. Components needing derived values wrap with `useMemo`.

### useActions + buildActions

`src/surfaces/_shared/buildActions.js` exports a factory that returns a frozen object of ~50 typed methods over `dispatchAction`. Each method corresponds to one action string currently dispatched by data-action buttons or main.js code paths. Complete surface:

Navigation: `navigateHome`, `openSubject(subjectId, tab)`, `openCodex`, `openParentHub`, `openAdminHub`, `openProfileSettings`.
Learner: `selectLearner(value)`, `createLearner(payload)`, `saveLearnerForm(formData)`, `deleteLearner`, `resetLearnerProgress`.
Adult surfaces: `selectAdultLearner(value)`, `setShellRole(value)`, `refreshAdminAccounts`, `setAdminAccountRole(accountId, value)`.
Theme + persistence: `toggleTheme`, `retryPersistence`, `platformLogout`.
Platform data: `exportLearner`, `exportApp`, `importPlatform`, `exportSpellingContent`, `importSpellingContent`, `publishSpellingContent`, `resetSpellingContent`.
Toasts + celebrations: `dismissToast(id)`, `dismissMonsterCelebration`, `subjectRuntimeRetry`.
Spelling session: `spellingSubmit(typed)`, `spellingContinue`, `spellingReplay`, `spellingReplaySlow`, `spellingSkip`, `spellingEndEarly`, `spellingBack`.
Spelling setup: `spellingStart`, `setSpellingPref(pref, value)`.
Spelling word bank: `openWordBank`, `closeWordBank`, `setWordBankFilter(value)`, `setWordBankSearch(value)`, `openWordDetail(slug)`, `closeWordDetail`, `setWordDetailMode(mode)`, `submitWordBankDrill(typed)`, `replayWordBankDrill`, `replayWordBankDrillSlow`.

Rule: component files never import `dispatchAction` directly. Access is always `const actions = useActions()`. This lets tests override with `<ActionsContext.Provider value={mockActions}>`.

### SessionCard (Flicker-Kill Contract)

Subscribes:
- `session` (currentCard, progress, type, phase, practiceOnly)
- `feedback`
- `awaitingAdvance`
- `learnerId`

Computes:
- `heroBg = useMemo(() => heroBgForSession(learnerId, session), [learnerId, session?.progress?.done, session?.progress?.total])`

Renders through `<HeroShell className="spelling-in-session" style={{ '--hero-bg': heroBg }}>`. Outer div is the same DOM node across renders, so `backdrop-filter` does not recompose.

`<FeedbackSlot feedback={feedback}>` uses `key={feedback?.id || feedback?.kind || 'none'}`. Null-to-value transitions mount a fresh ribbon, playing `ribbon-in` once. Value-to-null transitions switch class to `is-placeholder` without unmount, so the animation does not restart.

Path dots are keyed by index. `.path-step.current` remains the same DOM node across questions when the current index does not change; when it does, only the `.done` class toggles on one dot and `.current` transitions onto the next. `@keyframes pulse-ring` continues animating without restart on the node that stays current.

### Overlays

Permanently mounted in `<App>`. Each subscribes its own slice:
- `<ToastShelf>` → `useAppState(s => s.toasts)`
- `<MonsterCelebration>` → `useAppState(s => s.monsterCelebrations.queue[0])`
- `<PersistenceBanner>` → `useAppState(s => s.persistence)` and renders null unless `mode === 'degraded'`

Route changes do not unmount them. Toast entry no longer flashes the header.

### useFocusRestore

Mounted once in `<App>`. Captures `document.activeElement` selector and selection range in a `useLayoutEffect` before state commit, restores in a trailing `useEffect`. Controlled inputs (React owns value) rarely need it, but it covers the edge case where a parent remount destroys an input during cross-screen transition.

### useModalFocusTrap

Used only by `<WordDetailModal>`. Traps Tab/Shift+Tab within the modal, autofocuses `[data-autofocus="true"]` or first focusable on open, restores trigger focus via caller-supplied `lastTriggerRef` on close. Escape and scrim-click handled with React onClick on the scrim.

### useAudioPlayingClass

Instantiated once at `<App>`. Subscribes to `tts` events and exposes current kind (`'normal' | 'slow' | null`) via a React state value. Components render `<button className={playingKind === 'normal' ? 'btn icon playing' : 'btn icon'}>`. Replaces main.js `syncAudioPlayingClass`.

### Context Value Shape

`<StoreContext.Provider value={{ store, tts, services, runtimeBoundary }}>`. Single context avoids provider tower. Consumers pull only what they need.

### store.batch(fn)

```js
// platform/core/store.js addition
let batchDepth = 0;
let batchedNotify = false;

function notify() {
  if (batchDepth > 0) { batchedNotify = true; return; }
  for (const listener of listeners) { try { listener(state); } catch {} }
}

function batch(fn) {
  batchDepth += 1;
  try { return fn(); }
  finally {
    batchDepth -= 1;
    if (batchDepth === 0 && batchedNotify) {
      batchedNotify = false;
      notify();
    }
  }
}
```

`applySubjectTransition` in main.js wraps its 3-4 store calls in `store.batch(() => { ... })`. One notify per submit.

## Testing Strategy

### Harness Changes

`tests/helpers/app-harness.js` gains a React mount path:

```js
return {
  store, repositories, services, tts, eventRuntime, runtimeBoundary, subjects,
  contextFor, dispatch, keydown, autoAdvance, scheduler,
  render,                                    // deprecated, kept during migration
  state() { return store.getState(); },
  select(selector) { return selector(store.getState()); },
  mount() { /* creates jsdom, mounts <AppRoot> */ },
  mounted,                                   // { container, unmount, rerender }
  flushReact() { /* await microtask + setImmediate */ },
  html() { return mounted?.container?.innerHTML || render(); },
};
```

`jsdom` added to `devDependencies`.

### Assertion Migration

Preferred pattern (state assertion):
```js
harness.dispatch('spelling-start');
const sp = harness.select(s => s.subjectUi.spelling);
assert.equal(sp.phase, 'session');
assert.ok(sp.session.currentCard.word.word);
```

Acceptable pattern (DOM assertion when testing view contract):
```js
harness.mount();
harness.dispatch('spelling-start');
await harness.flushReact();
assert.ok(harness.mounted.container.querySelector('[data-testid="session-prompt-instr"]'));
```

Rule: test state mutation and identifiable UI affordance presence. Avoid raw HTML substring when state assertion covers the intent.

### data-testid Policy

Minimal and targeted. Introduced only where state assertion cannot express intent cleanly:
- `data-testid="session-word-input"` on the answer input
- `data-testid="feedback-ribbon"` on the live ribbon
- `data-testid="monster-celebration-title"` on the celebration headline

Production code stays free of test hooks where state assertion works.

### Primitive Contract Tests

New test files:
- `tests/shared/useAppState.test.js` — selector equality, re-render count via React Profiler.
- `tests/shared/useActions.test.js` — every method exists.
- `tests/shared/buildActions.test.js` — every method dispatches the right action string with right payload. Snapshot-stable source of truth for the facade.

### Regression-Prevention Tests

- `tests/flicker/session-card-render-count.test.js` — mount `SessionCard` with mock store, submit answer, count React commits via Profiler, assert ≤ 2 commits per question advance.
- `tests/flicker/store-batch.test.js` — verify `store.batch(fn)` coalesces N setState to 1 notify.

### Dependency Addition

`jsdom` (~6 MB install). React 18.3 + node `--test` + `react-dom/client` run cleanly in jsdom per React team's official support matrix. `flushReact()` uses `queueMicrotask` + `setImmediate` for commit flush.

## Execution Plan

### Phase 0 — Shell Architect (sequential, ~25 min)

Owned by lead agent (me). Ships every primitive needed before parallel agents start.

Scope:
- `src/main.js` rewrite to React mount
- `src/platform/core/store.js` +batch(fn)
- `src/surfaces/_shared/**` (all primitives, all hooks)
- `src/surfaces/app/**` (AppRoot, App router, screen map)
- `src/surfaces/_overlays/**` (ToastShelf, MonsterCelebration, PersistenceBanner)
- `scripts/build-bundles.mjs` entry update
- `tests/helpers/app-harness.js` mount/flushReact additions
- `package.json` add `jsdom` devDep
- Stub files for Agent 1-owned shared helpers (Ribbon, Cloze, PathProgress, etc.) exporting placeholder components so Phase 1 imports compile

Barrier: Phase 0 ships primitives before any Phase 1 agent starts.

### Phase 1 — Parallel Surface Ports (~50-70 min wall clock)

Four agents run concurrently.

**Agent 1 — Spelling practice**
- Owns: `surfaces/spelling/session/**`, `surfaces/spelling/setup/**`, `surfaces/spelling/summary/**`, `surfaces/spelling/_shared/**`, `surfaces/spelling/SpellingScreen.jsx`
- Replaces Phase 0 stub shared helpers with real implementations
- Reads only: `subjects/spelling/module.js` (view port reference), `subjects/spelling/session-ui.js`
- Must NOT touch: `subjects/spelling/service.js`, `subjects/spelling/module.js` source (its view portion is removed in Phase 2)

**Agent 2 — Word bank + modal**
- Owns: `surfaces/spelling/word-bank/**`
- Imports shared primitives from Agent 1's directory (stubs until Agent 1 returns)
- Uses `useModalFocusTrap` from `_shared`

**Agent 3 — Dashboard + profile settings**
- Owns: `surfaces/home/HomeScreen.jsx` refactor, `surfaces/home/CodexScreen.jsx` rename, `surfaces/profile-settings/**`
- Reads only: `platform/ui/render.js` for `renderDashboard` / `renderProfileSettings` / `renderHero` logic

**Agent 4 — Parent hub + admin hub**
- Owns: `surfaces/parent-hub/**`, `surfaces/admin-hub/**`
- Reads only: `platform/ui/render.js` for hub logic

Barrier: all 4 agents return successful builds.

### Phase 2 — Integration (~40 min)

Lead agent:
- Reduce `subjects/spelling/module.js` to `handleAction`, service glue, and content helpers only. Remove every `render*` function and the helper functions they depend on (`summaryCards`, `renderPathProgress`, `renderCloze`, `renderFeedbackSlot`, `renderSession`, `renderSummary`, `renderWordBank`, etc.). Expected size after reduction: ~300 LOC from 1486.
- Remove `platform/ui/render.js`. Grep all imports first; if zero consumers remain, delete the file. If any import lingers from non-ported code, stub the exported names with no-op functions and a one-line deprecation comment pointing at `surfaces/app/App.jsx` as the replacement.
- Final main.js cleanup — remove legacy click delegation for actions now flowing through React onClick. Keep `<form>` submit and file-input change fallbacks.
- Verify esbuild builds clean. Dedupe any helper unintentionally ported by two agents.

### Phase 3 — Test Migration (~50 min)

Split into 2 parallel sub-agents or serial, lead's call:
- 6a: `tests/smoke.test.js` (~40 assertions)
- 6b: `tests/spelling-parity.test.js` (~150 assertions)

Plus: write new `tests/shared/*.test.js` primitive contracts and `tests/flicker/*.test.js` regression guards.

### Phase 4 — Verification (~25 min)

- `npm test` green
- `npm run check` green (build + build-public + wrangler dry-run)
- Browse 10 questions in a spelling session, confirm zero visible flicker between transitions
- Browse all 6 routes, confirm no console errors
- Modal keyboard flow works (Tab trap + Esc + scrim click)
- Audio playing class syncs on main session and word-bank drill
- Toast auto-dismiss fires at 10s
- Monster celebration queue/release semantics preserved
- Theme toggle persists across reload

Total wall-clock estimate: 3-3.5 hours.

## Shared Helper Ownership

| Helper                 | Phase 0 (stub) | Real impl owner | Consumers                              |
|------------------------|:--------------:|-----------------|----------------------------------------|
| `Ribbon.jsx`           | yes            | Agent 1         | Agent 1 (session + summary), Agent 2   |
| `FamilyChips.jsx`      | yes            | Agent 1         | Agent 1 (session feedback), Agent 2    |
| `PathProgress.jsx`     | yes            | Agent 1         | Agent 1 (session + summary)            |
| `Cloze.jsx`            | yes            | Agent 1         | Agent 1 (session)                      |
| `HeroShell.jsx`        | yes            | Agent 1         | Agent 1 (all three phases), Agent 2    |
| `PromptCard.jsx`       | —              | Phase 0         | Agent 1, Agent 4                       |
| Spelling `icons.jsx`   | yes            | Agent 1         | Agent 1, Agent 2                       |
| `useAppState`          | —              | Phase 0         | All agents                             |
| `useActions`           | —              | Phase 0         | All agents                             |
| `useFocusRestore`      | —              | Phase 0         | Mounted in `<App>` only                |
| `useModalFocusTrap`    | —              | Phase 0         | Agent 2 only                           |
| `useAudioPlayingClass` | —              | Phase 0         | Agent 1, Agent 2                       |

Phase 0 stub files (rows with `yes`) export placeholder components returning `null` so Agent 2 can import without blocking on Agent 1. Integration phase 2 confirms Agent 1 has replaced stubs with real implementations.

## Risks & Mitigations

**R1: Agent 1 and Agent 4 both need the `.prompt-card` glass panel treatment and could ship divergent local copies.**
Phase 0 pre-emptively ships `PromptCard.jsx` in `_shared/` as the single glass-panel primitive. Both agents import, no duplication possible.

**R2: useSyncExternalStore selector churn causes unexpected re-renders.**
Phase 0 ships `useAppState.test.js` with React Profiler re-render counter. Agent 1's `SessionCard` pushes through this test before Phase 2 integration.

**R3: Focus restore regressions — word-bank search caret lost between keystrokes.**
Controlled components (React owns input value via state) prevent unmount across store ticks. `useFocusRestore` becomes fallback, not primary. `tests/smoke.test.js` adds explicit "word bank search caret" assertion.

**R4: jsdom + React 18.3 + node --test timer scheduling edge cases.**
`flushReact()` uses documented pattern. Fallback: `import { act } from 'react-dom/test-utils'` wrapping dispatches.

**R5: Audio playing class desync across cross-surface remounts.**
`useAudioPlayingClass` is a singleton hook at `<App>` level broadcasting to children. Remounts re-subscribe on mount, preserving state.

**R6: Legacy `root.addEventListener('click', ...)` delegation fights React synthetic events.**
React 17+ uses root delegation too. Our React `e.preventDefault()` stops propagation to the legacy listener. Phase 2 removes most legacy handlers; only form submit and file input change remain.

**R7: Build bundle size roughly doubles.**
Current home bundle ~100KB minified. Full-app bundle expected ~150-180KB gzipped. Acceptable for a KS2 learning app loaded once per session. Code-split by route deferred as YAGNI.

**R8: React version drift.**
React 18.3.1 confirmed in package.json. No 19 indicator in git log.

## Ship-Ready Criteria

- [ ] `npm test` green
- [ ] `npm run check` green
- [ ] Browse 10 consecutive spelling questions, zero visible flicker, screenshot comparison against `tmp-shot-spelling-375.png` baseline
- [ ] Browse all 6 routes (dashboard, subject, codex, profile-settings, parent-hub, admin-hub), no console errors
- [ ] Modal keyboard flow (Tab trap + Esc + scrim click) works end-to-end
- [ ] Audio playing class syncs on session and word-bank drill
- [ ] Toast auto-dismiss fires at 10s
- [ ] Monster celebration queue/release semantics preserved
- [ ] Theme toggle persists across reload
