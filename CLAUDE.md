# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Preferred agent workflows（代理工作流偏好）

When a task matches an available **gstack** skill or a **Compound Engineering** skill (`ce:*`), agents should **use those skills by default** rather than ad-hoc workflows.

- Prefer **gstack** skills for browser QA, design review, debugging/investigation, shipping, deploy verification, and related agent-driven workflows.
- Prefer **Compound Engineering** skills for planning, implementation workflow, code review, learnings capture, and other `ce:*` processes.
- If both are applicable, use the minimal combination that fits the task and follow their documented sequencing.
- If no relevant skill exists, continue with the best local workflow and state the fallback briefly.

## What this is

A browser-side React app for a KS2 (Year 5/6, UK) study shell with six subjects
(spelling, arithmetic, reasoning, grammar, punctuation, reading). **Spelling**
is the real product surface; the other five subjects are realistic UI mockups.
The frontend is bundled via Vite and served alongside a Cloudflare Worker backend.

## Running locally

```bash
npm install
npm run build
npm run dev
```

- `index.html` is the canonical entry shell.
- `npm run build:public` writes production static output to `dist/public/` via atomic swap.
- `archive/KS2 Unified.html` is a legacy snapshot for historical reference only.
- Use `npm test` and `npm run test:e2e` for verification.

## Script load order is load-bearing

`index.html` and generated `dist/public/index.html` rely on a deliberate order:
content globals must load before the frontend bundle entry.

```
vendor/sentence-bank-01.js … sentence-bank-06.js  → banks on window
vendor/word-list.js                               → window.KS2_WORDS
vendor/word-meta.js                               → window.KS2_WORD_META
src/main.jsx                                      → frontend module entry
```

If you change content globals or entry assumptions, keep `index.html`,
`scripts/build-public.mjs`, and tests in sync.

## High-level architecture

- **`App` (`src/app.jsx`)** — owns global route (`'home' | 'collection' | subjectId`),
  active tab, tweaks (nav pattern / density / accent), profile, and a one-at-a-time
  monster-event queue. Everything is lifted here so sub-screens stay stateless.

- **Three nav patterns** (`Sidebar`, `Topbar`, `Dashboard`) live in `shell.jsx` and
  are toggled by `tweaks.navPattern`. `Dashboard` has no persistent switcher — you
  return home to change subject. The palette used across the shell can be swapped
  between `SUBJECTS` (muted) and `SUBJECTS_VIVID` via `tweaks.accentStyle`; `App`
  republishes the active map on `window.SUBJECTS` so deeply nested components pick
  it up without prop drilling.

- **Tabs** under a subject are dispatched in `SubjectView` → `PracticeScreen`,
  `AnalyticsScreen`, `ProfilesScreen`, `SettingsScreen`, `MethodScreen`. The
  Practice tab calls `<QuestionBody subject={…}>` which dispatches to the
  subject-specific question component in `questions.jsx`.

- **Spelling pipeline** (the one real feature) flows:
  `SpellingGame` (UI) → `SpellingEngine` (grading + spaced-repetition mastery) →
  `MonsterEngine` (milestone detection) → `MonsterOverlay` (celebration).
  Spelling uses a stage model (0–6, `SECURE_STAGE = 4`) per word; correct answers
  move +1, wrong −1. Reaching `SECURE_STAGE` for the first time feeds the
  associated monster pool.

- **Monster system** — each monster belongs to a subject and a word pool
  (`'y3-4' → inklet`, `'y5-6' → glimmerbug`). `MonsterEngine.recordMastery` dedupes
  by word slug and emits at most one event per transition: `caught` (10 mastered),
  `levelup` (every 10), `evolve` (50 / 80), or `mega` (100). Thresholds live in
  `monsters.jsx` (`stageFor`, `levelFor`). Monster art is **inline hand-drawn SVG**
  in `monsters.jsx`; PNG fallbacks in `assets/monsters/` are not currently wired in.

## Worker layering (`worker/`)

