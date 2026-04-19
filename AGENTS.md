# AGENTS.md

This file provides guidance to Codex, Cursor agents, and other automation when working with code in this repository.

## Preferred agent workflows（代理工作流偏好）

When a task matches an available **gstack** skill or a **Compound Engineering** skill (`ce:*`), agents should **use those skills by default** rather than ad-hoc workflows.

- Prefer **gstack** skills for browser QA, design review, debugging/investigation, shipping, deploy verification, and related agent-driven workflows.
- Prefer **Compound Engineering** skills for planning, implementation workflow, code review, learnings capture, and other `ce:*` processes.
- If both are applicable, use the minimal combination that fits the task and follow their documented sequencing.
- If no relevant skill exists, continue with the best local workflow and state the fallback briefly.

## What this is（項目定位）

A **browser-side React UI** (Babel Standalone + vendored React) for a KS2 (Year 5/6, UK) study shell with six subjects: spelling, arithmetic, reasoning, grammar, punctuation, and reading. **Spelling** is the real product surface; the other five are realistic **UI mockups** sharing the same shell.

The app is no longer “static HTML only”: a **Cloudflare Worker** (`worker/`, Hono) serves `/api/*` first (`wrangler.jsonc` → `run_worker_first`), with **D1** (accounts, children, spelling sessions) and **R2** (optional spelling audio buffers). The browser talks to **`window.KS2App`** (`src/client-store.jsx`) and **`window.KS2Spelling`** (`src/spelling-api.jsx`) for auth, bootstrap, and spelling rounds. A **Next.js port** is still an eventual direction; comments may still mention it.

## Repo map（目錄速覽）

| Area | Role |
| --- | --- |
| `src/*.jsx` | React UI + client auth/spelling adapters |
| `worker/` | Hono app, OAuth, D1 access, spelling session service |
| `scripts/` | `build-spelling-data.mjs`, `build-spelling-runtime.mjs`, `build-public.mjs` |
| `worker/generated/` | Generated spelling payloads / runtime (do not hand-edit; run `npm run build`) |
| `vendor/` | Vendored React, Babel, fonts, **all six** `sentence-bank-0N.js`, `word-list.js`, `word-meta.js` |
| `test/` | Vitest (`*.test.mjs`, Cloudflare Workers test pool) + Playwright E2E (`test/e2e/`) |
| `docs/social-auth-setup.md` | OAuth / social login wiring notes |
| `KS2 Unified.html` | **Local static template** (full script pipeline + boot beacon); see “Two shells” below |
| `dist/public/` | **Build output** (gitignored): `npm run build:public` builds into `dist/public.tmp` and atomically swaps into `dist/public/`, writing `dist/public/index.html` |

## Running locally（本機運行）

```bash
npm install
npm run build          # data + worker spelling runtime + public site
npm run dev            # build + local D1 migrations/backfill + Worker + SPA
```

- **Deploy / dry-run**: `npm run check` / `npm run deploy` (both run `build` first).
- **Tests**: `npm test` (Vitest + Workers bindings), `npm run test:e2e` (Playwright).
- **`file://`**: still unreliable for `text/babel` `src=` fetches; prefer HTTP. For a **quick static** preview without the API, you can still serve the repo root — but the **full** app expects `/api/bootstrap` and spelling routes, so use **`npm run dev`** for the supported local full-stack loop.

## Two shells / one template（兩套載入：模板 vs 上線）

1. **Production-shaped client** — `npm run build:public` reads `KS2 Unified.html`, swaps the `<title>`, and **replaces** the block from the `<!-- Content: sentence banks … -->` comment through `</body>` with a fixed `scriptBlock` defined in `scripts/build-public.mjs`. That block injects **`client-store.jsx`** and **`spelling-api.jsx`**, omits the separate `monster-engine.jsx` / `spelling-engine.jsx` script tags (see shims below), and writes **`dist/public/index.html`** (via an atomic `dist/public.tmp` → `dist/public` rename so Wrangler never sees a half-rebuilt tree). **If you change load order or add modules, update both `KS2 Unified.html` and `build-public.mjs`.**

2. **Root `KS2 Unified.html` (checked in)** — still loads legacy **`monster-engine.jsx`** + **`spelling-engine.jsx`** and all sentence-bank scripts. **`app.jsx` now depends on `window.KS2App` / `window.KS2Spelling`**, which this file **does not** include, so treat the checked-in HTML as a **partial dev template** unless you mirror the `build-public` script tags by hand. The supported full-stack loop is **`npm run dev`**.

## Script load order is load-bearing（載入次序）

### `KS2 Unified.html` (static template)

