# PR-A — Tap-target floor + `.btn` `min-height` + `.sm` migration

**Spec author**: @Designer-Opus
**Spec reviewer**: @Design-Opus-Worker
**Implementation owner**: @Codex-Coder
**Wave**: 1 (parallel with PR-D)
**Severity**: BLOCKING (gates child-facing surfaces against WCAG 2.5.5 / KS2 motor-accuracy standard)
**Status**: SPEC READY for review

---

## 1. Goal

Establish a single `--tap-min` token (44 px) as the canonical floor for any touch-interactive surface in `fol2/ks2-mastery`. Apply the floor to:
- `.btn` base (currently no `min-height`)
- Interactive `.chip` (currently ~28–30 px on filter / selection chips)
- `.btn.icon` (currently fixed at 42 × 42)

Eliminate the under-sized `.btn.sm` modifier and migrate all 14 callsites to default `.btn`.

This PR ships **no visual change to elements that already meet 44 px**, only enforces the floor where it's currently violated. Net result: child-facing surfaces become WCAG 2.5.5 compliant by construction.

---

## 2. Why (evidence)

### Current violations
- `.btn` default has **no `min-height`** — relies on padding alone. Estimated rendered height ≈ 38–40 px.
- `.btn.sm` (line 528 in `styles/app.css`): `padding: 8px 12px; font-size: 0.92rem;` → estimated ≈ 32–34 px. **Hard fail.**
- `.btn.icon` (line 6217): `width: 42px; height: 42px;` — both dimensions explicitly under 44 px. Used in **spelling audio playback** (a child-facing critical interaction). **Hard fail.**
- Interactive chips (filter chips in `GrammarConceptBankScene`, `SpellingWordBankScene`) have `padding: 6px 10px` → estimated ≈ 28–30 px. **Hard fail.**
- Only `.btn.xl` (`min-height: 48px`) and `.btn.icon.lg` (52 × 52) currently meet the floor explicitly.

### Standards reference
- `notes/design-standards.md` § "Child-facing surfaces (KS2 / primary-age, age 7–11)" — tap-target sizing **promoted to BLOCKING** for any touch interactive surface in mastery / assessment / reward / onboarding flows.
- WCAG 2.5.5 (Target Size Level AAA) = 44 × 44 CSS px.
- Reasoning: primary-age (7–11) motor accuracy is below adult baseline; SEND-cohort overrepresentation (dyslexia, ADHD, autism, low vision) compounds risk.

### Pact reference
- `notes/designer-opus-pact.md` § "Hard rules" → no token-touching change ships without baseline reference. Baseline: `notes/ks2-mastery-design-baseline.md` § 7 "Locked decisions".

---

## 3. Scope (exhaustive)

### 3.1 — Add `--tap-min` token

**File**: `styles/app.css`
**Where**: `:root` block, after `--shadow-glow` (around line 49), before the font tokens.
**Insert**:
```css
  /* Touch-target minimum — WCAG 2.5.5 AAA, elevated to baseline for KS2.
     Child-facing surfaces (mastery / assessment / reward / onboarding)
     MUST honour this floor on every interactive element. */
  --tap-min: 44px;
```
No dark-mode override needed (geometry-only, theme-invariant).

### 3.2 — Apply `min-height` to `.btn` base

**File**: `styles/app.css`
**Where**: `.btn` block (line 509).
**Change**: Add `min-height: var(--tap-min)` and switch to flex layout for vertical centring.