The Worker is layered as **composition root → middleware → routes → services → lib**.
There is deliberately no repository layer — an earlier iteration added thin
pass-through wrappers and they never grew real logic, so they were removed as
YAGNI. If cross-cutting persistence concerns appear (row-to-domain adapters,
caching, transaction wrappers, per-table error translation), re-introduce a
`worker/repositories/*.js` layer at that point rather than scattering the logic
across services. Until then:

- **Composition root (`worker/index.js`)** — 29 lines. Wires `instrumentRequest`
  + `ensureApiSchema` middleware, mounts route groups, delegates the asset path.
- **Middleware (`worker/middleware/`)** — cross-cutting per-request concerns:
  request-id + structured log, schema readiness guard, session extraction.
- **Routes (`worker/routes/`)** — Hono route groups, one per domain. Parse via
  contracts, delegate to services, serialise via contracts. No business logic.
- **Services (`worker/services/`)** — the locus of orchestration and business
  rules (rate-limit, Turnstile gating, session bundle patching, TTS provider
  selection). Services call `worker/lib/*.js` directly for persistence.
- **Contracts (`worker/contracts/`)** — request parsing (`parse*Payload`) and
  response envelope construction (`build*Response`) with runtime shape asserts.
  Pure functions, unit-testable without a Worker pool.
- **Lib (`worker/lib/`)** — shared primitives: `store.js` (D1 helpers),
  `http.js` (HttpError family + handlers), `validation.js`, `observability.js`,
  provider clients (`tts.js`, `oauth.js`, `turnstile.js`), `rate-limit.js`.

Enum constants that cross layers (`AUTH_PROVIDER_KEYS`, `OAUTH_PROVIDER_KEYS`,
`TTS_PROVIDER_KEYS`, `MONSTER_IDS`) live next to their authoritative producer
in `worker/lib/` and are imported by the bootstrap response validator — do not
duplicate these lists in contracts or services.

## State persistence (localStorage keys)

All state is client-side. Keys — with the profile-scoped ones suffixed by
`profile.id || 'default'`:

| Key | Written by | Purpose |
| --- | --- | --- |
| `ks2-profile` | `profile.jsx` | The single active profile object |
| `ks2-route` | `app.jsx` | Last active route (home / collection / subject) |
| `ks2-tab` | `app.jsx` | Last active tab within a subject |
| `ks2-spell-progress-<pid>` | `spelling-engine.jsx` | `{ [word]: { stage, correct, wrong, attempts } }` |
| `ks2-monsters-<pid>` | `monster-engine.jsx` | `{ [monsterId]: { mastered: string[], caught: bool } }` |

There is no migration layer — if you change a schema, bump the key or clear
localStorage while testing. `MonsterEngine.resetAll(pid)` exists as a dev reset.

## Host edit-mode protocol

`app.jsx` posts `{ type: '__edit_mode_available' }` on mount and listens for
`__activate_edit_mode` / `__deactivate_edit_mode` from `window.parent`. When
toggled it opens the in-app **Tweaks** panel. Every tweak change is mirrored to
the host via `{ type: '__edit_mode_set_keys', edits: { … } }`. The `DEFAULTS`
literal in `app.jsx` is wrapped in `/*EDITMODE-BEGIN*/ … /*EDITMODE-END*/`
markers — the external edit tool rewrites what is **between** those markers in
place, so do not reformat that block or remove the markers.

## Design tokens and subjects

`TOKENS` in `src/tokens.jsx` is the single source of visual truth (warm neutrals,
two serif/sans/mono families, radius/shadow scales). `SUBJECTS` gives each of the
six subjects an accent / accentSoft / accentTint triple and an icon name. Read
these before introducing hard-coded colours or new families.

## Writing style

UK English throughout (`lang="en-GB"`, en-GB SpeechSynthesis voice preference,
British spellings in copy). Keep it that way when editing copy or adding comments.

## Working with `ks2-mastery-legacy`

The sibling repo `ks2-mastery-legacy` holds pre-unified HTML prototypes and
older spelling UX/content. Use it as a design/content reference when checking
historical behaviour. In this repo, sentence banks 01–06 plus `word-list.js`
and `word-meta.js` are already vendored and active.
