import React from 'react';
import { probeHeroTextTones } from './luminance.js';

/* Subject-agnostic Setup hero contrast hook.
 *
 * Each subject's Setup scene paints a hero backdrop with three
 * region/tone combinations. The contrast that the mode cards, ledes,
 * and tweak labels need depends on which region+tone is active — and
 * sometimes we already know it statically (via the per-tone curated
 * profile in the subject view-model), sometimes we have to probe the
 * actual artwork because the region was authored after the curated
 * table.
 *
 * The hook is platform-level so Spelling, Grammar, and any new subject
 * can share a single implementation. It accepts:
 *
 *   * `staticContrastForBg(url, mode)` — fast lookup that returns the
 *     curated `{ tone, shell, controls, cards[] }` profile or `null`
 *     when the subject does not have one for this URL.
 *   * `cardSelector` — DOM selector for mode cards. Spelling uses
 *     `.mode-card`; Grammar uses `.grammar-primary-mode`.
 *   * `controlSelectors` — array of selectors for tweak labels (the
 *     elements whose colour we adapt to the active region tone).
 *
 * Defaults intentionally match Spelling's existing call-site so the
 * Spelling wrapper can keep its previous behaviour by simply forwarding
 * `staticContrastForBg`.
 */

const DEFAULT_CONTRAST = Object.freeze({
  tone: '',
  shell: 'dark',
  controls: 'dark',
  cards: Object.freeze(['dark', 'dark', 'dark']),
});

const CARD_GLASS_ALPHA = 0.28;
const SELECTED_CARD_GLASS_ALPHA = 0.42;
const CONTROL_REFRESH_MS = 6000;

const DEFAULT_CARD_SELECTOR = '.mode-card';
const DEFAULT_CONTROL_SELECTORS = Object.freeze(['.tool-label', '.length-unit']);
const DEFAULT_OBSERVE_SELECTORS = Object.freeze([
  '.mode-card',
  '.setup-control-stack',
  '.title',
  '.lede',
]);

export function useSetupHeroContrast(heroBg, mode, options = {}) {
  const ref = React.useRef(null);
  const {
    staticContrastForBg,
    cardSelector = DEFAULT_CARD_SELECTOR,
    controlSelectors = DEFAULT_CONTROL_SELECTORS,
    observeSelectors = DEFAULT_OBSERVE_SELECTORS,
  } = options;
  const staticContrast = React.useMemo(() => (
    typeof staticContrastForBg === 'function'
      ? staticContrastForBg(heroBg, mode)
      : null
  ), [heroBg, mode, staticContrastForBg]);
  const [probedContrast, setProbedContrast] = React.useState(staticContrast || DEFAULT_CONTRAST);

  React.useEffect(() => {
    if (staticContrast) {
      setProbedContrast(staticContrast);
      return undefined;
    }

    const shell = ref.current;
    if (!shell || !heroBg || typeof window === 'undefined') {
      setProbedContrast(DEFAULT_CONTRAST);
      return undefined;
    }

    let cancelled = false;
    let frame = 0;
    let observer = null;

    const scheduleProbe = () => {
      if (cancelled || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        runProbe(shell, heroBg, { cardSelector, controlSelectors }).then((nextContrast) => {
          if (cancelled) return;
          setProbedContrast((current) => (
            sameContrast(current, nextContrast) ? current : nextContrast
          ));
        });
      });
    };

    scheduleProbe();
    const interval = window.setInterval(scheduleProbe, CONTROL_REFRESH_MS);
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleProbe);
      observer.observe(shell);
      observeSelectors.forEach((selector) => {
        shell.querySelectorAll(selector).forEach((element) => observer.observe(element));
      });
    }

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      observer?.disconnect();
    };
  }, [heroBg, mode, staticContrast, cardSelector, controlSelectors, observeSelectors]);

  return { ref, contrast: staticContrast || probedContrast };
}

async function runProbe(shell, heroBg, { cardSelector, controlSelectors }) {
  const cards = Array.from(shell.querySelectorAll(cardSelector));
  const cardProbes = cards.map((card, index) => ({
    key: `card:${index}`,
    element: cardTextRegion(card) || card,
    glassAlpha: card.classList.contains('selected') ? SELECTED_CARD_GLASS_ALPHA : CARD_GLASS_ALPHA,
  }));
  const controlElements = controlSelectors.flatMap((selector) => (
    Array.from(shell.querySelectorAll(selector))
  )).filter((element) => visibleForProbe(element, shell));
  const probes = [
    { key: 'shell', element: shell.querySelector('.lede') || shell.querySelector('.title') || shell, glassAlpha: 0 },
    ...cardProbes,
    ...controlElements.map((element, index) => ({ key: `control:${index}`, element, glassAlpha: 0 })),
  ];

  const results = await probeHeroTextTones(heroBg, shell, probes);
  const byKey = new Map(results.map((result) => [result.key, result]));
  const controlResults = results.filter((result) => String(result.key || '').startsWith('control:'));
  return {
    tone: '',
    shell: byKey.get('shell')?.tone || DEFAULT_CONTRAST.shell,
    cards: cards.map((_, index) => byKey.get(`card:${index}`)?.tone || DEFAULT_CONTRAST.cards[index] || DEFAULT_CONTRAST.shell),
    controls: combinedTone(controlResults) || DEFAULT_CONTRAST.controls,
  };
}

function cardTextRegion(card) {
  const title = card.querySelector('h4, h3, .grammar-primary-mode-title');
  const copy = card.querySelector('p, .grammar-primary-mode-desc');
  if (!title && !copy) return null;
  return {
    getBoundingClientRect() {
      const rects = [title, copy]
        .filter(Boolean)
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width && rect.height);
      if (!rects.length) return card.getBoundingClientRect();
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    },
  };
}

function visibleForProbe(element, shell) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  for (let current = element; current && current.nodeType === Node.ELEMENT_NODE; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') <= 0.05) return false;
    if (current === shell) break;
  }
  return true;
}

function combinedTone(results) {
  if (!results.length) return '';
  return results.some((result) => result.tone === 'light') ? 'light' : 'dark';
}

function sameContrast(left, right) {
  return left.tone === right.tone
    && left.shell === right.shell
    && left.controls === right.controls
    && left.cards.length === right.cards.length
    && left.cards.every((tone, index) => tone === right.cards[index]);
}
