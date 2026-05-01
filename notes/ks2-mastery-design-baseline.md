# ks2-mastery design baseline — CONSOLIDATED

**Audit date**: 2026-05-01
**Auditors**: @Designer-Opus + @Design-Opus-Worker (independent dual-pass, then reconciled)
**Scope**: `~/Coding/ks2-mastery` HEAD as of 2026-05-01
**Cross-reference**: `notes/design-standards.md`, `notes/designer-opus-pact.md`, `notes/agents-and-collaboration.md`

This is the **locked** baseline that gates all future design work in `fol2/ks2-mastery`. Both auditors must publish the same content in their workspaces. Hard rule: **no token-touching change ships without referencing this doc**.

---

## 1. Repo / surface map

```
src/
├─ app/              entry, AppProviders, App
├─ platform/
│  ├─ ui/            DESIGN-SYSTEM PRIMITIVES (Button, Card, EmptyState,
│  │                 ErrorCard, LoadingSkeleton, ProgressMeter, StatCard,
│  │                 SectionHeader, SubjectThemeScope, hero-*)
│  ├─ react/         ErrorBoundary, useSubmitLock, useTtsStatus, chunk-load-*
│  ├─ hubs/          admin-panel-frame
│  └─ rewards/, game/, hero/, hubs/, ops/, runtime/, access/, events/, core/
├─ subjects/
│  ├─ grammar/       SessionScene, SetupScene, SummaryScene, TransferScene,
│  │                 MiniTestReview, AnalyticsScene, CalibrationPanel,
│  │                 ConceptBankScene, ConceptDetailModal, PracticeSurface
│  ├─ punctuation/   SessionScene, SetupScene, SummaryScene, MapScene,
│  │                 SkillDetailModal, PracticeSurface
│  ├─ spelling/      (in-scope; not deep-audited this pass)
│  └─ placeholders/
├─ surfaces/
│  ├─ auth/          AuthSurface, DemoExpiryBanner
│  ├─ home/          HomeSurface, HeroQuestCard, HeroCampPanel,
│  │                 MonsterMeadow, CodexSurface, CodexCard, CodexCreature*
│  ├─ hubs/          AdminHubSurface, ParentHubSurface, AdminPanelFrame,
│  │                 + ~20 admin section panels
│  ├─ profile/       ProfileSettingsSurface
│  ├─ shell/         TopNav, ToastShelf, MonsterCelebrationOverlay,
│  │                 PersistenceBanner, SubjectBreadcrumb
│  └─ subject/       SubjectRoute, SubjectRuntimeFallback, HeroTaskBanner

styles/
└─ app.css           13,562 lines — single source of CSS truth

assets/
├─ monsters/         403 MB source → 64 MB deployed (CDN)
├─ regions/          308 MB source → 22 MB deployed (CDN)
├─ app-icons/        1.2 MB
└─ icons/            188 KB
```

**Asset binding (verified)**: `wrangler.jsonc` declares `"assets": { "directory": "./dist/public", "binding": "ASSETS" }`. Monster + region webps are served via Cloudflare ASSETS edge, NOT bundled into the JS bundle. Page-load weight (86 MB deployed across multi-resolution variants) is a separate optimisation track.

---

## 2. Token system — current state

### Tokens that EXIST (don't break these)

| Category | Tokens | Status |
| --- | --- | --- |
| Background / panel | `--bg`, `--bg-tint`, `--panel`, `--panel-soft`, `--panel-sunken` | ✅ |
| Ink (text) | `--ink`, `--ink-2`, `--muted`, `--subtle` | ✅ |
| Lines / borders | `--line`, `--line-soft`, `--line-strong` | ✅ |
| Semantic colour | `--good[/-strong/-soft]`, `--warn[…]`, `--bad[…]` | ✅ |
| Brand | `--brand`, `--brand-ink`, `--brand-soft` | ✅ |
| Subject themes | 6 subjects × {accent, accentInk, accentSoft, accentBorder} via `.subject-theme[data-subject]`; mirrored in `src/platform/ui/subject-themes.js` | ✅ |
| Radii | `--radius-xs/sm/md/lg/xl` (8 / 12 / 20 / 28 / 32 px) | ✅ |
| Shadows | `--shadow-xs/-/lg/-glow` | ✅ |
| Fonts | `--font-display` (Fraunces), `--font-sans` (Inter), `--font-serif`, `--font-mono` | ✅ |
| Motion (partial) | `--ease-out`, `--ease-in-out`, `--dur-fast/-/-slow/-slower` (120 / 200 / 320 / 520 ms) | ⚠️ partial — see §3 motion gap |
| Dark mode | full token override via `prefers-color-scheme: dark` AND `[data-theme="dark"]` | ✅ |

