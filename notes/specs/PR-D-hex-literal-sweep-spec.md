# PR-D — Hex literal sweep · v2 (scoped to `.btn.warn` / `.chip.warn` dark-mode contrast fix)

> **Scope note**: keeping the "Hex literal sweep" name for traceability against baseline §3 (Colour) and the original Wave-1 PR sequence. **Actual PR substance is the 2-line dark-mode WCAG contrast fix.** Broader rogue cleanup deferred to PR-D2 (border tokens) in Wave 2 — see baseline §8.

**Spec author**: @Design-Opus-Worker
**Spec reviewer**: @Designer-Opus (✅ signed off — see revision log §10)
**Implementation owner**: @Codex-Coder
**Wave**: 1 (parallel with PR-A)
**Severity**: 🔴 **BLOCKING** — fixes WCAG 2.2 AA dark-mode contrast violation on warn semantic surfaces.
**Status**: SPEC READY for handoff

---

## 1. Goal

Replace hex-literal usages in `styles/app.css` that are **functionally identical** to existing design tokens with `var(--token)` references — converting lazy-paste literals into token references AND fixing two latent dark-mode contrast bugs.

This PR ships **no visual change in light mode** (substitutions resolve to identical RGB). In dark mode it fixes the `.btn.warn` / `.chip.warn` foreground-on-background contrast issue caused by hardcoded light-theme orange text.

---

## 2. Why (evidence)

### 2.1 Reframing the original "166 unique hex / 76 single-use" finding
Baseline §3 colour census reported 166 unique hex values with ~135 considered "rogue". After context-filtering, the actual rogue surface is **much smaller**:

| Filtered scope | Count |
| --- | --- |
| Hex literals in `styles/app.css` (raw) | 166 unique |
| Removed: `:root` / dark / subject-theme **definition** blocks | -83 |
| Removed: `var(--token, #literal)` **defensive fallback** patterns | (~7 lines) |
| Removed: `color-mix(in oklab, #LIGHT-VALUE %, #DARK-BG)` cross-theme **inputs** by design | (~12 lines) |
| Removed: comments referencing colours | (~5 lines) |
| Removed: decorative linear-gradient palettes (intentional fixed colours) | (~6 lines) |
| **High-confidence substitution candidates** | **2** |
| Per-callsite-review candidates | ~9 |

**The "lazy-paste rogue" pattern barely exists in this codebase.** Most hex literals are intentional (definitions, fallbacks, gradient palettes, cross-theme color-mix inputs). PR-D's real value pivots from "rogue cleanup" to **dark-mode contrast bug fix + establishing the audit-and-convert pipeline** for future incremental cleanup.

### 2.2 The two real dark-mode bugs

`styles/app.css:526` and `styles/app.css:552`:

```css
.btn.warn { background: var(--warn-soft); border-color: #edd9ae; color: #9e6a19; }
.chip.warn { background: var(--warn-soft); color: #9e6a19; border-color: #edd9ae; }
```

The `color: #9e6a19` is the literal value of `--warn-strong` in **light theme only**. There is **no dark-mode override** for these selectors.

**Light mode** (`--warn-strong: #9E6A19`):
- Foreground: `#9e6a19` (dark warm orange)
- Background: `var(--warn-soft)` = `#FBEFD9` (cream)
- Contrast ratio ≈ **6.27 : 1** ✅ WCAG AA

