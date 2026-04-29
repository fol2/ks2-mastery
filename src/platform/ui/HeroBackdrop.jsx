import React from 'react';
import { HERO_TRANSITION_MS, heroBgStyle, heroPanDelayStyle } from './hero-bg.js';

/* Subject-agnostic hero backdrop with cross-fade + slow horizontal pan.
 *
 * Setup scenes (Spelling, Grammar, future Punctuation) all paint a
 * region artwork behind the mode cards. When the URL changes — e.g. a
 * mode flip swaps the region — we render the new layer on top with
 * `is-entering`, demote prior layers to `is-exiting`, and after the
 * dissolve duration prune everything except the freshly active layer.
 *
 * The handoff slot lets a parent surface (typically the
 * SubjectPracticeSurface) supply the URL the previous scene was painting
 * so the backdrop animates in from THAT artwork rather than from a flat
 * panel — keeping the visual continuity even when the underlying scene
 * remounts.
 *
 * Each layer carries `data-hero-layer="true"` so the platform-level
 * luminance probe (`probeHeroTextTones`) can locate the active layer
 * by attribute regardless of which subject is calling it.
 *
 * Optional class hooks:
 *   * `extraBackdropClassName` — additional class on the wrapper, e.g.
 *     `spelling-hero-backdrop` for the legacy `.spelling-in-session`
 *     selector. Grammar and any new subject can leave this blank.
 *   * `extraLayerClassName` — additional class on each layer element,
 *     used by the same legacy selectors. New callers should leave blank
 *     and rely on `.hero-layer`.
 *
 * Why a config prop instead of a CSS-only switch: the legacy CSS rules
 * for spelling reach DOWN through `.spelling-in-session .spelling-hero-
 * layer::after` — we cannot drop the class without rewriting the
 * mid-session backdrop tinting. Carrying both names is the lightest
 * touch that keeps Spelling's rules and contracts intact while letting
 * Grammar use the clean primitive.
 */
export function HeroBackdrop({
  url,
  previousUrl = '',
  extraBackdropClassName = '',
  extraLayerClassName = '',
}) {
  const handoffUrl = previousUrl && previousUrl !== url ? previousUrl : '';
  const layerId = React.useRef(handoffUrl ? 1 : 0);
  const currentUrl = React.useRef(url || '');
  const initialTransitionId = React.useRef(handoffUrl ? 1 : null);
  const [layers, setLayers] = React.useState(() => (
    (() => {
      if (!url) return [];
      const panStyle = heroPanDelayStyle();
      return [
        ...(handoffUrl ? [{ id: 0, url: handoffUrl, phase: 'exiting', panStyle }] : []),
        { id: handoffUrl ? 1 : 0, url, phase: handoffUrl ? 'entering' : 'active', panStyle },
      ];
    })()
  ));

  React.useEffect(() => {
    const nextId = initialTransitionId.current;
    if (nextId == null || !url) return undefined;
    const transitionUrl = url;
    const timer = setTimeout(() => {
      setLayers((current) => {
        if (currentUrl.current !== transitionUrl) return current;
        return current
          .filter((layer) => layer.id === nextId)
          .map((layer) => ({ ...layer, phase: 'active' }));
      });
    }, HERO_TRANSITION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once handoff settle
  }, []);

  React.useEffect(() => {
    if (!url) {
      currentUrl.current = '';
      setLayers([]);
      return undefined;
    }

    if (currentUrl.current === url) return undefined;
    currentUrl.current = url;
    layerId.current += 1;
    const nextId = layerId.current;
    const panStyle = heroPanDelayStyle();
    setLayers((current) => [
      ...current.slice(-2).map((layer) => ({ ...layer, phase: 'exiting' })),
      { id: nextId, url, phase: 'entering', panStyle },
    ]);

    const timer = setTimeout(() => {
      setLayers((current) => current
        .filter((layer) => layer.id === nextId)
        .map((layer) => ({ ...layer, phase: 'active' })));
    }, HERO_TRANSITION_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [url]);

  if (!layers.length) return null;

  const backdropClasses = ['hero-backdrop'];
  if (extraBackdropClassName) backdropClasses.push(extraBackdropClassName);

  return (
    <div className={backdropClasses.join(' ')} aria-hidden="true">
      {layers.map((layer) => {
        const layerClasses = ['hero-art', 'pan', 'hero-layer', `is-${layer.phase}`];
        if (extraLayerClassName) layerClasses.push(extraLayerClassName);
        return (
          <div
            className={layerClasses.join(' ')}
            data-hero-layer="true"
            style={{ ...heroBgStyle(layer.url), ...(layer.panStyle || {}) }}
            key={layer.id}
          />
        );
      })}
    </div>
  );
}
