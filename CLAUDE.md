# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Preferred agent workflows（代理工作流偏好）

When a task matches an available **gstack** skill or a **Compound Engineering** skill (`ce:*`), agents should **use those skills by default** rather than ad-hoc workflows.

- Prefer **gstack** skills for browser QA, design review, debugging/investigation, shipping, deploy verification, and related agent-driven workflows.
- Prefer **Compound Engineering** skills for planning, implementation workflow, code review, learnings capture, and other `ce:*` processes.
- If both are applicable, use the minimal combination that fits the task and follow their documented sequencing.
- If no relevant skill exists, continue with the best local workflow and state the fallback briefly.

## What this is

A browser-side React prototype of a KS2 (Year 5/6, UK) study app with six subjects
(spelling, arithmetic, reasoning, grammar, punctuation, reading). Only **spelling**
is wired to a real engine; the other five subjects are realistic UI mockups that
share the same shell. The project is a static HTML prototype intended to be ported
to Next.js later — references to that are sprinkled through comments.

## Running locally

There is **no build step and no package.json**. `KS2 Unified.html` loads
React 18, ReactDOM, and Babel Standalone from `unpkg.com` (see the three
`<script>` tags at the bottom of `<body>`), then pulls every file under `src/`
and `vendor/` via `<script type="text/babel" src="...">`.

Because external `text/babel` scripts are fetched via `fetch()`, `file://` will
not work — serve the directory over HTTP. For example:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/KS2%20Unified.html
```

Tests, linters, package manager: **none**. Changes are verified by reloading
the HTML file in a browser.

## Script load order is load-bearing

`KS2 Unified.html` loads modules in a **deliberate order** because each file
registers its exports on `window` and later files read them at parse time:

```
vendor/sentence-bank-01.js   → window.KS2_SENTENCE_BANK
vendor/word-meta.js          → window.KS2_WORD_META (depends on sentence bank)

src/tokens.jsx               → TOKENS, SUBJECTS, SUBJECT_ORDER, getSubjects
src/icons.jsx                → Icon (+ glyph catalogue)
src/primitives.jsx           → Panel, Btn, Chip, Stat, Field, Select, ProgressBar
src/shell.jsx                → Sidebar, Topbar, SubjectHeader, SubjectGlyph
src/profile.jsx              → ProfileOnboarding, ProfileEditDialog, loadProfile
src/monsters.jsx             → MONSTERS, MONSTERS_BY_SUBJECT, stageFor, levelFor
src/monster-engine.jsx       → MonsterEngine (plain <script>, not JSX)
src/monster-overlay.jsx      → MonsterOverlay
src/collection.jsx           → CollectionScreen
src/dashboard.jsx            → Dashboard
src/spelling-engine.jsx      → SpellingEngine (plain <script>, not JSX)
src/spelling-game.jsx        → SpellingGame
src/questions.jsx            → QuestionBody + per-subject Q components
src/practice.jsx             → PracticeScreen
src/tabs.jsx                 → AnalyticsScreen, ProfilesScreen, SettingsScreen, MethodScreen
src/app.jsx                  → App root + ReactDOM.createRoot(...).render
```

If you add a new module, append its `<script>` tag in the correct slot in
`KS2 Unified.html` and end the module with
`Object.assign(window, { NewExport })` or `window.NewExport = NewExport` —
there is no ES-module bundler.

**Two script types coexist**: use `type="text/babel"` for files with JSX;
use plain `<script>` for engine files that use no JSX syntax
(`spelling-engine.jsx`, `monster-engine.jsx`). Mixing it up either slows
compile or breaks parse.

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

The sibling directory `/Users/jamesto/Coding/ks2-mastery-legacy` (allow-listed in
`.claude/settings.local.json`) holds the **pre-unified** prototypes: separate
`preview - Arithmetic.html`, `preview - Grammar.html` etc., plus sentence banks
2–6 (`sentence-bank-02.js` … `06.js`) and the full original spelling game.
When porting a new subject into this unified shell, the legacy HTML is the
design reference and the `sentence-bank-0N.js` files are the content source that
has not yet been copied into `vendor/`. Only `sentence-bank-01.js` and
`word-meta.js` are active in this directory.