### Tokens MISSING — BLOCKING gaps for child-facing standards

| Category | Status | Severity |
| --- | --- | --- |
| **Spacing scale** (`--space-*`) | ❌ MISSING | **BLOCKING** |
| **Type scale** (`--text-*`) | ❌ MISSING | **BLOCKING** |
| **Heading scale** (`--text-h1..h6`) | ❌ MISSING (current usage shows semantic inversion — see §3) | **BLOCKING** |
| **Tap-target minimum** (`--tap-min`) | ❌ MISSING | **BLOCKING** for KS2 |
| **Motion `--dur-medium` (240 ms)** | ❌ MISSING (240 ms used 29× untokenised) | non-blocking but recommended |
| **Focus-ring token** (`--focus-ring`) | ❌ MISSING (`--shadow-glow` does double duty) | nit |
| **Z-index scale** | not audited this pass | TBD |

The absence of spacing + type tokens means **every component re-decides its own spacing/sizing** → cross-surface drift by construction. §3 quantifies the drift.

---

## 3. Drift census (the rogue values)

### Type scale — 82 unique font-size values (Designer-Opus count) / 30+ font-sizes with 0.01rem precision (Worker count)

Sub-1rem (i.e. < 16 px @ 16 px base):
```
0.58em, 0.66, 0.68, 0.70, 0.72, 0.74, 0.75, 0.76, 0.78, 0.80,
0.82, 0.83, 0.84, 0.85, 0.86, 0.87, 0.88, 0.92, 0.94, 0.95, 0.96, 0.98 rem
```
**22 distinct sub-1rem variants.** All violate the KS2 18 px minimum codified in `notes/design-standards.md`.

#### 6-selector kill list (sub-12 px) — must ship in same PR as type scale
| Line | Selector | Size | Action |
| --- | --- | --- | --- |
| `styles/app.css:464` | `.eyebrow` | 11 px | **Pattern replace (i)**: replace ALL-CAPS letter-spaced eyebrow with section-subhead pattern (16 px semibold normal case + optional coloured rule above). 11 px ALL-CAPS + 0.08em letter-spacing is anti-readability for primary-age. |
| `styles/app.css:3434` | `.subject-grid .sc-status` | 10 px | Up-size to `--text-xs` (14 px); non-touch context |
| `styles/app.css:4826` | `.mode-card .mc-badge` | 10 px | Up-size to `--text-xs` (14 px) |
| `styles/app.css:4903` | `.post-mega-stat dt` | 11 px | Up-size to `--text-xs` (14 px) |
| `styles/app.css:5060` | `.mc-badge-roadmap-label` | 9 px ← worst | Up-size to `--text-xs` (14 px) |
| `styles/app.css:5178` | `.post-mega-coming-next-eyebrow` | 10 px | Up-size to `--text-xs` (14 px); also evaluate pattern replace |

### Heading hierarchy — semantic inversion exists

Current heading scale is gappy AND inverts in two places:
- **3.2 → 1.45 rem jump** with no h2/h3 step
- `subject-grid .subject-card h3` = 1.35 rem
- `wb-word-group-head h2` = 1 rem ← **h3 visually larger than h2**