```css
.btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  padding: 10px 14px;
  font-weight: 800;
  transition: transform 0.05s ease, filter 0.15s ease, background 0.15s ease;
  /* PR-A: WCAG 2.5.5 floor + flex centring so taller min-height stays balanced. */
  min-height: var(--tap-min);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

**Visual side-effect**: previously the buttons rendered ~38–40 px tall via padding only; they now render at exactly 44 px on touch surfaces. Padding stays unchanged so internal text rhythm is identical. **No visual regression** on `.btn.lg` (already ≥ 40 px) or `.btn.xl` (already 48 px); both naturally exceed `var(--tap-min)`.

### 3.3 — Apply `min-height` to interactive `.chip`

**File**: `styles/app.css`
**Where**: `.chip` block (around line 542).
**Change**: Add a sibling rule that scopes `min-height` to interactive chips only (those rendered as `<button>` or with `[role="button"]`). Decorative label chips stay compact.

```css
/* PR-A: interactive chip floor. Decorative label chips remain compact. */
button.chip,
.chip[role="button"] {
  min-height: var(--tap-min);
  display: inline-flex;
  align-items: center;
}
```

**Migration note for callsites**: all chips rendered with `onClick` MUST be `<button class="chip ...">` (not `<span>`/`<div>`) so the selector reaches them. Audit:
- `GrammarConceptBankScene.jsx` lines 56, 82 — verify `<button>` element.
- `SpellingWordBankScene.jsx` lines 71, 137 — verify `<button>` element.

If any are `<span>`/`<div>`, convert to `<button type="button">` in this PR. Failing that, add `role="button"` and `tabIndex={0}` + keyboard handler. Recommendation: convert to `<button>`; semantic HTML > ARIA.

### 3.4 — Eliminate `.btn.sm`

**Decision**: ELIMINATE entirely (cleaner than rename — no footgun ever, no admin/non-admin distinction to maintain). All callsites migrate to default `.btn`.

**File**: `styles/app.css`
**Where**: line 528.
**Change**: Delete the `.btn.sm` rule.

```css
/* DELETE THIS LINE: */
.btn.sm { padding: 8px 12px; font-size: 0.92rem; }
```

If, during implementation, @Codex-Coder finds a callsite where the size genuinely cannot be a default `.btn` (e.g. dense admin grid where 44 px would break layout), surface that callsite back to design pair before shipping. We will reintroduce `.btn.compact` (with explicit non-touch contract) in a follow-up if needed. Default position: eliminate.

### 3.5 — Migrate all `.btn.sm` callsites to default `.btn`

**Files** (14 callsites total — 13 child-facing + 1 admin):

> **Implementation note**: `AdminContentSection.jsx:710` is the only non-child-facing callsite. Verify the admin table layout doesn't break before merging — this is the one place where size growth (≈ 32–34 px → 44 px) is meaningfully visible in a dense table. If the layout breaks unacceptably, surface back to design pair before shipping; we'll revisit (likely path: reintroduce `.btn.compact` for admin density, but only if genuinely needed).


| File | Line | Current | New |
| --- | --- | --- | --- |
| `src/subjects/grammar/components/GrammarTransferScene.jsx` | 119 | `className="btn primary sm"` | `className="btn primary"` |
| `src/subjects/grammar/components/GrammarTransferScene.jsx` | 386 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/grammar/components/GrammarTransferScene.jsx` | 430 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/grammar/components/GrammarTransferScene.jsx` | 557 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/grammar/components/GrammarMiniTestReview.jsx` | 110 | `className="btn secondary sm"` | `className="btn secondary"` |
| `src/subjects/grammar/components/GrammarConceptBankScene.jsx` | 118 | `className="btn primary sm"` | `className="btn primary"` |
| `src/subjects/grammar/components/GrammarConceptBankScene.jsx` | 127 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/grammar/components/GrammarConceptBankScene.jsx` | 205 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/punctuation/components/PunctuationMapScene.jsx` | 363 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/spelling/components/SpellingWordBankScene.jsx` | 406 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/spelling/components/SpellingWordBankScene.jsx` | 524 | `className="btn ghost sm"` | `className="btn ghost"` |
| `src/subjects/spelling/components/PatternQuestScene.jsx` | 301 | `className="btn sm bad"` | `className="btn bad"` |
| `src/surfaces/home/CodexCard.jsx` | 52 | `className="btn secondary sm"` | `className="btn secondary"` |
| `src/surfaces/hubs/AdminContentSection.jsx` | 710 | `className="btn ghost sm"` | `className="btn ghost"` |

