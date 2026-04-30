# UI Refactor P3 — Evidence Map (Starting State)

**Date:** 2026-04-30
**Author:** automated U0 evidence collection

---

## Git Evidence

### 1. Git Ref (starting point)

```
HEAD: 515da0bea39bd4fcc460a725f5bb56a0848ad614
Branch: feat/ui-refactor-p3
Message: docs(ui-refactor-p3): agreed implementation plan
```

### 2. P2 Completion Report

- **Path:** `docs/plans/james/ui-refactor/ui-refactor-p2-completion-report.md`
- **git hash-object:** `bf8778644945b00d5e17602c21b5500aeb455440`

### 3. Primitive Inventory (`src/platform/ui/`)

| File | Consumers |
|------|-----------|
| `Button.jsx` | 6 (AdminPanelFrame, HomeSurface, HeroQuestCard, GrammarSetupScene, PunctuationSetupScene, SpellingSetupScene) |
| `Card.jsx` | 2 (SubjectRuntimeFallback, hub-utils) |
| `EmptyState.jsx` | 7 (AdminPanelFrame, MonsterMeadow, HeroQuestCard, CodexSurface, ParentHubSurface, CodexCreatureLightbox, GrammarSetupScene) |
| `ErrorCard.jsx` | 3 (SubjectRuntimeFallback, hub-utils, HeroQuestCard) |
| `HeroBackdrop.jsx` | 6 (GrammarSetupScene, PunctuationSummaryScene, PunctuationSetupScene, PunctuationSessionScene, PunctuationMapScene, SpellingHeroBackdrop) |
| `HeroWelcome.jsx` | 2 (GrammarSetupScene, PunctuationSetupScene) |
| `LengthPicker.jsx` | 3 (GrammarSetupScene, PunctuationSetupScene, SpellingSetupScene) |
| `LoadingSkeleton.jsx` | 2 (App, AdminPanelFrame) |
| `luminance.js` | 2 (main.js via probeRelLuminance, SpellingPracticeSurface via preloadImages) |
| `hero-bg.js` | 2 (GrammarSetupScene, spelling-view-model) |
| `hero-copy.js` | 0 (indirect — imported by HeroWelcome internally) |
| `ProgressMeter.jsx` | 2 (SubjectCard, PunctuationSetupScene) |
| `SectionHeader.jsx` | 0 (no detected external imports — likely internal to HeroBackdrop) |
| `SetupMorePractice.jsx` | 1 (GrammarSetupScene) |
| `SetupSidePanel.jsx` | 2 (GrammarSetupScene, SpellingSetupScene) |
| `StatCard.jsx` | 1 (PunctuationSetupScene) |
| `useSetupHeroContrast.js` | 3 (GrammarSetupScene, PunctuationSetupScene, spelling/useSetupHeroContrast re-export) |

### 4. Raw `.btn` Inventory

**Total:** 182 usages across 41 files

#### Learner-facing: Session (55 usages)

| File | Count |
|------|-------|
| `subjects/grammar/components/GrammarSessionScene.jsx` | 14 |
| `subjects/punctuation/components/PunctuationSessionScene.jsx` | 9 |
| `subjects/spelling/components/SpellingSessionScene.jsx` | 7 |
| `subjects/spelling/components/PatternQuestScene.jsx` | 6 |
| `subjects/grammar/components/GrammarTransferScene.jsx` | 6 |
| `subjects/punctuation/components/PunctuationMapScene.jsx` | 3 |
| `subjects/grammar/components/GrammarPracticeSurface.jsx` | 1 |
| `subjects/grammar/components/GrammarMiniTestReview.jsx` | 1 |
| `subjects/grammar/components/GrammarAnalyticsScene.jsx` | 1 |
| `subjects/punctuation/components/PunctuationSkillDetailModal.jsx` | 1 |
| `subjects/grammar/components/GrammarConceptBankScene.jsx` | 3 |
| `subjects/grammar/components/GrammarConceptDetailModal.jsx` | 2 |
| `subjects/spelling/components/SpellingWordDetailModal.jsx` | 2 |

#### Learner-facing: Setup (0 raw `.btn` — uses `<Button>` primitive)

All three setup scenes import `Button` from `platform/ui/Button.jsx`.

#### Learner-facing: Summary (10 usages)