Locked heading scale (ships in PR-C):
```
--text-h1: clamp(2rem, 4vw + 1rem, 3.2rem)     /* responsive cap */
--text-h2: clamp(1.5rem, 2.4vw + 0.8rem, 2rem) /* responsive cap */
--text-h3: 1.5rem
--text-h4: 1.25rem
--text-h5: 1.125rem
--text-h6: 1rem  /* = 18px with body baseline 112.5%, meets KS2 floor */
```
Migrations forced into same PR:
- `subject-card h3` 1.35rem → `var(--text-h3)` (1.5 rem)
- `wb-word-group-head h2` 1rem → `var(--text-h2)` (capped clamp)

### Spacing — 254 padding decls / 56 margin / 371 gap, all raw px or rem

Worker's count of distinct px values: 25. Top non-scale offenders by frequency:
- `10 px` × 143
- `14 px` × 86
- `6 px` × 83
- `18 px` × 61
- `2 px` × 41
- `22 px` × 26

**Locked spacing ladder** (ships in PR-B):
```
--space-0: 0
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-7: 32px
--space-8: 48px
```
Defer `--space-9: 40px` until callsite migration genuinely needs it. The 32 → 48 jump is intentional luxe consistent with 8pt-system convention.

### Colour — 166 unique hex values

Reframed by Worker: many "rogues" are actually **token VALUES used as literals**, e.g.
- `#3E6FA8` × 23 = `var(--brand)`
- `#0F1620` × 16 = dark-theme `--bg`

Severity drops from "blocking" to "high-leverage low-risk migration". Audit-and-convert is mechanical: PR-D ships a literal-to-token sweep.

Sample of true rogues found in `.btn.warn / .good / .bad` and `.chip.*` (lines 524–556):
```
#b8dfca, #edd9ae, #f0c8c5, #9e6a19, #f4f6f8, #546171,
#d9e0e7, #e8f1fb, #2f6fae, #bdd5ef
```
These resolve to existing tokens (`--good-strong`, `--warn-soft`, `--bad-strong`, etc.).

### Motion — 124 tokenised transitions ✅, but the tail is rogue

| Value | Count | Status |
| --- | --- | --- |
| 240 ms | × 29 | **untokenised; dominant** → introduce `--dur-medium: 240ms` |
| 220 ms | × 8 | snap to `--dur` (200 ms) |
| 360 ms | × 4 | snap to `--dur-slow` (320 ms) |
| 420 ms | × 5 | snap to `--dur-slow` or `--dur-slower` |
| 480 ms | × 3 | snap to `--dur-slower` (520 ms) |
| 600 ms | × 3 | snap to `--dur-slower` |
| 720 ms | × 5 | snap to `--dur-slower` |
| 880 ms | × 3 | snap to `--dur-slower` |

Specific multi-prop conflict to resolve:
```css
transition: border-color 200ms ease, box-shadow 200ms ease, transform 220ms var(--ease-out);
```
Same element, two durations (200 / 220), two easings (`ease` / `var(--ease-out)`). Visible micro-jank.

### Tap targets — 27 explicit `min-height ≥ 44 px` declarations

`.btn` default has **no min-height** — relies on padding alone. Estimated rendered height ≈ 38–40 px for `.btn` default, 32–34 px for `.btn.sm`. **Both violate WCAG 2.5.5 / our codified 44 px minimum** (`notes/design-standards.md` § Child-facing surfaces).
Only `.btn.xl` correctly sets `min-height: 48px`. `.btn.lg` borderline.

### `.btn.sm` callsite evidence (drives PR-A scope)

| Surface | `.btn.sm` callsites | Child-facing? | Action |
| --- | --- | --- | --- |
| `GrammarMiniTestReview.jsx` | 1 | YES | migrate to `.btn` default |
| `GrammarConceptBankScene.jsx` | 3 | YES | migrate to `.btn` default |
| `PunctuationMapScene.jsx` | 1 | YES | migrate to `.btn` default |
| `SpellingWordBankScene.jsx` | 2 | YES | migrate to `.btn` default |
| `PatternQuestScene.jsx` | 1 | YES | migrate to `.btn` default |
| `CodexCard.jsx` | 1 | YES (reward path) | migrate to `.btn` default |
| `GrammarTransferScene.jsx` | 5 | NON-critical (Writing Try) | migrate for consistency |
| Admin sections | 3+ | NO (admin only) | rename `.btn.sm` → `.btn.compact` is acceptable here |