Mechanical delete-the-` sm` pass. No prop changes elsewhere. `Button.jsx` primitive does not need editing — it composes class strings, the `size` prop with default `'md'` already produces no modifier; `'sm'` would be lost from the class composition (which is correct, since `.btn.sm` is being removed).

### 3.6 — Update `Button.jsx` primitive

**File**: `src/platform/ui/Button.jsx`

**Two changes**:

1. **Remove `'sm'` from valid `size` values.** Currently the primitive accepts `size = 'md' | 'sm' | 'lg' | 'xl'`. Remove `'sm'` from accepted values; if a caller passes `size="sm"` after this PR, the primitive should warn (dev) or treat as default (prod).

   Current logic (lines 119–121):
   ```js
   const classes = ['btn'];
   if (variant) classes.push(variant);
   if (size && size !== 'md') classes.push(size);
   if (className) classes.push(className);
   ```

   Change to:
   ```js
   const classes = ['btn'];
   if (variant) classes.push(variant);
   if (size && size !== 'md') {
     if (size === 'sm') {
       // PR-A: .btn.sm eliminated. Treat as default md so calls don't
       // emit a stale modifier class. Warn in dev.
       if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
         // eslint-disable-next-line no-console
         console.warn('Button: size="sm" was removed in PR-A (tap-target). Use default size or rework the surface for the WCAG 2.5.5 floor.');
       }
     } else {
       classes.push(size);
     }
   }
   if (className) classes.push(className);
   ```

2. **Update the file header comment** (lines 115–122) to reflect that `.btn.sm` no longer exists. Replace:
   ```
   // `size === 'md'` renders as the bare `.btn` (per plan U1 Approach).
   // Other sizes append the matching modifier — `.btn sm` / `.btn lg` /
   // `.btn xl` — exactly mirroring the hand-rolled class strings the
   // migrating call-sites already use.
   ```
   With:
   ```
   // `size === 'md'` renders as the bare `.btn` (per plan U1 Approach).
   // Other sizes append the matching modifier — `.btn lg` / `.btn xl`.
   // `.btn.sm` was eliminated in PR-A (WCAG 2.5.5 / KS2 tap-target floor).
   ```

3. **Enrich the dev warn message** with doc references so future devs see context immediately, not just a banner. Use:
   ```js
   console.warn(
     'Button: size="sm" was removed in PR-A (WCAG 2.5.5 / KS2 tap-target floor). '
     + 'See notes/specs/PR-A-tap-target-spec.md or '
     + 'notes/ks2-mastery-design-baseline.md §3 for context. '
     + 'Use default size or rework the surface to honour --tap-min (44px).'
   );
   ```

### 3.7 — Migrate `.btn.icon` to `--tap-min` (BLOCKING — caught by Worker review)

**File**: `styles/app.css`
**Where**: `.btn.icon` block (line 6217).
**Current** (BELOW floor on width):
```css
.btn.icon {
  width: 42px; height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-soft);
  border-color: var(--line);
  color: var(--ink);
}
```

**Fix**: replace explicit dimensions with the new token. `.btn.icon` is intentionally a fixed-size square (no padding, icon-only); keeping `width:` + `height:` (rather than `min-*`) preserves that intent.

```css
.btn.icon {
  width: var(--tap-min);   /* PR-A: was 42px — under WCAG 2.5.5 floor */
  height: var(--tap-min);  /* PR-A: was 42px — under WCAG 2.5.5 floor */
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-soft);
  border-color: var(--line);
  color: var(--ink);
}
```

`.btn.icon.lg` (line 6227, 52 × 52) is unchanged — already exceeds floor.

**Affected critical-path surface**: `SpellingSessionScene` audio playback button (`.spelling-in-session .audio-row .btn.icon`). Spelling subject is in our active scope (a child-facing surface; audio cue interaction is a primary affordance for spelling tasks). Without this fix, spelling audio buttons stay at 42 × 42 after PR-A — WCAG 2.5.5 fail.

Also affected (non-critical but should still comply): `.monster-effect-row-actions .btn.icon` (line 833 — admin debugging UI; growth from 42 → 44 px is visually negligible).

---