| File | Count |
|------|-------|
| `subjects/spelling/components/SpellingSummaryScene.jsx` | 5 |
| `subjects/punctuation/components/PunctuationSummaryScene.jsx` | 4 |
| `subjects/grammar/components/GrammarSummaryScene.jsx` | 1 |

#### Shell / Auth / Profile (28 usages)

| File | Count |
|------|-------|
| `surfaces/profile/ProfileSettingsSurface.jsx` | 13 |
| `surfaces/auth/AuthSurface.jsx` | 6 |
| `surfaces/auth/DemoExpiryBanner.jsx` | 2 |
| `surfaces/shell/PersistenceBanner.jsx` | 1 |
| `surfaces/shell/MonsterCelebrationOverlay.jsx` | 1 |
| `surfaces/subject/SubjectRoute.jsx` | 4 |
| `app/App.jsx` | 1 |

#### Home / Codex / Hero (8 usages)

| File | Count |
|------|-------|
| `surfaces/home/HeroCampPanel.jsx` | 3 |
| `surfaces/home/HeroCampConfirmation.jsx` | 2 |
| `surfaces/home/CodexHero.jsx` | 1 |
| `surfaces/home/CodexCard.jsx` | 1 |
| `subjects/spelling/components/SoftLockoutBanner.jsx` | 1 |

#### Admin / Hubs (78 usages)

| File | Count |
|------|-------|
| `surfaces/hubs/AdminMarketingSection.jsx` | 12 |
| `surfaces/hubs/AdminContentSection.jsx` | 10 |
| `surfaces/hubs/AdminAccountsSection.jsx` | 8 |
| `surfaces/hubs/MonsterEffectCatalogPanel.jsx` | 7 |
| `surfaces/hubs/MonsterVisualConfigPanel.jsx` | 6 |
| `surfaces/hubs/AdminIncidentPanel.jsx` | 6 |
| `surfaces/hubs/MonsterEffectBindingsPanel.jsx` | 4 |
| `surfaces/hubs/AdminErrorTimelinePanel.jsx` | 4 |
| `surfaces/hubs/AdminDebugBundlePanel.jsx` | 4 |
| `surfaces/hubs/MonsterVisualFieldControls.jsx` | 2 |
| `surfaces/hubs/AdminRequestDenialsPanel.jsx` | 2 |
| `surfaces/hubs/admin-panel-header.jsx` | 2 |
| `surfaces/hubs/AdminLearnerSupportPanel.jsx` | 2 |
| `surfaces/hubs/MonsterEffectCelebrationPanel.jsx` | 1 |
| `surfaces/hubs/ParentHubSurface.jsx` | 1 |
| `surfaces/hubs/hub-utils.js` | 1 |

#### Platform internals (3 usages)

| File | Count |
|------|-------|
| `platform/ui/Button.jsx` | 2 (btn-start-icon / btn-end-icon) |
| `platform/ui/EmptyState.jsx` | 1 |
| `platform/ui/ErrorCard.jsx` | 1 |
| `platform/react/ErrorBoundary.jsx` | 1 |
| `platform/game/render/effects/celebration-shell.js` | 1 |

### 5. Raw Colour Inventory (hex literals in src/)

#### `#3E6FA8` — Spelling / default brand (20 usages)

| File | Count | Role |
|------|-------|------|
| `src/main.js` | 2 | avatarColor fallback |
| `src/surfaces/profile/ProfileSettingsSurface.jsx` | 1 | safeColour fallback |
| `src/surfaces/subject/SubjectRuntimeFallback.jsx` | 1 | borderTopColor fallback |
| `src/surfaces/shell/MonsterCelebrationOverlay.jsx` | 1 | monster accent fallback |
| `src/platform/app/create-app-controller.js` | 2 | avatarColor fallback |
| `src/platform/core/local-review-profile.js` | 1 | default profile |
| `src/platform/core/data-transfer.js` | 1 | import fallback |
| `src/platform/core/store.js` | 1 | initial state |
| `src/platform/core/repositories/helpers.js` | 2 | safeColor fallback |
| `src/platform/game/monster-celebrations.js` | 1 | accent fallback |
| `src/platform/game/monsters.js` | 1 | inklet accent |
| `src/platform/game/render/play-celebration.js` | 1 | accent fallback |
| `src/platform/game/render/effects/celebration-shell.js` | 1 | primary default |
| `src/subjects/spelling/module.js` | 1 | module accent |
| `src/subjects/spelling/components/spelling-view-model.js` | 1 | SPELLING_ACCENT const |
| `src/surfaces/home/data.js` | 1 | gradient start (Spelling) |
| `src/surfaces/auth/DemoExpiryBanner.jsx` | 2 (comments) | CSS doc comment |
| `src/surfaces/auth/AuthSurface.jsx` | 5 (comments) | CSS doc comment |