React / Babel load from **`vendor/`** (not unpkg). Then content globals:

```
vendor/sentence-bank-01.js … sentence-bank-06.js  → banks on window
vendor/word-list.js                               → window.KS2_WORDS (enriched list)
vendor/word-meta.js                               → window.KS2_WORD_META (depends on banks)
```

Then JSX modules (each file ends with `Object.assign(window, { … })` or `window.* =` — **no ES-module bundler**):

```
src/tokens.jsx → icons → primitives → shell → profile → monsters
src/monster-engine.jsx (plain script)
src/monster-overlay.jsx → collection → dashboard
src/tts-core.jsx (plain) → tts-settings → spelling-engine (plain)
→ spelling-dashboard → spelling-game → spelling-summary
src/questions.jsx → practice → tabs → app.jsx
```

Use **`type="text/babel"`** for JSX files; **plain `<script>`** for non-JSX engines (`tts-core.jsx`, `spelling-engine.jsx`, `monster-engine.jsx` in this template).

### `dist/public/index.html` (after `build:public`)

Order is defined in **`scripts/build-public.mjs`**: **`client-store.jsx`** runs after **`shell.jsx`** and before **`profile.jsx`**; **`spelling-api.jsx`** sits after **`tts-settings.jsx`** and before **`spelling-dashboard.jsx`**. **`window.MonsterEngine`** is a **read-only shim** implemented in `client-store.jsx` (backed by `KS2App` monster state from the server), not `monster-engine.jsx`.

## High-level architecture（架構概要）

- **`App` (`src/app.jsx`)** — route (`'home' \| 'collection' \| subjectId`), tab, tweaks, monster overlay/toast queues. Calls **`window.KS2App.bootstrap()`** on mount; shows **`AuthScreen`** / **`LoadingScreen`** from `client-store.jsx` until signed in and a child profile exists.

- **Nav patterns** — unchanged: `shell.jsx` (`Sidebar`, `Topbar`, `Dashboard`), `tweaks.navPattern`, `window.SUBJECTS` republished from `getSubjects(tweaks.accentStyle)`.

- **Spelling (server-backed)** — `SpellingGame` uses **`window.KS2Spelling`** (`startSession`, `submit`, `advance`, `skip`) → Worker **`spelling-service.js`**. Monster milestones are returned on API responses and rebroadcast (`monster:progress` custom event) for UI chips. Legacy **`SpellingEngine` / `MonsterEngine.recordMastery`** path applies mainly to the **static template** + unit tests that embed the generated runtime.

- **Tabs** — `SubjectView` → `PracticeScreen`, analytics, profiles, settings, method; **`PracticeScreen`** spelling modes call **`KS2Spelling.startSession`**.

## State & persistence（狀態與持久化）

| Layer | What |
| --- | --- |
| **D1 (Worker)** | Users, sessions, children, spelling progress, prefs — authoritative for signed-in use |
| **`localStorage`** | `ks2-route`, `ks2-tab` (`app.jsx`); TTS / provider prefs and optional API keys (`tts-core.jsx`, keys prefixed `ks2-spelling-…`) |
| **Legacy keys** | `ks2-spell-progress-<pid>` (`spelling-engine.jsx`), `ks2-monsters-<pid>` (`monster-engine.jsx`) — used when those engines run in the browser; **not** the source of truth once **`KS2App`** + API are active |

There is little automatic migration — schema changes in the Worker usually need SQL / store updates in `worker/lib/store.js` and matching client handling.

## Host edit-mode protocol（宿主編輯模式）

Unchanged: `app.jsx` posts `__edit_mode_available`, listens for `__activate_edit_mode` / `__deactivate_edit_mode`, mirrors tweak edits via `__edit_mode_set_keys`, and wraps `DEFAULTS` in `/*EDITMODE-BEGIN*/ … /*EDITMODE-END*/` — keep markers intact for external rewrite tools.

## Design tokens and subjects（設計 token）

`TOKENS` / `SUBJECTS` in `src/tokens.jsx` remain the single source for visual language and subject accents.

## Writing style（用字）

UK English throughout (`lang="en-GB"`, British copy, en-GB TTS preference where applicable).

## Working with `ks2-mastery-legacy`（舊倉對照）

The sibling repo **`ks2-mastery-legacy`** holds pre-unified HTML prototypes (`preview*.html`), extra sentence-bank sources, and older spelling UX. When porting content or behaviour, use it as the **design / content reference**. This repo vendors **banks 01–06** plus `word-list.js` / `word-meta.js`; server-side spelling data is regenerated via **`npm run build:data`**.