**Dark mode** (`--warn-strong: #F1C081`):
- Foreground: `#9e6a19` (UNCHANGED — the literal isn't theme-aware)
- Background: `var(--warn-soft)` = `color-mix(in oklab, #D08A2C 22%, #0F1620)` ≈ `#3D2E1A` (dark warm)
- Contrast ratio ≈ **2.4 : 1** ❌ **FAILS WCAG AA (requires ≥ 4.5:1 for body, ≥ 3:1 for UI)**

This is a real WCAG 2.2 AA violation in dark mode. Substituting `color: #9e6a19` → `color: var(--warn-strong)` makes the foreground theme-aware:
- Light: `#9E6A19` (identical to current — no visual regression)
- Dark: `#F1C081` (light warm orange) on dark warm-soft → contrast ≈ **5.8 : 1** ✅

`.chip.warn` follows the same pattern.

### 2.3 Pact / standards reference
- `notes/design-standards.md` § Accessibility a11y baseline: WCAG 2.2 AA — contrast ≥ 4.5:1 for body. The current `.btn.warn` / `.chip.warn` color violates this in dark mode.
- `notes/ks2-mastery-design-baseline.md` § 3 Colour: hex-as-token-literal framing.

---

## 3. Scope (exhaustive)

### 3.1 — Two BLOCKING substitutions (dark-mode contrast bug fix)

**File**: `styles/app.css`

| Line | Selector | Change |
| --- | --- | --- |
| 526 | `.btn.warn` | `color: #9e6a19` → `color: var(--warn-strong)` |
| 552 | `.chip.warn` | `color: #9e6a19` → `color: var(--warn-strong)` |

After change:

```css
.btn.warn { background: var(--warn-soft); border-color: #edd9ae; color: var(--warn-strong); }
.chip.warn { background: var(--warn-soft); color: var(--warn-strong); border-color: #edd9ae; }
```

`border-color: #edd9ae` stays untouched in this PR (deferred to PR-D2 — needs a `--warn-border` token introduction, which is a system-level design call rather than a substitution).

### 3.2 — Out of scope for PR-D (deferred to PR-D2)

Documented for traceability — these are real rogues but require design judgment beyond mechanical substitution:

| Pattern | Count | Why deferred |
| --- | --- | --- |
| `.btn.good` / `.chip.good` `border-color: #b8dfca` | × 14 | Needs new `--good-border` token; theme-aware introduction = system-level decision |
| `.btn.warn` / `.chip.warn` `border-color: #edd9ae` | × 9 | Needs new `--warn-border` token |
| `.btn.bad` / `.chip.bad` `border-color: #f0c8c5` | × 4 | Needs new `--bad-border` token |
| `#1d2b3a` setting `--mode-card-title` (L4596, L4700) | × 2 | L4700 is `[data-text-tone="dark"]` intentional fixed-ink override; L4596 needs scope confirmation |
| `#FFFFFF` in decorative linear-gradients | × 6 | Gradient palettes are design choices; per-callsite review needed |
| `#3E6FA8` literal usages | × 25 | Mostly legitimate (definitions, var-fallbacks, color-mix inputs across themes); ambiguous between `--brand` and `--inklet` token |
| `#B8873F` literal usages | × 8 | Mostly legitimate (definitions, color-mix); needs design call |

**Note for Designer-Opus**: PR-D2 is a future spec that introduces the three border tokens (`--good-border`, `--warn-border`, `--bad-border`) and consolidates the 27 border literals. Bundle estimate: net-negative (3 token definitions × 2 themes = 6 lines added; 27 literal usages × ~8 bytes saved = -216 bytes raw, -130 bytes gzip est.). Worth it.

### 3.3 — Substitution rules (for future PRs in this lineage)

Document the rules so PR-D2..N follow the same discipline:

1. **Skip definitions** — `:root`, `[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`, `.subject-theme[data-subject="*"]` blocks define tokens; literals there ARE the source of truth.
2. **Skip `var()` fallbacks** — `var(--token, #fallback)` is a defensive pattern; the literal is the safety net, do not remove.
3. **Skip cross-theme color-mix inputs** — when a dark-mode rule does `color-mix(in oklab, #LIGHT-COLOUR 22%, #DARK-BG)`, the light colour is intentionally fixed (the substitution would self-reference the dark-theme token and break the cascade).
4. **Skip comments**.
5. **Skip decorative gradient palettes** — fixed colour design choices, not theme-tracking.
6. **Substitute when**: literal exactly matches a token's value in the cascade scope AND substitution preserves intent (or fixes a theme-awareness bug).
7. **For ambiguous literals** (multiple tokens share value, e.g. `#3E6FA8` = `--brand` and `--inklet`): per-callsite semantic review required — choose the token that matches the surrounding selector's intent.

---

## 4. Verification

### 4.1 Unit / parser tests
- No new tests required for 2-line CSS substitution.
- Existing visual regression suite (if any Playwright screenshot-snapshot tests) should pass unchanged in light mode.

### 4.2 Build / bundle checks
- `npm run check` passes.
- `npm test` passes.
- CSS bundle delta: `dist/public/styles/app.css` size before / after — expect **net-zero** or **+8 bytes** (`#9e6a19` is 7 chars, `var(--warn-strong)` is 18 chars; 2 substitutions × 11 chars added ≈ +22 bytes raw, gzip-equivalent likely ≤ +10 bytes since both forms compress).
- JS bundle delta: 0 bytes (no JS change).

### 4.3 Critical-path / dark-mode contrast verification (BLOCKING)

**REQUIRED — Playwright assertion (CI-durable, catches regressions)**:

Add a Playwright test that:
1. Renders a surface containing `.btn.warn` AND `.chip.warn` (or two separate surfaces).
2. In light theme: asserts `getComputedStyle(el).color` resolves to RGB equivalent of `var(--warn-strong)` light value (`#9E6A19` → `rgb(158, 106, 25)`).
3. Toggles to dark theme via `[data-theme="dark"]` attribute on the root element.
4. Re-asserts `getComputedStyle(el).color` resolves to RGB equivalent of `var(--warn-strong)` dark value (`#F1C081` → `rgb(241, 192, 129)`).
5. The assertion is on the COMPUTED colour tracking the token across themes — proves substitution succeeded AND prevents future regression if anyone re-introduces a literal here.

Sketch:
```js
test('warn surfaces foreground tracks --warn-strong token in both themes', async ({ page }) => {
  await page.goto('/some-route-with-warn-surface');
  // Light theme baseline
  const lightColor = await page.evaluate(() => getComputedStyle(document.querySelector('.btn.warn')).color);
  expect(lightColor).toBe('rgb(158, 106, 25)');  // --warn-strong light
  // Toggle to dark
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const darkColor = await page.evaluate(() => getComputedStyle(document.querySelector('.btn.warn')).color);
  expect(darkColor).toBe('rgb(241, 192, 129)');  // --warn-strong dark
  // Repeat for .chip.warn
});
```

Where `.btn.warn` / `.chip.warn` actually render in the app (find callsites first):
```bash
grep -rn "btn[^\"']*warn\|chip[^\"']*warn" src --include="*.jsx"
```
Pick one surface per selector for the test fixture.

**OPTIONAL but recommended — light/dark screenshot pair for PR description**:

Useful for human reviewer eyeball; not durable. Capture before/after for one `.btn.warn` and one `.chip.warn` callsite in both themes. Add to PR body inline.

### 4.4 Regression check
- `.btn.warn` / `.chip.warn` foreground colour in light mode IS `#9E6A19` (same as `--warn-strong` light value). Substitution preserves byte-identical visual.
- No other selector references `#9e6a19` for it to drift.

---

## 5. A11y impact

**Positive**:
- Fixes WCAG 2.2 AA contrast violation for `.btn.warn` / `.chip.warn` in dark mode (estimated ~2.4:1 → ~5.8:1).
- Aligns with `notes/design-standards.md` § Accessibility a11y baseline (≥ 4.5:1 body contrast).
- No keyboard / screen-reader / motion impact.

**Risk**:
- None. Light mode unchanged; dark mode strictly improves.

---

## 6. Bundle impact

| Item | Direction | Magnitude |
| --- | --- | --- |
| 2 × `#9e6a19` (7 chars) → `var(--warn-strong)` (18 chars) | + | ~22 bytes raw, ~+8 bytes gzip est. |

**Net estimate**: ≈ +8 bytes gzip, negligible against the 1,506-byte JS-bundle headroom (and CSS bundle is separate from JS bundle anyway).

PR-D2 (border tokens + 27 literal consolidation) is the bundle-banking PR — that one nets ~−130 bytes.

---

## 7. Dissent log (alternatives considered + rejected)

### Rejected: ship the original "broad sweep" of all 166 hex literals
Reason: filter analysis revealed most hex literals are intentional (definitions, var-fallbacks, gradient palettes, cross-theme color-mix). Naive `sed` replace would have introduced regressions. Surgical scope (2 lines) reflects the actual rogue surface.

### Rejected: include border-colour rogues (`#b8dfca`, `#edd9ae`, `#f0c8c5`) in this PR
Reason: substitution-without-token doesn't apply (these aren't existing token values). Token introduction is a system-level decision deserving its own PR. PR-D2 will handle.