#### `#B8873F` — Punctuation accent (8 usages)

| File | Role |
|------|------|
| `src/subjects/punctuation/module.js` | module accent |
| `src/subjects/placeholders/index.js` | placeholder accent |
| `src/platform/game/monsters.js` | pealark, vellhorn accent |
| `src/surfaces/home/data.js` | gradient start |
| `src/subjects/punctuation/components/PunctuationMapScene.jsx` | borderTopColor |
| `src/subjects/punctuation/components/PunctuationSessionScene.jsx` | borderTopColor |
| `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` | comment + borderTopColor |

#### `#2E8479` — Grammar accent (7 usages)

| File | Role |
|------|------|
| `src/subjects/grammar/module.js` | module accent |
| `src/subjects/placeholders/index.js` | placeholder accent |
| `src/platform/game/monsters.js` | bracehart, chronalyx accent |
| `src/surfaces/home/data.js` | gradient start |
| `src/subjects/punctuation/components/PunctuationSessionScene.jsx` | feedback border (success) |
| `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` | comment (stray teal) |

#### `#C06B3E` — Arithmetic accent (4 usages)

| File | Role |
|------|------|
| `src/subjects/placeholders/index.js` | placeholder accent |
| `src/platform/game/monsters.js` | claspin accent |
| `src/surfaces/home/data.js` | gradient start |

#### `#8A5A9D` — Reasoning accent (4 usages)

| File | Role |
|------|------|
| `src/subjects/placeholders/index.js` | placeholder accent |
| `src/platform/game/monsters.js` | quoral accent |
| `src/surfaces/home/data.js` | gradient start |

#### `#F2B756` — secondary gold (1 usage)

| File | Role |
|------|------|
| `src/surfaces/home/data.js` | gradient end (Arithmetic) |

#### `#4B7280` — not found in source

No matches. The placeholder `Reading` uses `#4B7A4A` (green) instead.

### 6. Inline-Style Inventory

From `scripts/inventory-inline-styles.mjs`:

```
PRE_MIGRATION_TOTAL  = 439
SITES_MIGRATED_THIS_PR = 194
POST_MIGRATION_TOTAL = 245  (= 439 - 194)
```

Live grep confirms: **245 sites across 50 files**.

From `tests/bundle-byte-budget.test.js`:

```
BUDGET_GZIP_BYTES = 227_500
```

### 7. Setup / Session / Summary Map

| Subject | Setup | Session | Summary |
|---------|-------|---------|---------|
| Spelling | `src/subjects/spelling/components/SpellingSetupScene.jsx` | `src/subjects/spelling/components/SpellingSessionScene.jsx` | `src/subjects/spelling/components/SpellingSummaryScene.jsx` |
| Grammar | `src/subjects/grammar/components/GrammarSetupScene.jsx` | `src/subjects/grammar/components/GrammarSessionScene.jsx` | `src/subjects/grammar/components/GrammarSummaryScene.jsx` |
| Punctuation | `src/subjects/punctuation/components/PunctuationSetupScene.jsx` | `src/subjects/punctuation/components/PunctuationSessionScene.jsx` | `src/subjects/punctuation/components/PunctuationSummaryScene.jsx` |

Additional session-related scenes:
- `src/subjects/grammar/components/GrammarTransferScene.jsx` (transfer/mixed practice)
- `src/subjects/spelling/components/PatternQuestScene.jsx` (pattern quests)
- `src/subjects/punctuation/components/PunctuationMapScene.jsx` (skill map)

### 8. Subject Metadata Sources