## 4. Out of scope for PR-A

Explicitly NOT in this PR (each gets its own PR per baseline §8):
- Spacing-scale tokens (`--space-*`) → PR-B
- Type scale + body baseline + heading scale + 6-selector kill list → PR-C
- Hex literal sweep → PR-D
- State primitive adoption → PR-E
- Per-surface ErrorBoundary → PR-F
- Motion token sweep → PR-G

Do **not** rename other class modifiers (`.btn.lg`, `.btn.xl`, `.btn.primary`, etc.) in this PR. Single-concept PRs only.

---

## 5. Verification (REQUIRED before marking ready-for-review)

### 5.1 — Unit / parser tests
- Existing `tests/ui-button-primitive.test.js` should still pass (no breaking change to public API).
- Add: assertion that `Button` with `size="sm"` does NOT emit a `.sm` class in production build.

### 5.2 — Visual regression / build checks
- `npm run check` — typecheck + dry-run deploy passes.
- `npm test` — full suite passes.
- Bundle delta: report gzip JS bundle size before / after. Expected: small positive (~+80 bytes per §7 — additions outweigh deletions). Hard threshold: **+200 bytes**. Report in PR description.
- CSS bundle delta: report `dist/public/styles/app.css` size before / after. Expected: small positive (additions in §3.1 / §3.2 / §3.3 outweigh `.btn.sm` rule deletion in §3.4 and the `42px` → `var(--tap-min)` replacement in §3.7 which is net-zero).

### 5.3 — Critical-path measurement (BLOCKING)
For every surface in baseline §6 critical paths, manually verify in built app. Every interactive element rendered must measure **≥ 44 × 44 CSS px** (`Playwright boundingBox()` returns CSS pixels).

#### Buttons
- `GrammarSessionScene` answer buttons / next button
- `PunctuationSessionScene` answer buttons / next button
- `GrammarSummaryScene` continue / restart buttons
- `PunctuationSummaryScene` continue / restart buttons
- `MonsterCelebrationOverlay` "Keep going" CTA
- `HeroQuestCard` quest CTAs
- `CodexCard` practice button (was `.btn secondary sm` → now `.btn secondary`)
- `AuthSurface` sign-in / next buttons
- First-tap surfaces in onboarding

#### Chips (interactive, post-§3.3 migration)
- `GrammarConceptBankScene.jsx` chips at lines 56, 82 — assert `boundingBox.height >= 44 && boundingBox.width >= 44`
- `SpellingWordBankScene.jsx` chips at lines 71, 137 — same assertion

#### Icon buttons (post-§3.7 migration)
- `SpellingSessionScene` audio playback button (`.spelling-in-session .audio-row .btn.icon`) — assert both dims ≥ 44 (was 42 × 42 pre-PR)

Acceptable evidence in PR: (a) Playwright assertion file listing each surface + asserting `boundingBox.height >= 44 && boundingBox.width >= 44`, OR (b) screenshot grid with dev-tools overlay showing element box.

### 5.4 — A11y verification
- `Button` primitive a11y contract still throws on missing label (existing test).
- `<button class="chip">` migrations preserve `aria-pressed` / `aria-checked` if present in original.
- No regression in keyboard navigation: tab order through critical-path surfaces unchanged.

---

## 6. A11y impact

**Positive**:
- Every interactive button on critical paths becomes WCAG 2.5.5 (AAA) Target Size compliant.
- Removes systemic a11y regression risk from `.btn.sm` callsites in child-facing surfaces.
- Closes a SEND-cohort accessibility gap (motor accuracy + small target size = high mistap rate).

**Risk**:
- None expected. Buttons growing from ~38 px to 44 px does not affect screen-reader or keyboard users; visual users see slightly taller buttons.
- Layout: tighter component boxes that previously fit a 38 px `.btn` snugly may now have a 6 px gap. Verify on critical paths during 5.3.

**Verification**: see § 5.4.

---

## 7. Bundle impact