### Rejected: substitute `#1d2b3a` → `var(--ink)` for `--mode-card-title` (L4596, L4700)
Reason: L4700 is inside `.mode-card[data-text-tone="dark"]` where the design intentionally pins a dark ink colour regardless of theme. Substitution would change semantics (introduce theme-awareness where the design wants theme-static). L4596 needs scope confirmation. Both deferred to PR-D2.

### Rejected: substitute `#FFFFFF` → `var(--panel)` in linear-gradients (6 occurrences)
Reason: gradients are decorative palette choices, not theme-tracking surfaces. `#FFFFFF` in a gradient stop expresses "white at this stop", not "the panel surface colour"; these meanings differ in dark mode. Skip without explicit per-callsite design call.

### Rejected: defer entire PR-D until PR-D2 token additions are designed
Reason: the 2 dark-mode contrast fixes are real WCAG violations. Shipping them now (Wave 1) closes a child-facing a11y gap immediately. Bundling into a larger PR delays the fix unnecessarily.

---

## 8. Acceptance criteria (binary)

- [ ] `styles/app.css:526` `.btn.warn` colour changed from `#9e6a19` to `var(--warn-strong)`.
- [ ] `styles/app.css:552` `.chip.warn` colour changed from `#9e6a19` to `var(--warn-strong)`.
- [ ] No other CSS / JS / JSX changes in this PR.
- [ ] `npm run check` passes.
- [ ] `npm test` passes.
- [ ] Playwright theme-tracking assertion added (REQUIRED — see §4.3); passes in CI.
- [ ] Light/dark screenshot pair in PR description (OPTIONAL but recommended).
- [ ] Bundle delta reported: ≤ +20 bytes gzip.
- [ ] PR description references this spec doc + baseline doc § 3 Colour.
- [ ] Reviewer (Designer-Opus) sign-off on contrast verification.

