import React from 'react';
import { probeHeroTextTones } from '../../../platform/ui/luminance.js';
import { heroContrastProfileForBg } from './spelling-view-model.js';

const DEFAULT_CONTRAST = Object.freeze({
  tone: '',
  shell: 'dark',
  controls: 'dark',
  cards: Object.freeze(['dark', 'dark', 'dark']),
});

const CARD_GLASS_ALPHA = 0.28;
const SELECTED_CARD_GLASS_ALPHA = 0.42;
const CONTROL_REFRESH_MS = 6000;

export function useSetupHeroContrast(heroBg, mode) {
  const ref = React.useRef(null);
  const staticContrast = React.useMemo(() => heroContrastProfileForBg(heroBg, mode), [heroBg, mode]);
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
        runProbe(shell, heroBg).then((nextContrast) => {
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
      shell.querySelectorAll('.mode-card, .setup-control-stack, .title, .lede').forEach((element) => {
        observer.observe(element);
      });
    }

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      observer?.disconnect();
    };
  }, [heroBg, mode, staticContrast]);

  return { ref, contrast: staticContrast || probedContrast };
}

async function runProbe(shell, heroBg) {
  const cards = Array.from(shell.querySelectorAll('.mode-card'));
  const cardProbes = cards.map((card, index) => ({
    key: `card:${index}`,
    element: cardTextRegion(card) || card,
    glassAlpha: card.classList.contains('selected') ? SELECTED_CARD_GLASS_ALPHA : CARD_GLASS_ALPHA,
  }));
  const controlElements = Array.from(shell.querySelectorAll('.tool-label, .length-unit'))
    .filter((element) => visibleForProbe(element));
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
  const title = card.querySelector('h4');
  const copy = card.querySelector('p');
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

function visibleForProbe(element) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  for (let current = element; current && current.nodeType === Node.ELEMENT_NODE; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') <= 0.05) return false;
    if (current.classList?.contains('setup-main')) break;
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
