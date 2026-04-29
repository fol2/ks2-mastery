/* Subject-agnostic hero backdrop primitives.
 *
 * Every Setup scene renders a layered backdrop with a slow horizontal pan
 * and a cross-fade when the URL changes. The CSS keyframes (`hero-pan`,
 * `spelling-hero-dissolve-in`, `spelling-hero-dissolve-out`) live in
 * `styles/app.css` and are referenced through CSS custom properties so
 * they stay tuned in one place.
 *
 * The pan duration constant is shared with the React backdrop so the JS
 * layer's transition timer (`HERO_TRANSITION_MS`) and the CSS animation
 * stay in sync; the inline `--hero-pan-delay` style randomises each
 * mount's start point so simultaneous backdrop layers do not lock-step.
 *
 * Centralising these helpers under `src/platform/ui/` lets each subject
 * (Spelling, Grammar, future Punctuation) reuse the identical engine
 * without re-implementing the cross-fade contract or drifting on the
 * pan period.
 */

export const HERO_PAN_SECONDS = 96;
export const HERO_TRANSITION_MS = 920;

export function heroBgStyle(url) {
  return url ? { '--hero-bg': `url('${url}')` } : {};
}

export function heroPanDelayStyle() {
  if (typeof performance === 'undefined') return {};
  const elapsed = (performance.now() / 1000) % (HERO_PAN_SECONDS * 2);
  return { '--hero-pan-delay': `-${elapsed.toFixed(3)}s` };
}
