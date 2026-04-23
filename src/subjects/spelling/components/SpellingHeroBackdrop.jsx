import React from 'react';
import { heroBgStyle, heroPanDelayStyle } from './spelling-view-model.js';

export function SpellingHeroBackdrop({ url, previousUrl = '' }) {
  const handoffUrl = previousUrl && previousUrl !== url ? previousUrl : '';
  const layerId = React.useRef(handoffUrl ? 1 : 0);
  const currentUrl = React.useRef(url || '');
  const initialTransitionId = React.useRef(handoffUrl ? 1 : null);
  const [layers, setLayers] = React.useState(() => (
    url
      ? [
        ...(handoffUrl ? [{ id: 0, url: handoffUrl, phase: 'exiting' }] : []),
        { id: handoffUrl ? 1 : 0, url, phase: handoffUrl ? 'entering' : 'active' },
      ]
      : []
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
    }, 920);
    return () => clearTimeout(timer);
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
    setLayers((current) => {
      return [
        ...current.slice(-2).map((layer) => ({ ...layer, phase: 'exiting' })),
        { id: nextId, url, phase: 'entering' },
      ];
    });

    const timer = setTimeout(() => {
      setLayers((current) => current
        .filter((layer) => layer.id === nextId)
        .map((layer) => ({ ...layer, phase: 'active' })));
    }, 920);

    return () => {
      clearTimeout(timer);
    };
  }, [url]);

  if (!layers.length) return null;

  const panStyle = heroPanDelayStyle();

  return (
    <div className="spelling-hero-backdrop" aria-hidden="true">
      {layers.map((layer) => (
        <div
          className={`hero-art pan spelling-hero-layer is-${layer.phase}`}
          style={{ ...heroBgStyle(layer.url), ...panStyle }}
          key={layer.id}
        />
      ))}
    </div>
  );
}