| Item | Direction | Magnitude |
| --- | --- | --- |
| New CSS var `--tap-min` | + | ~16 bytes |
| `.btn { min-height + display:inline-flex + align/justify }` | + | ~85 bytes |
| `button.chip, .chip[role="button"]` rule | + | ~70 bytes |
| `.btn.icon` `42px` → `var(--tap-min)` × 2 | + | ~12 bytes |
| `.btn.sm` rule deletion | − | ~50 bytes |
| Button.jsx warn block (enriched message) | + (dev only, tree-shaken in prod) | net-zero in prod bundle |
| 14 callsite `' sm'` removals | − | ~42 bytes (3 bytes × 14) |

**Net estimate**: ≈ +90 bytes gzip, well within the 1,506-byte JS-bundle headroom (and CSS bundle is separate from JS bundle anyway). PR description must include actual measured delta.

If actual delta exceeds +200 bytes, treat as a blocker and revisit the implementation (likely cause: new flex display propagating cascade weight unintendedly).

---

## 8. Dissent log (alternatives considered + rejected)

### Rejected: rename `.btn.sm` → `.btn.compact` instead of eliminating
Worker initially proposed rename + explicit comment + non-touch contract. Rejected because:
- Only 1 of 14 callsites is in admin (AdminContentSection). Eliminating + migrating that one to default `.btn` is cleaner than maintaining a parallel modifier.
- Rename keeps the footgun shape — future devs may still reach for it without reading the comment.
- Elimination forces the design pair to consciously reintroduce `.btn.compact` if a genuine non-touch context emerges, with proper review at that point.

If review finds the elimination too aggressive (e.g. admin tables genuinely break), reintroduce `.btn.compact` in PR-A2 with the explicit contract.

### Rejected: apply `min-height` to ALL `.chip` (including decorative)
Decorative chips (status labels, achievement badges, learning-state indicators) are non-interactive and should stay compact for visual rhythm. Selector scoped to `button.chip, .chip[role="button"]` only.

### Rejected: ship `.btn` `min-height: 48px` (matching `.btn.xl`)
Considered for "more touch comfort". Rejected: 44 px is the documented WCAG 2.5.5 AAA floor. Going beyond turns the entire app into XL buttons, which would break information density on dashboards. Designers should opt INTO 48 px (`.btn.xl`) where the surface warrants emphasis.

### Rejected: defer `.chip` floor to PR-E (state primitive adoption)
Considered for smaller PR. Rejected: `.chip` interactivity floor is the same conceptual change as `.btn` floor; bundling is more efficient. Reviewer can review one PR with two related changes faster than two PRs each with half.

---

## 9. Acceptance criteria (binary)

- [ ] `--tap-min: 44px` defined in `styles/app.css` `:root`.
- [ ] `.btn` base has `min-height: var(--tap-min)` + flex centring.
- [ ] `button.chip, .chip[role="button"]` has `min-height: var(--tap-min)` + flex centring.
- [ ] `.btn.icon` `width` / `height` swapped from `42px` to `var(--tap-min)`.
- [ ] `.btn.sm` rule deleted from `styles/app.css`.
- [ ] All 14 callsites in §3.5 migrated.
- [ ] `Button.jsx` no longer emits `.sm` modifier; dev-only warning added with doc references; header comment updated.
- [ ] `npm run check` passes.
- [ ] `npm test` passes (existing + any new assertions for §5.1).
- [ ] Critical-path verification evidence in PR description (§5.3) — buttons + chips + icon-button.
- [ ] Bundle delta reported in PR description; ≤ +200 bytes gzip.
- [ ] PR description references this spec doc + baseline doc.
- [ ] Reviewer (Worker) sign-off on a11y impact + dissent log.

---

## 10. Handoff metadata

- Spec drafted: 2026-05-01
- Implementation owner: @Codex-Coder
- Spec reviewer (must approve before implementation starts): @Design-Opus-Worker
- Spec reviewer (must approve PR before merge): @Codex-Reviewer (severity-tagged review per their format)
- Final design sign-off: @Designer-Opus
- Critical-path acceptance check: @Designer-Opus + @Design-Opus-Worker (dual-pass per pact §4)