---

## 9. Handoff metadata

- Spec drafted: 2026-05-01
- Implementation owner: @Codex-Coder
- Spec reviewer (approved before implementation): @Designer-Opus ✅ (DM 70dc8693)
- Spec reviewer (must approve PR before merge): @Codex-Reviewer
- Final design sign-off: @Designer-Opus
- Follow-up: **PR-D2** introduces `--good-border`, `--warn-border`, `--bad-border` tokens and consolidates the 27 border literals (`#b8dfca` × 14, `#edd9ae` × 9, `#f0c8c5` × 4). **Scheduled for Wave 2** alongside other token-introduction PRs (B / C / G). Estimated bundle impact: ~−130 bytes gzip.

## 10. Revision log

- **v1** (2026-05-01) — initial draft, scope reframed via context-filter analysis (§2.1). Sent for review (DM b47f8acb).
- **v2** (2026-05-01) — Designer-Opus sign-off (DM 70dc8693) with three conditional edits applied:
  1. Severity retag: mixed 🟡+🔴 → single 🔴 BLOCKING (warn-surface contrast is the entire substantive scope).
  2. Verification §4.3: Playwright theme-tracking assertion promoted to REQUIRED (CI-durable, regression-proof); screenshot pair demoted to OPTIONAL.
  3. Title clarified with subtitle preserving "Hex literal sweep" name for traceability while flagging actual scope.
  - PR-D2 added to baseline §8 PR sequence as Wave 2 token-introduction PR (per Designer-Opus recommendation; defer drafting until Wave 1 lands).
- Independent contrast verification by Designer-Opus matched Worker's calc within rounding (~2.5 vs ~2.4 in dark; ~7.1 vs ~5.8 post-fix).