PR-A renames `.btn.sm` → `.btn.compact` in CSS with explicit comment, AND migrates child-facing callsites to default `.btn`.

### Inline `style={{}}` — 20 src files (mostly fine)

Sample-audited by Worker: most are intentional CSS-variable passthroughs (`Card.jsx --card-accent`, `LengthPicker --option-count`, `ProgressMeter --progress-value`). Rare literal violation: `ActionRow.jsx { gap: 12 }` — flag for fix in PR-B (spacing scale rollout).

---

## 4. State coverage — primitives strong, adoption uneven

State primitives (`src/platform/ui/`) are well-built with correct a11y contracts:
- `EmptyState` — `role="status" + aria-live="polite"`, three-part copy pattern (what / safe / action)
- `ErrorCard` — `role="alert" + aria-live="polite"` (polite, not assertive — correct for mid-session non-blocking errors); hides error code from visible copy, surfaces as `data-error-code` attribute
- `LoadingSkeleton` — `aria-label="Loading"`, visually-hidden screen-reader text, `prefers-reduced-motion` flattens to static placeholder
- `Button` — **throws** if no visible label and no `aria-label` → fail-fast a11y contract; `busy` sets both `aria-busy` and `disabled`

| Primitive | Adoption | Verdict |
| --- | --- | --- |
| `EmptyState` | 9 surfaces of ~50 (~18%) | ⚠️ partial |
| `ErrorCard` | 5 surfaces (~10%) | ❌ under-used |
| `LoadingSkeleton` | 3 surfaces (~6%) | ❌ **weakest state** |
| `ErrorBoundary` | 1 (App.jsx global only) | ⚠️ no per-surface boundaries |
| Offline detection | 4 files | ⚠️ minimal |

### State matrix — components × {empty, loading, error, success, disabled, offline}
Critical-path surfaces from pact §4 should achieve full state coverage by end of Wave 3 (PR-E + PR-F).

**Critical-path adoption gaps to close in PR-E**:
- `GrammarSessionScene`, `PunctuationSessionScene` (mastery flow critical)
- `GrammarSummaryScene`, `PunctuationSummaryScene` (assessment + reward boundary)
- `HeroQuestCard`, `MonsterMeadow`, `CodexSurface` (reward / progression critical)
- `AuthSurface`, `HomeSurface` (onboarding / first-run critical)

---

## 5. A11y signal — overall positive but inconsistent

| Signal | Count | Verdict |
| --- | --- | --- |
| `aria-label` | 191 | ✅ |
| `aria-live` | 49 | ✅ |
| `role=` | 143 | ✅ |
| `prefers-reduced-motion` blocks | 36 | ✅ Strong |
| `:focus-visible` rules | 38 | ✅ |
| `.sr-only` / `.visually-hidden` utility | 1 def | ⚠️ verify pattern |
| `PunctuationSessionScene` uses `role="radiogroup"`, `role="alert"`, `aria-describedby`, `aria-invalid` | yes | ✅ correct |

**Conclusion**: standards-violations cluster at the **system-token level**, not at the a11y-attribute level. Migration is filling token gaps + raising adoption — not rebuilding a11y.

**Open verifications (not in this baseline pass)**:
- WCAG 2.2 AA contrast sweep
- Manual keyboard traversal of critical paths
- Flesch–Kincaid microcopy pass
- Full per-surface state matrix (only critical paths sampled this pass)

---

## 6. Critical path verification (against pact §4)

| Pact critical path | Surfaces to dual-pass | Notes |
| --- | --- | --- |
| (1) Core mastery flow | `GrammarSessionScene`, `PunctuationSessionScene` | Question → answer → feedback → next |
| ~~(2) Assessment submission~~ | **MERGED into (1)** per Worker definitive read of `*SessionScene` | `GrammarMiniTestReview` = post-finish review, `GrammarTransferScene` = optional non-scored Writing Try — neither IS the assessment |
| (3) Reward / progression | `MonsterCelebrationOverlay`, `MonsterMeadow`, `CodexSurface`, `CodexCard`, `CodexCreature*`, `HeroQuestCard` | Several distinct surfaces; dual-pass each |
| (4) Onboarding / first-run | `AuthSurface`, `HomeSurface` first paint, first SubjectCard tap, first `Setup*Scene` impression | High SEND-cohort risk |

