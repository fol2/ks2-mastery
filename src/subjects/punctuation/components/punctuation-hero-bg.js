/* Punctuation hero backdrop view-model.
 *
 * Mirrors the file layout of `grammar-hero-bg.js` so the platform-level
 * engine (`HeroBackdrop`, `useSetupHeroContrast`, `probeHeroTextTones`)
 * can drive Punctuation's Setup/Session/Summary/Map scenes with the same
 * cross-fade, pan, and contrast-probe contract it gives Grammar and
 * Spelling.
 *
 * Asset layout:
 *   /assets/regions/bellstorm-coast/bellstorm-coast-{variant}.{size}.webp
 *
 * Variant naming follows the Bellstorm cover + a1-e2 grid:
 *   bellstorm-coast-cover  — Setup cover (phase: setup, index 0)
 *   bellstorm-coast-a1     — Setup A1 (phase: setup, index 1)
 *   bellstorm-coast-b1     — Setup B1 / Map (phase: setup index 2 /
 *                            active-item / map)
 *   bellstorm-coast-c1     — Setup C1 (phase: setup, index 3)
 *   bellstorm-coast-d1     — Summary D1 (phase: feedback / summary-ish)
 *   bellstorm-coast-d2     — Summary D2 (phase: feedback / summary-ish)
 *   bellstorm-coast-e1     — Summary E1 (phase: summary index 0)
 *   bellstorm-coast-e2     — Summary E2 (phase: summary / boss)
 *
 * Scene selection (which variant for which phase) is owned by
 * `bellstormSceneForPhase` in `punctuation-view-model.js`. We re-export
 * it here so consumers only import hero-backdrop concerns from a single
 * file — mirrors the Grammar split where `grammar-hero-bg.js` owns the
 * chrome, and `grammar-view-model.js` owns content.
 *
 * Contrast profile rationale: unlike Grammar (which has a tone axis 1/2/3
 * driving light vs dark ink decisions per region), every Bellstorm Coast
 * scene shares one visual palette today — dark ink reads on the light
 * golden-sand field. So the helper returns a single static profile for
 * any recognised Bellstorm URL. If Bellstorm adds a darker variant in a
 * future content drop, this table grows. The single-row table still
 * earns its keep: it short-circuits the runtime luminance probe so Setup's
 * first paint is fast, mirroring the Grammar pattern.
 *
 * Explicit non-goal: no `heroToneForPunctuationBg` helper exists.
 * Punctuation has no tone axis, so there is no per-tone variant for
 * `data-hero-tone` decoding to report. Consumers read `heroContrast.
 * contrast.tone` from the hook directly — for Punctuation this will be
 * an empty string (default), which is correct for the current palette. */

// Re-export `bellstormSceneForPhase` so consumers import hero-backdrop
// concerns from a single file — matches the Grammar split where the
// content view-model owns scene content and the hero-bg module owns
// chrome concerns.
export { bellstormSceneForPhase } from './punctuation-view-model.js';

const CONTRAST_DARK = 'dark';

/* Every recognised Bellstorm Coast scene (cover + a1-e2) shares this
 * single profile. `shell`, `controls`, and the `cards` array are all
 * `'dark'` because the Bellstorm palette is a light golden-sand field
 * that takes dark ink everywhere. If a future content drop introduces
 * a saturated / dusk variant that inverts the palette, this becomes a
 * per-variant table — the regex match below already extracts the
 * variant letter so the upgrade is a drop-in.
 *
 * The `cards` array length is 1 because Punctuation's Setup scene has
 * a single primary CTA button (not a mode-card row like Grammar's
 * three-card layout). The shared `useSetupHeroContrast` hook treats
 * missing card indices as falling back to `shell` tone, so this is
 * safe if future Punctuation scenes add more cards — but the mission
 * dashboard's one-CTA shape is the authored default.
 *
 * `tone` is empty because Punctuation has no tone axis — see the
 * module-level comment. */
const PUNCTUATION_HERO_CONTRAST_STATIC = Object.freeze({
  tone: '',
  shell: CONTRAST_DARK,
  controls: CONTRAST_DARK,
  cards: Object.freeze([CONTRAST_DARK]),
});

/* Short-circuit the luminance probe for recognised Bellstorm URLs.
 * Returns `null` for unknown URLs so `useSetupHeroContrast` falls back
 * to its runtime probe (which is the correct behaviour for an
 * off-canon URL, e.g. a future region-share preview).
 *
 * Single-argument signature (no `mode` parameter) — Punctuation has no
 * tone / mode axis affecting the backdrop palette. Compare with Grammar's
 * `heroContrastProfileForGrammarBg(url, mode)` which darkens the
 * selected card on tone-1 artwork. */
export function heroContrastProfileForPunctuationBg(url) {
  const text = String(url || '');
  // Regex matches `bellstorm-coast-cover`, `bellstorm-coast-a1`,
  // `bellstorm-coast-b1`, …, `bellstorm-coast-e2`. Accepts optional
  // query / hash suffix so a cache-busting `?v=…` variant still hits.
  const variant = text.match(/bellstorm-coast-(cover|[a-e][12])\.\d+\.webp(?:$|[?#])/);
  if (!variant) return null;
  return PUNCTUATION_HERO_CONTRAST_STATIC;
}
