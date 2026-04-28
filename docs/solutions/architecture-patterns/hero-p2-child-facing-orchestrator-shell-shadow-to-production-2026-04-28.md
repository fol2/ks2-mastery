---
title: "Hero P2 child-facing orchestrator shell — six patterns for evolving shadow-to-production with zero-write and economy-free constraints"
date: 2026-04-28
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - "A shadow-only subsystem needs to become child-visible without introducing persistent state"
  - "An orchestrator shell must render child UI from a read-model designed for internal shadow use"
  - "Active session detection requires data in a different D1 column than the existing query reads"
  - "Multiple subject normalisers strip injected context before the client receives it"
  - "Server error responses may leak correct values enabling single-roundtrip bypass of freshness protection"
  - "Debug/scheduler internals must be excluded from child-visible API responses"
  - "Test fixtures use simplified shapes that differ from production provider output"
tags:
  - hero-mode
  - shadow-to-production
  - child-visible-orchestrator
  - zero-write-boundary
  - economy-free
  - store-patch-semantics
  - safe-session-whitelist
  - ui-json-expansion
  - fingerprint-leak
  - production-faithful-fixtures
  - three-layer-architecture
---

# Hero P2 child-facing orchestrator shell — six patterns for evolving shadow-to-production

## Context

Hero Mode is a cross-subject daily mission system in a KS2 educational app, designed to evolve through layered phases: P0 (shadow scheduler, read-only, invisible to children), P1 (launch bridge, delegating to existing subject command pipelines), and P2 (child-facing quest shell — the first time the orchestrator's output is visible in a real browser).

P0 and P1 operated entirely within internal/shadow contexts. Assumptions that were invisible in those phases surfaced immediately when P2 exposed the system to a child browser:

- A query reading only `data_json` is sufficient for providers computing task envelopes, but insufficient when session state lives in `ui_json`.
- Subject read-model normalisers silently strip unknown keys — a safety feature in shadow mode, but a data availability gap when the client needs those keys.
- A store updater that triggers re-render is indistinguishable from a correct one during shadow testing — only when React reads `appState.heroUi` does the empty updater reveal itself.
- Error responses carrying server-side values are invisible leaks when no child browser inspects them. They become a security bypass the moment a client reads the 409 body.
- Debug blocks with scheduler internals pass unnoticed in shadow mode. They are an exposure when a child's DevTools can read the GET response.
- Fixture objects that don't match production shapes produce correct-looking test output but render as `[object Object]` in real JSX.

**The pattern:** any platform subsystem transitioning from internal-only to child-visible will encounter assumptions that are structurally invisible in the internal phase. P2 addresses this with six discovery-driven patterns.

(see origin: `docs/plans/james/hero-mode/hero-mode-p2.md`, completion report: `docs/plans/james/hero-mode/hero-mode-p2-completion-report.md`)

## Guidance

### Pattern 1. Expand existing queries minimally for new read paths — do not add new queries

`readHeroSubjectReadModels` originally read only `data_json` (subject stats/analytics). But `heroContext` — injected by P1 onto session state — is persisted in `ui_json`. Active session detection requires reading `ui_json`.

The fix: one extra column in the existing query, not a new D1 round-trip:

```js
// worker/src/repository.js — before: SELECT subject_id, data_json
const rows = await all(db, `
  SELECT subject_id, data_json, ui_json
  FROM child_subject_state WHERE learner_id = ?
`, [learnerId]);
// Return { [subjectId]: { data, ui } }
```

Providers consume `entry.data` unchanged. A backward-compatibility shim (`'data' in entry ? entry.data : entry`) keeps P0/P1 unit tests passing with raw data objects.

### Pattern 2. Route around whitelist normalisers — do not modify them

All three subjects' `safeSession()` normalisers use fixed whitelists (Spelling: 12 fields, Grammar: named set, Punctuation: named set). `heroContext` is absent from all three. `appState.subjectUi[subject.id]?.session?.heroContext` is always `null` after normalisation.

Rather than modifying three subject normalisers (touching files outside Hero scope, widening each whitelist's attack surface), use data already available in the Hero command response:

```js
// src/main.js — set during applyHeroLaunchResponse
patchHeroUi({
  lastLaunch: {
    questId: heroLaunch.questId,
    taskId: heroLaunch.taskId,
    subjectId: heroLaunch.subjectId,
    intent: heroLaunch.intent,
    launcher: heroLaunch.launcher,
    launchedAt: new Date().toISOString(),
  },
});
// HeroTaskBanner reads heroUi.lastLaunch, cleared on navigate-home
```

### Pattern 3. Store updaters must inject state — empty updaters are silent no-ops

```js
// BROKEN — triggers re-render but heroUi never enters the store
store?.patch(() => ({}));  // appState.heroUi is undefined

// CORRECT — heroUi is injected into the store state
store?.patch((s) => ({ ...s, heroUi }));  // appState.heroUi now readable
```

This bug is invisible in tests that check the module-scoped `heroUi` directly. It only manifests when a React component reads `appState.heroUi` — which is `undefined`. The entire P2 UI is silently dead.

### Pattern 4. Never return server-side values in conflict error responses

```js
// BROKEN — client learns correct fingerprint in one round-trip
throw new ConflictError('Quest fingerprint mismatch', {
  code: 'hero_quest_fingerprint_mismatch',
  clientFingerprint: clientQuestFingerprint,
  serverFingerprint: heroReadModel.questFingerprint,  // LEAK
});

// CORRECT — client must re-fetch via GET to obtain fresh fingerprint
throw new ConflictError('Quest fingerprint mismatch', {
  code: 'hero_quest_fingerprint_mismatch',
  clientFingerprint: clientQuestFingerprint,
});
```

### Pattern 5. Strip debug/internal data from child-visible responses

```js
// worker/src/hero/routes.js
const { debug, ...safeResult } = result;
const responseHero = envFlagEnabled(env.HERO_MODE_CHILD_UI_ENABLED)
  ? safeResult   // child-visible: no debug block
  : result;      // internal/shadow: full debug data preserved
return json({ ok: true, hero: responseHero });
```

### Pattern 6. Normalise provider shapes at the view-model boundary

Server providers return `eligibleSubjects` as `Array<{subjectId, reason}>`. Card code mapping `.map((id) => HERO_SUBJECT_LABELS[id] || id)` renders `[object Object]`.

Fix: the view-model normaliser handles both shapes:

```js
// src/platform/hero/hero-ui-model.js
const eligibleSubjects = (readModel?.eligibleSubjects || [])
  .map(e => typeof e === 'string' ? e : e?.subjectId || '')
  .filter(Boolean);
```

Normalisation at the view-model boundary means every downstream consumer works with the simplest shape, regardless of what the provider returns.

## Why This Matters

| Pattern | What breaks without it |
|---------|----------------------|
| 1. Query expansion | Active session detection impossible. Child gets double-session conflicts or silently abandoned sessions. |
| 2. Whitelist routing | Modifying three subject normalisers widens each whitelist, increasing attack surface. Or banner is permanently blank. |
| 3. Store injection | The entire P2 UI is silently inert — dashboard card, task banner, action handlers, stale-quest recovery all read `undefined`. |
| 4. Fingerprint leak | Freshness protection defeated in one extra round-trip. Client submits any fingerprint, reads correct one from error, resubmits. |
| 5. Debug stripping | `quest.debug` exposes `rejectedCandidates`, `subjectMix`, safety flags to child's DevTools. Privacy contract violation. |
| 6. Shape normalisation | `[object Object]` appears wherever a subject label should be. Production-faithful fixtures would catch this, but simplified fixtures mask it. |

## When to Apply

- **Any platform subsystem evolving from shadow/internal to child-visible.** The six patterns address assumptions structurally invisible in shadow mode.
- **Any cross-system query gaining a new consumer.** When a query was designed for one purpose (providers reading `data_json`) and a new consumer needs adjacent data (`ui_json`), prefer expanding the existing query over adding a new one.
- **Any system with whitelist-based normalisers between server and client.** If a new feature injects data onto server state and needs it on the client, check whether normalisers pass it through. If not, route around using data from the feature's own response path.
- **Any feature where error responses carry server-side state.** The freshness-bypass pattern applies whenever a conflict response includes the authoritative server-side value.
- **Any view-model consuming provider data with a different shape than the UI expects.** The normalisation boundary should be explicit and in one place (the view-model builder).

## Examples

**Most impactful: empty store updater (Pattern 3)**

Before — `appState.heroUi` is always `undefined`:
```js
store?.patch(() => ({}));  // re-render fires, but heroUi never enters store
```
After — heroUi is accessible:
```js
store?.patch((s) => ({ ...s, heroUi }));
```
Every P2 client feature depends on this: card, banner, actions, recovery. The empty updater makes everything silently inert.

**Security-critical: fingerprint leak (Pattern 4)**

Before — client bypass in one round-trip:
```js
// 409 body: { code: 'hero_quest_fingerprint_mismatch', serverFingerprint: 'hero-qf-000030a4bd24' }
// Client reads serverFingerprint, resubmits immediately
```
After — client must re-fetch:
```js
// 409 body: { code: 'hero_quest_fingerprint_mismatch', clientFingerprint: '...' }
// Client calls GET /api/hero/read-model to get fresh quest + fingerprint
```

**Shape mismatch: eligibleSubjects (Pattern 6)**

Before — renders `[object Object]`:
```jsx
// Server: [{ subjectId: 'spelling', reason: 'has-weak' }]
{eligibleSubjects.map((id) => <span>{HERO_SUBJECT_LABELS[id] || id}</span>)}
```
After — view-model normalises at boundary:
```js
const eligibleSubjects = (readModel?.eligibleSubjects || [])
  .map(e => typeof e === 'string' ? e : e?.subjectId || '')
  .filter(Boolean);
// Card code works unchanged: ['spelling', 'grammar', 'punctuation']
```

## How these patterns were discovered

| Pattern | Discovery phase | Discoverer |
|---------|----------------|------------|
| 1. `ui_json` expansion | Plan deepening (feasibility reviewer) | Before any code was written |
| 2. `safeSession` whitelist | Plan deepening (feasibility reviewer) | Before any code was written |
| 3. Empty store updater | Implementation review (correctness reviewer) | After all 10 units implemented |
| 4. Fingerprint leak | Implementation review (security reviewer) | After all 10 units implemented |
| 5. Debug block exposure | Implementation review (security reviewer) | After all 10 units implemented |
| 6. Shape normalisation | Implementation review (correctness reviewer) | After all 10 units implemented |

Patterns 1–2 were caught during plan deepening (3 parallel reviewers before implementation). Patterns 3–6 were caught during post-implementation review (3 parallel adversarial reviewers). The two-phase review approach — plan review then implementation review — catches structurally different classes of issues.

## Related

- [Hero P0 — read-only shadow subsystem](hero-p0-read-only-shadow-subsystem-2026-04-27.md) — predecessor: three-layer architecture, provider pattern, no-write boundary proof
- [Hero P1 — launch bridge and subject command delegation](hero-p1-launch-bridge-subject-command-delegation-2026-04-27.md) — predecessor: launch adapters, heroContext active injection, quest recomputation
- [Grammar P6 — Star derivation trust and production-faithful fixtures](grammar-p6-star-derivation-trust-and-server-owned-persistence-2026-04-27.md) — parallel pattern: six trust defects survived when test fixtures used idealised shapes
- [P2 completion report](../../plans/james/hero-mode/hero-mode-p2-completion-report.md) — full implementation inventory, test coverage, review findings
- PR #451 (Hero P2), PR #397 (Hero P1), PR #357 (Hero P0)