**Non-critical (single-auditor sufficient)**: `GrammarTransferScene` (Writing Try), error-recovery, network-loss reconnect, secondary admin / settings paths.

---

## 7. Locked decisions

- Spacing ladder `--space-{0..8}` = `0 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`; defer `--space-9: 40` until needed
- Body baseline = `html { font-size: 112.5% }` (Option A) — makes 1 rem = 18 px base, all `rem`-based rules auto-comply
- Type scale = `--text-{xs..4xl}` with `--text-base = 1.125rem (18 px)` floor on child-facing
- Heading scale = h1/h2 `clamp()`, h3–h6 fixed; eliminates current 3.2 → 1.45 rem gap and h2/h3 inversion
- Critical path (2) merged into (1); `GrammarTransferScene` = non-critical
- `.btn.sm` → renamed to `.btn.compact` (admin-only) + child-facing callsites migrated to `.btn` default
- Hex-rogue migration = incremental + one sweep PR for `--brand`/`--bg`/`--ink` literal cleanup
- Onboarding scope = `AuthSurface` + `HomeSurface` first paint + first SubjectCard tap → SetupScene first impression
- Kill list (6 selectors) ships in same PR as type scale
- Motion `--dur-medium: 240ms` introduced; 220 / 360 / 420 / 480 / 600 / 720 / 880 ms snapped to nearest token
- Per-surface `ErrorBoundary` = lift-and-place (existing component at `src/platform/react/ErrorBoundary.jsx`)

## 8. PR sequence — locked (3 waves of 2-3 parallel PRs each)

| Wave | PR | Lead spec | Reviewer | Bundle est |
| --- | --- | --- | --- | --- |
| 1 | **PR-A** tap-target token + `.btn` `min-height` + `.sm` migration | Designer-Opus | Worker | net-zero |
| 1 | **PR-D** hex-literal sweep (`--brand`/`--bg`/`--ink` literals to tokens) | Worker | Designer-Opus | net-negative |
| 2 | **PR-B** spacing scale (definitions only, no callsite migration) | Worker | Designer-Opus | small +ve |
| 2 | **PR-C** type scale + body baseline + heading scale + 6-selector kill list (incl. `.eyebrow` pattern replace) | Worker | Designer-Opus | small ± |
| 2 | **PR-G** motion token sweep (`--dur-medium: 240`, snap rogue tail) | Worker | Designer-Opus | net-negative |
| 3 | **PR-E** state primitive adoption (Session / Setup / Summary scenes) | Worker | Designer-Opus | small +ve |
| 3 | **PR-F** per-surface `ErrorBoundary` (lift-and-place around `Subject*PracticeSurface`) | Designer-Opus | Worker | small +ve |

Wave gating: cannot start a wave until all PRs in the previous wave land or are decisively dropped.

## 9. Open / pending

- [ ] PR-A spec drafted by Designer-Opus, handed to @Codex-Coder.
- [ ] PR-D spec drafted by Worker.
- [ ] Wave 2 specs (B, C, G) drafted by Worker post-Wave-1.
- [ ] Wave 3 specs (E by Worker, F by Designer-Opus) drafted post-Wave-2.
- [ ] Page-load weight optimisation track (PNG → WebP/AVIF, asset preloading) — separate roadmap, not in baseline scope.
- [ ] Future: WCAG 2.2 AA contrast sweep, keyboard traversal, Flesch–Kincaid microcopy pass.

## 10. Revision log

- 2026-05-01 — initial dual-pass + reconcile complete; baseline locked (DM thread: 67ac83e1 → 8904646f → 3b8dafb0 → ae2251bc → 75169f65 → 26d1f156 → 6feaec0d → acc7bdc9 → 44863d01 → de08f54e).