| Data | Location |
|------|----------|
| Subject IDs (active) | `src/subjects/{spelling,grammar,punctuation}/module.js` — each exports its own constant (e.g. `GRAMMAR_SUBJECT_ID`) |
| Subject IDs (placeholder) | `src/subjects/placeholders/index.js` — arithmetic, reasoning, grammar, punctuation, reading |
| Subject names | `src/surfaces/home/data.js` lines 88-95 (`SUBJECT_NAMES` frozen object) |
| Subject accents | Each `module.js` exports `.accent` in the module descriptor; also in `src/subjects/placeholders/index.js` |
| Monster nouns | `src/surfaces/home/data.js` lines 97-104 (`SUBJECT_MONSTER_NOUNS` frozen object) |
| Monster roster per subject | `src/platform/game/monsters.js` line 186 (`MONSTERS_BY_SUBJECT`) |
| Monster definitions (name, accent, stages) | `src/platform/game/monsters.js` (`MONSTERS` object, line 1) |
| Subject decor (gradient, glyph) | `src/surfaces/home/data.js` lines ~195-230 (`SUBJECT_DECOR`) |

### 9. Monster / Status Surfaces (files rendering creature visuals)

#### Platform render layer
- `src/platform/game/render/MonsterRender.jsx` — core monster sprite renderer
- `src/platform/game/render/BaseSprite.jsx` — inner `<img>` with transform
- `src/platform/game/render/CelebrationLayer.jsx` — transient effect overlay
- `src/platform/game/render/play-celebration.js` — celebration trigger
- `src/platform/game/render/effects/celebration-shell.js` — celebration shell UI
- `src/platform/game/MonsterVisualConfigContext.jsx` — visual config context
- `src/platform/game/MonsterEffectConfigContext.jsx` — effect config context

#### Home / Codex surfaces
- `src/surfaces/home/MonsterMeadow.jsx` — meadow grid
- `src/surfaces/home/CodexSurface.jsx` — codex container
- `src/surfaces/home/CodexCreature.jsx` — single creature card
- `src/surfaces/home/CodexCreatureLightbox.jsx` — creature detail overlay
- `src/surfaces/home/CodexHero.jsx` — codex hero banner
- `src/surfaces/home/CodexCard.jsx` — codex card
- `src/surfaces/home/CodexSubjectSection.jsx` — subject section in codex
- `src/surfaces/home/HeroCampPanel.jsx` — hero camp monster display
- `src/surfaces/home/HeroCampMonsterCard.jsx` — individual monster in hero camp

#### Shell overlay
- `src/surfaces/shell/MonsterCelebrationOverlay.jsx` — full-screen celebration

#### Admin / Ops
- `src/surfaces/hubs/MonsterVisualConfigPanel.jsx` — admin visual editing
- `src/surfaces/hubs/MonsterVisualPreviewGrid.jsx` — preview grid
- `src/surfaces/hubs/MonsterVisualFieldControls.jsx` — field controls
- `src/surfaces/hubs/MonsterEffectCatalogPanel.jsx` — effect catalog
- `src/surfaces/hubs/MonsterEffectBindingsPanel.jsx` — bindings editor
- `src/surfaces/hubs/MonsterEffectCelebrationPanel.jsx` — celebration editor
- `src/surfaces/hubs/MonsterEffectFieldControls.jsx` — effect field controls

#### Subject-specific (monster references in session/setup)
- `src/subjects/spelling/components/SpellingPracticeSurface.jsx`
- `src/subjects/spelling/components/SpellingSetupScene.jsx`
- `src/subjects/spelling/components/SpellingSessionScene.jsx`
- `src/subjects/spelling/components/SpellingSummaryScene.jsx`
- `src/subjects/grammar/components/GrammarSetupScene.jsx`
- `src/subjects/grammar/components/GrammarSummaryScene.jsx`
- `src/subjects/grammar/components/GrammarPracticeSurface.jsx`
- `src/subjects/grammar/components/GrammarTransferScene.jsx`
- `src/subjects/grammar/components/GrammarAnalyticsScene.jsx`
- `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
- `src/subjects/punctuation/components/PunctuationSummaryScene.jsx`
- `src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
- `src/subjects/punctuation/components/PunctuationMapScene.jsx`

---

## Local-Run Evidence

### 10. Bundle Measurement

```
node scripts/audit-client-bundle.mjs
```

**Result:** not measured — requires npm install (ENOENT: `src/bundles/app.bundle.js` not built).

Budget ceiling from `tests/bundle-byte-budget.test.js`: **227,500 bytes gzip**.

---

## Production Evidence: Not Gathered

No production metrics, live bundle measurements, or real-user-monitoring data were collected for this evidence map. All data is from static code analysis and git state.
